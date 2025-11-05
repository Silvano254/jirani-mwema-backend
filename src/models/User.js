const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    match: [/^\+254[7][0-9]{8}$|^0[7][0-9]{8}$|^[7][0-9]{8}$/, 'Please enter a valid Kenyan phone number']
  },
  firstName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  role: {
    type: String,
    enum: ['admin', 'chairperson', 'secretary', 'treasurer', 'member'],
    default: 'member'
  },
  nationalId: {
    type: String,
    trim: true,
    sparse: true // Allow null values but enforce uniqueness when present
  },
  isActive: {
    type: Boolean,
    default: true
  },
  fingerprintEnabled: {
    type: Boolean,
    default: true
  },
  isProxyManaged: {
    type: Boolean,
    default: false
  },
  deviceToken: {
    type: String,
    default: null
  },
  lastLoginAt: {
    type: Date,
    default: null
  },
  otpCode: {
    type: String,
    default: null
  },
  otpExpires: {
    type: Date,
    default: null
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  accountLocked: {
    type: Boolean,
    default: false
  },
  lockUntil: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes
userSchema.index({ phoneNumber: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for checking if account is locked
userSchema.virtual('isLocked').get(function() {
  return !!(this.accountLocked && this.lockUntil && this.lockUntil > Date.now());
});

// Methods
userSchema.methods.compareOTP = function(candidateOTP) {
  return this.otpCode === candidateOTP && this.otpExpires > Date.now();
};

userSchema.methods.incrementLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: {
        loginAttempts: 1,
        lockUntil: 1,
        accountLocked: 1
      }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = {
      accountLocked: true,
      lockUntil: Date.now() + 2 * 60 * 60 * 1000 // 2 hours
    };
  }
  
  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: {
      loginAttempts: 1,
      lockUntil: 1,
      accountLocked: 1
    }
  });
};

userSchema.methods.setOTP = function(otp, expiryMinutes = 10) {
  this.otpCode = otp;
  this.otpExpires = new Date(Date.now() + expiryMinutes * 60 * 1000);
  return this.save();
};

userSchema.methods.clearOTP = function() {
  this.otpCode = null;
  this.otpExpires = null;
  return this.save();
};

userSchema.methods.updateLastLogin = function() {
  this.lastLoginAt = new Date();
  return this.save();
};

userSchema.methods.isAdmin = function() {
  return ['chairperson', 'secretary', 'treasurer'].includes(this.role);
};

// Phone number normalization middleware
userSchema.pre('save', function(next) {
  if (this.isModified('phoneNumber') || this.isNew) {
    this.phoneNumber = normalizePhoneNumber(this.phoneNumber);
  }
  next();
});

// Helper function to normalize phone numbers
function normalizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return phoneNumber;
  
  // Remove all spaces and special characters except +
  let normalized = phoneNumber.replace(/[\s\-\(\)]/g, '');
  
  // Convert 07XXXXXXXX to +254XXXXXXXX
  if (normalized.startsWith('07')) {
    normalized = '+254' + normalized.substring(1);
  }
  // Convert 7XXXXXXXX to +2547XXXXXXXX
  else if (normalized.match(/^7[0-9]{8}$/)) {
    normalized = '+254' + normalized;
  }
  // If already has +254, ensure it's properly formatted
  else if (normalized.startsWith('+254')) {
    // Remove any extra + signs
    normalized = '+254' + normalized.substring(4).replace(/\+/g, '');
  }
  // Convert 254XXXXXXXX to +254XXXXXXXX
  else if (normalized.startsWith('254') && normalized.length === 12) {
    normalized = '+' + normalized;
  }
  
  return normalized;
}

// Ensure virtual fields are serialized
userSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.otpCode;
    delete ret.otpExpires;
    delete ret.loginAttempts;
    delete ret.accountLocked;
    delete ret.lockUntil;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);