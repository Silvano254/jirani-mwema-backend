const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Validate required environment variables
const requiredEnvVars = [
  'NODE_ENV',
  'PORT',
  'MONGODB_URI',
  'JWT_SECRET',
  'JWT_EXPIRE',
  'AFRICASTALKING_USERNAME',
  'AFRICASTALKING_API_KEY'
];

const validateEnv = () => {
  const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missingVars.length > 0) {
    console.error('Missing required environment variables:', missingVars);
    process.exit(1);
  }
};

// Environment configuration object
const config = {
  // Application settings
  node_env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT) || 5000,
  
  // Database configuration
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/jirani-mwema',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  },
  
  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
    expire: process.env.JWT_EXPIRE || '7d',
    refreshExpire: process.env.JWT_REFRESH_EXPIRE || '30d'
  },
  
  // SMS service configuration (Africa's Talking)
  sms: {
    username: process.env.AFRICASTALKING_USERNAME || 'sandbox',
    apiKey: process.env.AFRICASTALKING_API_KEY || 'your-api-key',
    shortCode: process.env.SMS_SHORT_CODE || '22100',
    senderId: process.env.SMS_SENDER_ID || 'JiraniMwema'
  },
  
  // OTP configuration
  otp: {
    length: 6,
    expireMinutes: parseInt(process.env.OTP_EXPIRE_MINUTES) || 10,
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS) || 3,
    resendDelayMinutes: parseInt(process.env.OTP_RESEND_DELAY) || 1
  },
  
  // Security settings
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
    lockoutDurationMinutes: parseInt(process.env.LOCKOUT_DURATION) || 30,
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 3600 // 1 hour
  },
  
  // CORS settings
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
    credentials: true
  },
  
  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    message: 'Too many requests from this IP, please try again later'
  },
  
  // File upload settings
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/jpg'],
    uploadDir: process.env.UPLOAD_DIR || './uploads'
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'combined',
    maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
    maxSize: process.env.LOG_MAX_SIZE || '10m'
  },
  
  // Notification settings
  notifications: {
    enablePush: process.env.ENABLE_PUSH_NOTIFICATIONS === 'true',
    enableSMS: process.env.ENABLE_SMS_NOTIFICATIONS !== 'false', // Default to true
    enableEmail: process.env.ENABLE_EMAIL_NOTIFICATIONS === 'true'
  },
  
  // Development settings
  isDevelopment: () => config.node_env === 'development',
  isProduction: () => config.node_env === 'production',
  isTest: () => config.node_env === 'test'
};

// Validate environment variables only in production
if (config.isProduction()) {
  validateEnv();
}

module.exports = config;