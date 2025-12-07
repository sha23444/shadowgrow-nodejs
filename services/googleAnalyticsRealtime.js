const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const {
  loadGaSettings,
  AnalyticsNotConfiguredError,
} = require('../controllers/admin/analytics-settings');
const { differenceInCalendarDays } = require('date-fns');

let cachedClient = null;
let cachedProperty = null;

const ensureClient = async () => {
  if (cachedClient && cachedProperty) {
    return { client: cachedClient, property: cachedProperty };
  }

  const settings = await loadGaSettings();
  if (!settings.propertyId || !settings.credentialsParsed) {
    throw new AnalyticsNotConfiguredError(
      'Google Analytics integration is not configured.',
    );
  }

  cachedClient = new BetaAnalyticsDataClient({
    credentials: settings.credentialsParsed,
    projectId: settings.credentialsParsed.project_id,
  });
  cachedProperty = `properties/${settings.propertyId}`;
  return { client: cachedClient, property: cachedProperty };
};

const fetchActiveUsers = async () => {
  const { client, property } = await ensureClient();

  const [response] = await client.runRealtimeReport({
    property,
    metrics: [{ name: 'activeUsers' }, { name: 'eventCount' }],
    dimensions: [{ name: 'minutesAgo' }],
    limit: 30,
    orderBys: [
      {
        dimension: { dimensionName: 'minutesAgo' },
        desc: true,
      },
    ],
  });

  const totalActiveUsers =
    Number(
      response.totals?.[0]?.metricValues?.[0]?.value ||
        response.rows?.[0]?.metricValues?.[0]?.value ||
        0,
    ) || 0;

  const minutes = (response.rows || []).map(row => ({
    minute: row.dimensionValues?.[0]?.value || '',
    activeUsers: Number(row.metricValues?.[0]?.value || 0),
    events: Number(row.metricValues?.[1]?.value || 0),
  }));

  return {
    totalActiveUsers,
    timeline: minutes,
  };
};

const parseDateFromGa = (value) => {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  return new Date(Date.UTC(year, month - 1, day));
};

const parseDateHourFromGa = (value) => {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, day, hour));
};

const fetchActiveUsersHistory = async ({ startDate, endDate }) => {
  if (!startDate || !endDate) {
    throw new Error('startDate and endDate are required');
  }

  const { client, property } = await ensureClient();
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diffDays = Math.max(
    0,
    differenceInCalendarDays(end, start),
  );
  const useHourly = diffDays <= 2; // up to 3 days of hourly granularity

  const dimensions = useHourly ? [{ name: 'dateHour' }] : [{ name: 'date' }];

  const [response] = await client.runReport({
    property,
    dateRanges: [
      {
        startDate,
        endDate,
      },
    ],
    metrics: [{ name: 'activeUsers' }],
    dimensions,
    orderBys: [
      {
        dimension: {
          dimensionName: dimensions[0].name,
        },
        desc: false,
      },
    ],
  });

  const rows = response.rows ?? [];

  const timeline = rows
    .map(row => {
      const raw = row.dimensionValues?.[0]?.value || '';
      const activeUsers = Number(row.metricValues?.[0]?.value || 0);

      if (!raw) {
        return null;
      }

      const date =
        dimensions[0].name === 'dateHour'
          ? parseDateHourFromGa(raw)
          : parseDateFromGa(raw);

      return {
        timestamp: date.toISOString(),
        activeUsers,
      };
    })
    .filter(Boolean);

  const total = timeline.reduce(
    (sum, point) => sum + point.activeUsers,
    0,
  );
  const max = timeline.reduce(
    (maxValue, point) => Math.max(maxValue, point.activeUsers),
    0,
  );
  const average =
    timeline.length > 0 ? total / timeline.length : 0;

  return {
    granularity: dimensions[0].name === 'dateHour' ? 'hour' : 'day',
    summary: {
      total,
      max,
      average,
    },
    timeline,
  };
};

module.exports = {
  fetchActiveUsers,
  fetchActiveUsersHistory,
};

