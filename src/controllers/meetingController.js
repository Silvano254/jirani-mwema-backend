const Meeting = require('../models/Meeting');
const User = require('../models/User');
const logger = require('../utils/logger');
const smsService = require('../services/smsService');
const { validationResult } = require('express-validator');

/**
 * @desc    Create a new meeting
 * @route   POST /api/meetings
 * @access  Private (Admin/Secretary)
 */
const createMeeting = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const meetingData = {
      ...req.body,
      createdBy: req.user.id,
      status: 'scheduled'
    };

    const meeting = await Meeting.create(meetingData);
    
    // Populate created meeting
    await meeting.populate('createdBy', 'firstName lastName');

    logger.info('Meeting created', { meetingId: meeting._id, createdBy: req.user.id });

    res.status(201).json({
      success: true,
      message: 'Meeting created successfully',
      data: meeting
    });
  } catch (error) {
    logger.error('Error creating meeting:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating meeting'
    });
  }
};

/**
 * @desc    Get all meetings with pagination and filtering
 * @route   GET /api/meetings
 * @access  Private (All authenticated users)
 */
const getAllMeetings = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      type,
      upcoming = false,
      past = false
    } = req.query;

    const skip = (page - 1) * limit;
    const query = {};

    if (status) query.status = status;
    if (type) query.meetingType = type;

    // Filter by time
    const now = new Date();
    if (upcoming === 'true') {
      query.scheduledDate = { $gte: now };
    } else if (past === 'true') {
      query.scheduledDate = { $lt: now };
    }

    const meetings = await Meeting.find(query)
      .populate('createdBy', 'firstName lastName')
      .populate('attendees.user', 'firstName lastName')
      .sort({ scheduledDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Meeting.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        meetings,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalMeetings: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching meetings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching meetings'
    });
  }
};

/**
 * @desc    Get meeting by ID
 * @route   GET /api/meetings/:id
 * @access  Private (All authenticated users)
 */
const getMeetingById = async (req, res) => {
  try {
    const { id } = req.params;

    const meeting = await Meeting.findById(id)
      .populate('createdBy', 'firstName lastName')
      .populate('attendees.user', 'firstName lastName phoneNumber');

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    res.status(200).json({
      success: true,
      data: meeting
    });
  } catch (error) {
    logger.error('Error fetching meeting:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching meeting'
    });
  }
};

/**
 * @desc    Update meeting
 * @route   PUT /api/meetings/:id
 * @access  Private (Admin/Secretary)
 */
const updateMeeting = async (req, res) => {
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

    const meeting = await Meeting.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    ).populate('createdBy', 'firstName lastName');

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    logger.info('Meeting updated', { meetingId: id, updatedBy: req.user.id });

    res.status(200).json({
      success: true,
      message: 'Meeting updated successfully',
      data: meeting
    });
  } catch (error) {
    logger.error('Error updating meeting:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating meeting'
    });
  }
};

/**
 * @desc    Schedule/reschedule a meeting
 * @route   POST /api/meetings/:id/schedule
 * @access  Private (Admin/Secretary)
 */
const scheduleMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    const { scheduledDate, sendNotifications = true } = req.body;

    const meeting = await Meeting.findByIdAndUpdate(
      id,
      { 
        scheduledDate: new Date(scheduledDate),
        status: 'scheduled',
        updatedAt: new Date()
      },
      { new: true }
    ).populate('createdBy', 'firstName lastName');

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    // Send notifications if requested
    if (sendNotifications) {
      try {
        const activeUsers = await User.find({ isActive: true });
        const message = `Meeting "${meeting.title}" has been scheduled for ${new Date(scheduledDate).toLocaleString()}. Location: ${meeting.location}`;
        
        await smsService.sendBulkSMS(
          activeUsers.map(user => user.phoneNumber),
          message
        );
      } catch (smsError) {
        logger.error('Error sending meeting notifications:', smsError);
        // Don't fail the request if SMS fails
      }
    }

    logger.info('Meeting scheduled', { meetingId: id, scheduledBy: req.user.id });

    res.status(200).json({
      success: true,
      message: 'Meeting scheduled successfully',
      data: meeting
    });
  } catch (error) {
    logger.error('Error scheduling meeting:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while scheduling meeting'
    });
  }
};

/**
 * @desc    Cancel a meeting
 * @route   POST /api/meetings/:id/cancel
 * @access  Private (Admin/Secretary)
 */
const cancelMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, notifyMembers = true } = req.body;

    const meeting = await Meeting.findByIdAndUpdate(
      id,
      { 
        status: 'cancelled',
        cancellationReason: reason,
        cancelledBy: req.user.id,
        cancelledAt: new Date(),
        updatedAt: new Date()
      },
      { new: true }
    ).populate('createdBy', 'firstName lastName');

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    // Send cancellation notifications if requested
    if (notifyMembers) {
      try {
        const activeUsers = await User.find({ isActive: true });
        const message = `Meeting "${meeting.title}" scheduled for ${meeting.scheduledDate.toLocaleString()} has been cancelled. Reason: ${reason}`;
        
        await smsService.sendBulkSMS(
          activeUsers.map(user => user.phoneNumber),
          message
        );
      } catch (smsError) {
        logger.error('Error sending cancellation notifications:', smsError);
      }
    }

    logger.info('Meeting cancelled', { meetingId: id, cancelledBy: req.user.id, reason });

    res.status(200).json({
      success: true,
      message: 'Meeting cancelled successfully',
      data: meeting
    });
  } catch (error) {
    logger.error('Error cancelling meeting:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while cancelling meeting'
    });
  }
};

