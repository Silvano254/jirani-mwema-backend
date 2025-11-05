const User = require('../models/User');
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

    // In a real implementation, this would query actual transaction data
    // For now, we'll return mock data with proper structure
    const reportData = {
      summary: {
        totalIncome: 850000.00,
        totalExpenses: 325000.00,
        netIncome: 525000.00,
        memberContributions: 600000.00,
        loanInterest: 125000.00,
        fines: 25000.00,
        operationalExpenses: 150000.00,
        loanDisbursements: 175000.00
      },
      categoryBreakdown: {
        income: {
          'Member Contributions': 600000.00,
          'Loan Interest': 125000.00,
          'Registration Fees': 75000.00,
          'Fines & Penalties': 25000.00,
          'Investment Returns': 25000.00
        },
        expenses: {
          'Loan Disbursements': 175000.00,
          'Administrative Costs': 75000.00,
          'Meeting Expenses': 25000.00,
          'Bank Charges': 15000.00,
          'Communication': 10000.00,
          'Miscellaneous': 25000.00
        }
      },
      memberContributions: [
        {
          memberName: 'John Doe',
          amount: 15000.00,
          status: 'paid',
          date: '2024-11-01T00:00:00.000Z'
        },
        {
          memberName: 'Jane Smith',
          amount: 15000.00,
          status: 'paid',
          date: '2024-11-01T00:00:00.000Z'
        },
        {
          memberName: 'Mike Johnson',
          amount: 15000.00,
          status: 'pending',
          date: '2024-11-01T00:00:00.000Z'
        },
        {
          memberName: 'Sarah Wilson',
          amount: 15000.00,
          status: 'paid',
          date: '2024-11-01T00:00:00.000Z'
        },
        {
          memberName: 'David Brown',
          amount: 15000.00,
          status: 'paid',
          date: '2024-11-01T00:00:00.000Z'
        }
      ],
      loanPortfolio: {
        totalLoansIssued: 25,
        totalLoanAmount: 1250000.00,
        outstandingAmount: 450000.00,
        interestEarned: 125000.00,
        activeLoans: 18,
        completedLoans: 5,
        defaultedLoans: 2
      },
      monthlyTrends: [
        {
          month: 'Aug 2024',
          income: 720000.00,
          expenses: 280000.00
        },
        {
          month: 'Sep 2024',
          income: 780000.00,
          expenses: 310000.00
        },
        {
          month: 'Oct 2024',
          income: 820000.00,
          expenses: 295000.00
        },
        {
          month: 'Nov 2024',
          income: 850000.00,
          expenses: 325000.00
        }
      ]
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

    // Mock member activity data
    const activityData = {
      totalMembers: 45,
      activeMembers: 38,
      newMembers: 3,
      memberDetails: [
        {
          name: 'John Doe',
          contributions: 45000.00,
          loans: 2,
          attendance: 85,
          lastActivity: '2024-11-04T10:30:00.000Z'
        },
        {
          name: 'Jane Smith',
          contributions: 50000.00,
          loans: 1,
          attendance: 92,
          lastActivity: '2024-11-03T14:20:00.000Z'
        }
      ]
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
    const portfolioData = {
      summary: {
        totalLoans: 25,
        totalAmount: 1250000.00,
        outstandingAmount: 450000.00,
        repaidAmount: 800000.00,
        defaultedAmount: 75000.00
      },
      loansByStatus: {
        active: 18,
        completed: 5,
        defaulted: 2
      },
      loanDetails: [
        {
          loanId: 'LN001',
          memberName: 'John Doe',
          amount: 50000.00,
          outstanding: 25000.00,
          interestRate: 5.0,
          status: 'active',
          disbursedDate: '2024-08-15T00:00:00.000Z',
          dueDate: '2025-02-15T00:00:00.000Z'
        },
        {
          loanId: 'LN002',
          memberName: 'Jane Smith',
          amount: 75000.00,
          outstanding: 0.00,
          interestRate: 5.0,
          status: 'completed',
          disbursedDate: '2024-06-01T00:00:00.000Z',
          dueDate: '2024-12-01T00:00:00.000Z'
        }
      ]
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