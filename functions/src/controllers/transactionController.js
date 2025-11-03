const Transaction = require('../models/Transaction');
const User = require('../models/User');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

/**
 * @desc    Create a new transaction
 * @route   POST /api/transactions
 * @access  Private (Admin/Treasurer)
 */
const createTransaction = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const transactionData = {
      ...req.body,
      createdBy: req.user.id,
      status: 'pending'
    };

    // If no specific user mentioned, assume it's for the creating user
    if (!transactionData.fromUserId && !transactionData.toUserId) {
      transactionData.fromUserId = req.user.id;
    }

    const transaction = await Transaction.create(transactionData);
    
    await transaction.populate([
      { path: 'fromUserId', select: 'firstName lastName phoneNumber' },
      { path: 'toUserId', select: 'firstName lastName phoneNumber' },
      { path: 'createdBy', select: 'firstName lastName' }
    ]);

    logger.info('Transaction created', { 
      transactionId: transaction._id, 
      type: transaction.type,
      amount: transaction.amount,
      createdBy: req.user.id 
    });

    res.status(201).json({
      success: true,
      message: 'Transaction created successfully',
      data: transaction
    });
  } catch (error) {
    logger.error('Error creating transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating transaction'
    });
  }
};

/**
 * @desc    Get all transactions with pagination and filtering
 * @route   GET /api/transactions
 * @access  Private (Admin/Treasurer)
 */
const getAllTransactions = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      status,
      fromDate,
      toDate,
      userId,
      category,
      minAmount,
      maxAmount,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (page - 1) * limit;
    const query = {};

    // Build filter query
    if (type) query.type = type;
    if (status) query.status = status;
    if (userId) {
      query.$or = [
        { fromUserId: userId },
        { toUserId: userId }
      ];
    }
    if (category) query.category = new RegExp(category, 'i');

    // Date range filter
    if (fromDate || toDate) {
      query.transactionDate = {};
      if (fromDate) query.transactionDate.$gte = new Date(fromDate);
      if (toDate) query.transactionDate.$lte = new Date(toDate);
    }

    // Amount range filter
    if (minAmount || maxAmount) {
      query.amount = {};
      if (minAmount) query.amount.$gte = parseFloat(minAmount);
      if (maxAmount) query.amount.$lte = parseFloat(maxAmount);
    }

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const transactions = await Transaction.find(query)
      .populate('fromUserId', 'firstName lastName phoneNumber')
      .populate('toUserId', 'firstName lastName phoneNumber')
      .populate('createdBy', 'firstName lastName')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Transaction.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        transactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalTransactions: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching transactions'
    });
  }
};

/**
 * @desc    Get transaction by ID
 * @route   GET /api/transactions/:id
 * @access  Private (Admin/Treasurer/Own transactions)
 */
const getTransactionById = async (req, res) => {
  try {
    const { id } = req.params;

    const transaction = await Transaction.findById(id)
      .populate('fromUserId', 'firstName lastName phoneNumber')
      .populate('toUserId', 'firstName lastName phoneNumber')
      .populate('createdBy', 'firstName lastName');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Check if user can access this transaction
    const canAccess = req.user.role === 'admin' || 
                     req.user.role === 'treasurer' ||
                     transaction.fromUserId?._id.toString() === req.user.id ||
                     transaction.toUserId?._id.toString() === req.user.id;

    if (!canAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: transaction
    });
  } catch (error) {
    logger.error('Error fetching transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching transaction'
    });
  }
};

/**
 * @desc    Update transaction
 * @route   PUT /api/transactions/:id
 * @access  Private (Admin/Treasurer)
 */
const updateTransaction = async (req, res) => {
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
    const updates = { ...req.body, updatedAt: new Date() };

    // Prevent updating certain fields
    delete updates.createdBy;
    delete updates.status; // Use separate endpoints for status changes

    const transaction = await Transaction.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    ).populate([
      { path: 'fromUserId', select: 'firstName lastName phoneNumber' },
      { path: 'toUserId', select: 'firstName lastName phoneNumber' },
      { path: 'createdBy', select: 'firstName lastName' }
    ]);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    logger.info('Transaction updated', { 
      transactionId: id, 
      updatedBy: req.user.id 
    });

    res.status(200).json({
      success: true,
      message: 'Transaction updated successfully',
      data: transaction
    });
  } catch (error) {
    logger.error('Error updating transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating transaction'
    });
  }
};