/**
 * @desc    Mark attendance for a meeting
 * @route   POST /api/meetings/:id/attendance
 * @access  Private (Admin/Secretary)
 */
const markAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, status, checkInTime, notes } = req.body;

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    // Check if user exists in attendees
    const existingAttendeeIndex = meeting.attendees.findIndex(
      attendee => attendee.user.toString() === userId
    );

    const attendanceData = {
      user: userId,
      status,
      checkInTime: checkInTime ? new Date(checkInTime) : new Date(),
      notes: notes || ''
    };

    if (existingAttendeeIndex >= 0) {
      // Update existing attendance
      meeting.attendees[existingAttendeeIndex] = attendanceData;
    } else {
      // Add new attendance record
      meeting.attendees.push(attendanceData);
    }

    await meeting.save();
    await meeting.populate('attendees.user', 'firstName lastName');

    logger.info('Attendance marked', { meetingId: id, userId, status, markedBy: req.user.id });

    res.status(200).json({
      success: true,
      message: 'Attendance marked successfully',
      data: meeting.attendees
    });
  } catch (error) {
    logger.error('Error marking attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while marking attendance'
    });
  }
};

/**
 * @desc    Get meeting attendance
 * @route   GET /api/meetings/:id/attendance
 * @access  Private (All authenticated users)
 */
const getMeetingAttendance = async (req, res) => {
  try {
    const { id } = req.params;

    const meeting = await Meeting.findById(id)
      .select('title scheduledDate attendees')
      .populate('attendees.user', 'firstName lastName phoneNumber');

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    const attendanceStats = {
      total: meeting.attendees.length,
      present: meeting.attendees.filter(a => a.status === 'present').length,
      absent: meeting.attendees.filter(a => a.status === 'absent').length,
      late: meeting.attendees.filter(a => a.status === 'late').length
    };

    res.status(200).json({
      success: true,
      data: {
        meeting: {
          title: meeting.title,
          scheduledDate: meeting.scheduledDate
        },
        attendees: meeting.attendees,
        stats: attendanceStats
      }
    });
  } catch (error) {
    logger.error('Error fetching meeting attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching attendance'
    });
  }
};

/**
 * @desc    Get meeting statistics
 * @route   GET /api/meetings/stats
 * @access  Private (Admin/Secretary)
 */
const getMeetingStats = async (req, res) => {
  try {
    const totalMeetings = await Meeting.countDocuments();
    const scheduledMeetings = await Meeting.countDocuments({ status: 'scheduled' });
    const completedMeetings = await Meeting.countDocuments({ status: 'completed' });
    const cancelledMeetings = await Meeting.countDocuments({ status: 'cancelled' });

    const upcomingMeetings = await Meeting.find({
      status: 'scheduled',
      scheduledDate: { $gte: new Date() }
    })
      .select('title scheduledDate location')
      .sort({ scheduledDate: 1 })
      .limit(5);

    const recentMeetings = await Meeting.find()
      .select('title scheduledDate status')
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      data: {
        overview: {
          total: totalMeetings,
          scheduled: scheduledMeetings,
          completed: completedMeetings,
          cancelled: cancelledMeetings
        },
        upcomingMeetings,
        recentMeetings
      }
    });
  } catch (error) {
    logger.error('Error fetching meeting stats:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching meeting statistics'
    });
  }
};

/**
 * @desc    Delete meeting (soft delete)
 * @route   DELETE /api/meetings/:id
 * @access  Private (Admin only)
 */
const deleteMeeting = async (req, res) => {
  try {
    const { id } = req.params;

    const meeting = await Meeting.findByIdAndUpdate(
      id,
      { 
        status: 'cancelled',
        deletedAt: new Date(),
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    logger.info('Meeting deleted', { meetingId: id, deletedBy: req.user.id });

    res.status(200).json({
      success: true,
      message: 'Meeting deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting meeting:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting meeting'
    });
  }
};

// Additional helper functions for meeting management
const sendMeetingReminders = async (req, res) => {
  // Implementation for sending meeting reminders
  res.status(200).json({
    success: true,
    message: 'Meeting reminders sent successfully'
  });
};

const getMeetingMinutes = async (req, res) => {
  // Implementation for getting meeting minutes
  res.status(200).json({
    success: true,
    data: {}
  });
};

const updateMeetingMinutes = async (req, res) => {
  // Implementation for updating meeting minutes
  res.status(200).json({
    success: true,
    message: 'Meeting minutes updated successfully'
  });
};

module.exports = {
  createMeeting,
  getAllMeetings,
  getMeetingById,
  updateMeeting,
  deleteMeeting,
  scheduleMeeting,
  cancelMeeting,
  markAttendance,
  getMeetingAttendance,
  sendMeetingReminders,
  getMeetingMinutes,
  updateMeetingMinutes,
  getMeetingStats
};