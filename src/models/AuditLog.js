const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'USER_LOGIN',
      'USER_LOGOUT', 
      'USER_CREATED',
      'USER_UPDATED',
      'USER_DELETED',
      'ROLE_CHANGED',
      'PASSWORD_CHANGED',
      'BIOMETRIC_ENABLED',
      'BIOMETRIC_DISABLED',
      'TRANSACTION_CREATED',
      'LOAN_APPROVED',
      'LOAN_REJECTED',
      'MEETING_CREATED',
      'MEETING_UPDATED',
      'SMS_SENT',
      'NOTIFICATION_SENT',
      'SYSTEM_BACKUP',
      'DATA_EXPORT',
      'ADMIN_ACTION',
      'PERMISSION_CHANGED',
      'SYSTEM_CONFIG_CHANGED'
    ]
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // For actions performed on other users
  },
  details: {
    type: String,
    required: true
  },
  ipAddress: {
    type: String,
    required: false
  },
  userAgent: {
    type: String,
    required: false
  },
  result: {
    type: String,
    enum: ['SUCCESS', 'FAILURE', 'ERROR'],
    default: 'SUCCESS'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    required: false // Additional data specific to the action
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ result: 1 });

// Static method to log an action
auditLogSchema.statics.logAction = async function(actionData) {
  try {
    const auditLog = new this(actionData);
    await auditLog.save();
    return auditLog;
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw error to prevent disrupting the main operation
    return null;
  }
};

// Static method to get logs with pagination and filtering
auditLogSchema.statics.getLogs = async function(filters = {}, options = {}) {
  const {
    page = 1,
    limit = 50,
    action,
    userId,
    targetUserId,
    result,
    startDate,
    endDate
  } = options;

  // Build query
  const query = {};
  
  if (action) query.action = action;
  if (userId) query.userId = userId;
  if (targetUserId) query.targetUserId = targetUserId;
  if (result) query.result = result;
  
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  try {
    const logs = await this.find(query)
      .populate('userId', 'firstName lastName email phone role')
      .populate('targetUserId', 'firstName lastName email phone role')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await this.countDocuments(query);

    return {
      logs,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalLogs: total,
        hasNext: skip + parseInt(limit) < total,
        hasPrev: parseInt(page) > 1
      }
    };
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    throw error;
  }
};

module.exports = mongoose.model('AuditLog', auditLogSchema);