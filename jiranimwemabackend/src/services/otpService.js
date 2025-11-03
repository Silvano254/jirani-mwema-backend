const crypto = require('crypto');
const logger = require('../utils/logger');

class OTPService {
  // Generate a 6-digit OTP
  static generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Generate a more secure OTP using crypto
  static generateSecureOTP() {
    const buffer = crypto.randomBytes(3);
    const otp = parseInt(buffer.toString('hex'), 16) % 1000000;
    return otp.toString().padStart(6, '0');
  }

  // Validate OTP format
  static isValidOTPFormat(otp) {
    if (!otp || typeof otp !== 'string') {
      return false;
    }
    
    // Check if it's exactly 6 digits
    return /^\d{6}$/.test(otp);
  }

  // Generate OTP with expiry
  static generateOTPWithExpiry(expiryMinutes = 10) {
    const otp = this.generateSecureOTP();
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
    
    logger.info(`Generated OTP: ${otp}, expires at: ${expiresAt}`);
    
    return {
      otp,
      expiresAt
    };
  }

  // Check if OTP is expired
  static isOTPExpired(expiryDate) {
    if (!expiryDate) {
      return true;
    }
    
    return new Date() > new Date(expiryDate);
  }

  // Generate OTP for testing (only in development)
  static generateTestOTP() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Test OTP cannot be generated in production');
    }
    
    return '123456'; // Fixed OTP for testing
  }

  // Rate limiting helper - check if user can request new OTP
  static canRequestNewOTP(lastOTPTime, cooldownMinutes = 1) {
    if (!lastOTPTime) {
      return true;
    }
    
    const cooldownMs = cooldownMinutes * 60 * 1000;
    const timeSinceLastOTP = Date.now() - new Date(lastOTPTime).getTime();
    
    return timeSinceLastOTP >= cooldownMs;
  }

  // Validate OTP and check expiry
  static validateOTP(providedOTP, storedOTP, expiryDate) {
    // Check format
    if (!this.isValidOTPFormat(providedOTP)) {
      return {
        valid: false,
        reason: 'Invalid OTP format'
      };
    }

    // Check if expired
    if (this.isOTPExpired(expiryDate)) {
      return {
        valid: false,
        reason: 'OTP has expired'
      };
    }

    // Check if OTP matches
    if (providedOTP !== storedOTP) {
      return {
        valid: false,
        reason: 'Invalid OTP'
      };
    }

    return {
      valid: true,
      reason: 'OTP is valid'
    };
  }

  // Hash OTP for storage (optional security measure)
  static hashOTP(otp) {
    return crypto.createHash('sha256').update(otp).digest('hex');
  }

  // Verify hashed OTP
  static verifyHashedOTP(providedOTP, hashedOTP) {
    const hashedProvided = this.hashOTP(providedOTP);
    return hashedProvided === hashedOTP;
  }
}

module.exports = OTPService;