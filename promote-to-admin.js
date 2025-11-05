const mongoose = require('mongoose');
require('dotenv').config();

// Import User model
const User = require('./src/models/User');

async function promoteToAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get phone number from command line argument or use default
    const phoneNumber = process.argv[2] || '+254746170866'; // Your default admin phone

    console.log(`🔍 Looking for user with phone number: ${phoneNumber}`);

    // Find user by phone number
    const user = await User.findOne({ phoneNumber });
    
    if (!user) {
      console.log(`❌ User with phone number ${phoneNumber} not found`);
      console.log('\n📋 Available users:');
      
      const users = await User.find({}).select('phoneNumber firstName lastName role');
      users.forEach((u, index) => {
        console.log(`   ${index + 1}. ${u.firstName} ${u.lastName} (${u.phoneNumber}) - ${u.role}`);
      });
      
      return;
    }

    console.log(`✅ Found user: ${user.firstName} ${user.lastName}`);
    console.log(`   Current role: ${user.role}`);

    // Promote to admin
    user.role = 'admin';
    user.isActive = true;
    await user.save();

    console.log(`🚀 Successfully promoted ${user.firstName} ${user.lastName} to admin!`);
    console.log(`📞 Phone: ${user.phoneNumber}`);
    console.log(`👤 New role: ${user.role}`);
    console.log(`✅ Active: ${user.isActive}`);

  } catch (error) {
    console.error('Error promoting user to admin:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

console.log('📢 Promoting user to admin...');
console.log('Usage: node promote-to-admin.js [phone_number]');
console.log('Example: node promote-to-admin.js +254746170866\n');

promoteToAdmin();