const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Meeting = require('../models/Meeting');
const logger = require('../utils/logger');

// Get financial reports data
const getFinancialReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Validate date parameters
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use ISO 8601 format.'
      });
    }

    // Query actual transaction data
    const dateQuery = {
      createdAt: {
        $gte: start,
        $lte: end
      }
    };

    // Calculate income (contributions, loan interest, fines, fees)
    const incomeTransactions = await Transaction.aggregate([
      {
        $match: {
          ...dateQuery,
          type: { $in: ['contribution', 'loan_interest', 'fine', 'registration_fee', 'dividend'] },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: '$type',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Calculate expenses (loans disbursed, operational expenses)
    const expenseTransactions = await Transaction.aggregate([
      {
        $match: {
          ...dateQuery,
          type: { $in: ['loan', 'expense', 'transfer'] },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: '$type',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Calculate totals
    const totalIncome = incomeTransactions.reduce((sum, item) => sum + item.totalAmount, 0);
    const totalExpenses = expenseTransactions.reduce((sum, item) => sum + item.totalAmount, 0);

    // Get member contributions breakdown
    const memberContributions = await Transaction.find({
      ...dateQuery,
      type: 'contribution',
      status: 'completed'
    })
    .populate('memberId', 'firstName lastName')
    .sort({ createdAt: -1 })
    .limit(10);

    // Get monthly trends (last 4 months)
    const fourMonthsAgo = new Date();
    fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 3);
    
    const monthlyTrends = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: fourMonthsAgo },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            type: '$type'
          },
          totalAmount: { $sum: '$amount' }
        }
      },
      {
        $group: {
          _id: {
            year: '$_id.year',
            month: '$_id.month'
          },
          income: {
            $sum: {
              $cond: [
                { $in: ['$_id.type', ['contribution', 'loan_interest', 'fine', 'registration_fee']] },
                '$totalAmount',
                0
              ]
            }
          },
          expenses: {
            $sum: {
              $cond: [
                { $in: ['$_id.type', ['loan', 'expense']] },
                '$totalAmount',
                0
              ]
            }
          }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    // Get loan portfolio data
    const loanStats = await Transaction.aggregate([
      {
        $match: {
          type: 'loan',
          status: { $in: ['completed', 'approved', 'active'] }
        }
      },
      {
        $group: {
          _id: null,
          totalLoansIssued: { $sum: 1 },
          totalLoanAmount: { $sum: '$amount' },
          averageLoanAmount: { $avg: '$amount' }
        }
      }
    ]);

    // Format income breakdown
    const incomeBreakdown = {};
    incomeTransactions.forEach(item => {
      const labels = {
        'contribution': 'Member Contributions',
        'loan_interest': 'Loan Interest',
        'fine': 'Fines & Penalties',
        'registration_fee': 'Registration Fees',
        'dividend': 'Investment Returns'
      };
      incomeBreakdown[labels[item._id] || item._id] = item.totalAmount;
    });

    // Format expense breakdown
    const expenseBreakdown = {};
    expenseTransactions.forEach(item => {
      const labels = {
        'loan': 'Loan Disbursements',
        'expense': 'Operational Expenses',
        'transfer': 'Transfers'
      };
      expenseBreakdown[labels[item._id] || item._id] = item.totalAmount;
    });

    const reportData = {
      summary: {
        totalIncome: totalIncome,
        totalExpenses: totalExpenses,
        netIncome: totalIncome - totalExpenses,
        memberContributions: incomeBreakdown['Member Contributions'] || 0,
        loanInterest: incomeBreakdown['Loan Interest'] || 0,
        fines: incomeBreakdown['Fines & Penalties'] || 0,
        operationalExpenses: expenseBreakdown['Operational Expenses'] || 0,
        loanDisbursements: expenseBreakdown['Loan Disbursements'] || 0
      },
      categoryBreakdown: {
        income: incomeBreakdown,
        expenses: expenseBreakdown
      },
      memberContributions: memberContributions.map(transaction => ({
        memberName: transaction.memberId ? 
          `${transaction.memberId.firstName} ${transaction.memberId.lastName}` : 
          'Unknown Member',
        amount: transaction.amount,
        status: transaction.status,
        date: transaction.createdAt.toISOString()
      })),
      loanPortfolio: {
        totalLoansIssued: loanStats[0]?.totalLoansIssued || 0,
        totalLoanAmount: loanStats[0]?.totalLoanAmount || 0,
        averageLoanAmount: loanStats[0]?.averageLoanAmount || 0,
        outstandingAmount: 0, // Would need additional calculation for outstanding loans
        interestEarned: incomeBreakdown['Loan Interest'] || 0
      },
      monthlyTrends: monthlyTrends.map(trend => ({
        month: new Date(trend._id.year, trend._id.month - 1).toLocaleString('default', { 
          month: 'short', 
          year: 'numeric' 
        }),
        income: trend.income,
        expenses: trend.expenses
      })),
      dateRange: {
        startDate: start.toISOString(),
        endDate: end.toISOString()
      }
    };

    logger.info(`Financial report generated for period: ${startDate} to ${endDate}`);

    res.status(200).json({
      success: true,
      message: 'Financial report generated successfully',
      data: reportData
    });

  } catch (error) {
    logger.error('Error generating financial report:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while generating report'
    });
  }
};

// Get member activity report
const getMemberActivityReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Calculate date range (default to last 30 days if not provided)
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get total member counts
    const totalMembers = await User.countDocuments({ role: 'member' });
    const activeMembers = await User.countDocuments({ 
      role: 'member', 
      isActive: true 
    });

    // Get new members in the period
    const newMembers = await User.countDocuments({
      role: 'member',
      createdAt: { $gte: start, $lte: end }
    });

    // Get member activity details with contributions and loans
    const memberDetails = await User.aggregate([
      {
        $match: { 
          role: 'member',
          isActive: true
        }
      },
      {
        $lookup: {
          from: 'transactions',
          localField: '_id',
          foreignField: 'memberId',
          as: 'transactions'
        }
      },
      {
        $lookup: {
          from: 'meetings',
          let: { userId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ['$$userId', '$attendees']
                },
                date: { $gte: start, $lte: end }
              }
            }
          ],
          as: 'meetingsAttended'
        }
      },
      {
        $project: {
          name: { $concat: ['$firstName', ' ', '$lastName'] },
          contributions: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: '$transactions',
                    cond: { 
                      $and: [
                        { $eq: ['$$this.type', 'contribution'] },
                        { $eq: ['$$this.status', 'completed'] },
                        { $gte: ['$$this.createdAt', start] },
                        { $lte: ['$$this.createdAt', end] }
                      ]
                    }
                  }
                },
                as: 'transaction',
                in: '$$transaction.amount'
              }
            }
          },
          loans: {
            $size: {
              $filter: {
                input: '$transactions',
                cond: { 
                  $and: [
                    { $eq: ['$$this.type', 'loan'] },
                    { $in: ['$$this.status', ['approved', 'active', 'completed']] }
                  ]
                }
              }
            }
          },
          meetingsAttended: { $size: '$meetingsAttended' },
          lastActivity: { $max: '$transactions.createdAt' },
          totalTransactions: { $size: '$transactions' },
          balance: '$balance'
        }
      },
      {
        $lookup: {
          from: 'meetings',
          pipeline: [
            {
              $match: {
                date: { $gte: start, $lte: end }
              }
            }
          ],
          as: 'totalMeetings'
        }
      },
      {
        $addFields: {
          attendance: {
            $cond: [
              { $gt: [{ $size: '$totalMeetings' }, 0] },
              { 
                $multiply: [
                  { $divide: ['$meetingsAttended', { $size: '$totalMeetings' }] },
                  100
                ]
              },
              0
            ]
          }
        }
      },
      {
        $sort: { contributions: -1 }
      },
      {
        $limit: 20
      }
    ]);

    // Get contribution summary
    const contributionSummary = await Transaction.aggregate([
      {
        $match: {
          type: 'contribution',
          status: 'completed',
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: null,
          totalContributions: { $sum: '$amount' },
          averageContribution: { $avg: '$amount' },
          contributionCount: { $sum: 1 }
        }
      }
    ]);

    // Get loan activity summary
    const loanSummary = await Transaction.aggregate([
      {
        $match: {
          type: 'loan',
          status: { $in: ['approved', 'active', 'completed'] },
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: null,
          totalLoans: { $sum: '$amount' },
          averageLoan: { $avg: '$amount' },
          loanCount: { $sum: 1 }
        }
      }
    ]);

    // Get meeting attendance summary
    const meetingAttendance = await Meeting.aggregate([
      {
        $match: {
          date: { $gte: start, $lte: end }
        }
      },
      {
        $project: {
          attendeeCount: { $size: '$attendees' },
          date: 1,
          title: 1
        }
      },
      {
        $group: {
          _id: null,
          totalMeetings: { $sum: 1 },
          averageAttendance: { $avg: '$attendeeCount' },
          maxAttendance: { $max: '$attendeeCount' },
          minAttendance: { $min: '$attendeeCount' }
        }
      }
    ]);

    const activityData = {
      summary: {
        totalMembers,
        activeMembers,
        inactiveMembers: totalMembers - activeMembers,
        newMembers,
        totalContributions: contributionSummary[0]?.totalContributions || 0,
        averageContribution: contributionSummary[0]?.averageContribution || 0,
        totalLoansIssued: loanSummary[0]?.loanCount || 0,
        totalLoanAmount: loanSummary[0]?.totalLoans || 0,
        totalMeetings: meetingAttendance[0]?.totalMeetings || 0,
        averageMeetingAttendance: Math.round(meetingAttendance[0]?.averageAttendance || 0)
      },
      memberDetails: memberDetails.map(member => ({
        name: member.name,
        contributions: member.contributions || 0,
        loans: member.loans || 0,
        attendance: Math.round(member.attendance || 0),
        lastActivity: member.lastActivity || null,
        totalTransactions: member.totalTransactions || 0,
        balance: member.balance || 0,
        status: member.totalTransactions > 0 ? 'active' : 'inactive'
      })),
      dateRange: {
        startDate: start.toISOString(),
        endDate: end.toISOString()
      }
    };

    res.status(200).json({
      success: true,
      message: 'Member activity report generated successfully',
      data: activityData
    });

  } catch (error) {
    logger.error('Error generating member activity report:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while generating report'
    });
  }
};

