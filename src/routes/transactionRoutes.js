const express = require('express');
const { body, param, query } = require('express-validator');
const {
  createTransaction,
  getAllTransactions,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  getUserTransactions,
  getTransactionsByType,
  calculateUserBalance,
  getTransactionStats,
  exportTransactions,
  reconcileTransactions,
  approveTransaction,
  rejectTransaction,
  bulkImportTransactions,
  getMonthlyReport,
  getDashboardStats
} = require('../controllers/transactionController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

// Middleware to log transaction access
const logTransactionAccess = (req, res, next) => {
  logger.info('Transaction route accessed', {
    userId: req.user?.id,
    endpoint: req.originalUrl,
    method: req.method,
    ip: req.ip
  });
  next();
};

// Apply protection and logging to all routes
router.use(protect);
router.use(logTransactionAccess);

// Validation rules
const transactionIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid transaction ID format')
];

const createTransactionValidation = [
  body('type')
    .isIn(['contribution', 'loan', 'loan_repayment', 'fine', 'dividend', 'expense', 'income', 'transfer'])
    .withMessage('Transaction type must be one of: contribution, loan, loan_repayment, fine, dividend, expense, income, transfer'),
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be a positive number greater than 0'),
  body('description')
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('Description must be between 3 and 200 characters'),
  body('category')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Category must be between 2 and 50 characters'),
  body('reference')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Reference must be between 3 and 100 characters'),
  body('fromUserId')
    .optional()
    .isMongoId()
    .withMessage('From user ID must be valid'),
  body('toUserId')
    .optional()
    .isMongoId()
    .withMessage('To user ID must be valid'),
  body('transactionDate')
    .optional()
    .isISO8601()
    .withMessage('Transaction date must be a valid date'),
  body('dueDate')
    .optional()
    .isISO8601()
    .withMessage('Due date must be a valid date'),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('tags.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 30 })
    .withMessage('Each tag must be between 1 and 30 characters')
];

const updateTransactionValidation = [
  body('amount')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be a positive number greater than 0'),
  body('description')
    .optional()
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('Description must be between 3 and 200 characters'),
  body('category')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Category must be between 2 and 50 characters'),
  body('reference')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Reference must be between 3 and 100 characters'),
  body('transactionDate')
    .optional()
    .isISO8601()
    .withMessage('Transaction date must be a valid date'),
  body('dueDate')
    .optional()
    .isISO8601()
    .withMessage('Due date must be a valid date'),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array')
];

const approvalValidation = [
  body('comment')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Comment must not exceed 300 characters')
];

const bulkImportValidation = [
  body('transactions')
    .isArray({ min: 1 })
    .withMessage('Transactions must be a non-empty array'),
  body('transactions.*.type')
    .isIn(['contribution', 'loan', 'loan_repayment', 'fine', 'dividend', 'expense', 'income', 'transfer'])
    .withMessage('Each transaction type must be valid'),
  body('transactions.*.amount')
    .isFloat({ min: 0.01 })
    .withMessage('Each transaction amount must be positive'),
  body('transactions.*.description')
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('Each transaction description must be between 3 and 200 characters')
];

/**
 * @route   GET /api/transactions
 * @desc    Get all transactions with pagination and filtering
 * @access  Private (Admin/Treasurer)
 */
router.get('/',
  authorize('admin', 'treasurer'),
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('type')
      .optional()
      .isIn(['contribution', 'loan', 'loan_repayment', 'fine', 'dividend', 'expense', 'income', 'transfer'])
      .withMessage('Invalid transaction type filter'),
    query('status')
      .optional()
      .isIn(['pending', 'approved', 'rejected', 'completed'])
      .withMessage('Invalid status filter'),
    query('fromDate')
      .optional()
      .isISO8601()
      .withMessage('From date must be a valid date'),
    query('toDate')
      .optional()
      .isISO8601()
      .withMessage('To date must be a valid date'),
    query('userId')
      .optional()
      .isMongoId()
      .withMessage('User ID must be valid'),
    query('category')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Category filter must be between 1 and 50 characters'),
    query('minAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Minimum amount must be a positive number'),
    query('maxAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Maximum amount must be a positive number')
  ],
  validate,
  getAllTransactions
);

/**
 * @route   GET /api/transactions/dashboard-stats
 * @desc    Get dashboard statistics
 * @access  Private (Admin/Treasurer)
 */
router.get('/dashboard-stats',
  authorize('admin', 'treasurer'),
  getDashboardStats
);

/**
 * @route   GET /api/transactions/stats
 * @desc    Get transaction statistics
 * @access  Private (Admin/Treasurer)
 */
router.get('/stats',
  authorize('admin', 'treasurer'),
  [
    query('period')
      .optional()
      .isIn(['week', 'month', 'quarter', 'year'])
      .withMessage('Period must be one of: week, month, quarter, year'),
    query('groupBy')
      .optional()
      .isIn(['type', 'category', 'status', 'user'])
      .withMessage('Group by must be one of: type, category, status, user')
  ],
  validate,
  getTransactionStats
);

/**
 * @route   GET /api/transactions/monthly-report
 * @desc    Get monthly transaction report
 * @access  Private (Admin/Treasurer)
 */
