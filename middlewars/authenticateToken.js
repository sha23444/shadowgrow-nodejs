const jwt = require("jsonwebtoken");
const { secretKey } = require("../config/database");

function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ 
        error: "Authentication failed", 
        message: "Authorization header missing or invalid",
        status: 401
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ 
        error: "Authentication failed", 
        message: "Token is missing",
        status: 401
      });
    }

    if (!secretKey) {
//       // console.error("Secret key is missing in configuration.");
      return res.status(500).json({ 
        error: "Server configuration error",
        message: "Authentication service unavailable",
        status: 500
      });
    }

    jwt.verify(token, secretKey, (err, user) => {
      if (err) {
        // Handle specific JWT errors
        let errorMessage = "Authentication failed";
        let status = 401;

        switch (err.name) {
          case 'TokenExpiredError':
            errorMessage = "Token expired, please login again";
            status = 401;
            // Don't log expired tokens - they're common and expected
            break;
          case 'JsonWebTokenError':
            errorMessage = "Invalid token, please login again";
            status = 401;
            // Don't log invalid tokens - they're common and expected
            break;
          case 'NotBeforeError':
            errorMessage = "Token not active yet";
            status = 401;
            break;
          default:
            errorMessage = "Authentication failed";
            status = 401;
        }

        // Only log unexpected authentication errors, not common JWT issues
        if (err.name !== 'TokenExpiredError' && err.name !== 'JsonWebTokenError') {
//           // console.warn("Unexpected Authentication Error:", {
//             name: err.name,
//             message: err.message,
//             url: req.url,
//             method: req.method,
//             ip: req.ip,
//             timestamp: new Date().toISOString()
//           });
        }

        return res.status(status).json({ 
          error: "Authentication failed",
          message: errorMessage,
          status: status
        });
      }

      // Token is valid, attach user to request
      req.user = user;
      next();
    });
  } catch (error) {
    // Catch any unexpected errors in the middleware
//     // console.error("Unexpected error in authenticateToken middleware:", {
//       error: error.message,
//       stack: error.stack,
//       url: req.url,
//       method: req.method,
//       ip: req.ip,
//       timestamp: new Date().toISOString()
//     });

    return res.status(500).json({ 
      error: "Internal server error",
      message: "Authentication service temporarily unavailable",
      status: 500
    });
  }
}

module.exports = authenticateToken;
