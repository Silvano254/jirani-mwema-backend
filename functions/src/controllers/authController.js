const jwt = require('jsonwebtoken');
const User = require('../models/User');
const otpService = require('../services/otpService');
const smsService = require('../services/smsService');
const logger = require('../utils/logger');

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

// Send OTP for login
const sendOTP = async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    // Find user by phone number
    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found. Please contact admin for registration.'
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked due to too many failed attempts'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Please contact admin.'
      });
    }

    // Generate OTP
    const otp = otpService.generateOTP();
    await user.setOTP(otp);

    // Check if we should send real SMS (for testing)
    const enableRealSMS = process.env.ENABLE_REAL_SMS === 'true' || process.env.NODE_ENV === 'production';
    
    if (process.env.NODE_ENV === 'development' && !enableRealSMS) {
      logger.info(`Development mode: OTP for ${phoneNumber} is ${otp}`);
      
      res.status(200).json({
        success: true,
        message: 'OTP sent successfully (Development mode)',
        data: {
          phoneNumber: phoneNumber,
          expiresIn: 10, // minutes
          testOtp: otp // Show OTP in development
        }
      });
      return;
    }

    // Send SMS in production or when real SMS is enabled
    const smsMessage = `Your Jirani Mwema login code is: ${otp}. Valid for 10 minutes.`;
    logger.info(`Attempting to send SMS to ${phoneNumber} with message: ${smsMessage}`);
    
    const smsSent = await smsService.sendSMS(phoneNumber, smsMessage);
    logger.info(`SMS send result for ${phoneNumber}: ${smsSent ? 'SUCCESS' : 'FAILED'}`);

    if (!smsSent) {
      logger.error(`Failed to send OTP SMS to ${phoneNumber}`);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP. Please try again.'
      });
    }

    logger.info(`OTP sent to user ${user.id} at ${phoneNumber}`);

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        phoneNumber: phoneNumber,
        expiresIn: 10 // minutes
      }
    });

  } catch (error) {
    logger.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Verify OTP and login
const verifyOTP = async (req, res) => {
  try {
    const { phoneNumber, otp, deviceToken } = req.body;

    if (!phoneNumber || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and OTP are required'
      });
    }

    // Find user
    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked'
      });
    }

    // Verify OTP
    if (!user.compareOTP(otp)) {
      await user.incrementLoginAttempts();
      
      const errorMsg = !user.otpCode ? 'No OTP found. Please request a new OTP.' 
                      : user.otpExpires <= Date.now() ? 'OTP has expired. Please request a new OTP.'
                      : 'Invalid OTP. Please check and try again.';
      
      return res.status(400).json({
        success: false,
        message: errorMsg
      });
    }

    // Clear OTP and login attempts
    await user.clearOTP();
    await user.resetLoginAttempts();
    await user.updateLastLogin();

    // Update device token if provided
    if (deviceToken) {
      user.deviceToken = deviceToken;
      await user.save();
    }

    // Generate JWT token
    const token = generateToken(user._id);

    logger.info(`User ${user.id} logged in successfully`);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user._id,
          phoneNumber: user.phoneNumber,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: user.fullName,
          role: user.role,
          isActive: user.isActive,
          fingerprintEnabled: user.fingerprintEnabled,
          isProxyManaged: user.isProxyManaged
        }
      }
    });

  } catch (error) {
    logger.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Biometric login
const biometricLogin = async (req, res) => {
  try {
    const { phoneNumber, deviceToken } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if biometric is enabled
    if (!user.fingerprintEnabled) {
      return res.status(403).json({
        success: false,
        message: 'Biometric login is not enabled for this account'
      });
    }

    // Check if account is active and not locked
    if (!user.isActive || user.isLocked) {
      return res.status(403).json({
        success: false,
        message: 'Account access denied'
      });
    }

    await user.updateLastLogin();

    // Update device token if provided
    if (deviceToken) {
      user.deviceToken = deviceToken;
      await user.save();
    }

    // Generate JWT token
    const token = generateToken(user._id);

    logger.info(`User ${user.id} logged in with biometrics`);

    res.status(200).json({
      success: true,
      message: 'Biometric login successful',
      data: {
        token,
        user: {
          id: user._id,
          phoneNumber: user.phoneNumber,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: user.fullName,
          role: user.role,
          isActive: user.isActive,
          fingerprintEnabled: user.fingerprintEnabled,
          isProxyManaged: user.isProxyManaged
        }
      }
    });

  } catch (error) {
    logger.error('Biometric login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Toggle fingerprint setting
const toggleFingerprint = async (req, res) => {
  try {
    const { enabled } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.fingerprintEnabled = enabled;
    await user.save();

    logger.info(`User ${userId} ${enabled ? 'enabled' : 'disabled'} fingerprint login`);

    res.status(200).json({
      success: true,
      message: `Fingerprint login ${enabled ? 'enabled' : 'disabled'}`,
      data: {
        fingerprintEnabled: user.fingerprintEnabled
      }
    });

  } catch (error) {
    logger.error('Toggle fingerprint error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Logout
const logout = async (req, res) => {
  try {
    const userId = req.user.id;

    // Clear device token
    await User.findByIdAndUpdate(userId, { deviceToken: null });

    logger.info(`User ${userId} logged out`);

    res.status(200).json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Refresh token
const refreshToken = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user || !user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    // Generate new token
    const token = generateToken(userId);

    res.status(200).json({
      success: true,
      message: 'Token refreshed',
      data: { token }
    });

  } catch (error) {
    logger.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  sendOTP,
  verifyOTP,
  biometricLogin,
  toggleFingerprint,
  logout,
  refreshToken
};