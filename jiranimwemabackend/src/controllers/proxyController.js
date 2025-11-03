const ProxyAction = require('../models/ProxyAction');
const User = require('../models/User');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

/**
 * @desc    Create a new proxy action request
 * @route   POST /api/proxy
 * @access  Private (All authenticated users)
 */
const createProxyAction = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const proxyActionData = {
      ...req.body,
      requestedBy: req.user.id,
      status: 'pending'
    };

    const proxyAction = await ProxyAction.create(proxyActionData);
    
    await proxyAction.populate([
      { path: 'requestedBy', select: 'firstName lastName phoneNumber' },
      { path: 'targetUserId', select: 'firstName lastName phoneNumber' }
    ]);

    logger.info('Proxy action created', { 
      proxyActionId: proxyAction._id, 
      actionType: proxyAction.actionType,
      requestedBy: req.user.id 
    });

    res.status(201).json({
      success: true,
      message: 'Proxy action request created successfully',
      data: proxyAction
    });
  } catch (error) {
    logger.error('Error creating proxy action:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating proxy action'
    });
  }
};

/**
 * @desc    Get all proxy actions with pagination and filtering
 * @route   GET /api/proxy
 * @access  Private (Admin only)
 */
const getAllProxyActions = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      actionType,
      priority,
      requestedBy,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (page - 1) * limit;
    const query = {};

    // Build filter query
    if (status) query.status = status;
    if (actionType) query.actionType = actionType;
    if (priority) query.priority = priority;
    if (requestedBy) query.requestedBy = requestedBy;

    // Exclude expired actions unless specifically requested
    if (!query.status) {
      query.$or = [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } },
        { status: { $ne: 'pending' } }
      ];
    }

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const proxyActions = await ProxyAction.find(query)
      .populate('requestedBy', 'firstName lastName phoneNumber role')
      .populate('targetUserId', 'firstName lastName phoneNumber')
      .populate('approvedBy', 'firstName lastName')
      .populate('executedBy', 'firstName lastName')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ProxyAction.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        proxyActions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalActions: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching proxy actions:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching proxy actions'
    });
  }
};

/**
 * @desc    Get proxy action by ID
 * @route   GET /api/proxy/:id
 * @access  Private (Admin or request owner)
 */
const getProxyActionById = async (req, res) => {
  try {
    const { id } = req.params;

    const proxyAction = await ProxyAction.findById(id)
      .populate('requestedBy', 'firstName lastName phoneNumber role')
      .populate('targetUserId', 'firstName lastName phoneNumber')
      .populate('approvedBy', 'firstName lastName')
      .populate('executedBy', 'firstName lastName');

    if (!proxyAction) {
      return res.status(404).json({
        success: false,
        message: 'Proxy action not found'
      });
    }

    // Check if user can access this proxy action
    if (req.user.role !== 'admin' && proxyAction.requestedBy._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: proxyAction
    });
  } catch (error) {
    logger.error('Error fetching proxy action:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching proxy action'
    });
  }
};

/**
 * @desc    Approve a proxy action
 * @route   PUT /api/proxy/:id/approve
 * @access  Private (Admin only)
 */
const approveProxyAction = async (req, res) => {
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
    const { comment, conditions } = req.body;

    const proxyAction = await ProxyAction.findById(id);
    if (!proxyAction) {
      return res.status(404).json({
        success: false,
        message: 'Proxy action not found'
      });
    }

    if (proxyAction.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending proxy actions can be approved'
      });
    }

    // Check if action has expired
    if (proxyAction.expiresAt && proxyAction.expiresAt < new Date()) {
      proxyAction.status = 'expired';
      await proxyAction.save();
      
      return res.status(400).json({
        success: false,
        message: 'Proxy action has expired'
      });
    }

    proxyAction.status = 'approved';
    proxyAction.approvedBy = req.user.id;
    proxyAction.approvedAt = new Date();
    proxyAction.approvalDetails = {
      comment: comment || '',
      conditions: conditions || []
    };

    await proxyAction.save();
    await proxyAction.populate([
      { path: 'requestedBy', select: 'firstName lastName' },
      { path: 'approvedBy', select: 'firstName lastName' }
    ]);

    logger.info('Proxy action approved', { 
      proxyActionId: id, 
      approvedBy: req.user.id,
      actionType: proxyAction.actionType 
    });

    res.status(200).json({
      success: true,
      message: 'Proxy action approved successfully',
      data: proxyAction
    });
  } catch (error) {
    logger.error('Error approving proxy action:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while approving proxy action'
    });
  }
};

