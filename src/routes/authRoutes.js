const express = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const {
  sendOTP,
  verifyOTP,
  biometricLogin,
  toggleFingerprint,
  logout,
  refreshToken
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // limit each IP to 3 OTP requests per minute
  message: {
    success: false,
    message: 'Too many OTP requests, please try again later.'
  }
});

// Validation rules
const phoneValidation = [
  body('phoneNumber')
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^\+?254[17][0-9]{8}$|^0[17][0-9]{8}$/)
    .withMessage('Please enter a valid Kenyan phone number (Safaricom or Airtel)')
];

const otpValidation = [
  body('otp')
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be 6 digits')
    .isNumeric()
    .withMessage('OTP must contain only numbers')
];

// Middleware to log auth attempts
const logAuthAttempt = (req, res, next) => {
  logger.auth('Authentication attempt', req.body.phoneNumber || 'unknown', {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    endpoint: req.originalUrl
  });
  next();
};

/**
 * @route   POST /api/auth/login
 * @desc    Send OTP for login
 * @access  Public
 */
router.post('/login', 
  otpLimiter,
  phoneValidation,
  logAuthAttempt,
  sendOTP
);

/**
 * @route   POST /api/auth/verify-otp
 * @desc    Verify OTP and complete login
 * @access  Public
 */
router.post('/verify-otp',
  authLimiter,
  [
    ...phoneValidation,
    ...otpValidation,
    body('deviceToken')
      .optional()
      .isString()
      .withMessage('Device token must be a string')
  ],
  logAuthAttempt,
  verifyOTP
);

/**
 * @route   POST /api/auth/biometric-login
 * @desc    Login with biometrics
 * @access  Public
 */
router.post('/biometric-login',
  authLimiter,
  [
    ...phoneValidation,
    body('deviceToken')
      .optional()
      .isString()
      .withMessage('Device token must be a string')
  ],
  logAuthAttempt,
  biometricLogin
);

/**
 * @route   POST /api/auth/toggle-fingerprint
 * @desc    Enable/disable fingerprint authentication
 * @access  Private
 */
router.post('/toggle-fingerprint',
  protect,
  [
    body('enabled')
      .isBoolean()
      .withMessage('Enabled field must be a boolean')
  ],
  toggleFingerprint
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout', protect, logout);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh JWT token
 * @access  Private
 */
router.post('/refresh', protect, refreshToken);

/**
 * @route   GET /api/auth/status
 * @desc    Check authentication status
 * @access  Private
 */
router.get('/status', protect, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'User is authenticated',
    data: {
      id: req.user._id,
      phoneNumber: req.user.phoneNumber,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      fullName: req.user.fullName,
      role: req.user.role,
      isActive: req.user.isActive,
      fingerprintEnabled: req.user.fingerprintEnabled,
      isProxyManaged: req.user.isProxyManaged,
      lastLoginAt: req.user.lastLoginAt
    }
  });
});

module.exports = router;