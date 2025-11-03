const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const proxyRoutes = require('./routes/proxyRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const meetingRoutes = require('./routes/meetingRoutes');

const app = express();

// Global database connection status
let dbConnected = false;

// Connect to database asynchronously (don't block server startup)
connectDB()
  .then(() => {
    dbConnected = true;
    console.log('Database connection established');
  })
  .catch((error) => {
    console.error('Database connection failed:', error);
    dbConnected = false;
  });

// Security middleware
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

// Logging
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint - responds even if DB is not connected
app.get('/health', (req, res) => {
  const healthStatus = {
    status: 'OK',
    message: 'Jirani Mwema Backend is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    database: dbConnected ? 'connected' : 'disconnected',
    uptime: process.uptime()
  };
  
  res.status(200).json(healthStatus);
});

// Simple root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Jirani Mwema Backend API',
    version: '1.0.0',
    status: 'running'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/proxy', proxyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/meetings', meetingRoutes);

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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Jirani Mwema Backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Database: ${process.env.MONGODB_URI ? 'Connected' : 'Not configured'}`);
});