const {
  AnalyticsNotConfiguredError,
} = require('./analytics-settings');
const {
  fetchActiveUsers,
  fetchActiveUsersHistory,
} = require('../../services/googleAnalyticsRealtime');

const getActiveUsersRealtime = async (req, res) => {
  try {
    const data = await fetchActiveUsers();
    return res.status(200).json({
      status: 'success',
      response: data,
    });
  } catch (error) {
    if (error instanceof AnalyticsNotConfiguredError) {
      return res.status(400).json({
        status: 'error',
        message: error.message,
      });
    }
    console.error('Error fetching realtime active users:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch realtime active users.',
      error: error.message,
    });
  }
};

const getActiveUsersHistory = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({
        status: 'error',
        message: 'startDate and endDate are required.',
      });
    }

    const data = await fetchActiveUsersHistory({ startDate, endDate });
    return res.status(200).json({
      status: 'success',
      response: data,
    });
  } catch (error) {
    if (error instanceof AnalyticsNotConfiguredError) {
      return res.status(400).json({
        status: 'error',
        message: error.message,
      });
    }
    console.error('Error fetching historical active users:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch historical active users.',
      error: error.message,
    });
  }
};

module.exports = {
  getActiveUsersRealtime,
  getActiveUsersHistory,
};

