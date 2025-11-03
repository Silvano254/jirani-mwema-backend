const express = require('express');
const { body, param, query } = require('express-validator');
const {
  createProxyAction,
  getAllProxyActions,
  getProxyActionById,
  approveProxyAction,
  rejectProxyAction,
  executeProxyAction,
  getUserProxyActions,
  getPendingActions,
  getProxyStats,
  cancelProxyAction,
  bulkApproveActions
} = require('../controllers/proxyController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

// Middleware to log proxy access
const logProxyAccess = (req, res, next) => {
  logger.info('Proxy route accessed', {
    userId: req.user?.id,
    endpoint: req.originalUrl,
    method: req.method,
    ip: req.ip
  });
  next();
};

// Apply protection and logging to all routes
router.use(protect);
router.use(logProxyAccess);

// Validation rules
const proxyActionIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid proxy action ID format')
];

const createProxyActionValidation = [
  body('actionType')
    .isIn(['payment', 'member_registration', 'loan_approval', 'meeting_scheduling', 'transaction_record', 'user_management'])
    .withMessage('Action type must be one of: payment, member_registration, loan_approval, meeting_scheduling, transaction_record, user_management'),
  body('targetUserId')
    .optional()
    .isMongoId()
    .withMessage('Target user ID must be valid'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Description must be between 10 and 500 characters'),
  body('reason')
    .trim()
    .isLength({ min: 10, max: 300 })
    .withMessage('Reason must be between 10 and 300 characters'),
  body('priority')
    .optional()
    .isIn(['low', 'normal', 'high', 'urgent'])
    .withMessage('Priority must be one of: low, normal, high, urgent'),
  body('expiresAt')
    .optional()
    .isISO8601()
    .withMessage('Expiration date must be a valid date')
    .custom((value) => {
      const expiryDate = new Date(value);
      const now = new Date();
      if (expiryDate <= now) {
        throw new Error('Expiration date must be in the future');
      }
      return true;
    }),
  body('actionData')
    .isObject()
    .withMessage('Action data must be an object'),
  body('requiredApprovals')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Required approvals must be between 1 and 5'),
  body('notifyUsers')
    .optional()
    .isArray()
    .withMessage('Notify users must be an array'),
  body('notifyUsers.*')
    .optional()
    .isMongoId()
    .withMessage('Each user ID must be valid')
];

const approvalValidation = [
  body('decision')
    .isIn(['approve', 'reject'])
    .withMessage('Decision must be either approve or reject'),
  body('comment')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Comment must not exceed 300 characters'),
  body('conditions')
    .optional()
    .isArray()
    .withMessage('Conditions must be an array'),
  body('conditions.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Each condition must be between 1 and 200 characters')
];

const bulkApprovalValidation = [
  body('actionIds')
    .isArray({ min: 1 })
    .withMessage('Action IDs must be a non-empty array'),
  body('actionIds.*')
    .isMongoId()
    .withMessage('Each action ID must be valid'),
  body('decision')
    .isIn(['approve', 'reject'])
    .withMessage('Decision must be either approve or reject'),
  body('comment')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Comment must not exceed 300 characters')
];

/**
 * @route   GET /api/proxy
 * @desc    Get all proxy actions with pagination and filtering
 * @access  Private (Admin only)
 */
router.get('/',
  authorize('admin'),
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
      .isIn(['pending', 'approved', 'rejected', 'executed', 'cancelled', 'expired'])
      .withMessage('Invalid status filter'),
    query('actionType')
      .optional()
      .isIn(['payment', 'member_registration', 'loan_approval', 'meeting_scheduling', 'transaction_record', 'user_management'])
      .withMessage('Invalid action type filter'),
    query('priority')
      .optional()
      .isIn(['low', 'normal', 'high', 'urgent'])
      .withMessage('Invalid priority filter'),
    query('requestedBy')
      .optional()
      .isMongoId()
      .withMessage('Requested by must be a valid user ID')
  ],
  validate,
  getAllProxyActions
);

/**
 * @route   GET /api/proxy/pending
 * @desc    Get pending proxy actions
 * @access  Private (Admin only)
 */
router.get('/pending',
  authorize('admin'),
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('priority')
      .optional()
      .isIn(['low', 'normal', 'high', 'urgent'])
      .withMessage('Invalid priority filter')
  ],
  validate,
  getPendingActions
);

/**
 * @route   GET /api/proxy/stats
 * @desc    Get proxy action statistics
 * @access  Private (Admin only)
 */
router.get('/stats',
  authorize('admin'),
  getProxyStats
);

/**
 * @route   GET /api/proxy/my-requests
 * @desc    Get current user's proxy actions
 * @access  Private (All authenticated users)
 */
router.get('/my-requests',
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
      .isIn(['pending', 'approved', 'rejected', 'executed', 'cancelled', 'expired'])
      .withMessage('Invalid status filter')
  ],
  validate,
  getUserProxyActions
);

/**
 * @route   POST /api/proxy
 * @desc    Create a new proxy action request
 * @access  Private (All authenticated users)
 */
router.post('/',
  createProxyActionValidation,
  validate,
  createProxyAction
);

/**
 * @route   GET /api/proxy/:id
 * @desc    Get proxy action by ID
 * @access  Private (Admin or request owner)
 */
router.get('/:id',
  proxyActionIdValidation,
  validate,
  getProxyActionById
);

/**
 * @route   PUT /api/proxy/:id/approve
 * @desc    Approve a proxy action
 * @access  Private (Admin only)
 */
router.put('/:id/approve',
  authorize('admin'),
  proxyActionIdValidation,
  approvalValidation,
  validate,
  approveProxyAction
);

/**
 * @route   PUT /api/proxy/:id/reject
 * @desc    Reject a proxy action
 * @access  Private (Admin only)
 */
router.put('/:id/reject',
  authorize('admin'),
  proxyActionIdValidation,
  approvalValidation,
  validate,
  rejectProxyAction
);

/**
 * @route   POST /api/proxy/:id/execute
 * @desc    Execute an approved proxy action
 * @access  Private (Admin only)
 */
router.post('/:id/execute',
  authorize('admin'),
  proxyActionIdValidation,
  [
    body('executionNotes')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Execution notes must not exceed 500 characters')
  ],
  validate,
  executeProxyAction
);

/**
 * @route   PUT /api/proxy/:id/cancel
 * @desc    Cancel a proxy action
 * @access  Private (Admin or request owner)
 */
router.put('/:id/cancel',
  proxyActionIdValidation,
  [
    body('reason')
      .trim()
      .isLength({ min: 5, max: 200 })
      .withMessage('Cancellation reason must be between 5 and 200 characters')
  ],
  validate,
  cancelProxyAction
);

/**
 * @route   PUT /api/proxy/bulk-approve
 * @desc    Bulk approve/reject proxy actions
 * @access  Private (Admin only)
 */
router.put('/bulk-approve',
  authorize('admin'),
  bulkApprovalValidation,
  validate,
  bulkApproveActions
);

module.exports = router;