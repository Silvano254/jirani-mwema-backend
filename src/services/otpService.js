const crypto = require('crypto');
const logger = require('../utils/logger');
const otpGenerator = require('../utils/otpGenerator');

class OTPService {
  // Generate a 6-digit OTP using the utility
  static generateOTP() {
    return otpGenerator.generateNumericOTP();
  }

  // Generate a more secure OTP using crypto (kept for compatibility)
  static generateSecureOTP() {
    return otpGenerator.generateSecureOTP(6);
  }

  // Validate OTP format
  static isValidOTPFormat(otp) {
    return otpGenerator.validateOTPFormat(otp, 6, false);
  }

  // Generate OTP with expiry using the utility
  static generateOTPWithExpiry(expiryMinutes = 10) {
    const otpData = otpGenerator.generateOTPWithExpiry(6, expiryMinutes);
    
    logger.info(`Generated OTP: ${otpData.otp}, expires at: ${otpData.expiresAt}`);
    
    return {
      otp: otpData.otp,
      expiresAt: otpData.expiresAt
    };
  }

  // Check if OTP is expired
  static isOTPExpired(expiryDate) {
    return otpGenerator.isOTPExpired(expiryDate);
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