// Get loan portfolio report
const getLoanPortfolioReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Calculate date range (default to all time if not provided)
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Get loan portfolio summary
    const loanSummary = await Transaction.aggregate([
      {
        $match: {
          type: 'loan',
          ...dateFilter
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          averageAmount: { $avg: '$amount' }
        }
      }
    ]);

    // Get overall loan statistics
    const overallStats = await Transaction.aggregate([
      {
        $match: {
          type: 'loan',
          ...dateFilter
        }
      },
      {
        $group: {
          _id: null,
          totalLoans: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          averageAmount: { $avg: '$amount' },
          maxAmount: { $max: '$amount' },
          minAmount: { $min: '$amount' }
        }
      }
    ]);

    // Calculate repaid amount from loan repayments
    const repaymentStats = await Transaction.aggregate([
      {
        $match: {
          type: 'loan_repayment',
          status: 'completed',
          ...dateFilter
        }
      },
      {
        $group: {
          _id: null,
          totalRepaid: { $sum: '$amount' },
          repaymentCount: { $sum: 1 }
        }
      }
    ]);

    // Get detailed loan information
    const loanDetails = await Transaction.find({
      type: 'loan',
      ...dateFilter
    })
    .populate('memberId', 'firstName lastName phoneNumber')
    .populate('adminId', 'firstName lastName')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

    // Calculate loan performance metrics
    const loansByStatus = {};
    let totalLoansIssued = 0;
    let totalLoanAmount = 0;

    loanSummary.forEach(item => {
      loansByStatus[item._id] = {
        count: item.count,
        totalAmount: item.totalAmount,
        averageAmount: item.averageAmount
      };
      totalLoansIssued += item.count;
      totalLoanAmount += item.totalAmount;
    });

    // Calculate outstanding amount (approximation)
    const totalRepaid = repaymentStats[0]?.totalRepaid || 0;
    const approvedLoansAmount = (loansByStatus.approved?.totalAmount || 0) + 
                              (loansByStatus.active?.totalAmount || 0);
    const outstandingAmount = Math.max(0, approvedLoansAmount - totalRepaid);

    // Get interest earned from loan interest transactions
    const interestEarned = await Transaction.aggregate([
      {
        $match: {
          type: 'loan_interest',
          status: 'completed',
          ...dateFilter
        }
      },
      {
        $group: {
          _id: null,
          totalInterest: { $sum: '$amount' }
        }
      }
    ]);

    // Get loan performance by month (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);

    const monthlyLoanTrends = await Transaction.aggregate([
      {
        $match: {
          type: 'loan',
          createdAt: { $gte: sixMonthsAgo },
          status: { $in: ['approved', 'active', 'completed'] }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          loanCount: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    const portfolioData = {
      summary: {
        totalLoans: totalLoansIssued,
        totalAmount: totalLoanAmount,
        outstandingAmount: outstandingAmount,
        repaidAmount: totalRepaid,
        defaultedAmount: loansByStatus.defaulted?.totalAmount || 0,
        interestEarned: interestEarned[0]?.totalInterest || 0,
        averageLoanSize: overallStats[0]?.averageAmount || 0,
        maxLoanSize: overallStats[0]?.maxAmount || 0,
        minLoanSize: overallStats[0]?.minAmount || 0
      },
      loansByStatus: {
        pending: loansByStatus.pending?.count || 0,
        approved: loansByStatus.approved?.count || 0,
        active: loansByStatus.active?.count || 0,
        completed: loansByStatus.completed?.count || 0,
        defaulted: loansByStatus.defaulted?.count || 0,
        rejected: loansByStatus.rejected?.count || 0
      },
      loanAmountsByStatus: {
        pending: loansByStatus.pending?.totalAmount || 0,
        approved: loansByStatus.approved?.totalAmount || 0,
        active: loansByStatus.active?.totalAmount || 0,
        completed: loansByStatus.completed?.totalAmount || 0,
        defaulted: loansByStatus.defaulted?.totalAmount || 0,
        rejected: loansByStatus.rejected?.totalAmount || 0
      },
      loanDetails: loanDetails.map(loan => ({
        loanId: loan._id,
        memberName: loan.memberId ? 
          `${loan.memberId.firstName} ${loan.memberId.lastName}` : 
          'Unknown Member',
        memberPhone: loan.memberId?.phoneNumber || 'N/A',
        amount: loan.amount,
        status: loan.status,
        disbursedDate: loan.createdAt,
        description: loan.description || '',
        approvedBy: loan.adminId ? 
          `${loan.adminId.firstName} ${loan.adminId.lastName}` : 
          'System',
        interestRate: loan.metadata?.interestRate || 'N/A',
        dueDate: loan.metadata?.dueDate || null
      })),
      monthlyTrends: monthlyLoanTrends.map(trend => ({
        month: new Date(trend._id.year, trend._id.month - 1).toLocaleString('default', { 
          month: 'short', 
          year: 'numeric' 
        }),
        loanCount: trend.loanCount,
        totalAmount: trend.totalAmount
      })),
      performanceMetrics: {
        approvalRate: totalLoansIssued > 0 ? 
          ((loansByStatus.approved?.count || 0) + (loansByStatus.active?.count || 0) + (loansByStatus.completed?.count || 0)) / totalLoansIssued * 100 : 0,
        defaultRate: totalLoansIssued > 0 ? 
          (loansByStatus.defaulted?.count || 0) / totalLoansIssued * 100 : 0,
        repaymentRate: totalLoanAmount > 0 ? 
          totalRepaid / totalLoanAmount * 100 : 0
      },
      dateRange: dateFilter.createdAt ? {
        startDate: dateFilter.createdAt.$gte.toISOString(),
        endDate: dateFilter.createdAt.$lte.toISOString()
      } : {
        startDate: 'All time',
        endDate: 'All time'
      }
    };

    res.status(200).json({
      success: true,
      message: 'Loan portfolio report generated successfully',
      data: portfolioData
    });

  } catch (error) {
    logger.error('Error generating loan portfolio report:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while generating report'
    });
  }
};

module.exports = {
  getFinancialReport,
  getMemberActivityReport,
  getLoanPortfolioReport
};