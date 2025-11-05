const express = require('express');
const router = express.Router();
const {
  promoteToAdmin,
  createAdmin,
  getAdminDashboard,
  getAllUsers,
  updateUser,
  deleteUser,
  createUser,
  // System Settings
  getSystemSettings,
  updateSystemSettings,
  // Biometric Management
  getBiometricStats,
  toggleUserBiometric,
  resetUserBiometric,
  // System Operations
  testSMSService,
  performBackup,
  getSystemLogs,
  clearCache,
  getSystemHealth,
  exportData,
  sendSystemNotification
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/authMiddleware');

/**
 * @route   POST /api/admin/promote-to-admin
 * @desc    Promote existing user to admin (for initial setup)
 * @access  Public (only works if no admin exists)
 */
router.post('/promote-to-admin', promoteToAdmin);

/**
 * @route   POST /api/admin/create-admin
 * @desc    Create admin user (for initial setup)
 * @access  Public (only works if no admin exists)
 */
router.post('/create-admin', createAdmin);

/**
 * @route   GET /api/admin/dashboard
 * @desc    Get admin dashboard statistics
 * @access  Private (Admin only)
 */
router.get('/dashboard', protect, authorize('admin'), getAdminDashboard);

/**
 * @route   GET /api/admin/users
 * @desc    Get all users with pagination and filters
 * @access  Private (Admin only)
 */
router.get('/users', protect, authorize('admin'), getAllUsers);

/**
 * @route   POST /api/admin/users
 * @desc    Create new user
 * @access  Private (Admin only)
 */
router.post('/users', protect, authorize('admin'), createUser);

/**
 * @route   PUT /api/admin/users/:userId
 * @desc    Update user details
 * @access  Private (Admin only)
 */
router.put('/users/:userId', protect, authorize('admin'), updateUser);

/**
 * @route   DELETE /api/admin/users/:userId
 * @desc    Delete user
 * @access  Private (Admin only)
 */
router.delete('/users/:userId', protect, authorize('admin'), deleteUser);

// System Settings Routes
/**
 * @route   GET /api/admin/system-settings
 * @desc    Get system settings
 * @access  Private (Admin only)
 */
router.get('/system-settings', protect, authorize('admin'), getSystemSettings);

/**
 * @route   PUT /api/admin/system-settings
 * @desc    Update system settings
 * @access  Private (Admin only)
 */
router.put('/system-settings', protect, authorize('admin'), updateSystemSettings);

// Biometric Management Routes
/**
 * @route   GET /api/admin/biometric-stats
 * @desc    Get biometric statistics
 * @access  Private (Admin only)
 */
router.get('/biometric-stats', protect, authorize('admin'), getBiometricStats);

/**
 * @route   PUT /api/admin/users/:userId/biometric
 * @desc    Toggle user biometric setting
 * @access  Private (Admin only)
 */
router.put('/users/:userId/biometric', protect, authorize('admin'), toggleUserBiometric);

/**
 * @route   DELETE /api/admin/users/:userId/biometric
 * @desc    Reset user biometric data
 * @access  Private (Admin only)
 */
router.delete('/users/:userId/biometric', protect, authorize('admin'), resetUserBiometric);

// System Operations Routes
/**
 * @route   POST /api/admin/test-sms
 * @desc    Test SMS service
 * @access  Private (Admin only)
 */
router.post('/test-sms', protect, authorize('admin'), testSMSService);

/**
 * @route   POST /api/admin/backup
 * @desc    Perform system backup
 * @access  Private (Admin only)
 */
router.post('/backup', protect, authorize('admin'), performBackup);

/**
 * @route   GET /api/admin/system-logs
 * @desc    Get system logs
 * @access  Private (Admin only)
 */
router.get('/system-logs', protect, authorize('admin'), getSystemLogs);

/**
 * @route   POST /api/admin/clear-cache
 * @desc    Clear system cache
 * @access  Private (Admin only)
 */
router.post('/clear-cache', protect, authorize('admin'), clearCache);

/**
 * @route   GET /api/admin/system-health
 * @desc    Get system health status
 * @access  Private (Admin only)
 */
router.get('/system-health', protect, authorize('admin'), getSystemHealth);

/**
 * @route   POST /api/admin/export-data
 * @desc    Export system data
 * @access  Private (Admin only)
 */
router.post('/export-data', protect, authorize('admin'), exportData);

/**
 * @route   POST /api/admin/send-notification
 * @desc    Send system notification
 * @access  Private (Admin only)
 */
router.post('/send-notification', protect, authorize('admin'), sendSystemNotification);

module.exports = router;