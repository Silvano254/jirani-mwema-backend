const express = require('express');
const router = express.Router();
const {
  getFinancialReport,
  getMemberActivityReport,
  getLoanPortfolioReport
} = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/authMiddleware');

/**
 * @route   GET /api/reports/financial
 * @desc    Get financial report with income/expense breakdown
 * @access  Private (Admin, Chairperson, Secretary, Treasurer)
 */
router.get('/financial', 
  protect, 
  authorize(['admin', 'chairperson', 'secretary', 'treasurer']), 
  getFinancialReport
);

/**
 * @route   GET /api/reports/member-activity
 * @desc    Get member activity and engagement report
 * @access  Private (Admin, Chairperson, Secretary)
 */
router.get('/member-activity', 
  protect, 
  authorize(['admin', 'chairperson', 'secretary']), 
  getMemberActivityReport
);

/**
 * @route   GET /api/reports/loan-portfolio
 * @desc    Get loan portfolio and performance report
 * @access  Private (Admin, Chairperson, Treasurer)
 */
router.get('/loan-portfolio', 
  protect, 
  authorize(['admin', 'chairperson', 'treasurer']), 
  getLoanPortfolioReport
);

module.exports = router;