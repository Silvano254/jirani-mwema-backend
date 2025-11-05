/**
 * Standardized response helper to ensure consistent API responses
 * across all controllers and prevent UI formatting issues
 */

/**
 * Create a standardized success response
 * @param {Object} res - Express response object
 * @param {Object} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code (default: 200)
 * @param {Object} meta - Additional metadata
 */
const sendSuccess = (res, data = null, message = 'Success', statusCode = 200, meta = {}) => {
  const response = {
    success: true,
    message: message,
    timestamp: new Date().toISOString(),
    ...meta
  };

  // Only include data if it exists and is not null/undefined
  if (data !== null && data !== undefined) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
};

/**
 * Create a standardized error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {Array} errors - Validation errors array
 * @param {Object} meta - Additional metadata
 */
const sendError = (res, message = 'Internal server error', statusCode = 500, errors = null, meta = {}) => {
  const response = {
    success: false,
    message: message,
    timestamp: new Date().toISOString(),
    ...meta
  };

  // Only include errors if they exist
  if (errors && Array.isArray(errors) && errors.length > 0) {
    response.errors = errors;
  }

  return res.status(statusCode).json(response);
};

/**
 * Create a paginated response
 * @param {Object} res - Express response object
 * @param {Array} data - Array of data items
 * @param {Object} pagination - Pagination info
 * @param {string} message - Success message
 * @param {Object} meta - Additional metadata
 */
const sendPaginated = (res, data, pagination, message = 'Data retrieved successfully', meta = {}) => {
  return sendSuccess(res, {
    items: data,
    pagination: {
      currentPage: parseInt(pagination.currentPage) || 1,
      totalPages: parseInt(pagination.totalPages) || 1,
      totalItems: parseInt(pagination.totalItems) || data.length,
      itemsPerPage: parseInt(pagination.itemsPerPage) || data.length,
      hasNext: pagination.hasNext || false,
      hasPrev: pagination.hasPrev || false
    }
  }, message, 200, meta);
};

/**
 * Create a validation error response
 * @param {Object} res - Express response object
 * @param {Array} validationErrors - Array of validation errors
 * @param {string} message - Error message
 */
const sendValidationError = (res, validationErrors, message = 'Validation failed') => {
  const formattedErrors = validationErrors.map(error => ({
    field: error.path || error.param,
    message: error.msg || error.message,
    value: error.value
  }));

  return sendError(res, message, 400, formattedErrors, {
    type: 'validation_error'
  });
};

/**
 * Create a not found response
 * @param {Object} res - Express response object
 * @param {string} resource - Resource name
 * @param {string} identifier - Resource identifier
 */
const sendNotFound = (res, resource = 'Resource', identifier = null) => {
  const message = identifier ? 
    `${resource} with identifier '${identifier}' not found` : 
    `${resource} not found`;
  
  return sendError(res, message, 404, null, {
    type: 'not_found_error',
    resource: resource,
    identifier: identifier
  });
};

/**
 * Create an unauthorized response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
const sendUnauthorized = (res, message = 'Access denied. Authentication required.') => {
  return sendError(res, message, 401, null, {
    type: 'authentication_error'
  });
};

/**
 * Create a forbidden response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
const sendForbidden = (res, message = 'Access denied. Insufficient privileges.') => {
  return sendError(res, message, 403, null, {
    type: 'authorization_error'
  });
};

/**
 * Format numbers for consistent display
 * @param {number} value - Number to format
 * @param {string} type - Format type ('currency', 'percentage', 'decimal')
 * @param {number} decimals - Number of decimal places
 */
const formatNumber = (value, type = 'decimal', decimals = 2) => {
  if (value === null || value === undefined || isNaN(value)) {
    return type === 'currency' ? '0.00' : '0';
  }

  const num = parseFloat(value);
  
  switch (type) {
    case 'currency':
      return num.toLocaleString('en-KE', {
        style: 'currency',
        currency: 'KES',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
    case 'percentage':
      return `${num.toFixed(decimals)}%`;
    case 'decimal':
    default:
      return num.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
  }
};

/**
 * Format dates for consistent display
 * @param {Date|string} date - Date to format
 * @param {string} format - Format type ('iso', 'readable', 'short')
 */
const formatDate = (date, format = 'iso') => {
  if (!date) return null;
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) return null;
  
  switch (format) {
    case 'readable':
      return dateObj.toLocaleString('en-KE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    case 'short':
      return dateObj.toLocaleDateString('en-KE');
    case 'iso':
    default:
      return dateObj.toISOString();
  }
};

/**
 * Sanitize object for response (remove sensitive fields)
 * @param {Object} obj - Object to sanitize
 * @param {Array} fieldsToRemove - Fields to remove from response
 */
const sanitizeResponse = (obj, fieldsToRemove = ['password', 'otp', 'otpExpires', 'deviceToken']) => {
  if (!obj || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeResponse(item, fieldsToRemove));
  }
  
  const sanitized = { ...obj };
  
  fieldsToRemove.forEach(field => {
    delete sanitized[field];
  });
  
  return sanitized;
};

/**
 * Create a standardized chart data format for admin dashboards
 * @param {Array} data - Raw data array
 * @param {string} labelField - Field to use as label
 * @param {string} valueField - Field to use as value
 * @param {Object} options - Formatting options
 */
const formatChartData = (data, labelField, valueField, options = {}) => {
  if (!Array.isArray(data)) return [];
  
  return data.map(item => ({
    label: item[labelField],
    value: formatNumber(item[valueField], options.numberType, options.decimals),
    rawValue: item[valueField],
    color: options.color || null,
    ...options.extraFields && Object.keys(options.extraFields).reduce((acc, key) => {
      acc[key] = item[options.extraFields[key]];
      return acc;
    }, {})
  }));
};

module.exports = {
  sendSuccess,
  sendError,
  sendPaginated,
  sendValidationError,
  sendNotFound,
  sendUnauthorized,
  sendForbidden,
  formatNumber,
  formatDate,
  sanitizeResponse,
  formatChartData
};