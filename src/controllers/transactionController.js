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
      adminId: req.user.id,
      status: 'pending'
    };

    // Set memberId if not provided (for self-contributions)
    if (!transactionData.memberId) {
      transactionData.memberId = req.user.id;
    }

    // Ensure amount is a valid number
    if (transactionData.amount) {
      transactionData.amount = Number(transactionData.amount);
      if (isNaN(transactionData.amount) || transactionData.amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be a valid positive number'
        });
      }
    }

    // Set member and admin names from user objects
    const member = await User.findById(transactionData.memberId);
    const admin = await User.findById(transactionData.adminId);
    
    if (!member) {
      return res.status(404).json({
        success: false,
        message: 'Member not found'
      });
    }

    transactionData.memberName = `${member.firstName} ${member.lastName}`;
    transactionData.adminName = `${admin.firstName} ${admin.lastName}`;

    const transaction = await Transaction.create(transactionData);
    
    await transaction.populate([
      { path: 'memberId', select: 'firstName lastName phoneNumber' },
      { path: 'adminId', select: 'firstName lastName' }
    ]);

    logger.info('Transaction created', { 
      transactionId: transaction._id, 
      type: transaction.type,
      amount: transaction.amount,
      adminId: req.user.id 
    });

    // Sanitize transaction data for response
    const sanitizedTransaction = transaction.toObject();
    if (sanitizedTransaction.amount) {
      sanitizedTransaction.amount = Number(sanitizedTransaction.amount);
    }

    res.status(201).json({
      success: true,
      message: 'Transaction created successfully',
      data: sanitizedTransaction
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

    // Validate and convert pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;
    const query = {};

    // Build filter query
    if (type) query.type = type;
    if (status) query.status = status;
    if (userId) {
      query.$or = [
        { memberId: userId },
        { adminId: userId }
      ];
    }
    if (category) query.category = new RegExp(category, 'i');

    // Date range filter
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }

    // Amount range filter with validation
    if (minAmount || maxAmount) {
      query.amount = {};
      if (minAmount) {
        const minVal = parseFloat(minAmount);
        if (!isNaN(minVal) && minVal >= 0) {
          query.amount.$gte = minVal;
        }
      }
      if (maxAmount) {
        const maxVal = parseFloat(maxAmount);
        if (!isNaN(maxVal) && maxVal >= 0) {
          query.amount.$lte = maxVal;
        }
      }
    }

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const transactions = await Transaction.find(query)
      .populate({
        path: 'memberId',
        select: 'firstName lastName phoneNumber',
        options: { strictPopulate: false }
      })
      .populate({
        path: 'adminId',
        select: 'firstName lastName',
        options: { strictPopulate: false }
      })
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum);

    const total = await Transaction.countDocuments(query);

    // Ensure all transactions have proper data types
    const sanitizedTransactions = transactions.map(transaction => {
      const sanitized = transaction.toObject();
      if (sanitized.amount) sanitized.amount = Number(sanitized.amount);
      return sanitized;
    });

    res.status(200).json({
      success: true,
      data: {
        transactions: sanitizedTransactions,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalTransactions: total,
          hasNext: pageNum < Math.ceil(total / limitNum),
          hasPrev: pageNum > 1
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
      .populate('memberId', 'firstName lastName phoneNumber')
      .populate('adminId', 'firstName lastName');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Check if user can access this transaction
    const canAccess = ['admin', 'chairperson', 'treasurer'].includes(req.user.role) ||
                     transaction.memberId?._id.toString() === req.user.id ||
                     transaction.adminId?._id.toString() === req.user.id;

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
    delete updates.adminId;
    delete updates.status; // Use separate endpoints for status changes

    const transaction = await Transaction.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    ).populate([
      { path: 'memberId', select: 'firstName lastName phoneNumber' },
      { path: 'adminId', select: 'firstName lastName' }
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
    
    // Validate and convert pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {
      $or: [
        { memberId: req.user.id },
        { adminId: req.user.id }
      ]
    };

    if (type) query.type = type;
    if (status) query.status = status;

    const transactions = await Transaction.find(query)
      .populate({
        path: 'memberId',
        select: 'firstName lastName',
        options: { strictPopulate: false }
      })
      .populate({
        path: 'adminId',
        select: 'firstName lastName',
        options: { strictPopulate: false }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Transaction.countDocuments(query);

    // Ensure all transactions have proper data types for getUserTransactions
    const sanitizedTransactions = transactions.map(transaction => {
      const sanitized = transaction.toObject();
      if (sanitized.amount) sanitized.amount = Number(sanitized.amount);
      return sanitized;
    });

    res.status(200).json({
      success: true,
      data: {
        transactions: sanitizedTransactions,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
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
    
    // Validate and convert pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const transactions = await Transaction.find({ type })
      .populate('memberId', 'firstName lastName')
      .populate('adminId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Transaction.countDocuments({ type });

    res.status(200).json({
      success: true,
      data: {
        transactions,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
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
    if (!['admin', 'chairperson', 'treasurer'].includes(req.user.role) && req.user.id !== userId) {
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
          memberId: user._id,
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

    // Calculate debits (loans and expenses for the member)
    const debitsResult = await Transaction.aggregate([
      {
        $match: {
          memberId: user._id,
          type: { $in: ['loan_request', 'loan_payment', 'expense', 'fine', 'penalty'] },
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
      $or: [{ memberId: userId }, { adminId: userId }],
      status: 'completed'
    })
      .populate('memberId', 'firstName lastName')
      .populate('adminId', 'firstName lastName')
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
          totalContributions: Number(totalContributions) || 0,
          totalDebits: Number(totalDebits) || 0,
          currentBalance: Number(balance) || 0,
          contributionCount: Number(contributionsResult[0]?.count) || 0,
          debitCount: Number(debitsResult[0]?.count) || 0
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
      .populate('memberId', 'firstName lastName')
      .populate('adminId', 'firstName lastName')
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
      { path: 'memberId', select: 'firstName lastName' },
      { path: 'adminId', select: 'firstName lastName' },
      { path: 'metadata.approvedBy', select: 'firstName lastName' }
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
  try {
    const { format = 'csv', fromDate, toDate, type, status } = req.query;

    // Build query for filtering
    const query = {};
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }
    if (type) query.type = type;
    if (status) query.status = status;

    // Get transactions with populated fields
    const transactions = await Transaction.find(query)
      .populate('memberId', 'firstName lastName phoneNumber')
      .populate('adminId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .lean();

    if (transactions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No transactions found for export'
      });
    }

    // Format data for export
    const exportData = transactions.map(transaction => ({
      Date: new Date(transaction.createdAt).toISOString().split('T')[0],
      Time: new Date(transaction.createdAt).toLocaleTimeString('en-KE'),
      'Transaction ID': transaction._id.toString(),
      Type: transaction.type,
      Amount: `KSh ${transaction.amount.toLocaleString()}`,
      Description: transaction.description,
      Status: transaction.status,
      'Member Name': transaction.memberId ? 
        `${transaction.memberId.firstName} ${transaction.memberId.lastName}` : 
        transaction.memberName,
      'Member Phone': transaction.memberId?.phoneNumber || 'N/A',
      'Processed By': transaction.adminId ? 
        `${transaction.adminId.firstName} ${transaction.adminId.lastName}` : 
        transaction.adminName,
      Category: transaction.category || 'General',
      Reference: transaction.metadata?.reference || '',
      'Loan Duration': transaction.metadata?.loanDuration ? 
        `${transaction.metadata.loanDuration} months` : '',
      'Due Date': transaction.metadata?.dueDate ? 
        new Date(transaction.metadata.dueDate).toISOString().split('T')[0] : ''
    }));

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `transactions_export_${timestamp}.${format}`;

    if (format === 'csv') {
      // Generate CSV content
      const headers = Object.keys(exportData[0]).join(',');
      const csvContent = [
        headers,
        ...exportData.map(row => 
          Object.values(row).map(value => 
            typeof value === 'string' && value.includes(',') ? 
            `"${value}"` : value
          ).join(',')
        )
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csvContent);
    }

    // For other formats, return JSON with download info
    logger.info('Transactions exported', { 
      count: transactions.length, 
      format, 
      exportedBy: req.user.id 
    });

    res.status(200).json({
      success: true,
      message: `${transactions.length} transactions exported successfully`,
      data: {
        format,
        filename,
        count: transactions.length,
        exportData: format === 'json' ? exportData : null
      }
    });
  } catch (error) {
    logger.error('Error exporting transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while exporting transactions'
    });
  }
};

const reconcileTransactions = async (req, res) => {
  try {
    const { reconciliationDate, adjustments = [], notes } = req.body;

    const reconcileDate = new Date(reconciliationDate);
    
    // Get all pending transactions up to reconciliation date
    const pendingTransactions = await Transaction.find({
      status: 'pending',
      createdAt: { $lte: reconcileDate }
    }).populate('memberId', 'firstName lastName');

    let reconciled = 0;
    let totalAdjustment = 0;
    const reconciliationResults = [];

    // Process each pending transaction
    for (const transaction of pendingTransactions) {
      // Auto-approve contributions older than reconciliation date
      if (transaction.type === 'contribution') {
        transaction.status = 'completed';
        transaction.metadata = transaction.metadata || {};
        transaction.metadata.reconciledAt = new Date();
        transaction.metadata.reconciledBy = req.user.id;
        await transaction.save();
        
        reconciled++;
        reconciliationResults.push({
          transactionId: transaction._id,
          action: 'auto-approved',
          type: transaction.type,
          amount: transaction.amount,
          memberName: transaction.memberId ? 
            `${transaction.memberId.firstName} ${transaction.memberId.lastName}` : 
            transaction.memberName
        });
      }
    }

    // Process manual adjustments
    for (const adjustment of adjustments) {
      if (adjustment.transactionId && adjustment.newStatus) {
        const transaction = await Transaction.findById(adjustment.transactionId);
        if (transaction) {
          const oldStatus = transaction.status;
          transaction.status = adjustment.newStatus;
          transaction.metadata = transaction.metadata || {};
          transaction.metadata.reconciledAt = new Date();
          transaction.metadata.reconciledBy = req.user.id;
          transaction.metadata.adjustmentReason = adjustment.reason;
          await transaction.save();

          reconciliationResults.push({
            transactionId: transaction._id,
            action: 'manually-adjusted',
            oldStatus,
            newStatus: adjustment.newStatus,
            reason: adjustment.reason,
            amount: transaction.amount
          });

          if (adjustment.amountAdjustment) {
            totalAdjustment += adjustment.amountAdjustment;
          }
        }
      }
    }

    // Create reconciliation audit log
    const reconciliationLog = {
      performedBy: req.user.id,
      reconciliationDate: reconcileDate,
      transactionsReconciled: reconciled,
      manualAdjustments: adjustments.length,
      totalAdjustment,
      notes,
      results: reconciliationResults,
      timestamp: new Date()
    };

    logger.info('Transaction reconciliation completed', reconciliationLog);

    res.status(200).json({
      success: true,
      message: `Reconciliation completed: ${reconciled} transactions processed`,
      data: {
        reconciliationDate: reconcileDate,
        transactionsReconciled: reconciled,
        manualAdjustments: adjustments.length,
        totalAdjustment,
        results: reconciliationResults,
        summary: {
          autoApproved: reconciliationResults.filter(r => r.action === 'auto-approved').length,
          manuallyAdjusted: reconciliationResults.filter(r => r.action === 'manually-adjusted').length
        }
      }
    });
  } catch (error) {
    logger.error('Error reconciling transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while reconciling transactions'
    });
  }
};

const bulkImportTransactions = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { transactions } = req.body;
    const results = {
      total: transactions.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    const importedTransactions = [];

    for (let i = 0; i < transactions.length; i++) {
      try {
        const transactionData = transactions[i];
        
        // Find member by phone number if provided
        let memberId = transactionData.memberId;
        if (!memberId && transactionData.memberPhone) {
          const member = await User.findOne({ 
            phoneNumber: transactionData.memberPhone,
            isActive: true 
          });
          if (member) {
            memberId = member._id;
          } else {
            results.errors.push({
              row: i + 1,
              error: `Member with phone ${transactionData.memberPhone} not found`
            });
            results.failed++;
            continue;
          }
        }

        // Create transaction
        const transaction = new Transaction({
          memberId: memberId || req.user.id,
          memberName: transactionData.memberName || 'Bulk Import',
          adminId: req.user.id,
          adminName: `${req.user.firstName} ${req.user.lastName}`,
          type: transactionData.type,
          amount: Number(transactionData.amount),
          description: transactionData.description,
          category: transactionData.category || 'General',
          status: transactionData.status || 'completed',
          metadata: {
            bulkImported: true,
            importedAt: new Date(),
            importedBy: req.user.id,
            reference: transactionData.reference || '',
            originalRow: i + 1
          }
        });

        // Override date if provided
        if (transactionData.date) {
          transaction.createdAt = new Date(transactionData.date);
        }

        await transaction.save();
        importedTransactions.push(transaction);
        results.successful++;

      } catch (error) {
        results.errors.push({
          row: i + 1,
          error: error.message
        });
        results.failed++;
      }
    }

    logger.info('Bulk import completed', {
      total: results.total,
      successful: results.successful,
      failed: results.failed,
      importedBy: req.user.id
    });

    res.status(201).json({
      success: true,
      message: `Bulk import completed: ${results.successful}/${results.total} transactions imported`,
      data: {
        summary: results,
        importedTransactions: importedTransactions.map(t => ({
          id: t._id,
          type: t.type,
          amount: t.amount,
          memberName: t.memberName,
          status: t.status
        }))
      }
    });
  } catch (error) {
    logger.error('Error bulk importing transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while importing transactions'
    });
  }
};

const getMonthlyReport = async (req, res) => {
  try {
    const { year, month } = req.query;
    
    // Create date range for the specified month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Get transactions for the month
    const transactions = await Transaction.find({
      createdAt: { $gte: startDate, $lte: endDate }
    }).populate('memberId', 'firstName lastName').lean();

    // Calculate monthly summaries
    const summaries = {
      contributions: { count: 0, amount: 0, transactions: [] },
      loans: { count: 0, amount: 0, transactions: [] },
      expenses: { count: 0, amount: 0, transactions: [] },
      fines: { count: 0, amount: 0, transactions: [] },
      other: { count: 0, amount: 0, transactions: [] }
    };

    // Process each transaction
    transactions.forEach(transaction => {
      const category = transaction.type === 'contribution' ? 'contributions' :
                      transaction.type.includes('loan') ? 'loans' :
                      ['fine', 'penalty'].includes(transaction.type) ? 'fines' :
                      transaction.type === 'expense' ? 'expenses' : 'other';

      summaries[category].count++;
      summaries[category].amount += transaction.amount;
      summaries[category].transactions.push({
        id: transaction._id,
        date: transaction.createdAt,
        amount: transaction.amount,
        description: transaction.description,
        memberName: transaction.memberId ? 
          `${transaction.memberId.firstName} ${transaction.memberId.lastName}` : 
          transaction.memberName,
        status: transaction.status
      });
    });

    // Calculate totals
    const totalIncome = summaries.contributions.amount + 
                       summaries.fines.amount + 
                       summaries.other.amount;
    const totalOutgoing = summaries.loans.amount + summaries.expenses.amount;
    const netAmount = totalIncome - totalOutgoing;

    // Get member participation stats
    const memberStats = await Transaction.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      { 
        $group: {
          _id: '$memberId',
          transactionCount: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          types: { $addToSet: '$type' }
        }
      },
      { $sort: { totalAmount: -1 } },
      { $limit: 10 }
    ]);

    // Populate member names
    await Transaction.populate(memberStats, {
      path: '_id',
      select: 'firstName lastName'
    });

    const monthName = new Date(year, month - 1).toLocaleString('default', { 
      month: 'long', 
      year: 'numeric' 
    });

    logger.info('Monthly report generated', {
      year,
      month,
      totalTransactions: transactions.length,
      netAmount,
      generatedBy: req.user.id
    });

    res.status(200).json({
      success: true,
      data: {
        period: {
          month: monthName,
          year: parseInt(year),
          monthNumber: parseInt(month),
          startDate,
          endDate
        },
        summary: {
          totalTransactions: transactions.length,
          totalIncome,
          totalOutgoing,
          netAmount,
          categories: Object.keys(summaries).map(key => ({
            category: key,
            count: summaries[key].count,
            amount: summaries[key].amount,
            percentage: totalIncome > 0 ? 
              ((summaries[key].amount / totalIncome) * 100).toFixed(1) : '0.0'
          }))
        },
        details: summaries,
        topMembers: memberStats.map(stat => ({
          memberName: stat._id ? 
            `${stat._id.firstName} ${stat._id.lastName}` : 'Unknown',
          transactionCount: stat.transactionCount,
          totalAmount: stat.totalAmount,
          types: stat.types
        })),
        trends: {
          averageTransactionValue: transactions.length > 0 ? 
            (transactions.reduce((sum, t) => sum + t.amount, 0) / transactions.length).toFixed(2) : 0,
          activeMembers: new Set(transactions.map(t => t.memberId?.toString())).size
        }
      }
    });
  } catch (error) {
    logger.error('Error generating monthly report:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while generating monthly report'
    });
  }
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