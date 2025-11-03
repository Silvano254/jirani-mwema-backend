const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

// Protect routes - require authentication
const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from token
      const user = await User.findById(decoded.userId).select('-otpCode -otpExpires');
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Token is not valid - user not found'
        });
      }

      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Account is deactivated'
        });
      }

      if (user.isLocked) {
        return res.status(423).json({
          success: false,
          message: 'Account is temporarily locked'
        });
      }

      req.user = user;
      next();

    } catch (error) {
      logger.error('Token verification error:', error);
      return res.status(401).json({
        success: false,
        message: 'Token is not valid'
      });
    }

  } catch (error) {
    logger.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Authorize specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Please login.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}`
      });
    }

    next();
  };
};

// Admin only access (chairperson, secretary, treasurer)
const adminOnly = (req, res, next) => {
  const adminRoles = ['chairperson', 'secretary', 'treasurer'];
  
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Please login.'
    });
  }

  if (!adminRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin access required.'
    });
  }

  next();
};

// Chairperson only access
const chairpersonOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Please login.'
    });
  }

  if (req.user.role !== 'chairperson') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Chairperson access required.'
    });
  }

  next();
};

// Check if user can access own resources or is admin
const ownerOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Please login.'
    });
  }

  const userId = req.params.userId || req.params.id;
  const isOwner = userId && userId === req.user._id.toString();
  const isAdmin = ['chairperson', 'secretary', 'treasurer'].includes(req.user.role);

  if (!isOwner && !isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You can only access your own resources.'
    });
  }

  next();
};

// Rate limiting middleware for sensitive operations
const sensitiveOperation = (req, res, next) => {
  // Add additional checks for sensitive operations
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Please login.'
    });
  }

  // Check if account is verified (has made at least one successful login)
  if (!req.user.lastLoginAt) {
    return res.status(403).json({
      success: false,
      message: 'Please complete account verification first.'
    });
  }

  next();
};

// Optional auth - user info if token is provided, but doesn't require auth
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-otpCode -otpExpires');
        
        if (user && user.isActive && !user.isLocked) {
          req.user = user;
        }
      } catch (error) {
        // Invalid token, but don't fail - just continue without user
        logger.warn('Optional auth - invalid token:', error.message);
      }
    }

    next();
  } catch (error) {
    logger.error('Optional auth middleware error:', error);
    next(); // Continue without user
  }
};

module.exports = {
  protect,
  authorize,
  adminOnly,
  chairpersonOnly,
  ownerOrAdmin,
  sensitiveOperation,
  optionalAuth
};