/**
 * @desc    Reject a proxy action
 * @route   PUT /api/proxy/:id/reject
 * @access  Private (Admin only)
 */
const rejectProxyAction = async (req, res) => {
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
    const { comment } = req.body;

    const proxyAction = await ProxyAction.findById(id);
    if (!proxyAction) {
      return res.status(404).json({
        success: false,
        message: 'Proxy action not found'
      });
    }

    if (proxyAction.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending proxy actions can be rejected'
      });
    }

    proxyAction.status = 'rejected';
    proxyAction.rejectedBy = req.user.id;
    proxyAction.rejectedAt = new Date();
    proxyAction.rejectionReason = comment || '';

    await proxyAction.save();

    logger.info('Proxy action rejected', { 
      proxyActionId: id, 
      rejectedBy: req.user.id,
      reason: comment 
    });

    res.status(200).json({
      success: true,
      message: 'Proxy action rejected successfully',
      data: proxyAction
    });
  } catch (error) {
    logger.error('Error rejecting proxy action:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while rejecting proxy action'
    });
  }
};

/**
 * @desc    Execute an approved proxy action
 * @route   POST /api/proxy/:id/execute
 * @access  Private (Admin only)
 */
const executeProxyAction = async (req, res) => {
  try {
    const { id } = req.params;
    const { executionNotes } = req.body;

    const proxyAction = await ProxyAction.findById(id);
    if (!proxyAction) {
      return res.status(404).json({
        success: false,
        message: 'Proxy action not found'
      });
    }

    if (proxyAction.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Only approved proxy actions can be executed'
      });
    }

    // Check if action has expired
    if (proxyAction.expiresAt && proxyAction.expiresAt < new Date()) {
      proxyAction.status = 'expired';
      await proxyAction.save();
      
      return res.status(400).json({
        success: false,
        message: 'Proxy action has expired'
      });
    }

    // Here you would implement the actual execution logic based on actionType
    // For now, we'll just mark it as executed
    proxyAction.status = 'executed';
    proxyAction.executedBy = req.user.id;
    proxyAction.executedAt = new Date();
    proxyAction.executionDetails = {
      notes: executionNotes || '',
      timestamp: new Date()
    };

    await proxyAction.save();

    logger.info('Proxy action executed', { 
      proxyActionId: id, 
      executedBy: req.user.id,
      actionType: proxyAction.actionType 
    });

    res.status(200).json({
      success: true,
      message: 'Proxy action executed successfully',
      data: proxyAction
    });
  } catch (error) {
    logger.error('Error executing proxy action:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while executing proxy action'
    });
  }
};

/**
 * @desc    Get current user's proxy actions
 * @route   GET /api/proxy/my-requests
 * @access  Private (All authenticated users)
 */
const getUserProxyActions = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const skip = (page - 1) * limit;

    const query = { requestedBy: req.user.id };
    if (status) query.status = status;

    const proxyActions = await ProxyAction.find(query)
      .populate('targetUserId', 'firstName lastName')
      .populate('approvedBy', 'firstName lastName')
      .populate('executedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ProxyAction.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        proxyActions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalActions: total
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching user proxy actions:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching proxy actions'
    });
  }
};

/**
 * @desc    Get pending proxy actions
 * @route   GET /api/proxy/pending
 * @access  Private (Admin only)
 */
const getPendingActions = async (req, res) => {
  try {
    const { page = 1, limit = 20, priority } = req.query;
    const skip = (page - 1) * limit;

    const query = { 
      status: 'pending',
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } }
      ]
    };

    if (priority) query.priority = priority;

    const proxyActions = await ProxyAction.find(query)
      .populate('requestedBy', 'firstName lastName phoneNumber role')
      .populate('targetUserId', 'firstName lastName phoneNumber')
      .sort({ priority: -1, createdAt: 1 }) // High priority first, then oldest first
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ProxyAction.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        proxyActions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalPending: total
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching pending proxy actions:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching pending actions'
    });
  }
};

