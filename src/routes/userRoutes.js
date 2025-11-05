const express = require('express');
const { body, param } = require('express-validator');
const {
  getAllUsers,
  getUserById,
  updateUserProfile,
  deleteUser,
  getUsersByRole,
  searchUsers,
  updateUserRole,
  toggleUserStatus,
  getUserStats,
  bulkUpdateUsers,
  registerMember,
  getMyProfile,
  updateMyProfile
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

// Middleware to log user access
const logUserAccess = (req, res, next) => {
  logger.info('User route accessed', {
    userId: req.user?.id,
    endpoint: req.originalUrl,
    method: req.method,
    ip: req.ip
  });
  next();
};

// Apply protection and logging to all routes
router.use(protect);
router.use(logUserAccess);

// Validation rules
const userIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid user ID format')
];

const updateProfileValidation = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('nationalId')
    .optional()
    .trim()
    .isLength({ min: 7, max: 8 })
    .withMessage('National ID must be 7-8 digits')
    .isNumeric()
    .withMessage('National ID must contain only numbers'),
  body('dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('Date of birth must be a valid date'),
  body('address')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Address must not exceed 200 characters'),
  body('emergencyContact')
    .optional()
    .trim()
    .matches(/^\+?254[17][0-9]{8}$|^0[17][0-9]{8}$/)
    .withMessage('Emergency contact must be a valid Kenyan phone number (Safaricom or Airtel)')
];

const roleValidation = [
  body('role')
    .isIn(['admin', 'secretary', 'treasurer', 'member'])
    .withMessage('Role must be one of: admin, chairperson, secretary, treasurer, member')
];

const statusValidation = [
  body('isActive')
    .isBoolean()
    .withMessage('Status must be a boolean value')
];

const memberRegistrationValidation = [
  body('firstName')
    .notEmpty()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name is required and must be between 2 and 50 characters'),
  body('lastName')
    .notEmpty()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name is required and must be between 2 and 50 characters'),
  body('phoneNumber')
    .notEmpty()
    .matches(/^\+?254[17][0-9]{8}$|^0[17][0-9]{8}$/)
    .withMessage('Valid Kenyan phone number is required (Safaricom or Airtel)'),
  body('nationalId')
    .notEmpty()
    .trim()
    .isLength({ min: 7, max: 8 })
    .isNumeric()
    .withMessage('Valid national ID is required (7-8 digits)'),
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Valid email address is required'),
  body('dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('Valid date of birth is required'),
  body('gender')
    .optional()
    .isIn(['male', 'female', 'other'])
    .withMessage('Gender must be male, female, or other'),
  body('role')
    .optional()
    .isIn(['member', 'secretary', 'treasurer'])
    .withMessage('Role must be member, secretary, or treasurer')
];

/**
 * @route   POST /api/users/register
 * @desc    Register a new member
 * @access  Private (Chairperson/Secretary)
 */
router.post('/register',
  authorize('chairperson', 'secretary'),
  memberRegistrationValidation,
  validate,
  registerMember
);

/**
 * @route   GET /api/users/profile
 * @desc    Get current user's profile
 * @access  Private (All authenticated users)
 */
router.get('/profile',
  getMyProfile
);

/**
 * @route   PUT /api/users/profile
 * @desc    Update current user's profile
 * @access  Private (All authenticated users)
 */
router.put('/profile',
  updateProfileValidation,
  validate,
  updateMyProfile
);

/**
 * @route   GET /api/users
 * @desc    Get all users with pagination and filtering
 * @access  Private (Admin/Secretary)
 */
router.get('/',
  authorize('admin', 'secretary'),
  getAllUsers
);

/**
 * @route   GET /api/users/stats
 * @desc    Get user statistics
 * @access  Private (Admin/Secretary)
 */
router.get('/stats',
  authorize('admin', 'secretary'),
  getUserStats
);

/**
 * @route   GET /api/users/role/:role
 * @desc    Get users by role
 * @access  Private (Admin/Secretary)
 */
router.get('/role/:role',
  authorize('admin', 'secretary'),
  [
    param('role')
      .isIn(['admin', 'secretary', 'treasurer', 'member'])
      .withMessage('Invalid role specified')
  ],
  validate,
  getUsersByRole
);

/**
 * @route   GET /api/users/search
 * @desc    Search users by name or phone
 * @access  Private (Admin/Secretary)
 */
router.get('/search',
  authorize('admin', 'secretary'),
  searchUsers
);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Private (Admin/Secretary/Own Profile)
 */
router.get('/:id',
  userIdValidation,
  validate,
  getUserById
);

/**
 * @route   PUT /api/users/:id
 * @desc    Update user profile
 * @access  Private (Admin/Own Profile)
 */
router.put('/:id',
  userIdValidation,
  updateProfileValidation,
  validate,
  updateUserProfile
);

/**
 * @route   PUT /api/users/:id/role
 * @desc    Update user role
 * @access  Private (Admin only)
 */
router.put('/:id/role',
  authorize('admin'),
  userIdValidation,
  roleValidation,
  validate,
  updateUserRole
);

/**
 * @route   PUT /api/users/:id/status
 * @desc    Toggle user active status
 * @access  Private (Admin only)
 */
router.put('/:id/status',
  authorize('admin'),
  userIdValidation,
  statusValidation,
  validate,
  toggleUserStatus
);

/**
 * @route   PUT /api/users/bulk-update
 * @desc    Bulk update multiple users
 * @access  Private (Admin only)
 */
router.put('/bulk-update',
  authorize('admin'),
  [
    body('userIds')
      .isArray({ min: 1 })
      .withMessage('User IDs must be a non-empty array'),
    body('userIds.*')
      .isMongoId()
      .withMessage('Each user ID must be valid'),
    body('updates')
      .isObject()
      .withMessage('Updates must be an object'),
    body('updates.role')
      .optional()
      .isIn(['admin', 'secretary', 'treasurer', 'member'])
      .withMessage('Role must be valid'),
    body('updates.isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be boolean')
  ],
  validate,
  bulkUpdateUsers
);

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user (soft delete)
 * @access  Private (Admin only)
 */
router.delete('/:id',
  authorize('admin'),
  userIdValidation,
  validate,
  deleteUser
);

module.exports = router;