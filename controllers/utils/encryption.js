const crypto = require('crypto');

const algorithm = 'aes-256-cbc';
const secretKey = (process.env.ENCRYPTION_SECRET_KEY || 'your-32-char-secret-key-123456789012').padEnd(32, '0').slice(0, 32); // Ensure 32 bytes
const iv = crypto.randomBytes(16); // 16 bytes IV

function encrypt(text) {
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex'); // store IV + encrypted
}

function decrypt(text) {
  const [ivHex, encryptedText] = text.split(':');
  const ivBuffer = Buffer.from(ivHex, 'hex');
  const encryptedBuffer = Buffer.from(encryptedText, 'hex');

  const decipher = crypto.createDecipheriv(algorithm, Buffer.from(secretKey), ivBuffer);
  let decrypted = decipher.update(encryptedBuffer);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}
 module.exports = {encrypt, decrypt}
