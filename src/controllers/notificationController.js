const Notification = require('../models/Notification');
const User = require('../models/User');
const logger = require('../utils/logger');
const smsService = require('../services/smsService');
const { validationResult } = require('express-validator');

/**
 * @desc    Send notification to specific users
 * @route   POST /api/notifications
 * @access  Private (Admin/Secretary)
 */
const sendNotification = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { title, message, type, recipients, priority = 'normal', channels = ['in-app'], scheduledFor, data } = req.body;

    // Create notifications for each recipient
    const notifications = recipients.map(recipientId => ({
      title,
      message,
      type,
      recipient: recipientId,
      sender: req.user.id,
      priority,
      channels,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : new Date(),
      data: data || {}
    }));

    const createdNotifications = await Notification.insertMany(notifications);

    // Send SMS if SMS channel is enabled
    if (channels.includes('sms')) {
      try {
        const recipientUsers = await User.find({ _id: { $in: recipients } }).select('phoneNumber');
        const phoneNumbers = recipientUsers.map(user => user.phoneNumber);
        
        await smsService.sendBulkSMS(phoneNumbers, message);
      } catch (smsError) {
        logger.error('Error sending SMS notifications:', smsError);
      }
    }

    logger.info('Notifications sent', { 
      count: createdNotifications.length, 
      type, 
      sentBy: req.user.id 
    });

    res.status(201).json({
      success: true,
      message: `${createdNotifications.length} notifications sent successfully`,
      data: createdNotifications
    });
  } catch (error) {
    logger.error('Error sending notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while sending notifications'
    });
  }
};

/**
 * @desc    Send bulk notification
 * @route   POST /api/notifications/bulk
 * @access  Private (Admin/Secretary)
 */
const sendBulkNotification = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { title, message, type, recipientType, role, customRecipients, priority = 'normal', channels = ['in-app'] } = req.body;

    let recipients = [];

    // Determine recipients based on type
    switch (recipientType) {
      case 'all':
        recipients = await User.find({ isActive: true }).select('_id phoneNumber');
        break;
      case 'role':
        recipients = await User.find({ role, isActive: true }).select('_id phoneNumber');
        break;
      case 'custom':
        recipients = await User.find({ _id: { $in: customRecipients }, isActive: true }).select('_id phoneNumber');
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid recipient type'
        });
    }

    if (recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No recipients found'
      });
    }

    // Create notifications for all recipients
    const notifications = recipients.map(recipient => ({
      title,
      message,
      type,
      recipient: recipient._id,
      sender: req.user.id,
      priority,
      channels
    }));

    const createdNotifications = await Notification.insertMany(notifications);

    // Send SMS if SMS channel is enabled
    if (channels.includes('sms')) {
      try {
        const phoneNumbers = recipients.map(user => user.phoneNumber);
        await smsService.sendBulkSMS(phoneNumbers, message);
      } catch (smsError) {
        logger.error('Error sending bulk SMS notifications:', smsError);
      }
    }

    logger.info('Bulk notifications sent', { 
      count: createdNotifications.length, 
      type,
      recipientType,
      sentBy: req.user.id 
    });

    res.status(201).json({
      success: true,
      message: `${createdNotifications.length} notifications sent successfully`,
      data: {
        count: createdNotifications.length,
        recipientType,
        channels
      }
    });
  } catch (error) {
    logger.error('Error sending bulk notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while sending bulk notifications'
    });
  }
};

/**
 * @desc    Get all notifications (admin view)
 * @route   GET /api/notifications/all
 * @access  Private (Admin/Secretary)
 */
const getAllNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const notifications = await Notification.find()
      .populate('recipient', 'firstName lastName phoneNumber')
      .populate('sender', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Notification.countDocuments();

    res.status(200).json({
      success: true,
      data: {
        notifications,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalNotifications: total
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching all notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching notifications'
    });
  }
};

/**
 * @desc    Get user's notifications
 * @route   GET /api/notifications
 * @access  Private (All authenticated users)
 */
const getUserNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, read, type, priority } = req.query;
    const skip = (page - 1) * limit;
    
    const query = { recipient: req.user.id };
    
    if (read !== undefined) query.isRead = read === 'true';
    if (type) query.type = type;
    if (priority) query.priority = priority;

    const notifications = await Notification.find(query)
      .populate('sender', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ recipient: req.user.id, isRead: false });

    res.status(200).json({
      success: true,
      data: {
        notifications,
        unreadCount,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalNotifications: total
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching user notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching notifications'
    });
  }
};

/**
 * @desc    Get notification by ID
 * @route   GET /api/notifications/:id
 * @access  Private (All authenticated users)
 */
const getNotificationById = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findById(id)
      .populate('recipient', 'firstName lastName')
      .populate('sender', 'firstName lastName');

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Check if user can access this notification
    if (notification.recipient._id.toString() !== req.user.id && 
        !['admin', 'chairperson', 'secretary'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: notification
    });
  } catch (error) {
    logger.error('Error fetching notification:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching notification'
    });
  }
};

/**
 * @desc    Mark notification as read
 * @route   PUT /api/notifications/:id/read
 * @access  Private (All authenticated users)
 */
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipient: req.user.id },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
  } catch (error) {
    logger.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating notification'
    });
  }
};

/**
 * @desc    Mark all notifications as read
 * @route   PUT /api/notifications/read-all
 * @access  Private (All authenticated users)
 */
const markAllAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { recipient: req.user.id, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`
    });
  } catch (error) {
    logger.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating notifications'
    });
  }
};

/**
 * @desc    Get notification statistics
 * @route   GET /api/notifications/stats
 * @access  Private (Admin/Secretary)
 */
const getNotificationStats = async (req, res) => {
  try {
    const totalNotifications = await Notification.countDocuments();
    const unreadNotifications = await Notification.countDocuments({ isRead: false });
    
    const typeStats = await Notification.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]);

    const priorityStats = await Notification.aggregate([
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]);

    const recentNotifications = await Notification.find()
      .populate('recipient', 'firstName lastName')
      .populate('sender', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      data: {
        overview: {
          total: totalNotifications,
          unread: unreadNotifications,
          read: totalNotifications - unreadNotifications
        },
        byType: typeStats.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byPriority: priorityStats.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        recentNotifications
      }
    });
  } catch (error) {
    logger.error('Error fetching notification stats:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching notification statistics'
    });
  }
};

/**
 * @desc    Get user notification settings
 * @route   GET /api/notifications/settings
 * @access  Private (All authenticated users)
 */
const getNotificationSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('notificationSettings');
    
    res.status(200).json({
      success: true,
      data: user.notificationSettings || {
        pushNotifications: true,
        smsNotifications: true,
        emailNotifications: false,
        meetingReminders: true,
        paymentAlerts: true,
        systemUpdates: true,
        quietHours: {
          enabled: false,
          startTime: '22:00',
          endTime: '07:00'
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching notification settings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching notification settings'
    });
  }
};

/**
 * @desc    Update user notification settings
 * @route   PUT /api/notifications/settings
 * @access  Private (All authenticated users)
 */
const updateNotificationSettings = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { notificationSettings: req.body },
      { new: true, runValidators: true }
    ).select('notificationSettings');

    res.status(200).json({
      success: true,
      message: 'Notification settings updated successfully',
      data: user.notificationSettings
    });
  } catch (error) {
    logger.error('Error updating notification settings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating notification settings'
    });
  }
};

/**
 * @desc    Delete notification
 * @route   DELETE /api/notifications/:id
 * @access  Private (Own notifications or Admin)
 */
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    const query = { _id: id };
    
    // If not admin/secretary, can only delete own notifications
    if (!['admin', 'chairperson', 'secretary'].includes(req.user.role)) {
      query.recipient = req.user.id;
    }

    const notification = await Notification.findOneAndDelete(query);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting notification'
    });
  }
};

module.exports = {
  sendNotification,
  getAllNotifications,
  getNotificationById,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUserNotifications,
  sendBulkNotification,
  getNotificationStats,
  updateNotificationSettings,
  getNotificationSettings
};