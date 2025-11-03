const express = require('express');
const { body, param, query } = require('express-validator');
const {
  createMeeting,
  getAllMeetings,
  getMeetingById,
  updateMeeting,
  deleteMeeting,
  scheduleMeeting,
  cancelMeeting,
  markAttendance,
  getMeetingAttendance,
  sendMeetingReminders,
  getMeetingMinutes,
  updateMeetingMinutes,
  getMeetingStats
} = require('../controllers/meetingController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

// Middleware to log meeting access
const logMeetingAccess = (req, res, next) => {
  logger.info('Meeting route accessed', {
    userId: req.user?.id,
    endpoint: req.originalUrl,
    method: req.method,
    ip: req.ip
  });
  next();
};

// Apply protection and logging to all routes
router.use(protect);
router.use(logMeetingAccess);

// Validation rules
const meetingIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid meeting ID format')
];

const createMeetingValidation = [
  body('title')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Meeting title must be between 3 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),
  body('scheduledDate')
    .isISO8601()
    .withMessage('Scheduled date must be a valid date')
    .custom((value) => {
      const meetingDate = new Date(value);
      const now = new Date();
      if (meetingDate <= now) {
        throw new Error('Meeting date must be in the future');
      }
      return true;
    }),
  body('duration')
    .isInt({ min: 15, max: 480 })
    .withMessage('Duration must be between 15 and 480 minutes'),
  body('location')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Location must be between 2 and 200 characters'),
  body('meetingType')
    .isIn(['regular', 'emergency', 'special', 'annual'])
    .withMessage('Meeting type must be one of: regular, emergency, special, annual'),
  body('isVirtual')
    .optional()
    .isBoolean()
    .withMessage('isVirtual must be a boolean'),
  body('virtualLink')
    .optional()
    .isURL()
    .withMessage('Virtual link must be a valid URL'),
  body('agenda')
    .optional()
    .isArray()
    .withMessage('Agenda must be an array'),
  body('agenda.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Each agenda item must be between 1 and 200 characters')
];

/**
 * @route   GET /api/meetings
 * @desc    Get all meetings with pagination and filtering
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
    query('status')
      .optional()
      .isIn(['scheduled', 'ongoing', 'completed', 'cancelled'])
      .withMessage('Invalid status filter'),
    query('type')
      .optional()
      .isIn(['regular', 'emergency', 'special', 'annual'])
      .withMessage('Invalid type filter')
  ],
  validate,
  getAllMeetings
);

/**
 * @route   GET /api/meetings/stats
 * @desc    Get meeting statistics
 * @access  Private (Admin/Secretary)
 */
router.get('/stats',
  authorize('admin', 'secretary'),
  getMeetingStats
);

/**
 * @route   POST /api/meetings
 * @desc    Create a new meeting
 * @access  Private (Admin/Secretary)
 */
router.post('/',
  authorize('admin', 'secretary'),
  createMeetingValidation,
  validate,
  createMeeting
);

/**
 * @route   GET /api/meetings/:id
 * @desc    Get meeting by ID
 * @access  Private (All authenticated users)
 */
router.get('/:id',
  meetingIdValidation,
  validate,
  getMeetingById
);

/**
 * @route   PUT /api/meetings/:id
 * @desc    Update meeting
 * @access  Private (Admin/Secretary)
 */
router.put('/:id',
  authorize('admin', 'secretary'),
  meetingIdValidation,
  validate,
  updateMeeting
);

/**
 * @route   POST /api/meetings/:id/attendance
 * @desc    Mark attendance for a meeting
 * @access  Private (Admin/Secretary)
 */
router.post('/:id/attendance',
  authorize('admin', 'secretary'),
  meetingIdValidation,
  validate,
  markAttendance
);

/**
 * @route   GET /api/meetings/:id/attendance
 * @desc    Get meeting attendance
 * @access  Private (All authenticated users)
 */
router.get('/:id/attendance',
  meetingIdValidation,
  validate,
  getMeetingAttendance
);

/**
 * @route   DELETE /api/meetings/:id
 * @desc    Delete meeting (soft delete)
 * @access  Private (Admin only)
 */
router.delete('/:id',
  authorize('admin'),
  meetingIdValidation,
  validate,
  deleteMeeting
);

module.exports = router;