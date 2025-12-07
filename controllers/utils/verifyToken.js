const crypto = require("crypto");

const secretKey = "your-very-simple-secret-key";

// Function to validate the token
function verifyToken(token) {
  // Split the token into base64-encoded data and the signature
  const [encodedData, signature] = token.split(".");

  // Decode the base64-encoded data back to the original token string
  const tokenDataString = Buffer.from(encodedData, "base64").toString();

  // Parse the JSON string to retrieve the token data
  let tokenData;
  try {
    tokenData = JSON.parse(tokenDataString);
  } catch (error) {
    throw new Error("Invalid token data");
  }

  // Recreate the expected signature using the decoded token string
  const expectedSignature = crypto
    .createHmac("sha256", secretKey)
    .update(tokenDataString)
    .digest("hex"); // Use the full signature without slicing

  // Check if the provided signature matches the expected signature
  if (signature !== expectedSignature) {
    throw new Error("Invalid token signature");
  }

  // Check if the token has expired
  const currentTime = Math.floor(Date.now() / 1000);
  if (currentTime > tokenData.expirationTime) {
    throw new Error("Token has expired");
  }
  

  // Return the decoded token data
  return tokenData;
}

// Export the function properly
module.exports = verifyToken;