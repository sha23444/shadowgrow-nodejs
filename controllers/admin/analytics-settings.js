const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const { pool } = require('../../config/database');

const OPTION_PROPERTY_ID = 'ga_property_id';
const OPTION_CREDENTIALS = 'ga_credentials';

class AnalyticsNotConfiguredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AnalyticsNotConfiguredError';
  }
}

const decodeCredentialString = (value) => {
  if (!value) {
    return null;
  }

  const attempts = [() => Buffer.from(value, 'base64').toString('utf8'), () => value];

  for (const attempt of attempts) {
    try {
      const raw = attempt();
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed.client_email || !parsed.private_key) {
        throw new Error('Missing service account fields.');
      }
      return {
        encoded: Buffer.from(JSON.stringify(parsed)).toString('base64'),
        parsed,
      };
    } catch (error) {
      continue;
    }
  }

  throw new Error('Invalid Google Analytics credential JSON.');
};

const loadGaSettings = async () => {
  const [rows] = await pool.query(
    `SELECT option_name, option_value 
     FROM res_options 
     WHERE option_name IN (?, ?)`,
    [OPTION_PROPERTY_ID, OPTION_CREDENTIALS],
  );

  const propertyRow = rows.find(row => row.option_name === OPTION_PROPERTY_ID);
  const credentialsRow = rows.find(row => row.option_name === OPTION_CREDENTIALS);

  let credentialsParsed = null;
  let credentialsEncoded = credentialsRow?.option_value || null;

  if (credentialsEncoded) {
    try {
      const decoded = decodeCredentialString(credentialsEncoded);
      credentialsEncoded = decoded.encoded;
      credentialsParsed = decoded.parsed;
    } catch (error) {
      console.error('Invalid stored Google Analytics credentials:', error);
      credentialsEncoded = null;
      credentialsParsed = null;
    }
  }

  return {
    propertyId: propertyRow?.option_value || '',
    credentialsEncoded,
    credentialsParsed,
  };
};

const saveOption = async (name, value) => {
  await pool.execute(
    `INSERT INTO res_options (option_name, option_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE option_value = VALUES(option_value)`,
    [name, value],
  );
};

const createAnalyticsClient = (credentials) => {
  if (!credentials) {
    throw new AnalyticsNotConfiguredError('Google Analytics credentials are not configured.');
  }

  const { client_email, private_key, project_id } = credentials;
  if (!client_email || !private_key) {
    throw new AnalyticsNotConfiguredError('Google Analytics credentials are incomplete.');
  }

  return new BetaAnalyticsDataClient({
    credentials: {
      client_email,
      private_key,
    },
    projectId: project_id,
  });
};

const getConfig = async (req, res) => {
  try {
    const settings = await loadGaSettings();
    return res.status(200).json({
      status: 'success',
      data: {
        propertyId: settings.propertyId || '',
        hasCredentials: Boolean(settings.credentialsEncoded),
      },
    });
  } catch (error) {
    console.error('Error fetching GA config:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to load Google Analytics settings.',
    });
  }
};

const updateConfig = async (req, res) => {
  try {
    const { propertyId, credentials } = req.body;

    if (!propertyId || typeof propertyId !== 'string' || !propertyId.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Property ID is required.',
      });
    }

    const trimmedPropertyId = propertyId.trim();
    await saveOption(OPTION_PROPERTY_ID, trimmedPropertyId);

    if (credentials) {
      const normalized = decodeCredentialString(credentials);
      await saveOption(OPTION_CREDENTIALS, normalized.encoded);
    }

    return res.status(200).json({
      status: 'success',
      message: 'Google Analytics configuration updated.',
    });
  } catch (error) {
    console.error('Error updating GA config:', error);
    return res.status(400).json({
      status: 'error',
      message: error.message || 'Failed to update Google Analytics settings.',
    });
  }
};

const testConnection = async (req, res) => {
  try {
    const { propertyId, credentials } = req.body || {};
    const storedSettings = await loadGaSettings();

    const effectivePropertyId = (propertyId || storedSettings.propertyId || '').trim();
    let credentialsInfo = null;

    if (credentials) {
      credentialsInfo = decodeCredentialString(credentials);
    } else if (storedSettings.credentialsEncoded) {
      credentialsInfo = {
        encoded: storedSettings.credentialsEncoded,
        parsed: storedSettings.credentialsParsed,
      };
    }

    if (!effectivePropertyId || !credentialsInfo?.parsed) {
      return res.status(400).json({
        status: 'error',
        message: 'Property ID and credentials are required to test the connection.',
      });
    }

    const client = createAnalyticsClient(credentialsInfo.parsed);
    const property = `properties/${effectivePropertyId}`;

    await client.runReport({
      property,
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      metrics: [{ name: 'totalUsers' }],
      limit: 1,
    });

    return res.status(200).json({
      status: 'success',
      message: 'Successfully connected to Google Analytics.',
    });
  } catch (error) {
    console.error('GA connection test failed:', error);
    return res.status(400).json({
      status: 'error',
      message: error.message || 'Failed to connect to Google Analytics.',
    });
  }
};

module.exports = {
  getConfig,
  updateConfig,
  testConnection,
  loadGaSettings,
  decodeCredentialString,
  createAnalyticsClient,
  AnalyticsNotConfiguredError,
};

