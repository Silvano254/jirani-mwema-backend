const express = require('express');
const router = express.Router();
const {
  promoteToAdmin,
  createAdmin,
  getAdminDashboard,
  getAllUsers,
  updateUser,
  deleteUser
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

module.exports = router;