/**
 * @desc    Get user's transactions
 * @route   GET /api/transactions/my-transactions
 * @access  Private (All authenticated users)
 */
const getUserTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status } = req.query;
    const skip = (page - 1) * limit;

    const query = {
      $or: [
        { fromUserId: req.user.id },
        { toUserId: req.user.id }
      ]
    };

    if (type) query.type = type;
    if (status) query.status = status;

    const transactions = await Transaction.find(query)
      .populate('fromUserId', 'firstName lastName')
      .populate('toUserId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Transaction.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        transactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalTransactions: total
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching user transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching transactions'
    });
  }
};

/**
 * @desc    Get transactions by type
 * @route   GET /api/transactions/type/:type
 * @access  Private (Admin/Treasurer)
 */
const getTransactionsByType = async (req, res) => {
  try {
    const { type } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({ type })
      .populate('fromUserId', 'firstName lastName')
      .populate('toUserId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Transaction.countDocuments({ type });

    res.status(200).json({
      success: true,
      data: {
        transactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalTransactions: total
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching transactions by type:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching transactions'
    });
  }
};

/**
 * @desc    Calculate user balance
 * @route   GET /api/transactions/balance/:userId
 * @access  Private (Admin/Treasurer/Own balance)
 */
const calculateUserBalance = async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user can access this balance
    if (req.user.role !== 'admin' && req.user.role !== 'treasurer' && req.user.id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Calculate contributions (money coming in)
    const contributionsResult = await Transaction.aggregate([
      {
        $match: {
          toUserId: user._id,
          type: { $in: ['contribution', 'income', 'dividend'] },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Calculate debits (money going out)
    const debitsResult = await Transaction.aggregate([
      {
        $match: {
          fromUserId: user._id,
          type: { $in: ['loan', 'expense', 'fine', 'transfer'] },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const totalContributions = contributionsResult[0]?.total || 0;
    const totalDebits = debitsResult[0]?.total || 0;
    const balance = totalContributions - totalDebits;

    // Get recent transactions
    const recentTransactions = await Transaction.find({
      $or: [{ fromUserId: userId }, { toUserId: userId }],
      status: 'completed'
    })
      .populate('fromUserId', 'firstName lastName')
      .populate('toUserId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.fullName,
          phoneNumber: user.phoneNumber
        },
        balance: {
          totalContributions,
          totalDebits,
          currentBalance: balance,
          contributionCount: contributionsResult[0]?.count || 0,
          debitCount: debitsResult[0]?.count || 0
        },
        recentTransactions
      }
    });
  } catch (error) {
    logger.error('Error calculating user balance:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while calculating balance'
    });
  }
};

/**
 * @desc    Get transaction statistics
 * @route   GET /api/transactions/stats
 * @access  Private (Admin/Treasurer)
 */
const getTransactionStats = async (req, res) => {
  try {
    const { period = 'month', groupBy = 'type' } = req.query;

    // Calculate date range based on period
    const now = new Date();
    let startDate;

    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Aggregate transactions
    const stats = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: `$${groupBy}`,
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
          avgAmount: { $avg: '$amount' }
        }
      },
      {
        $sort: { totalAmount: -1 }
      }
    ]);

    // Get total overview
    const totalStats = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          totalCount: { $sum: 1 },
          avgTransaction: { $avg: '$amount' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        period,
        groupBy,
        overview: totalStats[0] || { totalAmount: 0, totalCount: 0, avgTransaction: 0 },
        breakdown: stats
      }
    });
  } catch (error) {
    logger.error('Error fetching transaction stats:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching transaction statistics'
    });
  }
};

/**
 * @desc    Get dashboard statistics
 * @route   GET /api/transactions/dashboard-stats
 * @access  Private (Admin/Treasurer)
 */
const getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Monthly stats
    const monthlyStats = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfMonth },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Recent transactions
    const recentTransactions = await Transaction.find({ status: 'completed' })
      .populate('fromUserId', 'firstName lastName')
      .populate('toUserId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(5);

    // Pending transactions
    const pendingCount = await Transaction.countDocuments({ status: 'pending' });

    res.status(200).json({
      success: true,
      data: {
        monthlyStats: monthlyStats.reduce((acc, stat) => {
          acc[stat._id] = { total: stat.total, count: stat.count };
          return acc;
        }, {}),
        recentTransactions,
        pendingCount,
        generatedAt: new Date()
      }
    });
  } catch (error) {
    logger.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard statistics'
    });
  }
};

/**
 * @desc    Approve transaction
 * @route   PUT /api/transactions/:id/approve
 * @access  Private (Admin/Treasurer)
 */
const approveTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;

    const transaction = await Transaction.findById(id);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending transactions can be approved'
      });
    }

    transaction.status = 'approved';
    transaction.approvedBy = req.user.id;
    transaction.approvedAt = new Date();
    if (comment) transaction.approvalComment = comment;

    await transaction.save();
    await transaction.populate([
      { path: 'fromUserId', select: 'firstName lastName' },
      { path: 'toUserId', select: 'firstName lastName' },
      { path: 'approvedBy', select: 'firstName lastName' }
    ]);

    logger.info('Transaction approved', { 
      transactionId: id, 
      approvedBy: req.user.id 
    });

    res.status(200).json({
      success: true,
      message: 'Transaction approved successfully',
      data: transaction
    });
  } catch (error) {
    logger.error('Error approving transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while approving transaction'
    });
  }
};

/**
 * @desc    Reject transaction
 * @route   PUT /api/transactions/:id/reject
 * @access  Private (Admin/Treasurer)
 */
const rejectTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;

    const transaction = await Transaction.findById(id);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending transactions can be rejected'
      });
    }

    transaction.status = 'rejected';
    transaction.rejectedBy = req.user.id;
    transaction.rejectedAt = new Date();
    if (comment) transaction.rejectionComment = comment;

    await transaction.save();

    logger.info('Transaction rejected', { 
      transactionId: id, 
      rejectedBy: req.user.id,
      reason: comment 
    });

    res.status(200).json({
      success: true,
      message: 'Transaction rejected successfully',
      data: transaction
    });
  } catch (error) {
    logger.error('Error rejecting transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while rejecting transaction'
    });
  }
};

/**
 * @desc    Delete transaction (soft delete)
 * @route   DELETE /api/transactions/:id
 * @access  Private (Admin only)
 */
const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    const transaction = await Transaction.findByIdAndUpdate(
      id,
      { 
        status: 'cancelled',
        deletedAt: new Date(),
        deletedBy: req.user.id
      },
      { new: true }
    );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    logger.info('Transaction deleted', { 
      transactionId: id, 
      deletedBy: req.user.id 
    });

    res.status(200).json({
      success: true,
      message: 'Transaction deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting transaction'
    });
  }
};

// Additional helper functions
const exportTransactions = async (req, res) => {
  // Implementation for exporting transactions to CSV/Excel
  res.status(200).json({
    success: true,
    message: 'Export functionality not yet implemented'
  });
};

const reconcileTransactions = async (req, res) => {
  // Implementation for reconciling transactions
  res.status(200).json({
    success: true,
    message: 'Reconciliation functionality not yet implemented'
  });
};

const bulkImportTransactions = async (req, res) => {
  // Implementation for bulk importing transactions
  res.status(200).json({
    success: true,
    message: 'Bulk import functionality not yet implemented'
  });
};

const getMonthlyReport = async (req, res) => {
  // Implementation for monthly reports
  res.status(200).json({
    success: true,
    message: 'Monthly report functionality not yet implemented'
  });
};

module.exports = {
  createTransaction,
  getAllTransactions,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  getUserTransactions,
  getTransactionsByType,
  calculateUserBalance,
  getTransactionStats,
  exportTransactions,
  reconcileTransactions,
  approveTransaction,
  rejectTransaction,
  bulkImportTransactions,
  getMonthlyReport,
  getDashboardStats
};