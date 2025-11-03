const mongoose = require('mongoose');

const proxyActionSchema = new mongoose.Schema({
  actionType: {
    type: String,
    enum: ['payment', 'member_registration', 'loan_approval', 'meeting_scheduling', 'transaction_record', 'user_management'],
    required: true
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  reason: {
    type: String,
    required: true,
    trim: true,
    maxlength: 300
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'executed', 'cancelled', 'expired'],
    default: 'pending'
  },
  actionData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  requiredApprovals: {
    type: Number,
    default: 1,
    min: 1,
    max: 5
  },
  currentApprovals: {
    type: Number,
    default: 0
  },
  approvals: [{
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    approvedAt: {
      type: Date,
      default: Date.now
    },
    comment: {
      type: String,
      maxlength: 300
    },
    conditions: [String]
  }],
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  approvalDetails: {
    comment: {
      type: String,
      maxlength: 300
    },
    conditions: [String],
    notes: String
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedAt: {
    type: Date
  },
  rejectionReason: {
    type: String,
    maxlength: 300
  },
  executedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  executedAt: {
    type: Date
  },
  executionDetails: {
    notes: {
      type: String,
      maxlength: 500
    },
    timestamp: Date,
    result: mongoose.Schema.Types.Mixed,
    success: Boolean,
    errorMessage: String
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancelledAt: {
    type: Date
  },
  cancellationReason: {
    type: String,
    maxlength: 300
  },
  expiresAt: {
    type: Date,
    default: function() {
      // Default expiry: 7 days from creation
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 7);
      return expiry;
    }
  },
  notifyUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  notificationsSent: {
    type: Boolean,
    default: false
  },
  lastNotificationSent: {
    type: Date
  },
  relatedModel: {
    type: String,
    enum: ['Transaction', 'User', 'Meeting', 'Notification']
  },
  relatedId: {
    type: mongoose.Schema.Types.ObjectId
  },
  workflowSteps: [{
    step: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'skipped'],
      default: 'pending'
    },
    completedAt: Date,
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    notes: String,
    data: mongoose.Schema.Types.Mixed
  }],
  auditTrail: [{
    action: {
      type: String,
      required: true
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    performedAt: {
      type: Date,
      default: Date.now
    },
    details: {
      type: String,
      maxlength: 500
    },
    oldValues: mongoose.Schema.Types.Mixed,
    newValues: mongoose.Schema.Types.Mixed
  }],
  metadata: {
    source: {
      type: String,
      enum: ['web', 'mobile', 'api', 'system'],
      default: 'web'
    },
    ipAddress: String,
    userAgent: String,
    deviceInfo: String,
    originalRequest: mongoose.Schema.Types.Mixed,
    estimatedDuration: Number, // in minutes
    actualDuration: Number, // in minutes
    complexity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    }
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 30
  }],
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurrencePattern: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'quarterly']
    },
    interval: {
      type: Number,
      min: 1
    },
    endDate: Date,
    maxOccurrences: Number,
    lastExecuted: Date,
    nextExecution: Date
  },
  parentAction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProxyAction'
  },
  childActions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProxyAction'
  }],
  dependencies: [{
    actionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProxyAction'
    },
    type: {
      type: String,
      enum: ['prerequisite', 'blocker', 'related'],
      default: 'prerequisite'
    },
    description: String
  }],
  isTemplate: {
    type: Boolean,
    default: false
  },
  templateData: {
    name: String,
    description: String,
    category: String,
    usageCount: {
      type: Number,
      default: 0
    }
  },
  deletedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes for better query performance
proxyActionSchema.index({ requestedBy: 1, status: 1 });
proxyActionSchema.index({ status: 1, priority: -1 });
proxyActionSchema.index({ actionType: 1 });
proxyActionSchema.index({ expiresAt: 1 });
proxyActionSchema.index({ createdAt: -1 });
proxyActionSchema.index({ targetUserId: 1 });
proxyActionSchema.index({ approvedBy: 1 });
proxyActionSchema.index({ executedBy: 1 });

// Virtual for checking if action is expired
proxyActionSchema.virtual('isExpired').get(function() {
  return this.expiresAt && this.expiresAt < new Date();
});

// Virtual for checking if action is urgent
proxyActionSchema.virtual('isUrgent').get(function() {
  return this.priority === 'urgent' || this.priority === 'high';
});

// Virtual for calculating time remaining
proxyActionSchema.virtual('timeRemaining').get(function() {
  if (!this.expiresAt) return null;
  
  const now = new Date();
  const remaining = this.expiresAt.getTime() - now.getTime();
  
  if (remaining <= 0) return 0;
  
  return Math.ceil(remaining / (1000 * 60 * 60 * 24)); // Days remaining
});

// Virtual for workflow completion percentage
proxyActionSchema.virtual('workflowProgress').get(function() {
  if (!this.workflowSteps || this.workflowSteps.length === 0) return 0;
  
  const completedSteps = this.workflowSteps.filter(step => step.status === 'completed').length;
  return Math.round((completedSteps / this.workflowSteps.length) * 100);
});

