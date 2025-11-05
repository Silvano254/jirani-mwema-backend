const mongoose = require('mongoose');

const attendeeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['present', 'absent', 'late', 'excused'],
    default: 'absent'
  },
  checkInTime: {
    type: Date
  },
  notes: {
    type: String,
    maxlength: 200
  }
}, { _id: false });

const meetingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  scheduledDate: {
    type: Date,
    required: true
  },
  duration: {
    type: Number, // in minutes
    required: true,
    min: 15,
    max: 480 // 8 hours
  },
  location: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  meetingType: {
    type: String,
    enum: ['regular', 'emergency', 'special', 'annual'],
    default: 'regular'
  },
  status: {
    type: String,
    enum: ['scheduled', 'ongoing', 'completed', 'cancelled', 'postponed'],
    default: 'scheduled'
  },
  isVirtual: {
    type: Boolean,
    default: false
  },
  virtualLink: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        // Only validate if virtual meeting
        if (this.isVirtual && v) {
          const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
          return urlRegex.test(v);
        }
        return true;
      },
      message: 'Invalid virtual meeting link'
    }
  },
  agenda: [{
    type: String,
    trim: true,
    maxlength: 200
  }],
  minutes: {
    content: {
      type: String,
      maxlength: 2000,
      default: ''
    },
    decisions: [{
      topic: {
        type: String,
        maxlength: 200
      },
      decision: {
        type: String,
        maxlength: 500
      },
      votes: {
        for: { type: Number, default: 0 },
        against: { type: Number, default: 0 },
        abstention: { type: Number, default: 0 }
      }
    }],
    actionItems: [{
      description: {
        type: String,
        required: true,
        maxlength: 300
      },
      assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      dueDate: Date,
      status: {
        type: String,
        enum: ['pending', 'in-progress', 'completed'],
        default: 'pending'
      }
    }],
    attendees: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      status: {
        type: String,
        enum: ['present', 'absent', 'late'],
        default: 'present'
      }
    }],
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    recordedAt: Date,
    lastUpdated: Date
  },
  attendees: [attendeeSchema],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  cancellationReason: {
    type: String,
    maxlength: 300
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancelledAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  remindersEnabled: {
    type: Boolean,
    default: true
  },
  remindersSent: [{
    sentAt: {
      type: Date,
      required: true
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    successCount: {
      type: Number,
      default: 0
    },
    failureCount: {
      type: Number,
      default: 0
    },
    message: String
  }],
  lastReminderSent: {
    type: Date
  },
  requirements: [{
    item: {
      type: String,
      required: true,
      maxlength: 100
    },
    isRequired: {
      type: Boolean,
      default: false
    }
  }],
  decisions: [{
    topic: {
      type: String,
      required: true,
      maxlength: 200
    },
    decision: {
      type: String,
      required: true,
      maxlength: 500
    },
    votesFor: {
      type: Number,
      default: 0
    },
    votesAgainst: {
      type: Number,
      default: 0
    },
    abstentions: {
      type: Number,
      default: 0
    }
  }],
  attachments: [{
    name: {
      type: String,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    size: Number,
    mimeType: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurrencePattern: {
    frequency: {
      type: String,
      enum: ['weekly', 'monthly', 'quarterly', 'yearly'],
      default: 'monthly'
    },
    interval: {
      type: Number,
      default: 1,
      min: 1
    },
    endDate: Date,
    occurrences: Number
  },
  parentMeeting: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Meeting'
  },
  isProxyManaged: {
    type: Boolean,
    default: false
  },
  proxyDetails: {
    originalCreator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    proxyAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String
  },
  deletedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes for better query performance
meetingSchema.index({ scheduledDate: 1 });
meetingSchema.index({ status: 1 });
meetingSchema.index({ meetingType: 1 });
meetingSchema.index({ createdBy: 1 });
meetingSchema.index({ 'attendees.user': 1 });
meetingSchema.index({ createdAt: -1 });

// Virtual for calculating meeting end time
meetingSchema.virtual('endTime').get(function() {
  if (this.scheduledDate && this.duration) {
    const endTime = new Date(this.scheduledDate);
    endTime.setMinutes(endTime.getMinutes() + this.duration);
    return endTime;
  }
  return null;
});

// Virtual for checking if meeting is upcoming
meetingSchema.virtual('isUpcoming').get(function() {
  return this.scheduledDate > new Date() && this.status === 'scheduled';
});

// Virtual for checking if meeting is past
meetingSchema.virtual('isPast').get(function() {
  return this.scheduledDate < new Date();
});

// Virtual for attendance statistics
meetingSchema.virtual('attendanceStats').get(function() {
  const stats = {
    total: this.attendees.length,
    present: 0,
    absent: 0,
    late: 0,
    excused: 0
  };

  this.attendees.forEach(attendee => {
    stats[attendee.status]++;
  });

  stats.attendanceRate = stats.total > 0 ? 
    ((stats.present + stats.late) / stats.total * 100).toFixed(1) : 0;

  return stats;
});

// Pre-save middleware
meetingSchema.pre('save', function(next) {
  // Set completion date when status changes to completed
  if (this.isModified('status') && this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }

  // Validate virtual meeting requirements
  if (this.isVirtual && !this.virtualLink) {
    return next(new Error('Virtual meeting must have a virtual link'));
  }

  // Ensure scheduled date is in the future for new meetings
  if (this.isNew && this.scheduledDate <= new Date()) {
    return next(new Error('Meeting must be scheduled for a future date'));
  }

  next();
});

// Instance methods
meetingSchema.methods.addAttendee = function(userId, status = 'absent') {
  const existingIndex = this.attendees.findIndex(
    attendee => attendee.user.toString() === userId.toString()
  );

  if (existingIndex >= 0) {
    this.attendees[existingIndex].status = status;
    if (status === 'present' || status === 'late') {
      this.attendees[existingIndex].checkInTime = new Date();
    }
  } else {
    this.attendees.push({
      user: userId,
      status,
      checkInTime: (status === 'present' || status === 'late') ? new Date() : null
    });
  }

  return this.save();
};

meetingSchema.methods.markAttendance = function(userId, status, notes = '') {
  const attendeeIndex = this.attendees.findIndex(
    attendee => attendee.user.toString() === userId.toString()
  );

  if (attendeeIndex >= 0) {
    this.attendees[attendeeIndex].status = status;
    this.attendees[attendeeIndex].notes = notes;
    
    if (status === 'present' || status === 'late') {
      this.attendees[attendeeIndex].checkInTime = new Date();
    }
  } else {
    this.attendees.push({
      user: userId,
      status,
      notes,
      checkInTime: (status === 'present' || status === 'late') ? new Date() : null
    });
  }

  return this.save();
};

meetingSchema.methods.cancel = function(reason, cancelledBy) {
  this.status = 'cancelled';
  this.cancellationReason = reason;
  this.cancelledBy = cancelledBy;
  this.cancelledAt = new Date();
  return this.save();
};

meetingSchema.methods.complete = function() {
  this.status = 'completed';
  this.completedAt = new Date();
  return this.save();
};

meetingSchema.methods.postpone = function(newDate) {
  this.scheduledDate = newDate;
  this.status = 'scheduled';
  return this.save();
};

// Static methods
meetingSchema.statics.getUpcomingMeetings = function(limit = 5) {
  return this.find({
    status: 'scheduled',
    scheduledDate: { $gte: new Date() }
  })
    .populate('createdBy', 'firstName lastName')
    .sort({ scheduledDate: 1 })
    .limit(limit);
};

meetingSchema.statics.getMeetingsByDateRange = function(startDate, endDate) {
  return this.find({
    scheduledDate: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  })
    .populate('createdBy', 'firstName lastName')
    .populate('attendees.user', 'firstName lastName')
    .sort({ scheduledDate: 1 });
};

meetingSchema.statics.getMeetingStats = async function() {
  const totalMeetings = await this.countDocuments();
  const scheduledMeetings = await this.countDocuments({ status: 'scheduled' });
  const completedMeetings = await this.countDocuments({ status: 'completed' });
  const cancelledMeetings = await this.countDocuments({ status: 'cancelled' });

  const upcomingMeetings = await this.find({
    status: 'scheduled',
    scheduledDate: { $gte: new Date() }
  }).countDocuments();

  return {
    total: totalMeetings,
    scheduled: scheduledMeetings,
    completed: completedMeetings,
    cancelled: cancelledMeetings,
    upcoming: upcomingMeetings
  };
};

// Ensure virtual fields are serialized
meetingSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Meeting', meetingSchema);