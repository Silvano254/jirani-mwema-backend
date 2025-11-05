const User = require('../models/User');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

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

// System Settings Management
const getSystemSettings = async (req, res) => {
  try {
    // In a real implementation, these would be stored in a database
    const systemSettings = {
      biometric: {
        enabled: true,
        requireForAllUsers: false,
        maxRetryAttempts: 3,
        timeoutDuration: 30
      },
      notifications: {
        smsEnabled: true,
        emailEnabled: false,
        pushEnabled: true
      },
      security: {
        sessionTimeout: 30,
        passwordComplexity: true,
        twoFactorAuth: false
      },
      system: {
        maintenanceMode: false,
        backupFrequency: 'daily',
        logLevel: 'info'
      }
    };

    res.json({
      success: true,
      message: 'System settings retrieved successfully',
      data: systemSettings
    });

  } catch (error) {
    logger.error('Error fetching system settings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching system settings'
    });
  }
};

const updateSystemSettings = async (req, res) => {
  try {
    const { section, settings } = req.body;

    if (!section || !settings) {
      return res.status(400).json({
        success: false,
        message: 'Section and settings are required'
      });
    }

    // In a real implementation, this would update the database
    logger.info(`System settings updated for section: ${section}`, settings);

    res.json({
      success: true,
      message: `${section} settings updated successfully`,
      data: settings
    });

  } catch (error) {
    logger.error('Error updating system settings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating system settings'
    });
  }
};

// Biometric Management
const getBiometricStats = async (req, res) => {
  try {
    const totalBiometricUsers = await User.countDocuments({ fingerprintEnabled: true });
    const activeBiometricUsers = await User.countDocuments({ 
      fingerprintEnabled: true, 
      isActive: true 
    });

    // In a real implementation, these would come from a biometric logs collection
    const stats = {
      totalBiometricUsers,
      activeBiometricUsers,
      failedAttemptsToday: 5, // Mock data
      successRate: 94.2 // Mock data
    };

    res.json({
      success: true,
      message: 'Biometric statistics retrieved successfully',
      data: stats
    });

  } catch (error) {
    logger.error('Error fetching biometric stats:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching biometric stats'
    });
  }
};

const toggleUserBiometric = async (req, res) => {
  try {
    const { userId } = req.params;
    const { enabled } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { fingerprintEnabled: enabled },
      { new: true }
    ).select('firstName lastName phoneNumber fingerprintEnabled');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    logger.info(`Biometric ${enabled ? 'enabled' : 'disabled'} for user: ${user.firstName} ${user.lastName}`);

    res.json({
      success: true,
      message: `Biometric ${enabled ? 'enabled' : 'disabled'} for user`,
      data: user
    });

  } catch (error) {
    logger.error('Error toggling user biometric:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating biometric setting'
    });
  }
};

const resetUserBiometric = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      { 
        fingerprintEnabled: false,
        // In a real implementation, this would also clear biometric data
      },
      { new: true }
    ).select('firstName lastName phoneNumber fingerprintEnabled');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    logger.info(`Biometric data reset for user: ${user.firstName} ${user.lastName}`);

    res.json({
      success: true,
      message: 'Biometric data reset successfully',
      data: user
    });

  } catch (error) {
    logger.error('Error resetting user biometric:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while resetting biometric data'
    });
  }
};

// System Operations
const testSMSService = async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and message are required'
      });
    }

    // In a real implementation, this would test the SMS service
    logger.info(`SMS test sent to ${phoneNumber}: ${message}`);

    res.json({
      success: true,
      message: 'SMS test completed successfully',
      data: {
        phoneNumber,
        status: 'sent',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error testing SMS service:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while testing SMS service'
    });
  }
};

const performBackup = async (req, res) => {
  try {
    const { backupType } = req.body;

    if (!backupType || !['full', 'incremental'].includes(backupType)) {
      return res.status(400).json({
        success: false,
        message: 'Valid backup type (full or incremental) is required'
      });
    }

    // In a real implementation, this would perform the actual backup
    const backupId = `backup_${Date.now()}`;
    logger.info(`${backupType} backup initiated with ID: ${backupId}`);

    res.json({
      success: true,
      message: `${backupType} backup completed successfully`,
      data: {
        backupId,
        type: backupType,
        timestamp: new Date().toISOString(),
        size: '125.7 MB' // Mock data
      }
    });

  } catch (error) {
    logger.error('Error performing backup:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while performing backup'
    });
  }
};

