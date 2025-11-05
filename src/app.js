const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Initialize Express app first
const app = express();

// Trust proxy for Railway deployment
app.set('trust proxy', true);

// Global database connection status
let dbConnected = false;

// Async function to setup database
async function setupDatabase() {
  try {
    const connectDB = require('./config/db');
    await connectDB();
    dbConnected = true;
    console.log('✅ Database connection established');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    dbConnected = false;
    // Continue without database - app can still serve health checks
  }
}

// Setup database connection
setupDatabase();

// Import error handler and routes after app initialization
const errorHandler = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const proxyRoutes = require('./routes/proxyRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const meetingRoutes = require('./routes/meetingRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Security middleware
app.set('trust proxy', 1); // Trust first proxy (Railway)
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Simple root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Jirani Mwema Backend API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Logging with better error handling
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Body parsing middleware with better error handling
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      res.status(400).json({ error: 'Invalid JSON' });
      throw new Error('Invalid JSON');
    }
  }
}));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint - responds even if DB is not connected (should be early in middleware stack)
app.get('/health', (req, res) => {
  const healthStatus = {
    status: 'OK',
    message: 'Jirani Mwema Backend is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    database: dbConnected ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    environment: {
      nodeEnv: process.env.NODE_ENV || 'development',
      port: process.env.PORT || '3000',
      mongoUri: process.env.MONGODB_URI ? 'configured' : 'missing',
      atApiKey: process.env.AT_API_KEY ? 'configured' : 'missing',
      atUsername: process.env.AT_USERNAME ? 'configured' : 'missing'
    }
  };
  
  res.status(200).json(healthStatus);
});

// Simple root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Jirani Mwema Backend API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// App hit counter for debugging
let appHitCounter = 0;

// Debug endpoint to track app connections
app.post('/app-debug', (req, res) => {
  appHitCounter++;
  const { action, data } = req.body;
  
  console.log(` APP HIT #${appHitCounter}: ${action}`);
  console.log(` Data:`, data);
  console.log(` Time: ${new Date().toISOString()}`);
  
  res.json({
    success: true,
    message: `App connected! Hit #${appHitCounter}`,
    action: action,
    timestamp: new Date().toISOString()
  });
}); 

// SMS diagnostic endpoint
app.get('/sms-status', (req, res) => {
  const smsService = require('./services/smsService');
  
  res.json({
    status: 'SMS Service Diagnostics',
    environment: {
      AT_API_KEY: process.env.AT_API_KEY ? `${process.env.AT_API_KEY.substring(0, 10)}...` : 'missing',
      AT_USERNAME: process.env.AT_USERNAME || 'missing',
      AT_SENDER_ID: process.env.AT_SENDER_ID || 'missing',
      ENABLE_REAL_SMS: process.env.ENABLE_REAL_SMS || 'missing',
    },
    serviceStatus: smsService.getServiceStatus ? smsService.getServiceStatus() : 'method not available',
    recommendations: [
      '1. Verify AT_API_KEY is valid and not expired',
      '2. Check AT_USERNAME matches your Africa\'s Talking account',  
      '3. Ensure account has sufficient SMS credits',
      '4. Verify sender ID is approved (or remove it)',
      '5. Check if account is in sandbox mode',
    ]
  });
});

// Quick user registration endpoint for testing
app.post('/quick-register', async (req, res) => {
  try {
    const { phoneNumber, firstName, lastName, role } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    const User = require('./models/User');
    
    // Check if user already exists
    const existingUser = await User.findOne({ phoneNumber });
    if (existingUser) {
      return res.json({
        success: true,
        message: 'User already exists',
        user: { phoneNumber: existingUser.phoneNumber, role: existingUser.role }
      });
    }

    // Create new user
    const newUser = new User({
      phoneNumber,
      firstName: firstName || 'Test',
      lastName: lastName || 'User',
      role: role || 'member',
      isActive: true,
      isLocked: false,
    });

    await newUser.save();

    res.json({
      success: true,
      message: 'User registered successfully',
      user: { 
        phoneNumber: newUser.phoneNumber, 
        name: `${newUser.firstName} ${newUser.lastName}`,
        role: newUser.role 
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

app.post('/test-otp-verify', async (req, res) => {
  const { phoneNumber, otp } = req.body;
  
  console.log('=== OTP VERIFICATION TEST ===');
  console.log('Received phoneNumber:', phoneNumber);
  console.log('Received OTP:', otp);
  console.log('OTP type:', typeof otp);
  console.log('OTP length:', otp ? otp.length : 'null');
  
  try {
    // Find user with this phone number
    const User = require('./models/User');
    const user = await User.findOne({ phoneNumber });
    console.log('User found:', user ? 'YES' : 'NO');
    if (user) {
      console.log('User phone in DB:', user.phoneNumber);
      console.log('User OTP (otp field):', user.otp);
      console.log('User OTP (otpCode field):', user.otpCode);
      console.log('User OTP expires:', user.otpExpires);
      console.log('Current time:', new Date());
      console.log('OTP expired?', user.otpExpires < new Date());
      console.log('OTP matches otp field?', user.otp === otp);
      console.log('OTP matches otpCode field?', user.otpCode === otp);
    }
    
    res.json({
      success: true,
      receivedPhone: phoneNumber,
      receivedOtp: otp,
      userFound: !!user,
      userPhone: user?.phoneNumber,
      userOtp: user?.otp,
      userOtpCode: user?.otpCode,
      dbOtp: user?.otp,
      otpExpired: user ? user.otpExpires < new Date() : null,
      otpMatches: user ? user.otp === otp : null,
      otpCodeMatches: user ? user.otpCode === otp : null
    });
  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({ error: error.message });
  }
});
app.post('/test-sms', async (req, res) => {
  const { phoneNumber, message } = req.body;
  
  if (!phoneNumber || !message) {
    return res.status(400).json({
      success: false,
      error: 'Phone number and message are required'
    });
  }

  try {
    const smsService = require('./services/smsService');
    
    // Get service status first
    const serviceStatus = smsService.getServiceStatus();
    
    // Format phone number
    const formattedNumber = smsService.formatPhoneNumber(phoneNumber);
    
    const result = await smsService.sendSMS(phoneNumber, message);
    
    res.json({
      success: true,
      smsSent: result,
      phoneNumber: phoneNumber,
      formattedNumber: formattedNumber,
      message: message,
      serviceStatus: serviceStatus,
      environment: {
        atApiKey: process.env.AT_API_KEY ? process.env.AT_API_KEY.substring(0, 10) + '...' : 'missing',
        atUsername: process.env.AT_USERNAME || 'missing',
        atSenderId: process.env.AT_SENDER_ID || 'missing',
        enableRealSms: process.env.ENABLE_REAL_SMS,
        nodeEnv: process.env.NODE_ENV
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// IP check endpoint for Railway
app.get('/ip', async (req, res) => {
  try {
    const response = await fetch('https://httpbin.org/ip');
    const data = await response.json();
    res.status(200).json({
      railwayIP: data.origin,
      headers: {
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-real-ip': req.headers['x-real-ip']
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get IP' });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/proxy', proxyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/admin', adminRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

// Enhanced server startup with error handling
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Jirani Mwema Backend running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️  Database: ${process.env.MONGODB_URI ? 'Configured' : 'Not configured'}`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
});

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed successfully');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed successfully');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});