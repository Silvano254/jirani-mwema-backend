const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Add connection options for better Railway compatibility
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000, // 30 seconds
      socketTimeoutMS: 45000, // 45 seconds
      bufferCommands: false,
      bufferMaxEntries: 0
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        console.log('MongoDB connection closed due to app termination');
      } catch (error) {
        console.error('Error closing MongoDB connection:', error);
      }
      process.exit(0);
    });

    return conn;

  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    // Don't exit process - let app continue without database
    throw error;
  }
};

module.exports = connectDB;