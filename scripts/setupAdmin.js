const mongoose = require('mongoose');
require('dotenv').config();

// Import User model
const User = require('../src/models/User');

async function setupAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ phoneNumber: '0746170866' });
    if (existingAdmin) {
      // Update existing user to admin
      existingAdmin.role = 'chairperson';
      existingAdmin.firstName = 'Admin';
      existingAdmin.lastName = 'User';
      existingAdmin.isActive = true;
      await existingAdmin.save();
      console.log('Updated existing user to admin:', existingAdmin.fullName);
    } else {
      // Create new admin user
      const adminUser = new User({
        phoneNumber: '0746170866',
        firstName: 'Admin',
        lastName: 'User', 
        role: 'chairperson',
        isActive: true
      });

      await adminUser.save();
      console.log('Admin user created successfully:', adminUser.fullName);
    }

    // Also ensure the Airtel test user exists but as a regular member
    const testUser = await User.findOne({ phoneNumber: '0788617465' });
    if (testUser && testUser.role !== 'member') {
      testUser.role = 'member';
      await testUser.save();
      console.log('Test user role updated to member');
    }

    console.log('\nAdmin setup completed successfully!');

  } catch (error) {
    console.error('Error setting up admin:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

setupAdmin();