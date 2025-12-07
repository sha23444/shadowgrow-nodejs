const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const path = require('path');

// Setup auth
const analyticsDataClient = new BetaAnalyticsDataClient({
  keyFilename: path.join(__dirname, 'filewale-457317-6121e8015304.json'), // Update path
});

const PROPERTY_ID = '487321882'; // example: 'properties/123456789'

// Controller function
exports.getReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const [response] = await analyticsDataClient.runReport({
      property: `properties/${PROPERTY_ID}`,
      requestBody: {
        metrics: [{ name: 'activeUsers' }],
        dateRanges: [{ startDate: 'today', endDate: 'today' }],
      },
      dateRanges: [
        {
          startDate: startDate || '2024-01-01',
          endDate: endDate || 'today',  
        },
      ],
      dimensions: [{ name: 'city' }, { name: 'browser' }],
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
    });

    return res.json(response);
  } catch (error) {
    console.error('Error fetching GA4 report:', error);
    return res.status(500).json({
      message: 'Failed to fetch Google Analytics data',
      error: error.message,
    });
  }
};

exports.getLiveUsers = async (req, res) => {
  try {
    const [response] = await analyticsDataClient.runRealtimeReport({
      property: `properties/${PROPERTY_ID}`,
      dimensions: [{ name: 'unifiedScreenName' }], // You can customize dimensions
      metrics: [{ name: 'activeUsers' }],
    });

    return res.json(response);
  } catch (error) {
    console.error('Error fetching live users:', error);
    return res.status(500).json({
      message: 'Failed to fetch live users',
      error: error.message,
    });
  }
};


exports.getLiveUsersByCountry = async (req, res) => {
  try {
    const [response] = await analyticsDataClient.runRealtimeReport({
      property: `properties/${PROPERTY_ID}`,
      dimensions: [{ name: 'country' }],
      metrics: [{ name: 'activeUsers' }],
    });

    // Structure the response nicely
    const countriesData = response.rows?.map(row => ({
      country: row.dimensionValues?.[0]?.value,
      activeUsers: row.metricValues?.[0]?.value,
    })) || [];

    return res.json(countriesData);
  } catch (error) {
    console.error('Error fetching live users by country:', error);
    return res.status(500).json({
      message: 'Failed to fetch live users by country',
      error: error.message,
    });
  }
};

exports.getPageViewsByDate = async (req, res) => {
  try {
    const { startDate, endDate } = req.query; // coming from query params

    const [response] = await analyticsDataClient.runReport({
      property: `properties/${PROPERTY_ID}`,
      requestBody: {
        dimensions: [{ name: 'pagePath' }], // Group by page URL path
        metrics: [{ name: 'screenPageViews' }], // This is for total page views
        dateRanges: [
          {
            startDate: startDate || '2024-01-01', // Default if not provided
            endDate: endDate || 'today',
          },
        ],
        orderBys: [
          {
            metric: {
              metricName: 'screenPageViews',
            },
            desc: true, // Sort by most views
          },
        ],
      },
    });

    const pageViewsData = response.rows?.map(row => ({
      pagePath: row.dimensionValues?.[0]?.value,
      pageViews: row.metricValues?.[0]?.value,
    })) || [];

    return res.json(pageViewsData);
  } catch (error) {
    console.error('Error fetching page views by date:', error);
    return res.status(500).json({
      message: 'Failed to fetch page views by date',
      error: error.message,
    });
  }
};



