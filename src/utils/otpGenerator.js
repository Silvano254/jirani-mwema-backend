// OTP generator utility
const crypto = require('crypto');

/**
 * Generate a random OTP (One-Time Password)
 * @param {number} length - Length of the OTP (default: 6)
 * @param {boolean} alphanumeric - Include letters (default: false, numbers only)
 * @returns {string} Generated OTP
 */
function generateOTP(length = 6, alphanumeric = false) {
  if (length < 4 || length > 10) {
    throw new Error('OTP length must be between 4 and 10 digits');
  }

  if (alphanumeric) {
    // Generate alphanumeric OTP (numbers + uppercase letters)
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let otp = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, chars.length);
      otp += chars[randomIndex];
    }
    
    return otp;
  } else {
    // Generate numeric OTP only
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    
    // Use crypto.randomInt for cryptographically secure random numbers
    return crypto.randomInt(min, max + 1).toString();
  }
}

/**
 * Generate a secure 6-digit numeric OTP
 * @returns {string} 6-digit OTP
 */
function generateNumericOTP() {
  return generateOTP(6, false);
}

/**
 * Generate a secure 4-digit PIN
 * @returns {string} 4-digit PIN
 */
function generatePIN() {
  return generateOTP(4, false);
}

/**
 * Generate an alphanumeric OTP for high-security operations
 * @param {number} length - Length of the OTP (default: 8)
 * @returns {string} Alphanumeric OTP
 */
function generateSecureOTP(length = 8) {
  return generateOTP(length, true);
}

/**
 * Validate OTP format
 * @param {string} otp - OTP to validate
 * @param {number} expectedLength - Expected length (default: 6)
 * @param {boolean} alphanumeric - Whether to allow letters (default: false)
 * @returns {boolean} True if valid format
 */
function validateOTPFormat(otp, expectedLength = 6, alphanumeric = false) {
  if (!otp || typeof otp !== 'string') {
    return false;
  }

  if (otp.length !== expectedLength) {
    return false;
  }

  if (alphanumeric) {
    // Allow numbers and uppercase letters only
    return /^[0-9A-Z]+$/.test(otp);
  } else {
    // Allow numbers only
    return /^\d+$/.test(otp);
  }
}

/**
 * Generate OTP with expiration timestamp
 * @param {number} length - OTP length (default: 6)
 * @param {number} expiryMinutes - Expiry time in minutes (default: 10)
 * @returns {object} Object with otp and expiresAt timestamp
 */
function generateOTPWithExpiry(length = 6, expiryMinutes = 10) {
  const otp = generateOTP(length);
  const expiresAt = new Date(Date.now() + (expiryMinutes * 60 * 1000));
  
  return {
    otp,
    expiresAt,
    isExpired: function() {
      return new Date() > this.expiresAt;
    }
  };
}

/**
 * Check if OTP has expired
 * @param {Date} expiryTime - Expiry timestamp
 * @returns {boolean} True if expired
 */
function isOTPExpired(expiryTime) {
  return new Date() > new Date(expiryTime);
}

module.exports = {
  generateOTP,
  generateNumericOTP,
  generatePIN,
  generateSecureOTP,
  validateOTPFormat,
  generateOTPWithExpiry,
  isOTPExpired
};