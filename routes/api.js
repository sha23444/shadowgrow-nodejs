const express = require("express");
const router = express.Router();

const locationController = require("../controllers/api/location");
const settingController = require("../controllers/api/settings");
const countriesController = require("../controllers/api/countries");

const { smartCache } = require("../config/smart-cache");

router.use("/get-location", locationController.getUserLocation);
router.use("/settings",  settingController.getAllOptions);
router.get("/countries", countriesController.getCountries);
router.post("/states", countriesController.getStates);
router.post("/cities", countriesController.getCities);

// Cache test endpoint for performance testing
router.post('/test-cache', async (req, res) => {
  try {
    const { action, key, value, ttl } = req.body;
    
    if (!req.cache) {
      return res.status(503).json({ 
//         success: false, 
//         error: 'Cache not available' 
      });
    }
    
    switch (action) {
      case 'set':
        const setResult = await req.cache.set(key, value, ttl || 60);
        return res.json({ 
//           success: setResult, 
//           message: setResult ? 'Value cached successfully' : 'Failed to cache value' 
        });
        
      case 'get':
        const getResult = await req.cache.get(key);
        return res.json({ 
//           success: true, 
//           value: getResult,
//           cached: getResult !== null 
        });
        
      case 'del':
        const delResult = await req.cache.del(key);
        return res.json({ 
//           success: delResult, 
//           message: delResult ? 'Value deleted successfully' : 'Failed to delete value' 
        });
        
      default:
        return res.status(400).json({ 
//           success: false, 
//           error: 'Invalid action. Use: set, get, or del' 
        });
    }
  } catch (error) {
//     // console.error('Cache test error:', error.message);
    res.status(500).json({ 
//       success: false, 
//       error: 'Cache test failed' 
    });
  }
});


module.exports = router;