// Pre-save middleware
proxyActionSchema.pre('save', function(next) {
  // Auto-expire if past expiry date
  if (this.isExpired && this.status === 'pending') {
    this.status = 'expired';
  }

  // Update current approvals count
  if (this.approvals) {
    this.currentApprovals = this.approvals.length;
  }

  // Calculate actual duration when executed
  if (this.isModified('status') && this.status === 'executed' && this.createdAt) {
    this.metadata.actualDuration = Math.round((new Date() - this.createdAt) / (1000 * 60));
  }

  // Auto-approve if required approvals reached
  if (this.currentApprovals >= this.requiredApprovals && this.status === 'pending') {
    this.status = 'approved';
    this.approvedAt = new Date();
    // Use the latest approver as the primary approver
    if (this.approvals.length > 0) {
      this.approvedBy = this.approvals[this.approvals.length - 1].approvedBy;
    }
  }

  next();
});

// Pre-save middleware for audit trail
proxyActionSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    // Add audit trail entry for significant changes
    const significantFields = ['status', 'priority', 'approvals', 'executionDetails'];
    const modifiedSignificantFields = this.modifiedPaths().filter(path => 
      significantFields.some(field => path.startsWith(field))
    );

    if (modifiedSignificantFields.length > 0) {
      this.auditTrail.push({
        action: `Updated: ${modifiedSignificantFields.join(', ')}`,
        performedBy: this.constructor.currentUser || this.requestedBy, // Set from middleware
        details: `Modified fields: ${modifiedSignificantFields.join(', ')}`
      });
    }
  }
  next();
});

// Instance methods
proxyActionSchema.methods.addApproval = function(userId, comment = '', conditions = []) {
  this.approvals.push({
    approvedBy: userId,
    comment,
    conditions
  });

  this.auditTrail.push({
    action: 'Approval added',
    performedBy: userId,
    details: comment || 'Approval granted'
  });

  return this.save();
};

proxyActionSchema.methods.approve = function(userId, comment = '', conditions = []) {
  this.status = 'approved';
  this.approvedBy = userId;
  this.approvedAt = new Date();
  this.approvalDetails = {
    comment,
    conditions
  };

  this.auditTrail.push({
    action: 'Action approved',
    performedBy: userId,
    details: comment || 'Action approved for execution'
  });

  return this.save();
};

proxyActionSchema.methods.reject = function(userId, reason) {
  this.status = 'rejected';
  this.rejectedBy = userId;
  this.rejectedAt = new Date();
  this.rejectionReason = reason;

  this.auditTrail.push({
    action: 'Action rejected',
    performedBy: userId,
    details: reason
  });

  return this.save();
};

proxyActionSchema.methods.execute = function(userId, notes = '', result = null) {
  this.status = 'executed';
  this.executedBy = userId;
  this.executedAt = new Date();
  this.executionDetails = {
    notes,
    timestamp: new Date(),
    result,
    success: true
  };

  this.auditTrail.push({
    action: 'Action executed',
    performedBy: userId,
    details: notes || 'Action executed successfully'
  });

  return this.save();
};

proxyActionSchema.methods.cancel = function(userId, reason) {
  this.status = 'cancelled';
  this.cancelledBy = userId;
  this.cancelledAt = new Date();
  this.cancellationReason = reason;

  this.auditTrail.push({
    action: 'Action cancelled',
    performedBy: userId,
    details: reason
  });

  return this.save();
};

proxyActionSchema.methods.extendExpiry = function(days, userId) {
  const newExpiry = new Date(this.expiresAt);
  newExpiry.setDate(newExpiry.getDate() + days);
  this.expiresAt = newExpiry;

  this.auditTrail.push({
    action: 'Expiry extended',
    performedBy: userId,
    details: `Extended by ${days} days until ${newExpiry.toDateString()}`
  });

  return this.save();
};

// Static methods
proxyActionSchema.statics.getPendingActions = function(limit = 20) {
  return this.find({
    status: 'pending',
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  })
    .populate('requestedBy', 'firstName lastName phoneNumber role')
    .populate('targetUserId', 'firstName lastName')
    .sort({ priority: -1, createdAt: 1 })
    .limit(limit);
};

proxyActionSchema.statics.getActionsByType = function(actionType) {
  return this.find({ actionType })
    .populate('requestedBy', 'firstName lastName')
    .populate('approvedBy', 'firstName lastName')
    .sort({ createdAt: -1 });
};

proxyActionSchema.statics.getExpiredActions = function() {
  return this.find({
    status: 'pending',
    expiresAt: { $lt: new Date() }
  });
};

proxyActionSchema.statics.cleanupExpired = function() {
  return this.updateMany(
    {
      status: 'pending',
      expiresAt: { $lt: new Date() }
    },
    {
      $set: {
        status: 'expired',
        updatedAt: new Date()
      }
    }
  );
};

proxyActionSchema.statics.getActionStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  const typeStats = await this.aggregate([
    {
      $group: {
        _id: '$actionType',
        count: { $sum: 1 },
        pendingCount: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        }
      }
    }
  ]);

  return {
    byStatus: stats.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    byType: typeStats
  };
};

proxyActionSchema.statics.createFromTemplate = async function(templateId, requestedBy, customData = {}) {
  const template = await this.findById(templateId);
  if (!template || !template.isTemplate) {
    throw new Error('Invalid template');
  }

  const actionData = {
    ...template.toObject(),
    _id: undefined,
    requestedBy,
    status: 'pending',
    isTemplate: false,
    parentAction: templateId,
    actionData: { ...template.actionData, ...customData },
    createdAt: new Date(),
    updatedAt: new Date()
  };

  // Update template usage count
  template.templateData.usageCount += 1;
  await template.save();

  return this.create(actionData);
};

// Ensure virtual fields are serialized
proxyActionSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('ProxyAction', proxyActionSchema);