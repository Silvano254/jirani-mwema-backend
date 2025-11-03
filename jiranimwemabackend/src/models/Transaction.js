const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  memberId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  memberName: {
    type: String,
    required: true
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  adminName: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['contribution', 'loan_request', 'loan_approval', 'loan_payment', 'penalty', 'fine'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'completed', 'cancelled'],
    default: 'pending'
  },
  metadata: {
    loanDuration: Number, // in months
    interestRate: Number, // percentage
    collateral: String,
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: Date,
    dueDate: Date,
    reference: String
  },
  isProxyAction: {
    type: Boolean,
    default: false
  },
  proxyDetails: {
    actedFor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    actionBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String
  }
}, {
  timestamps: true
});

// Indexes
transactionSchema.index({ memberId: 1 });
transactionSchema.index({ adminId: 1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ 'metadata.dueDate': 1 });

// Virtual for checking if transaction is overdue
transactionSchema.virtual('isOverdue').get(function() {
  if (this.type.startsWith('loan') && this.metadata?.dueDate) {
    return this.metadata.dueDate < new Date() && this.status !== 'completed';
  }
  return false;
});

// Methods
transactionSchema.methods.approve = function(approvedBy) {
  this.status = 'approved';
  this.metadata.approvedBy = approvedBy;
  this.metadata.approvedAt = new Date();
  
  // Set due date for loans
  if (this.type === 'loan_request' && this.metadata.loanDuration) {
    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + this.metadata.loanDuration);
    this.metadata.dueDate = dueDate;
  }
  
  return this.save();
};

transactionSchema.methods.reject = function(reason) {
  this.status = 'rejected';
  this.metadata.rejectionReason = reason;
  return this.save();
};

transactionSchema.methods.complete = function() {
  this.status = 'completed';
  this.metadata.completedAt = new Date();
  return this.save();
};

// Static methods
transactionSchema.statics.getMemberBalance = async function(memberId) {
  const result = await this.aggregate([
    { $match: { memberId: mongoose.Types.ObjectId(memberId) } },
    {
      $group: {
        _id: '$type',
        total: { $sum: '$amount' }
      }
    }
  ]);
  
  let contributions = 0;
  let loans = 0;
  
  result.forEach(item => {
    if (item._id === 'contribution') {
      contributions = item.total;
    } else if (item._id.startsWith('loan')) {
      loans += item.total;
    }
  });
  
  return {
    contributions,
    loans,
    balance: contributions - loans
  };
};

transactionSchema.statics.getFinancialSummary = async function(startDate, endDate) {
  const match = {};
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }
  
  const result = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$type',
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);
  
  const summary = {
    totalContributions: 0,
    totalLoans: 0,
    totalTransactions: 0,
    contributionCount: 0,
    loanCount: 0
  };
  
  result.forEach(item => {
    summary.totalTransactions += item.count;
    
    if (item._id === 'contribution') {
      summary.totalContributions = item.total;
      summary.contributionCount = item.count;
    } else if (item._id.startsWith('loan')) {
      summary.totalLoans += item.total;
      summary.loanCount += item.count;
    }
  });
  
  return summary;
};

// Ensure virtual fields are serialized
transactionSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Transaction', transactionSchema);