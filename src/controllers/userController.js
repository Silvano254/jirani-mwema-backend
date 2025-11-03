const User = require('../models/User');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

/**
 * @desc    Get all users with pagination and filtering
 * @route   GET /api/users
 * @access  Private (Admin/Secretary)
 */
const getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      role,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (page - 1) * limit;
    const query = {};

    // Build search query
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } },
        { nationalId: { $regex: search, $options: 'i' } }
      ];
    }

    if (role) query.role = role;
    if (status !== undefined) query.isActive = status === 'active';

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const users = await User.find(query)
      .select('-otp -otpExpires -failedLoginAttempts -lockedUntil')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalUsers: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching users'
    });
  }
};

/**
 * @desc    Get user by ID
 * @route   GET /api/users/:id
 * @access  Private (Admin/Secretary/Own Profile)
 */
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user can access this profile
    if (req.user.role !== 'admin' && req.user.role !== 'secretary' && req.user.id !== id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const user = await User.findById(id)
      .select('-otp -otpExpires -failedLoginAttempts -lockedUntil');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user'
    });
  }
};

/**
 * @desc    Update user profile
 * @route   PUT /api/users/:id
 * @access  Private (Admin/Own Profile)
 */
const updateUserProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const updates = req.body;

    // Check if user can update this profile
    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Remove sensitive fields from updates
    delete updates.phoneNumber;
    delete updates.role;
    delete updates.isActive;
    delete updates.otp;
    delete updates.otpExpires;

    const user = await User.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).select('-otp -otpExpires -failedLoginAttempts -lockedUntil');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    logger.info('User profile updated', { userId: id, updatedBy: req.user.id });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: user
    });
  } catch (error) {
    logger.error('Error updating user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating profile'
    });
  }
};

/**
 * @desc    Get users by role
 * @route   GET /api/users/role/:role
 * @access  Private (Admin/Secretary)
 */
const getUsersByRole = async (req, res) => {
  try {
    const { role } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const skip = (page - 1) * limit;

    const users = await User.find({ role, isActive: true })
      .select('firstName lastName phoneNumber nationalId role createdAt')
      .sort({ lastName: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments({ role, isActive: true });

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalUsers: total
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching users by role:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching users'
    });
  }
};

/**
 * @desc    Search users by name or phone
 * @route   GET /api/users/search
 * @access  Private (Admin/Secretary)
 */
const searchUsers = async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters'
      });
    }

    const users = await User.find({
      $and: [
        { isActive: true },
        {
          $or: [
            { firstName: { $regex: q, $options: 'i' } },
            { lastName: { $regex: q, $options: 'i' } },
            { phoneNumber: { $regex: q, $options: 'i' } }
          ]
        }
      ]
    })
      .select('firstName lastName phoneNumber role')
      .limit(parseInt(limit))
      .sort({ lastName: 1 });

    res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    logger.error('Error searching users:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while searching users'
    });
  }
};

/**
 * @desc    Update user role
 * @route   PUT /api/users/:id/role
 * @access  Private (Admin only)
 */
const updateUserRole = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { role } = req.body;

    // Prevent admin from demoting themselves
    if (req.user.id === id && req.user.role === 'admin' && role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Admin cannot change their own role'
      });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { role, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).select('-otp -otpExpires -failedLoginAttempts -lockedUntil');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    logger.info('User role updated', { 
      userId: id, 
      newRole: role, 
      updatedBy: req.user.id 
    });

    res.status(200).json({
      success: true,
      message: 'User role updated successfully',
      data: user
    });
  } catch (error) {
    logger.error('Error updating user role:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating user role'
    });
  }
};

/**
 * @desc    Toggle user active status
 * @route   PUT /api/users/:id/status
 * @access  Private (Admin only)
 */
const toggleUserStatus = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { isActive } = req.body;

    // Prevent admin from deactivating themselves
    if (req.user.id === id && !isActive) {
      return res.status(400).json({
        success: false,
        message: 'Admin cannot deactivate their own account'
      });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { isActive, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).select('-otp -otpExpires -failedLoginAttempts -lockedUntil');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    logger.info('User status updated', { 
      userId: id, 
      newStatus: isActive ? 'active' : 'inactive', 
      updatedBy: req.user.id 
    });

    res.status(200).json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: user
    });
  } catch (error) {
    logger.error('Error updating user status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating user status'
    });
  }
};

