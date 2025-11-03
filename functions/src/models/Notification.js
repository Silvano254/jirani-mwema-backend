const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  type: {
    type: String,
    enum: ['info', 'warning', 'success', 'error', 'meeting', 'payment', 'system', 'reminder'],
    default: 'info'
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  channels: [{
    type: String,
    enum: ['push', 'sms', 'email', 'in-app'],
    default: 'in-app'
  }],
  scheduledFor: {
    type: Date,
    default: Date.now
  },
  sentAt: {
    type: Date
  },
  deliveryStatus: {
    push: {
      status: {
        type: String,
        enum: ['pending', 'sent', 'delivered', 'failed'],
        default: 'pending'
      },
      sentAt: Date,
      deliveredAt: Date,
      error: String
    },
    sms: {
      status: {
        type: String,
        enum: ['pending', 'sent', 'delivered', 'failed'],
        default: 'pending'
      },
      sentAt: Date,
      deliveredAt: Date,
      messageId: String,
      error: String
    },
    email: {
      status: {
        type: String,
        enum: ['pending', 'sent', 'delivered', 'failed'],
        default: 'pending'
      },
      sentAt: Date,
      deliveredAt: Date,
      messageId: String,
      error: String
    }
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  actionUrl: {
    type: String,
    trim: true
  },
  actionText: {
    type: String,
    trim: true,
    maxlength: 50
  },
  expiresAt: {
    type: Date
  },
  category: {
    type: String,
    trim: true,
    maxlength: 50
  },
  relatedModel: {
    type: String,
    enum: ['User', 'Meeting', 'Transaction', 'ProxyAction']
  },
  relatedId: {
    type: mongoose.Schema.Types.ObjectId
  },
  isSystemGenerated: {
    type: Boolean,
    default: false
  },
  batchId: {
    type: String,
    trim: true
  },
  retryCount: {
    type: Number,
    default: 0,
    max: 3
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 30
  }],
  metadata: {
    originalScheduledTime: Date,
    rescheduledCount: {
      type: Number,
      default: 0
    },
    source: {
      type: String,
      enum: ['manual', 'automated', 'scheduled', 'triggered'],
      default: 'manual'
    },
    deviceTokens: [String],
    userAgent: String,
    ipAddress: String
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedAt: {
    type: Date
  },
  deletedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes for better query performance
notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ priority: 1 });
notificationSchema.index({ scheduledFor: 1 });
notificationSchema.index({ expiresAt: 1 });
notificationSchema.index({ batchId: 1 });
notificationSchema.index({ isSystemGenerated: 1 });
notificationSchema.index({ 'deliveryStatus.sms.status': 1 });
notificationSchema.index({ 'deliveryStatus.push.status': 1 });

// Virtual for checking if notification is expired
notificationSchema.virtual('isExpired').get(function() {
  return this.expiresAt && this.expiresAt < new Date();
});

// Virtual for checking if notification is urgent
notificationSchema.virtual('isUrgent').get(function() {
  return this.priority === 'urgent' || this.priority === 'high';
});

// Virtual for overall delivery status
notificationSchema.virtual('overallDeliveryStatus').get(function() {
  const statuses = [];
  
  if (this.channels.includes('sms')) {
    statuses.push(this.deliveryStatus.sms.status);
  }
  if (this.channels.includes('push')) {
    statuses.push(this.deliveryStatus.push.status);
  }
  if (this.channels.includes('email')) {
    statuses.push(this.deliveryStatus.email.status);
  }
  
  if (statuses.every(status => status === 'delivered')) return 'delivered';
  if (statuses.some(status => status === 'failed')) return 'partial';
  if (statuses.some(status => status === 'sent')) return 'sent';
  return 'pending';
});

// Pre-save middleware
notificationSchema.pre('save', function(next) {
  // Set sentAt when notification is being sent
  if (this.isModified('deliveryStatus') && !this.sentAt) {
    const hasBeenSent = this.channels.some(channel => {
      return this.deliveryStatus[channel]?.status === 'sent' || 
             this.deliveryStatus[channel]?.status === 'delivered';
    });
    
    if (hasBeenSent) {
      this.sentAt = new Date();
    }
  }

  // Set readAt when marking as read
  if (this.isModified('isRead') && this.isRead && !this.readAt) {
    this.readAt = new Date();
  }

  // Archive expired notifications
  if (this.isExpired && !this.isArchived) {
    this.isArchived = true;
    this.archivedAt = new Date();
  }

  next();
});

// Instance methods
notificationSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

