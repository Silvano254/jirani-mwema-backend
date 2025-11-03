const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

/**
 * Middleware to handle validation errors from express-validator
 * @param {Request} req 
 * @param {Response} res 
 * @param {NextFunction} next 
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    logger.warn('Validation errors:', {
      endpoint: req.originalUrl,
      method: req.method,
      errors: errors.array(),
      userId: req.user?.id,
      ip: req.ip
    });

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(error => ({
        field: error.param,
        message: error.msg,
        value: error.value,
        location: error.location
      }))
    });
  }
  
  next();
};

/**
 * Middleware to sanitize request data
 * @param {Request} req 
 * @param {Response} res 
 * @param {NextFunction} next 
 */
const sanitize = (req, res, next) => {
  // Remove any potentially dangerous fields
  const dangerousFields = ['__proto__', 'constructor', 'prototype'];
  
  const sanitizeObject = (obj) => {
    if (obj && typeof obj === 'object') {
      dangerousFields.forEach(field => {
        delete obj[field];
      });
      
      Object.keys(obj).forEach(key => {
        if (typeof obj[key] === 'object') {
          sanitizeObject(obj[key]);
        }
      });
    }
  };

  if (req.body) {
    sanitizeObject(req.body);
  }
  
  if (req.query) {
    sanitizeObject(req.query);
  }
  
  if (req.params) {
    sanitizeObject(req.params);
  }

  next();
};

/**
 * Middleware to validate pagination parameters
 * @param {Request} req 
 * @param {Response} res 
 * @param {NextFunction} next 
 */
const validatePagination = (req, res, next) => {
  const { page = 1, limit = 10 } = req.query;
  
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  
  if (isNaN(pageNum) || pageNum < 1) {
    return res.status(400).json({
      success: false,
      message: 'Page must be a positive integer'
    });
  }
  
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    return res.status(400).json({
      success: false,
      message: 'Limit must be between 1 and 100'
    });
  }
  
  req.pagination = {
    page: pageNum,
    limit: limitNum,
    skip: (pageNum - 1) * limitNum
  };
  
  next();
};

/**
 * Middleware to validate date range parameters
 * @param {Request} req 
 * @param {Response} res 
 * @param {NextFunction} next 
 */
const validateDateRange = (req, res, next) => {
  const { fromDate, toDate } = req.query;
  
  if (fromDate && !Date.parse(fromDate)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid fromDate format'
    });
  }
  
  if (toDate && !Date.parse(toDate)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid toDate format'
    });
  }
  
  if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
    return res.status(400).json({
      success: false,
      message: 'fromDate cannot be later than toDate'
    });
  }
  
  next();
};

/**
 * Middleware to validate MongoDB ObjectId parameters
 * @param {string} paramName - Name of the parameter to validate
 */
const validateObjectId = (paramName) => {
  return (req, res, next) => {
    const id = req.params[paramName];
    
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${paramName} format`
      });
    }
    
    next();
  };
};

/**
 * Middleware to validate phone number format (Kenyan)
 * @param {Request} req 
 * @param {Response} res 
 * @param {NextFunction} next 
 */
const validatePhoneNumber = (req, res, next) => {
  const { phoneNumber } = req.body;
  
  if (phoneNumber) {
    const kenyanPhoneRegex = /^\+?254[7][0-9]{8}$|^0[7][0-9]{8}$/;
    
    if (!kenyanPhoneRegex.test(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid Kenyan phone number'
      });
    }
  }
  
  next();
};

/**
 * Middleware to validate file uploads
 * @param {Object} options - Validation options
 */
const validateFileUpload = (options = {}) => {
  const {
    maxSize = 5 * 1024 * 1024, // 5MB default
    allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'],
    required = false
  } = options;

  return (req, res, next) => {
    if (!req.file && required) {
      return res.status(400).json({
        success: false,
        message: 'File upload is required'
      });
    }
    
    if (req.file) {
      // Check file size
      if (req.file.size > maxSize) {
        return res.status(400).json({
          success: false,
          message: `File size exceeds ${maxSize / (1024 * 1024)}MB limit`
        });
      }
      
      // Check file type
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`
        });
      }
    }
    
    next();
  };
};

/**
 * Middleware to validate amount fields
 * @param {string} fieldName - Name of the amount field to validate
 */
const validateAmount = (fieldName = 'amount') => {
  return (req, res, next) => {
    const amount = req.body[fieldName];
    
    if (amount !== undefined) {
      const numAmount = parseFloat(amount);
      
      if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: `${fieldName} must be a positive number`
        });
      }
      
      if (numAmount > 10000000) { // 10M limit
        return res.status(400).json({
          success: false,
          message: `${fieldName} exceeds maximum allowed amount`
        });
      }
      
      // Round to 2 decimal places
      req.body[fieldName] = Math.round(numAmount * 100) / 100;
    }
    
    next();
  };
};

/**
 * Middleware to validate enum values
 * @param {string} fieldName - Name of the field to validate
 * @param {Array} allowedValues - Array of allowed values
 */
const validateEnum = (fieldName, allowedValues) => {
  return (req, res, next) => {
    const value = req.body[fieldName] || req.query[fieldName];
    
    if (value && !allowedValues.includes(value)) {
      return res.status(400).json({
        success: false,
        message: `${fieldName} must be one of: ${allowedValues.join(', ')}`
      });
    }
    
    next();
  };
};

/**
 * Middleware to log validation attempts
 * @param {Request} req 
 * @param {Response} res 
 * @param {NextFunction} next 
 */
const logValidation = (req, res, next) => {
  logger.debug('Validation check', {
    endpoint: req.originalUrl,
    method: req.method,
    hasBody: !!req.body && Object.keys(req.body).length > 0,
    hasQuery: !!req.query && Object.keys(req.query).length > 0,
    userId: req.user?.id
  });
  
  next();
};

module.exports = {
  validate,
  sanitize,
  validatePagination,
  validateDateRange,
  validateObjectId,
  validatePhoneNumber,
  validateFileUpload,
  validateAmount,
  validateEnum,
  logValidation
};