const jwt = require("jsonwebtoken");
const { pool, secretKey } = require("../../config/database");

const getUserIdFromToken = async (token) => {
  try {
    // Ensure the token format is correct
    const actualToken = token.split(" ")[1]; // Use index 1 for the token after "Bearer"

    if (!actualToken) {
      throw new Error("Token format is invalid");
    }

    // Decode and verify the token
    const decodedUser = jwt.verify(actualToken, secretKey);

    // Extract and return the user ID
    return { user_id: decodedUser.id };
  } catch (error) {
    // Handle errors and return a meaningful message
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return { error: "Forbidden: Invalid or expired token" };
    }

    return { error: "An error occurred while processing the token" };
  }
};

module.exports = getUserIdFromToken;