router.get('/monthly-report',
  authorize('admin', 'treasurer'),
  [
    query('year')
      .isInt({ min: 2020, max: 2030 })
      .withMessage('Year must be between 2020 and 2030'),
    query('month')
      .isInt({ min: 1, max: 12 })
      .withMessage('Month must be between 1 and 12')
  ],
  validate,
  getMonthlyReport
);

/**
 * @route   GET /api/transactions/export
 * @desc    Export transactions to CSV/Excel
 * @access  Private (Admin/Treasurer)
 */
router.get('/export',
  authorize('admin', 'treasurer'),
  [
    query('format')
      .optional()
      .isIn(['csv', 'excel'])
      .withMessage('Format must be csv or excel'),
    query('fromDate')
      .optional()
      .isISO8601()
      .withMessage('From date must be a valid date'),
    query('toDate')
      .optional()
      .isISO8601()
      .withMessage('To date must be a valid date')
  ],
  validate,
  exportTransactions
);

/**
 * @route   GET /api/transactions/my-transactions
 * @desc    Get current user's transactions
 * @access  Private (All authenticated users)
 */
router.get('/my-transactions',
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('type')
      .optional()
      .isIn(['contribution', 'loan', 'loan_repayment', 'fine', 'dividend', 'expense', 'income', 'transfer'])
      .withMessage('Invalid transaction type filter')
  ],
  validate,
  getUserTransactions
);

/**
 * @route   GET /api/transactions/balance/:userId
 * @desc    Calculate user balance
 * @access  Private (Admin/Treasurer/Own balance)
 */
router.get('/balance/:userId',
  [
    param('userId')
      .isMongoId()
      .withMessage('User ID must be valid')
  ],
  validate,
  calculateUserBalance
);

/**
 * @route   GET /api/transactions/balance/me
 * @desc    Calculate current user's balance
 * @access  Private (All authenticated users)
 */
router.get('/balance/me',
  (req, res, next) => {
    // Set the userId to the authenticated user's ID
    req.params.userId = req.user.id;
    next();
  },
  calculateUserBalance
);

/**
 * @route   GET /api/transactions/type/:type
 * @desc    Get transactions by type
 * @access  Private (Admin/Treasurer)
 */
router.get('/type/:type',
  authorize('admin', 'treasurer'),
  [
    param('type')
      .isIn(['contribution', 'loan', 'loan_repayment', 'fine', 'dividend', 'expense', 'income', 'transfer'])
      .withMessage('Invalid transaction type'),
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
  getTransactionsByType
);

/**
 * @route   POST /api/transactions
 * @desc    Create a new transaction
 * @access  Private (Admin/Treasurer)
 */
router.post('/',
  authorize('admin', 'treasurer'),
  createTransactionValidation,
  validate,
  createTransaction
);

/**
 * @route   POST /api/transactions/bulk-import
 * @desc    Bulk import transactions
 * @access  Private (Admin/Treasurer)
 */
router.post('/bulk-import',
  authorize('admin', 'treasurer'),
  bulkImportValidation,
  validate,
  bulkImportTransactions
);

/**
 * @route   POST /api/transactions/reconcile
 * @desc    Reconcile transactions
 * @access  Private (Admin/Treasurer)
 */
router.post('/reconcile',
  authorize('admin', 'treasurer'),
  [
    body('reconciliationDate')
      .isISO8601()
      .withMessage('Reconciliation date must be a valid date'),
    body('adjustments')
      .optional()
      .isArray()
      .withMessage('Adjustments must be an array'),
    body('notes')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Notes must not exceed 500 characters')
  ],
  validate,
  reconcileTransactions
);

/**
 * @route   GET /api/transactions/:id
 * @desc    Get transaction by ID
 * @access  Private (Admin/Treasurer/Own transactions)
 */
router.get('/:id',
  transactionIdValidation,
  validate,
  getTransactionById
);

/**
 * @route   PUT /api/transactions/:id
 * @desc    Update transaction
 * @access  Private (Admin/Treasurer)
 */
router.put('/:id',
  authorize('admin', 'treasurer'),
  transactionIdValidation,
  updateTransactionValidation,
  validate,
  updateTransaction
);

/**
 * @route   PUT /api/transactions/:id/approve
 * @desc    Approve transaction
 * @access  Private (Admin/Treasurer)
 */
router.put('/:id/approve',
  authorize('admin', 'treasurer'),
  transactionIdValidation,
  approvalValidation,
  validate,
  approveTransaction
);

/**
 * @route   PUT /api/transactions/:id/reject
 * @desc    Reject transaction
 * @access  Private (Admin/Treasurer)
 */
router.put('/:id/reject',
  authorize('admin', 'treasurer'),
  transactionIdValidation,
  approvalValidation,
  validate,
  rejectTransaction
);

/**
 * @route   DELETE /api/transactions/:id
 * @desc    Delete transaction (soft delete)
 * @access  Private (Admin only)
 */
router.delete('/:id',
  authorize('admin'),
  transactionIdValidation,
  validate,
  deleteTransaction
);

module.exports = router;