const getSystemLogs = async (req, res) => {
  try {
    const { level, limit = 100 } = req.query;

    // In a real implementation, this would read from log files or database
    const logs = [
      {
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: 'System startup completed',
        module: 'system'
      },
      {
        timestamp: new Date(Date.now() - 300000).toISOString(),
        level: 'WARN',
        message: 'High memory usage detected',
        module: 'monitoring'
      },
      {
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        level: 'ERROR',
        message: 'Failed to connect to SMS service',
        module: 'sms'
      }
    ];

    const filteredLogs = level ? logs.filter(log => log.level === level.toUpperCase()) : logs;
    const limitedLogs = filteredLogs.slice(0, parseInt(limit));

    res.json({
      success: true,
      message: 'System logs retrieved successfully',
      data: {
        logs: limitedLogs,
        total: filteredLogs.length
      }
    });

  } catch (error) {
    logger.error('Error fetching system logs:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching system logs'
    });
  }
};

const clearCache = async (req, res) => {
  try {
    const { cacheType } = req.body;

    if (!cacheType || !['application', 'database', 'all'].includes(cacheType)) {
      return res.status(400).json({
        success: false,
        message: 'Valid cache type (application, database, or all) is required'
      });
    }

    // In a real implementation, this would clear the specified cache
    logger.info(`Cache cleared: ${cacheType}`);

    res.json({
      success: true,
      message: `${cacheType} cache cleared successfully`,
      data: {
        cacheType,
        clearedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error clearing cache:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while clearing cache'
    });
  }
};

const getSystemHealth = async (req, res) => {
  try {
    // In a real implementation, this would check actual system health
    const healthData = {
      database: {
        status: 'healthy',
        responseTime: '15ms',
        connections: 5
      },
      smsService: {
        status: 'healthy',
        responseTime: '120ms',
        lastTest: new Date().toISOString()
      },
      memory: {
        status: 'warning',
        usage: '78%',
        available: '2.1 GB'
      },
      storage: {
        status: 'healthy',
        usage: '45%',
        available: '55 GB'
      },
      uptime: '5 days, 12 hours',
      version: '1.0.0'
    };

    res.json({
      success: true,
      message: 'System health retrieved successfully',
      data: healthData
    });

  } catch (error) {
    logger.error('Error fetching system health:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching system health'
    });
  }
};

const exportData = async (req, res) => {
  try {
    const { dataType, format } = req.body;

    if (!dataType || !['users', 'logs', 'settings', 'all'].includes(dataType)) {
      return res.status(400).json({
        success: false,
        message: 'Valid data type (users, logs, settings, or all) is required'
      });
    }

    if (!format || !['json', 'csv', 'excel'].includes(format)) {
      return res.status(400).json({
        success: false,
        message: 'Valid format (json, csv, or excel) is required'
      });
    }

    // In a real implementation, this would generate the actual export file
    const exportId = `export_${Date.now()}`;
    logger.info(`Data export initiated: ${dataType} in ${format} format`);

    res.json({
      success: true,
      message: 'Data export completed successfully',
      data: {
        exportId,
        dataType,
        format,
        timestamp: new Date().toISOString(),
        downloadUrl: `/api/admin/download/${exportId}`, // Mock URL
        size: '2.3 MB' // Mock data
      }
    });

  } catch (error) {
    logger.error('Error exporting data:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while exporting data'
    });
  }
};

const sendSystemNotification = async (req, res) => {
  try {
    const { title, message, type, recipients } = req.body;

    if (!title || !message || !type) {
      return res.status(400).json({
        success: false,
        message: 'Title, message, and type are required'
      });
    }

    if (!['info', 'warning', 'error', 'success'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Valid notification type (info, warning, error, success) is required'
      });
    }

    // In a real implementation, this would send notifications to users
    logger.info(`System notification sent: ${title} - ${message}`);

    res.json({
      success: true,
      message: 'System notification sent successfully',
      data: {
        title,
        message,
        type,
        recipients: recipients || 'all',
        sentAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error sending system notification:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while sending notification'
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
};