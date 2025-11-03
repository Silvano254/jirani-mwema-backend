const mongoose = require('mongoose');
require('dotenv').config();

// Import User model
const User = require('../src/models/User');

async function cleanupTestData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Remove test user (keeping only the admin)
    const testUser = await User.findOne({ phoneNumber: '0788617465' });
    if (testUser) {
      await User.deleteOne({ phoneNumber: '0788617465' });
      console.log('Test user removed');
    }

    // Ensure admin is properly set up
    const admin = await User.findOne({ phoneNumber: '0746170866' });
    if (admin) {
      console.log('Admin user verified:', {
        phoneNumber: admin.phoneNumber,
        fullName: admin.fullName,
        role: admin.role,
        isActive: admin.isActive
      });
    } else {
      console.log('Warning: Admin user not found!');
    }

    console.log('\nProduction cleanup completed!');
    console.log('Ready for launch with admin user only.');

  } catch (error) {
    console.error('Error cleaning up test data:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

cleanupTestData();