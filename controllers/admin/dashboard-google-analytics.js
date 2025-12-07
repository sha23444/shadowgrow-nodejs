const {
  loadGaSettings,
  createAnalyticsClient,
  AnalyticsNotConfiguredError,
} = require('./analytics-settings');

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const ensureConfigured = async () => {
  const settings = await loadGaSettings();
  if (!settings.propertyId || !settings.credentialsParsed) {
    throw new AnalyticsNotConfiguredError(
      'Google Analytics integration is not configured. Please add your property ID and credentials.',
    );
  }

  const client = createAnalyticsClient(settings.credentialsParsed);
  const property = `properties/${settings.propertyId}`;
  return { client, property, settings };
};

const validateDates = (startDate, endDate) => {
  if (startDate && startDate !== '30daysAgo' && startDate !== '7daysAgo' && !dateRegex.test(startDate)) {
    throw new Error('Invalid startDate format. Use YYYY-MM-DD or a relative GA date keyword.');
  }
  if (endDate && endDate !== 'today' && !dateRegex.test(endDate)) {
    throw new Error('Invalid endDate format. Use YYYY-MM-DD or today.');
  }
};

const runWithAnalytics = async (res, handler) => {
  try {
    const { client, property, settings } = await ensureConfigured();
    return await handler(client, property, settings);
  } catch (error) {
    if (error instanceof AnalyticsNotConfiguredError) {
      return res.status(400).json({
        status: 'error',
        message: error.message,
      });
    }
    console.error('Google Analytics error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch Google Analytics data.',
      error: error.message,
    });
  }
};

const getOverallAnalytics = async (req, res) => {
  const { startDate = '30daysAgo', endDate = 'today' } = req.query;

  try {
    validateDates(startDate, endDate);
  } catch (error) {
    return res.status(400).json({ status: 'error', message: error.message });
  }

  return runWithAnalytics(res, async (client, property) => {
    const [response] = await client.runReport({
      property,
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: 'totalUsers' },
        { name: 'newUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'averageSessionDuration' },
        { name: 'bounceRate' },
      ],
    });

    const metrics = response.rows?.[0]?.metricValues || [];

    return res.json({
      status: 'success',
      response: {
        data: {
          totalUsers: parseInt(metrics[0]?.value || 0, 10),
          newUsers: parseInt(metrics[1]?.value || 0, 10),
          sessions: parseInt(metrics[2]?.value || 0, 10),
          pageViews: parseInt(metrics[3]?.value || 0, 10),
          averageSessionDuration: parseFloat(metrics[4]?.value || 0),
          bounceRate: parseFloat(metrics[5]?.value || 0),
        },
        filters: { startDate, endDate },
      },
    });
  });
};

const getUserAcquisition = async (req, res) => {
  const { startDate = '30daysAgo', endDate = 'today' } = req.query;

  return runWithAnalytics(res, async (client, property) => {
    const [response] = await client.runReport({
      property,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionSource' }],
      metrics: [
        { name: 'sessions' },
        { name: 'newUsers' },
        { name: 'totalUsers' },
      ],
    });

    return res.json(response);
  });
};

const getPageViewsOverTime = async (req, res) => {
  const { startDate = '30daysAgo', endDate = 'today' } = req.query;

  return runWithAnalytics(res, async (client, property) => {
    const [response] = await client.runReport({
      property,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'date' }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'newUsers' },
        { name: 'screenPageViews' },
      ],
    });

    return res.json(response);
  });
};

const getUserDemographics = async (req, res) => {
  const { startDate = '30daysAgo', endDate = 'today' } = req.query;

  return runWithAnalytics(res, async (client, property) => {
    const [response] = await client.runReport({
      property,
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: 'country' },
        { name: 'city' },
        { name: 'deviceCategory' },
      ],
      metrics: [{ name: 'totalUsers' }],
    });

    return res.json(response);
  });
};

const getTopPages = async (req, res) => {
  const { startDate = '30daysAgo', endDate = 'today' } = req.query;

  return runWithAnalytics(res, async (client, property) => {
    const [response] = await client.runReport({
      property,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'averageSessionDuration' },
        { name: 'bounceRate' },
      ],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 10,
    });

    return res.json(response);
  });
};

module.exports = {
  getOverallAnalytics,
  getUserAcquisition,
  getPageViewsOverTime,
  getUserDemographics,
  getTopPages,
};
