const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '../../logs');
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    let logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    if (data) {
      if (data instanceof Error) {
        logMessage += `\n${data.stack}`;
      } else if (typeof data === 'object') {
        try {
          logMessage += `\n${JSON.stringify(data, null, 2)}`;
        } catch (err) {
          logMessage += `\n[Object could not be serialized: ${err.message}]`;
        }
      } else {
        logMessage += `\n${data}`;
      }
    }
    
    return logMessage;
  }

  writeToFile(level, message) {
    const fileName = `${new Date().toISOString().split('T')[0]}.log`;
    const filePath = path.join(this.logDir, fileName);
    
    try {
      fs.appendFileSync(filePath, message + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  log(level, message, data = null) {
    const formattedMessage = this.formatMessage(level, message, data);
    
    // Write to console
    if (level === 'error') {
      console.error(formattedMessage);
    } else if (level === 'warn') {
      console.warn(formattedMessage);
    } else {
      console.log(formattedMessage);
    }

    // Write to file in production
    if (process.env.NODE_ENV === 'production') {
      this.writeToFile(level, formattedMessage);
    }
  }

  info(message, data = null) {
    this.log('info', message, data);
  }

  warn(message, data = null) {
    this.log('warn', message, data);
  }

  error(message, data = null) {
    this.log('error', message, data);
  }

  debug(message, data = null) {
    if (process.env.NODE_ENV === 'development') {
      this.log('debug', message, data);
    }
  }

  // Log HTTP requests
  request(req, res) {
    const message = `${req.method} ${req.originalUrl}`;
    const data = {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      body: req.method !== 'GET' ? this.sanitizeBody(req.body) : undefined
    };
    
    this.info(message, data);
  }

  // Log HTTP responses
  response(req, res, responseTime) {
    const message = `${req.method} ${req.originalUrl} - ${res.statusCode}`;
    const data = {
      responseTime: `${responseTime}ms`,
      contentLength: res.get('Content-Length') || 0
    };
    
    if (res.statusCode >= 400) {
      this.warn(message, data);
    } else {
      this.info(message, data);
    }
  }

  // Sanitize request body (remove sensitive data)
  sanitizeBody(body) {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sanitized = { ...body };
    const sensitiveFields = ['password', 'otp', 'token', 'apiKey', 'secret'];
    
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  // Log authentication events
  auth(event, userId, details = null) {
    const message = `AUTH: ${event} - User: ${userId}`;
    this.info(message, details);
  }

  // Log business events
  business(event, userId, details = null) {
    const message = `BUSINESS: ${event} - User: ${userId}`;
    this.info(message, details);
  }

  // Log security events
  security(event, details = null) {
    const message = `SECURITY: ${event}`;
    this.warn(message, details);
  }

  // Log database operations
  database(operation, collection, details = null) {
    const message = `DB: ${operation} on ${collection}`;
    this.debug(message, details);
  }

  // Log external API calls
  externalApi(service, operation, details = null) {
    const message = `EXTERNAL: ${service} - ${operation}`;
    this.info(message, details);
  }

  // Performance logging
  performance(operation, duration, details = null) {
    const message = `PERF: ${operation} took ${duration}ms`;
    
    if (duration > 1000) {
      this.warn(message, details);
    } else {
      this.debug(message, details);
    }
  }

  // Clean old log files (keep last 30 days)
  cleanOldLogs() {
    try {
      const files = fs.readdirSync(this.logDir);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      files.forEach(file => {
        if (file.endsWith('.log')) {
          const filePath = path.join(this.logDir, file);
          const stats = fs.statSync(filePath);
          
          if (stats.mtime < thirtyDaysAgo) {
            fs.unlinkSync(filePath);
            this.info(`Deleted old log file: ${file}`);
          }
        }
      });
    } catch (error) {
      this.error('Failed to clean old logs:', error);
    }
  }
}

// Create singleton instance
const logger = new Logger();

// Clean old logs on startup
if (process.env.NODE_ENV === 'production') {
  logger.cleanOldLogs();
}

module.exports = logger;