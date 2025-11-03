const express = require('express');
const { body, param, query } = require('express-validator');
const {
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
} = require('../controllers/notificationController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

// Middleware to log notification access
const logNotificationAccess = (req, res, next) => {
  logger.info('Notification route accessed', {
    userId: req.user?.id,
    endpoint: req.originalUrl,
    method: req.method,
    ip: req.ip
  });
  next();
};

// Apply protection and logging to all routes
router.use(protect);
router.use(logNotificationAccess);

// Validation rules
const notificationIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid notification ID format')
];

const sendNotificationValidation = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title must be between 1 and 100 characters'),
  body('message')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Message must be between 1 and 500 characters'),
  body('type')
    .isIn(['info', 'warning', 'success', 'error', 'meeting', 'payment', 'system'])
    .withMessage('Type must be one of: info, warning, success, error, meeting, payment, system'),
  body('recipients')
    .isArray({ min: 1 })
    .withMessage('Recipients must be a non-empty array'),
  body('recipients.*')
    .isMongoId()
    .withMessage('Each recipient must be a valid user ID'),
  body('priority')
    .optional()
    .isIn(['low', 'normal', 'high', 'urgent'])
    .withMessage('Priority must be one of: low, normal, high, urgent'),
  body('channels')
    .optional()
    .isArray()
    .withMessage('Channels must be an array'),
  body('channels.*')
    .optional()
    .isIn(['push', 'sms', 'email', 'in-app'])
    .withMessage('Each channel must be one of: push, sms, email, in-app'),
  body('scheduledFor')
    .optional()
    .isISO8601()
    .withMessage('Scheduled date must be a valid date'),
  body('data')
    .optional()
    .isObject()
    .withMessage('Data must be an object')
];

const bulkNotificationValidation = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title must be between 1 and 100 characters'),
  body('message')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Message must be between 1 and 500 characters'),
  body('type')
    .isIn(['info', 'warning', 'success', 'error', 'meeting', 'payment', 'system'])
    .withMessage('Type must be one of: info, warning, success, error, meeting, payment, system'),
  body('recipientType')
    .isIn(['all', 'role', 'custom'])
    .withMessage('Recipient type must be one of: all, role, custom'),
  body('role')
    .if(body('recipientType').equals('role'))
    .isIn(['admin', 'secretary', 'treasurer', 'member'])
    .withMessage('Role must be one of: admin, secretary, treasurer, member'),
  body('customRecipients')
    .if(body('recipientType').equals('custom'))
    .isArray({ min: 1 })
    .withMessage('Custom recipients must be a non-empty array'),
  body('priority')
    .optional()
    .isIn(['low', 'normal', 'high', 'urgent'])
    .withMessage('Priority must be one of: low, normal, high, urgent'),
  body('channels')
    .optional()
    .isArray()
    .withMessage('Channels must be an array')
];

const notificationSettingsValidation = [
  body('pushNotifications')
    .optional()
    .isBoolean()
    .withMessage('Push notifications must be a boolean'),
  body('smsNotifications')
    .optional()
    .isBoolean()
    .withMessage('SMS notifications must be a boolean'),
  body('emailNotifications')
    .optional()
    .isBoolean()
    .withMessage('Email notifications must be a boolean'),
  body('meetingReminders')
    .optional()
    .isBoolean()
    .withMessage('Meeting reminders must be a boolean'),
  body('paymentAlerts')
    .optional()
    .isBoolean()
    .withMessage('Payment alerts must be a boolean'),
  body('systemUpdates')
    .optional()
    .isBoolean()
    .withMessage('System updates must be a boolean'),
  body('quietHours')
    .optional()
    .isObject()
    .withMessage('Quiet hours must be an object'),
  body('quietHours.enabled')
    .optional()
    .isBoolean()
    .withMessage('Quiet hours enabled must be a boolean'),
  body('quietHours.startTime')
    .optional()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Start time must be in HH:MM format'),
  body('quietHours.endTime')
    .optional()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('End time must be in HH:MM format')
];

/**
 * @route   GET /api/notifications
 * @desc    Get user's notifications with pagination
 * @access  Private (All authenticated users)
 */
router.get('/',
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('read')
      .optional()
      .isBoolean()
      .withMessage('Read filter must be a boolean'),
    query('type')
      .optional()
      .isIn(['info', 'warning', 'success', 'error', 'meeting', 'payment', 'system'])
      .withMessage('Invalid type filter'),
    query('priority')
      .optional()
      .isIn(['low', 'normal', 'high', 'urgent'])
      .withMessage('Invalid priority filter')
  ],
  validate,
  getUserNotifications
);

/**
 * @route   GET /api/notifications/all
 * @desc    Get all notifications (admin view)
 * @access  Private (Admin/Secretary)
 */
router.get('/all',
  authorize('admin', 'secretary'),
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ],
  validate,
  getAllNotifications
);

/**
 * @route   GET /api/notifications/stats
 * @desc    Get notification statistics
 * @access  Private (Admin/Secretary)
 */
router.get('/stats',
  authorize('admin', 'secretary'),
  getNotificationStats
);

/**
 * @route   GET /api/notifications/settings
 * @desc    Get user notification settings
 * @access  Private (All authenticated users)
 */
router.get('/settings',
  getNotificationSettings
);

/**
 * @route   PUT /api/notifications/settings
 * @desc    Update user notification settings
 * @access  Private (All authenticated users)
 */
router.put('/settings',
  notificationSettingsValidation,
  validate,
  updateNotificationSettings
);

/**
 * @route   POST /api/notifications
 * @desc    Send notification to specific users
 * @access  Private (Admin/Secretary)
 */
router.post('/',
  authorize('admin', 'secretary'),
  sendNotificationValidation,
  validate,
  sendNotification
);

/**
 * @route   POST /api/notifications/bulk
 * @desc    Send bulk notification
 * @access  Private (Admin/Secretary)
 */
router.post('/bulk',
  authorize('admin', 'secretary'),
  bulkNotificationValidation,
  validate,
  sendBulkNotification
);

/**
 * @route   GET /api/notifications/:id
 * @desc    Get notification by ID
 * @access  Private (All authenticated users)
 */
router.get('/:id',
  notificationIdValidation,
  validate,
  getNotificationById
);

/**
 * @route   PUT /api/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private (All authenticated users)
 */
router.put('/:id/read',
  notificationIdValidation,
  validate,
  markAsRead
);

/**
 * @route   PUT /api/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private (All authenticated users)
 */
router.put('/read-all',
  markAllAsRead
);

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete notification
 * @access  Private (Own notifications or Admin)
 */
router.delete('/:id',
  notificationIdValidation,
  validate,
  deleteNotification
);

module.exports = router;