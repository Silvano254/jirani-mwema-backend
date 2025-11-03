const admin = require('firebase-admin');
const logger = require('../utils/logger');
const Notification = require('../models/Notification');

class PushService {
  constructor() {
    this.isInitialized = false;
    this.initializeFirebase();
  }

  /**
   * Initialize Firebase Admin SDK
   */
  initializeFirebase() {
    try {
      // Check if Firebase is already initialized
      if (admin.apps.length === 0) {
        const serviceAccount = {
          type: 'service_account',
          project_id: process.env.FIREBASE_PROJECT_ID,
          private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
          private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          client_email: process.env.FIREBASE_CLIENT_EMAIL,
          client_id: process.env.FIREBASE_CLIENT_ID,
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
          auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
          client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
        };

        // Only initialize if we have the required Firebase config
        if (serviceAccount.project_id && serviceAccount.private_key && serviceAccount.client_email) {
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id
          });

          this.isInitialized = true;
          logger.info('Firebase Admin SDK initialized successfully');
        } else {
          logger.warn('Firebase configuration not found, push notifications will be disabled');
        }
      } else {
        this.isInitialized = true;
        logger.info('Firebase Admin SDK already initialized');
      }
    } catch (error) {
      logger.error('Failed to initialize Firebase Admin SDK:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Send push notification to a single device
   * @param {string} token - FCM device token
   * @param {Object} notification - Notification data
   * @returns {Object} Send result
   */
  async sendToDevice(token, notification) {
    if (!this.isInitialized) {
      return {
        success: false,
        error: 'Push service not initialized'
      };
    }

    try {
      const message = {
        token,
        notification: {
          title: notification.title,
          body: notification.message
        },
        data: {
          notificationId: notification.id?.toString() || '',
          type: notification.type || 'info',
          priority: notification.priority || 'normal',
          actionUrl: notification.actionUrl || '',
          timestamp: new Date().toISOString(),
          ...notification.data
        },
        android: {
          priority: notification.priority === 'urgent' ? 'high' : 'normal',
          notification: {
            channelId: this.getChannelId(notification.type),
            icon: 'ic_notification',
            color: this.getNotificationColor(notification.type),
            sound: notification.priority === 'urgent' ? 'default' : 'notification',
            vibrate: notification.priority === 'urgent' ? [200, 100, 200] : [100],
            sticky: notification.priority === 'urgent'
          }
        },
        apns: {
          payload: {
            aps: {
              badge: 1,
              sound: notification.priority === 'urgent' ? 'default' : 'notification.wav',
              category: notification.type,
              'thread-id': notification.category || 'general'
            }
          }
        },
        webpush: {
          headers: {
            'TTL': '300' // 5 minutes
          },
          notification: {
            icon: '/icons/notification-icon.png',
            badge: '/icons/badge-icon.png',
            requireInteraction: notification.priority === 'urgent',
            silent: notification.priority === 'low'
          }
        }
      };

      const response = await admin.messaging().send(message);
      
      logger.info('Push notification sent successfully', {
        messageId: response,
        token: token.substring(0, 20) + '...',
        type: notification.type
      });

      return {
        success: true,
        messageId: response,
        token
      };
    } catch (error) {
      logger.error('Failed to send push notification:', {
        error: error.message,
        token: token.substring(0, 20) + '...',
        errorCode: error.code
      });

      return {
        success: false,
        error: error.message,
        errorCode: error.code,
        token
      };
    }
  }

  /**
   * Send push notification to multiple devices
   * @param {Array} tokens - Array of FCM device tokens
   * @param {Object} notification - Notification data
   * @returns {Object} Send result with details
   */
  async sendToMultipleDevices(tokens, notification) {
    if (!this.isInitialized) {
      return {
        success: false,
        error: 'Push service not initialized'
      };
    }

    if (!tokens || tokens.length === 0) {
      return {
        success: false,
        error: 'No device tokens provided'
      };
    }

    try {
      const message = {
        notification: {
          title: notification.title,
          body: notification.message
        },
        data: {
          notificationId: notification.id?.toString() || '',
          type: notification.type || 'info',
          priority: notification.priority || 'normal',
          actionUrl: notification.actionUrl || '',
          timestamp: new Date().toISOString(),
          ...notification.data
        },
        android: {
          priority: notification.priority === 'urgent' ? 'high' : 'normal',
          notification: {
            channelId: this.getChannelId(notification.type),
            icon: 'ic_notification',
            color: this.getNotificationColor(notification.type)
          }
        },
        apns: {
          payload: {
            aps: {
              badge: 1,
              sound: notification.priority === 'urgent' ? 'default' : 'notification.wav'
            }
          }
        }
      };

      const response = await admin.messaging().sendMulticast({
        tokens,
        ...message
      });

      logger.info('Bulk push notifications sent', {
        totalTokens: tokens.length,
        successCount: response.successCount,
        failureCount: response.failureCount,
        type: notification.type
      });

      // Log failed tokens for cleanup
      if (response.failureCount > 0) {
        const failedTokens = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            failedTokens.push({
              token: tokens[idx].substring(0, 20) + '...',
              error: resp.error?.message,
              errorCode: resp.error?.code
            });
          }
        });

        logger.warn('Some push notifications failed:', {
          failedCount: response.failureCount,
          failedTokens
        });
      }

      return {
        success: response.successCount > 0,
        totalSent: response.successCount,
        totalFailed: response.failureCount,
        results: response.responses,
        failedTokens: response.responses
          .map((resp, idx) => (!resp.success ? tokens[idx] : null))
          .filter(token => token !== null)
      };
    } catch (error) {
      logger.error('Failed to send bulk push notifications:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send notification to a topic
   * @param {string} topic - FCM topic name
   * @param {Object} notification - Notification data
   * @returns {Object} Send result
   */
  async sendToTopic(topic, notification) {
    if (!this.isInitialized) {
      return {
        success: false,
        error: 'Push service not initialized'
      };
    }

    try {
      const message = {
        topic,
        notification: {
          title: notification.title,
          body: notification.message
        },
        data: {
          notificationId: notification.id?.toString() || '',
          type: notification.type || 'info',
          priority: notification.priority || 'normal',
          timestamp: new Date().toISOString(),
          ...notification.data
        }
      };

      const response = await admin.messaging().send(message);
      
      logger.info('Push notification sent to topic', {
        messageId: response,
        topic,
        type: notification.type
      });

      return {
        success: true,
        messageId: response,
        topic
      };
    } catch (error) {
      logger.error('Failed to send push notification to topic:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Subscribe device token to a topic
   * @param {string|Array} tokens - Device token(s)
   * @param {string} topic - Topic name
   * @returns {Object} Subscription result
   */
  async subscribeToTopic(tokens, topic) {
    if (!this.isInitialized) {
      return {
        success: false,
        error: 'Push service not initialized'
      };
    }

    try {
      const tokenArray = Array.isArray(tokens) ? tokens : [tokens];
      const response = await admin.messaging().subscribeToTopic(tokenArray, topic);
      
      logger.info('Devices subscribed to topic', {
        topic,
        successCount: response.successCount,
        failureCount: response.failureCount
      });

      return {
        success: response.successCount > 0,
        successCount: response.successCount,
        failureCount: response.failureCount,
        errors: response.errors
      };
    } catch (error) {
      logger.error('Failed to subscribe to topic:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Unsubscribe device token from a topic
   * @param {string|Array} tokens - Device token(s)
   * @param {string} topic - Topic name
   * @returns {Object} Unsubscription result
   */
  async unsubscribeFromTopic(tokens, topic) {
    if (!this.isInitialized) {
      return {
        success: false,
        error: 'Push service not initialized'
      };
    }

    try {
      const tokenArray = Array.isArray(tokens) ? tokens : [tokens];
      const response = await admin.messaging().unsubscribeFromTopic(tokenArray, topic);
      
      logger.info('Devices unsubscribed from topic', {
        topic,
        successCount: response.successCount,
        failureCount: response.failureCount
      });

      return {
        success: response.successCount > 0,
        successCount: response.successCount,
        failureCount: response.failureCount,
        errors: response.errors
      };
    } catch (error) {
      logger.error('Failed to unsubscribe from topic:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate device token
   * @param {string} token - FCM device token
   * @returns {Object} Validation result
   */
  async validateToken(token) {
    if (!this.isInitialized) {
      return {
        valid: false,
        error: 'Push service not initialized'
      };
    }

    try {
      // Try to send a minimal message to validate the token
      const message = {
        token,
        data: {
          test: 'validation'
        },
        dryRun: true // Don't actually send the message
      };

      await admin.messaging().send(message);
      
      return {
        valid: true,
        token
      };
    } catch (error) {
      logger.warn('Invalid device token:', {
        token: token.substring(0, 20) + '...',
        error: error.message
      });

      return {
        valid: false,
        error: error.message,
        errorCode: error.code
      };
    }
  }

  /**
   * Get notification channel ID based on type
   * @param {string} type - Notification type
   * @returns {string} Channel ID
   */
  getChannelId(type) {
    const channels = {
      'meeting': 'meeting_notifications',
      'payment': 'payment_notifications',
      'system': 'system_notifications',
      'urgent': 'urgent_notifications',
      'reminder': 'reminder_notifications',
      'default': 'general_notifications'
    };

    return channels[type] || channels.default;
  }

  /**
   * Get notification color based on type
   * @param {string} type - Notification type
   * @returns {string} Hex color code
   */
  getNotificationColor(type) {
    const colors = {
      'success': '#4CAF50',
      'warning': '#FF9800',
      'error': '#F44336',
      'info': '#2196F3',
      'meeting': '#9C27B0',
      'payment': '#4CAF50',
      'system': '#607D8B',
      'urgent': '#F44336'
    };

    return colors[type] || colors.info;
  }

  /**
   * Update notification delivery status
   * @param {string} notificationId - Notification ID
   * @param {string} status - Delivery status
   * @param {string} messageId - FCM message ID
   * @param {string} error - Error message if failed
   */
  async updateDeliveryStatus(notificationId, status, messageId = null, error = null) {
    try {
      const updateData = {
        'deliveryStatus.push.status': status,
        'deliveryStatus.push.sentAt': new Date()
      };

      if (messageId) {
        updateData['deliveryStatus.push.messageId'] = messageId;
      }

      if (status === 'delivered') {
        updateData['deliveryStatus.push.deliveredAt'] = new Date();
      }

      if (error) {
        updateData['deliveryStatus.push.error'] = error;
      }

      await Notification.findByIdAndUpdate(notificationId, updateData);
    } catch (updateError) {
      logger.error('Failed to update notification delivery status:', updateError);
    }
  }

  /**
   * Clean up invalid device tokens
   * @param {Array} invalidTokens - Array of invalid tokens
   */
  async cleanupInvalidTokens(invalidTokens) {
    try {
      if (invalidTokens && invalidTokens.length > 0) {
        // Here you would update your user collection to remove invalid tokens
        // This is a placeholder - implement based on your user model structure
        logger.info('Cleaning up invalid device tokens', {
          count: invalidTokens.length
        });

        // Example: Remove invalid tokens from user documents
        // await User.updateMany(
        //   { deviceTokens: { $in: invalidTokens } },
        //   { $pull: { deviceTokens: { $in: invalidTokens } } }
        // );
      }
    } catch (error) {
      logger.error('Failed to cleanup invalid tokens:', error);
    }
  }

  /**
   * Send scheduled notifications
   * @returns {Object} Processing result
   */
  async sendScheduledNotifications() {
    try {
      const now = new Date();
      
      // Get pending push notifications that are due
      const pendingNotifications = await Notification.find({
        'deliveryStatus.push.status': 'pending',
        channels: 'push',
        scheduledFor: { $lte: now },
        isArchived: false
      }).populate('recipient', 'deviceTokens firstName lastName');

      if (pendingNotifications.length === 0) {
        return {
          success: true,
          processed: 0,
          message: 'No pending push notifications'
        };
      }

      let successCount = 0;
      let failureCount = 0;

      for (const notification of pendingNotifications) {
        const recipient = notification.recipient;
        
        if (!recipient || !recipient.deviceTokens || recipient.deviceTokens.length === 0) {
          await this.updateDeliveryStatus(notification._id, 'failed', null, 'No device tokens');
          failureCount++;
          continue;
        }

        const result = await this.sendToMultipleDevices(recipient.deviceTokens, {
          id: notification._id,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          priority: notification.priority,
          actionUrl: notification.actionUrl,
          data: notification.data || {}
        });

        if (result.success) {
          await this.updateDeliveryStatus(
            notification._id, 
            'delivered', 
            'bulk_' + Date.now()
          );
          successCount++;

          // Clean up failed tokens
          if (result.failedTokens && result.failedTokens.length > 0) {
            await this.cleanupInvalidTokens(result.failedTokens);
          }
        } else {
          await this.updateDeliveryStatus(
            notification._id, 
            'failed', 
            null, 
            result.error
          );
          failureCount++;
        }
      }

      logger.info('Scheduled push notifications processed', {
        total: pendingNotifications.length,
        success: successCount,
        failed: failureCount
      });

      return {
        success: true,
        processed: pendingNotifications.length,
        success: successCount,
        failed: failureCount
      };
    } catch (error) {
      logger.error('Error processing scheduled push notifications:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get push service status
   * @returns {Object} Service status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      firebaseConfigured: !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY),
      timestamp: new Date().toISOString()
    };
  }
}

// Create singleton instance
const pushService = new PushService();

module.exports = pushService;