notificationSchema.methods.markAsDelivered = function(channel, messageId = null) {
  if (!this.channels.includes(channel)) {
    throw new Error(`Channel ${channel} not enabled for this notification`);
  }

  this.deliveryStatus[channel].status = 'delivered';
  this.deliveryStatus[channel].deliveredAt = new Date();
  
  if (messageId) {
    this.deliveryStatus[channel].messageId = messageId;
  }

  return this.save();
};

notificationSchema.methods.markAsFailed = function(channel, error) {
  if (!this.channels.includes(channel)) {
    throw new Error(`Channel ${channel} not enabled for this notification`);
  }

  this.deliveryStatus[channel].status = 'failed';
  this.deliveryStatus[channel].error = error;
  this.retryCount += 1;

  return this.save();
};

notificationSchema.methods.reschedule = function(newScheduleTime) {
  this.metadata.originalScheduledTime = this.scheduledFor;
  this.scheduledFor = newScheduleTime;
  this.metadata.rescheduledCount += 1;
  
  // Reset delivery status for rescheduled notifications
  this.channels.forEach(channel => {
    this.deliveryStatus[channel].status = 'pending';
    delete this.deliveryStatus[channel].sentAt;
    delete this.deliveryStatus[channel].deliveredAt;
    delete this.deliveryStatus[channel].error;
  });

  return this.save();
};

notificationSchema.methods.archive = function() {
  this.isArchived = true;
  this.archivedAt = new Date();
  return this.save();
};

// Static methods
notificationSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({
    recipient: userId,
    isRead: false,
    isArchived: false,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  });
};

notificationSchema.statics.getNotificationsByPriority = function(userId, priority) {
  return this.find({
    recipient: userId,
    priority: priority,
    isArchived: false,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  })
    .populate('sender', 'firstName lastName')
    .sort({ createdAt: -1 });
};

notificationSchema.statics.getRecentNotifications = function(userId, limit = 10) {
  return this.find({
    recipient: userId,
    isArchived: false,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  })
    .populate('sender', 'firstName lastName')
    .sort({ createdAt: -1 })
    .limit(limit);
};

notificationSchema.statics.getPendingDeliveries = function(channel) {
  const query = {
    scheduledFor: { $lte: new Date() },
    isArchived: false,
    channels: channel
  };
  
  query[`deliveryStatus.${channel}.status`] = 'pending';
  
  return this.find(query)
    .populate('recipient', 'firstName lastName phoneNumber')
    .sort({ priority: -1, scheduledFor: 1 });
};

notificationSchema.statics.createBulkNotifications = async function(notifications) {
  // Add batch ID to group related notifications
  const batchId = new mongoose.Types.ObjectId().toString();
  const notificationsWithBatch = notifications.map(notification => ({
    ...notification,
    batchId,
    isSystemGenerated: true,
    metadata: {
      ...notification.metadata,
      source: 'automated'
    }
  }));

  return this.insertMany(notificationsWithBatch);
};

notificationSchema.statics.cleanupExpired = function() {
  return this.updateMany(
    {
      expiresAt: { $lt: new Date() },
      isArchived: false
    },
    {
      $set: {
        isArchived: true,
        archivedAt: new Date()
      }
    }
  );
};

notificationSchema.statics.getDeliveryStats = async function(dateRange = {}) {
  const matchStage = {};
  
  if (dateRange.startDate || dateRange.endDate) {
    matchStage.createdAt = {};
    if (dateRange.startDate) matchStage.createdAt.$gte = new Date(dateRange.startDate);
    if (dateRange.endDate) matchStage.createdAt.$lte = new Date(dateRange.endDate);
  }

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          type: '$type',
          priority: '$priority'
        },
        total: { $sum: 1 },
        read: {
          $sum: { $cond: ['$isRead', 1, 0] }
        },
        smsDelivered: {
          $sum: {
            $cond: [
              { $eq: ['$deliveryStatus.sms.status', 'delivered'] },
              1, 0
            ]
          }
        },
        pushDelivered: {
          $sum: {
            $cond: [
              { $eq: ['$deliveryStatus.push.status', 'delivered'] },
              1, 0
            ]
          }
        }
      }
    },
    {
      $project: {
        _id: 1,
        total: 1,
        read: 1,
        readRate: { $multiply: [{ $divide: ['$read', '$total'] }, 100] },
        smsDelivered: 1,
        pushDelivered: 1
      }
    }
  ]);
};

// Ensure virtual fields are serialized
notificationSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Notification', notificationSchema);