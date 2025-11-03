const mongoose = require('mongoose');
require('dotenv').config();

// Import User model
const User = require('./src/models/User');

const testUsers = [
  {
    phoneNumber: '+254746170866',
    firstName: 'Admin',
    lastName: 'User',
    role: 'chairperson',
    isActive: true,
    isVerified: true,
    balance: 50000,
    contributionAmount: 5000
  },
  {
    phoneNumber: '+254712345678',
    firstName: 'John',
    lastName: 'Secretary',
    role: 'secretary',
    isActive: true,
    isVerified: true,
    balance: 30000,
    contributionAmount: 3000
  },
  {
    phoneNumber: '0746170866',
    firstName: 'Jane',
    lastName: 'Treasurer',
    role: 'treasurer',
    isActive: true,
    isVerified: true,
    balance: 40000,
    contributionAmount: 4000
  },
  {
    phoneNumber: '0712345678',
    firstName: 'Member',
    lastName: 'Test',
    role: 'member',
    isActive: true,
    isVerified: true,
    balance: 15000,
    contributionAmount: 2000
  }
];

async function createTestUsers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing users (optional)
    await User.deleteMany({});
    console.log('Cleared existing users');

    // Create test users
    for (const userData of testUsers) {
      const user = new User(userData);
      await user.save();
      console.log(`Created user: ${userData.firstName} ${userData.lastName} (${userData.phoneNumber})`);
    }

    console.log('\n✅ Test users created successfully!');
    console.log('\n📱 You can now login with these phone numbers:');
    testUsers.forEach(user => {
      console.log(`   • ${user.phoneNumber} - ${user.role} (${user.firstName} ${user.lastName})`);
    });

    console.log('\n🔑 Use OTP: 123456 for testing');

  } catch (error) {
    console.error('Error creating test users:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

createTestUsers();