const mongoose = require('mongoose');
require('dotenv').config();

// Import User model
const User = require('./src/models/User');

async function checkUserRole() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all users and their roles
    const users = await User.find({}).select('phoneNumber firstName lastName role isActive');
    
    console.log('\n📋 All users in the system:');
    console.log('='.repeat(60));
    
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.firstName} ${user.lastName}`);
      console.log(`   📞 Phone: ${user.phoneNumber}`);
      console.log(`   👤 Role: ${user.role}`);
      console.log(`   ✅ Active: ${user.isActive}`);
      console.log('-'.repeat(40));
    });

    // Check for admin users
    const adminUsers = users.filter(user => user.role === 'admin');
    const chairpersonUsers = users.filter(user => user.role === 'chairperson');
    
    console.log(`\n🔐 Admin users: ${adminUsers.length}`);
    console.log(`🪑 Chairperson users: ${chairpersonUsers.length}`);
    
    if (adminUsers.length === 0 && chairpersonUsers.length === 0) {
      console.log('\n⚠️  No admin users found!');
      console.log('💡 You can promote a user to admin by running:');
      console.log('   node promote-to-admin.js');
    }

  } catch (error) {
    console.error('Error checking users:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

checkUserRole();