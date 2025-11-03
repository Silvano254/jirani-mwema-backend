// Quick test to check environment variables
require('dotenv').config();

console.log('=== Environment Variable Test ===');
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'SET' : 'NOT SET');
console.log('MONGODB_URI length:', process.env.MONGODB_URI ? process.env.MONGODB_URI.length : 0);
console.log('AT_API_KEY:', process.env.AT_API_KEY ? 'SET' : 'NOT SET');
console.log('AT_USERNAME:', process.env.AT_USERNAME ? 'SET' : 'NOT SET');
console.log('AFRICASTALKING_API_KEY:', process.env.AFRICASTALKING_API_KEY ? 'SET' : 'NOT SET');
console.log('AFRICASTALKING_USERNAME:', process.env.AFRICASTALKING_USERNAME ? 'SET' : 'NOT SET');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('===================================');

// Test MongoDB connection
const mongoose = require('mongoose');

if (process.env.MONGODB_URI) {
  console.log('Testing MongoDB connection...');
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
      console.log('✅ MongoDB connection successful!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ MongoDB connection failed:', err.message);
      process.exit(1);
    });
} else {
  console.error('❌ MONGODB_URI not found in environment');
  process.exit(1);
}