/**
 * @desc    Get user statistics
 * @route   GET /api/users/stats
 * @access  Private (Admin/Secretary)
 */
const getUserStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const inactiveUsers = await User.countDocuments({ isActive: false });

    const roleStats = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);

    const recentUsers = await User.find({ isActive: true })
      .select('firstName lastName role createdAt')
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      data: {
        overview: {
          total: totalUsers,
          active: activeUsers,
          inactive: inactiveUsers
        },
        byRole: roleStats.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        recentUsers
      }
    });
  } catch (error) {
    logger.error('Error fetching user stats:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user statistics'
    });
  }
};

/**
 * @desc    Bulk update multiple users
 * @route   PUT /api/users/bulk-update
 * @access  Private (Admin only)
 */
const bulkUpdateUsers = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { userIds, updates } = req.body;

    // Prevent admin from updating themselves in bulk operations
    if (userIds.includes(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot include your own account in bulk updates'
      });
    }

    const result = await User.updateMany(
      { _id: { $in: userIds } },
      { ...updates, updatedAt: new Date() }
    );

    logger.info('Bulk user update', { 
      userIds, 
      updates, 
      modifiedCount: result.modifiedCount,
      updatedBy: req.user.id 
    });

    res.status(200).json({
      success: true,
      message: `Successfully updated ${result.modifiedCount} users`,
      data: {
        matched: result.matchedCount,
        modified: result.modifiedCount
      }
    });
  } catch (error) {
    logger.error('Error in bulk user update:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating users'
    });
  }
};

/**
 * @desc    Delete user (soft delete)
 * @route   DELETE /api/users/:id
 * @access  Private (Admin only)
 */
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (req.user.id === id) {
      return res.status(400).json({
        success: false,
        message: 'Admin cannot delete their own account'
      });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { 
        isActive: false, 
        deletedAt: new Date(),
        updatedAt: new Date()
      },
      { new: true }
    ).select('-otp -otpExpires -failedLoginAttempts -lockedUntil');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    logger.info('User deleted (soft delete)', { 
      userId: id, 
      deletedBy: req.user.id 
    });

    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
      data: user
    });
  } catch (error) {
    logger.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting user'
    });
  }
};

/**
 * @desc    Register a new member
 * @route   POST /api/users/register
 * @access  Private (Chairperson/Secretary)
 */
const registerMember = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      firstName,
      lastName,
      phoneNumber,
      nationalId,
      email,
      dateOfBirth,
      gender,
      address,
      emergencyContact,
      emergencyPhone,
      role = 'member'
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { phoneNumber },
        { nationalId },
        { email: email || null }
      ].filter(Boolean)
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User already exists with this phone number, national ID, or email'
      });
    }

    // Create new user
    const newUser = new User({
      firstName,
      lastName,
      phoneNumber,
      nationalId,
      email,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      gender,
      address,
      emergencyContact,
      emergencyPhone,
      role,
      isActive: true,
      isLocked: false,
      registeredBy: req.user.id,
      registrationDate: new Date()
    });

    await newUser.save();

    // Send welcome SMS
    try {
      const smsService = require('../services/smsService');
      await smsService.sendWelcomeSMS(phoneNumber, `${firstName} ${lastName}`);
    } catch (smsError) {
      logger.error('Failed to send welcome SMS:', smsError);
      // Don't fail registration if SMS fails
    }

    logger.info(`New member registered: ${firstName} ${lastName} (${phoneNumber}) by user ${req.user.id}`);

    res.status(201).json({
      success: true,
      message: 'Member registered successfully',
      data: {
        id: newUser._id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        phoneNumber: newUser.phoneNumber,
        role: newUser.role,
        isActive: newUser.isActive
      }
    });

  } catch (error) {
    logger.error('Member registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register member',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

module.exports = {
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
  registerMember
};