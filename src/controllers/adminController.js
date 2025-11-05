const User = require('../models/User');
const logger = require('../utils/logger');

// Promote existing user to admin (for initial setup)
const promoteToAdmin = async (req, res) => {
  try {
    const { phoneNumber, nationalId } = req.body;

    // Validate required fields
    if (!phoneNumber || !nationalId) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and national ID are required'
      });
    }

    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Admin user already exists'
      });
    }

    // Find user by phone number
    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User with this phone number not found'
      });
    }

    // Update user to admin role
    user.role = 'admin';
    user.nationalId = nationalId;
    user.firstName = 'Silvano';
    user.lastName = 'Otieno';
    await user.save();

    logger.info('User promoted to admin', {
      userId: user._id,
      phoneNumber: user.phoneNumber,
      promotedBy: 'system'
    });

    res.status(200).json({
      success: true,
      message: 'User successfully promoted to admin',
      data: {
        userId: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        nationalId: user.nationalId
      }
    });

  } catch (error) {
    logger.error('Error promoting user to admin:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Create admin user
const createAdmin = async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber, nationalId } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !phoneNumber || !nationalId) {
      return res.status(400).json({
        success: false,
        message: 'All fields (firstName, lastName, phoneNumber, nationalId) are required'
      });
    }

    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Admin user already exists'
      });
    }

    // Check if phone number already exists
    const existingPhone = await User.findOne({ phoneNumber });
    if (existingPhone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number already registered'
      });
    }

    // Check if national ID already exists
    const existingId = await User.findOne({ nationalId });
    if (existingId) {
      return res.status(400).json({
        success: false,
        message: 'National ID already registered'
      });
    }

    // Create admin user
    const adminUser = new User({
      firstName,
      lastName,
      phoneNumber,
      nationalId,
      role: 'admin',
      isActive: true,
      fingerprintEnabled: false
    });

    await adminUser.save();

    logger.info(`Admin user created: ${adminUser.firstName} ${adminUser.lastName} - ${adminUser.phoneNumber}`);

    res.status(201).json({
      success: true,
      message: 'Admin user created successfully',
      data: {
        id: adminUser._id,
        firstName: adminUser.firstName,
        lastName: adminUser.lastName,
        phoneNumber: adminUser.phoneNumber,
        nationalId: adminUser.nationalId,
        role: adminUser.role,
        isActive: adminUser.isActive
      }
    });

  } catch (error) {
    logger.error('Error creating admin user:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating admin user'
    });
  }
};

// Get admin dashboard stats
const getAdminDashboard = async (req, res) => {
  try {
    // Get user statistics
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const usersByRole = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);

    // Get recent users (last 10)
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('firstName lastName phoneNumber role isActive createdAt');

    // Get users with fingerprint enabled
    const fingerprintUsers = await User.countDocuments({ fingerprintEnabled: true });

    // Calculate statistics
    const stats = {
      totalUsers,
      activeUsers,
      inactiveUsers: totalUsers - activeUsers,
      fingerprintEnabledUsers: fingerprintUsers,
      usersByRole: usersByRole.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      recentUsers
    };

    res.json({
      success: true,
      message: 'Admin dashboard data retrieved successfully',
      data: stats
    });

  } catch (error) {
    logger.error('Error fetching admin dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard data'
    });
  }
};

// Get all users with pagination
const getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const role = req.query.role || '';
    const status = req.query.status || '';

    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } },
        { nationalId: { $regex: search, $options: 'i' } }
      ];
    }

    if (role) {
      query.role = role;
    }

    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-otpCode -otpExpires -loginAttempts -accountLocked -lockUntil')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      message: 'Users retrieved successfully',
      data: {
        users,
        pagination: {
          currentPage: page,
          totalPages,
          totalUsers: total,
          hasNext: page < totalPages,
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

// Update user (admin only)
const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;

    // Don't allow updating sensitive fields
    delete updates._id;
    delete updates.otpCode;
    delete updates.otpExpires;
    delete updates.loginAttempts;
    delete updates.accountLocked;
    delete updates.lockUntil;

    const user = await User.findByIdAndUpdate(
      userId,
      updates,
      { new: true, runValidators: true }
    ).select('-otpCode -otpExpires -loginAttempts -accountLocked -lockUntil');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    logger.info(`User updated by admin: ${user.firstName} ${user.lastName}`);

    res.json({
      success: true,
      message: 'User updated successfully',
      data: user
    });

  } catch (error) {
    logger.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating user'
    });
  }
};

// Delete user (admin only)
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Don't allow deleting admin users
    if (user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete admin users'
      });
    }

    await User.findByIdAndDelete(userId);

    logger.info(`User deleted by admin: ${user.firstName} ${user.lastName}`);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting user'
    });
  }
};

// Create new user (admin only)
const createUser = async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber, nationalId, role } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !phoneNumber || !nationalId || !role) {
      return res.status(400).json({
        success: false,
        message: 'All fields (firstName, lastName, phoneNumber, nationalId, role) are required'
      });
    }

    // Validate role
    const validRoles = ['member', 'secretary', 'treasurer', 'chairperson'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be one of: member, secretary, treasurer, chairperson'
      });
    }

    // Check if phone number already exists
    const existingPhone = await User.findOne({ phoneNumber });
    if (existingPhone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number already registered'
      });
    }

    // Check if national ID already exists
    const existingId = await User.findOne({ nationalId });
    if (existingId) {
      return res.status(400).json({
        success: false,
        message: 'National ID already registered'
      });
    }

    // Create new user
    const newUser = new User({
      firstName,
      lastName,
      phoneNumber,
      nationalId,
      role,
      isActive: true,
      fingerprintEnabled: false
    });

    await newUser.save();

    logger.info(`New user created by admin: ${newUser.firstName} ${newUser.lastName} - ${newUser.phoneNumber}`);

    // Return user data without sensitive fields
    const userData = {
      _id: newUser._id,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      phoneNumber: newUser.phoneNumber,
      nationalId: newUser.nationalId,
      role: newUser.role,
      isActive: newUser.isActive,
      fingerprintEnabled: newUser.fingerprintEnabled,
      createdAt: newUser.createdAt
    };

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: userData
    });

  } catch (error) {
    logger.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating user'
    });
  }
};

module.exports = {
  promoteToAdmin,
  createAdmin,
  getAdminDashboard,
  getAllUsers,
  updateUser,
  deleteUser,
  createUser
};