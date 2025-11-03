const crypto = require('crypto');
const logger = require('../utils/logger');
const User = require('../models/User');

class FingerprintService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 16;
    this.tagLength = 16;
    this.secretKey = process.env.FINGERPRINT_SECRET_KEY || crypto.randomBytes(this.keyLength);
  }

  /**
   * Generate a secure fingerprint token for a user
   * @param {string} userId - User ID
   * @param {string} deviceId - Device identifier
   * @returns {Object} Fingerprint token data
   */
  generateFingerprintToken(userId, deviceId) {
    try {
      const tokenData = {
        userId,
        deviceId,
        timestamp: Date.now(),
        random: crypto.randomBytes(16).toString('hex')
      };

      const token = this.encryptData(JSON.stringify(tokenData));
      
      logger.info('Fingerprint token generated', { 
        userId, 
        deviceId: deviceId?.substring(0, 8) + '...' 
      });

      return {
        success: true,
        token,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        deviceId
      };
    } catch (error) {
      logger.error('Error generating fingerprint token:', error);
      return {
        success: false,
        error: 'Failed to generate fingerprint token'
      };
    }
  }

  /**
   * Verify a fingerprint token
   * @param {string} token - Encrypted fingerprint token
   * @param {string} userId - User ID to verify against
   * @param {string} deviceId - Device ID to verify against
   * @returns {Object} Verification result
   */
  verifyFingerprintToken(token, userId, deviceId) {
    try {
      const decryptedData = this.decryptData(token);
      const tokenData = JSON.parse(decryptedData);

      // Verify token data
      if (tokenData.userId !== userId) {
        logger.warn('Fingerprint token verification failed - User ID mismatch', {
          expectedUserId: userId,
          tokenUserId: tokenData.userId
        });
        return {
          success: false,
          error: 'Invalid token for user'
        };
      }

      if (tokenData.deviceId !== deviceId) {
        logger.warn('Fingerprint token verification failed - Device ID mismatch', {
          expectedDeviceId: deviceId?.substring(0, 8) + '...',
          tokenDeviceId: tokenData.deviceId?.substring(0, 8) + '...'
        });
        return {
          success: false,
          error: 'Invalid token for device'
        };
      }

      // Check token age (max 30 days)
      const tokenAge = Date.now() - tokenData.timestamp;
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

      if (tokenAge > maxAge) {
        logger.warn('Fingerprint token verification failed - Token expired', {
          userId,
          tokenAge: Math.round(tokenAge / (24 * 60 * 60 * 1000)) + ' days'
        });
        return {
          success: false,
          error: 'Token has expired'
        };
      }

      logger.info('Fingerprint token verified successfully', { userId });

      return {
        success: true,
        tokenData
      };
    } catch (error) {
      logger.error('Error verifying fingerprint token:', error);
      return {
        success: false,
        error: 'Invalid or corrupted token'
      };
    }
  }

  /**
   * Enable fingerprint authentication for a user
   * @param {string} userId - User ID
   * @param {string} deviceId - Device identifier
   * @returns {Object} Enable result with token
   */
  async enableFingerprint(userId, deviceId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      // Generate new fingerprint token
      const tokenResult = this.generateFingerprintToken(userId, deviceId);
      if (!tokenResult.success) {
        return tokenResult;
      }

      // Update user's fingerprint settings
      user.fingerprintEnabled = true;
      user.fingerprintDevices = user.fingerprintDevices || [];
      
      // Remove existing device if present
      user.fingerprintDevices = user.fingerprintDevices.filter(
        device => device.deviceId !== deviceId
      );

      // Add new device
      user.fingerprintDevices.push({
        deviceId,
        token: tokenResult.token,
        enabledAt: new Date(),
        lastUsedAt: null,
        isActive: true
      });

      await user.save();

      logger.info('Fingerprint authentication enabled', { 
        userId, 
        deviceId: deviceId?.substring(0, 8) + '...',
        totalDevices: user.fingerprintDevices.length
      });

      return {
        success: true,
        token: tokenResult.token,
        message: 'Fingerprint authentication enabled successfully'
      };
    } catch (error) {
      logger.error('Error enabling fingerprint authentication:', error);
      return {
        success: false,
        error: 'Failed to enable fingerprint authentication'
      };
    }
  }

  /**
   * Disable fingerprint authentication for a user
   * @param {string} userId - User ID
   * @param {string} deviceId - Device identifier (optional, if not provided disables all)
   * @returns {Object} Disable result
   */
  async disableFingerprint(userId, deviceId = null) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      if (deviceId) {
        // Disable for specific device
        user.fingerprintDevices = user.fingerprintDevices.filter(
          device => device.deviceId !== deviceId
        );

        // If no devices left, disable fingerprint completely
        if (user.fingerprintDevices.length === 0) {
          user.fingerprintEnabled = false;
        }

        logger.info('Fingerprint authentication disabled for device', { 
          userId, 
          deviceId: deviceId?.substring(0, 8) + '...',
          remainingDevices: user.fingerprintDevices.length
        });
      } else {
        // Disable for all devices
        user.fingerprintEnabled = false;
        user.fingerprintDevices = [];

        logger.info('Fingerprint authentication disabled for all devices', { userId });
      }

      await user.save();

      return {
        success: true,
        message: deviceId ? 
          'Fingerprint authentication disabled for device' : 
          'Fingerprint authentication disabled for all devices'
      };
    } catch (error) {
      logger.error('Error disabling fingerprint authentication:', error);
      return {
        success: false,
        error: 'Failed to disable fingerprint authentication'
      };
    }
  }

  /**
   * Authenticate user with fingerprint token
   * @param {string} token - Fingerprint token
   * @param {string} deviceId - Device identifier
   * @returns {Object} Authentication result
   */
  async authenticateWithFingerprint(token, deviceId) {
    try {
      // First decrypt and get basic token data
      const decryptedData = this.decryptData(token);
      const tokenData = JSON.parse(decryptedData);

      const user = await User.findById(tokenData.userId);
      if (!user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      if (!user.fingerprintEnabled) {
        return {
          success: false,
          error: 'Fingerprint authentication is disabled for this user'
        };
      }

      if (!user.isActive) {
        return {
          success: false,
          error: 'User account is inactive'
        };
      }

      // Find the device
      const device = user.fingerprintDevices.find(d => d.deviceId === deviceId);
      if (!device || !device.isActive) {
        return {
          success: false,
          error: 'Device not registered for fingerprint authentication'
        };
      }

      // Verify the token
      const verificationResult = this.verifyFingerprintToken(token, user._id.toString(), deviceId);
      if (!verificationResult.success) {
        return verificationResult;
      }

      // Update last used timestamp
      device.lastUsedAt = new Date();
      user.lastLoginAt = new Date();
      await user.save();

      logger.info('Fingerprint authentication successful', { 
        userId: user._id, 
        deviceId: deviceId?.substring(0, 8) + '...'
      });

      return {
        success: true,
        user: {
          id: user._id,
          phoneNumber: user.phoneNumber,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: user.fullName,
          role: user.role,
          isActive: user.isActive
        }
      };
    } catch (error) {
      logger.error('Error authenticating with fingerprint:', error);
      return {
        success: false,
        error: 'Authentication failed'
      };
    }
  }

  /**
   * Get fingerprint devices for a user
   * @param {string} userId - User ID
   * @returns {Object} User's fingerprint devices
   */
  async getUserFingerprintDevices(userId) {
    try {
      const user = await User.findById(userId).select('fingerprintEnabled fingerprintDevices');
      if (!user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      const devices = user.fingerprintDevices.map(device => ({
        deviceId: device.deviceId?.substring(0, 8) + '...',
        enabledAt: device.enabledAt,
        lastUsedAt: device.lastUsedAt,
        isActive: device.isActive
      }));

      return {
        success: true,
        fingerprintEnabled: user.fingerprintEnabled,
        devices,
        totalDevices: devices.length
      };
    } catch (error) {
      logger.error('Error getting user fingerprint devices:', error);
      return {
        success: false,
        error: 'Failed to get fingerprint devices'
      };
    }
  }

  /**
   * Clean up expired fingerprint tokens
   * @returns {Object} Cleanup result
   */
  async cleanupExpiredTokens() {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const result = await User.updateMany(
        {},
        {
          $pull: {
            fingerprintDevices: {
              enabledAt: { $lt: thirtyDaysAgo },
              lastUsedAt: { $lt: thirtyDaysAgo }
            }
          }
        }
      );

      // Disable fingerprint for users with no devices left
      await User.updateMany(
        { fingerprintDevices: { $size: 0 } },
        { $set: { fingerprintEnabled: false } }
      );

      logger.info('Fingerprint token cleanup completed', {
        modifiedCount: result.modifiedCount
      });

      return {
        success: true,
        cleanedTokens: result.modifiedCount
      };
    } catch (error) {
      logger.error('Error cleaning up expired fingerprint tokens:', error);
      return {
        success: false,
        error: 'Failed to cleanup expired tokens'
      };
    }
  }

  /**
   * Encrypt data using AES-256-GCM
   * @param {string} text - Text to encrypt
   * @returns {string} Encrypted data with IV and tag
   */
  encryptData(text) {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipher(this.algorithm, this.secretKey, { iv });
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    // Combine IV, tag, and encrypted data
    return iv.toString('hex') + tag.toString('hex') + encrypted;
  }

  /**
   * Decrypt data using AES-256-GCM
   * @param {string} encryptedData - Encrypted data with IV and tag
   * @returns {string} Decrypted text
   */
  decryptData(encryptedData) {
    const iv = Buffer.from(encryptedData.slice(0, this.ivLength * 2), 'hex');
    const tag = Buffer.from(encryptedData.slice(this.ivLength * 2, (this.ivLength + this.tagLength) * 2), 'hex');
    const encrypted = encryptedData.slice((this.ivLength + this.tagLength) * 2);
    
    const decipher = crypto.createDecipher(this.algorithm, this.secretKey, { iv });
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Generate device fingerprint based on device characteristics
   * @param {Object} deviceInfo - Device information
   * @returns {string} Device fingerprint
   */
  generateDeviceFingerprint(deviceInfo) {
    const {
      platform,
      version,
      model,
      manufacturer,
      screenResolution,
      userAgent
    } = deviceInfo;

    const fingerprint = crypto
      .createHash('sha256')
      .update(`${platform}-${version}-${model}-${manufacturer}-${screenResolution}-${userAgent}`)
      .digest('hex');

    return fingerprint.substring(0, 16); // Use first 16 characters
  }
}

// Create singleton instance
const fingerprintService = new FingerprintService();

module.exports = fingerprintService;