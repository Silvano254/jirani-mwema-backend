const mongoose = require('mongoose');
require('dotenv').config();

// Import User model
const User = require('../src/models/User');

async function addTestUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if user already exists
    const existingUser = await User.findOne({ phoneNumber: '0788617465' });
    if (existingUser) {
      console.log('User with phone number 0788617465 already exists');
      process.exit(0);
    }

    // Create test user
    const testUser = new User({
      phoneNumber: '0788617465',
      firstName: 'Test',
      lastName: 'User',
      role: 'member',
      isActive: true
    });

    await testUser.save();
    console.log('Test user created successfully:');
    console.log({
      id: testUser._id,
      phoneNumber: testUser.phoneNumber,
      fullName: testUser.fullName,
      role: testUser.role
    });

  } catch (error) {
    console.error('Error creating test user:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

addTestUser();