/**
 * @desc    Get proxy action statistics
 * @route   GET /api/proxy/stats
 * @access  Private (Admin only)
 */
const getProxyStats = async (req, res) => {
  try {
    const totalActions = await ProxyAction.countDocuments();
    const pendingActions = await ProxyAction.countDocuments({ 
      status: 'pending',
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } }
      ]
    });
    const approvedActions = await ProxyAction.countDocuments({ status: 'approved' });
    const executedActions = await ProxyAction.countDocuments({ status: 'executed' });
    const rejectedActions = await ProxyAction.countDocuments({ status: 'rejected' });

    // Get stats by action type
    const actionTypeStats = await ProxyAction.aggregate([
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

    // Get stats by priority
    const priorityStats = await ProxyAction.aggregate([
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]);

    // Recent actions
    const recentActions = await ProxyAction.find()
      .populate('requestedBy', 'firstName lastName')
      .populate('targetUserId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      data: {
        overview: {
          total: totalActions,
          pending: pendingActions,
          approved: approvedActions,
          executed: executedActions,
          rejected: rejectedActions
        },
        byActionType: actionTypeStats.reduce((acc, item) => {
          acc[item._id] = { total: item.count, pending: item.pendingCount };
          return acc;
        }, {}),
        byPriority: priorityStats.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        recentActions
      }
    });
  } catch (error) {
    logger.error('Error fetching proxy stats:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching proxy statistics'
    });
  }
};

/**
 * @desc    Cancel a proxy action
 * @route   PUT /api/proxy/:id/cancel
 * @access  Private (Admin or request owner)
 */
const cancelProxyAction = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const proxyAction = await ProxyAction.findById(id);
    if (!proxyAction) {
      return res.status(404).json({
        success: false,
        message: 'Proxy action not found'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && proxyAction.requestedBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (proxyAction.status === 'executed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel an executed proxy action'
      });
    }

    proxyAction.status = 'cancelled';
    proxyAction.cancelledBy = req.user.id;
    proxyAction.cancelledAt = new Date();
    proxyAction.cancellationReason = reason;

    await proxyAction.save();

    logger.info('Proxy action cancelled', { 
      proxyActionId: id, 
      cancelledBy: req.user.id,
      reason 
    });

    res.status(200).json({
      success: true,
      message: 'Proxy action cancelled successfully',
      data: proxyAction
    });
  } catch (error) {
    logger.error('Error cancelling proxy action:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while cancelling proxy action'
    });
  }
};

/**
 * @desc    Bulk approve/reject proxy actions
 * @route   PUT /api/proxy/bulk-approve
 * @access  Private (Admin only)
 */
const bulkApproveActions = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { actionIds, decision, comment } = req.body;

    const updateData = {
      updatedAt: new Date()
    };

    if (decision === 'approve') {
      updateData.status = 'approved';
      updateData.approvedBy = req.user.id;
      updateData.approvedAt = new Date();
      updateData['approvalDetails.comment'] = comment || '';
    } else {
      updateData.status = 'rejected';
      updateData.rejectedBy = req.user.id;
      updateData.rejectedAt = new Date();
      updateData.rejectionReason = comment || '';
    }

    const result = await ProxyAction.updateMany(
      { 
        _id: { $in: actionIds },
        status: 'pending'
      },
      updateData
    );

    logger.info('Bulk proxy action update', { 
      actionIds, 
      decision,
      modifiedCount: result.modifiedCount,
      updatedBy: req.user.id 
    });

    res.status(200).json({
      success: true,
      message: `Successfully ${decision}d ${result.modifiedCount} proxy actions`,
      data: {
        matched: result.matchedCount,
        modified: result.modifiedCount
      }
    });
  } catch (error) {
    logger.error('Error in bulk proxy action update:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating proxy actions'
    });
  }
};

module.exports = {
  createProxyAction,
  getAllProxyActions,
  getProxyActionById,
  approveProxyAction,
  rejectProxyAction,
  executeProxyAction,
  getUserProxyActions,
  getPendingActions,
  getProxyStats,
  cancelProxyAction,
  bulkApproveActions
};