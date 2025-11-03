const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
}

// User schema (simplified)
const userSchema = new mongoose.Schema({
  phoneNumber: String,
  firstName: String,
  lastName: String,
  role: String,
  isActive: Boolean,
  otpCode: String,
  otpExpires: Date,
  loginAttempts: { type: Number, default: 0 },
  lockUntil: Date,
  accountLocked: { type: Boolean, default: false }
});

const User = mongoose.model('User', userSchema);

async function unlockUser() {
  await connectDB();
  
  try {
    // Reset login attempts and unlock the user
    const result = await User.updateOne(
      { phoneNumber: '0746170866' },
      {
        $unset: {
          loginAttempts: 1,
          lockUntil: 1,
          accountLocked: 1,
          otpCode: 1,
          otpExpires: 1
        }
      }
    );
    
    console.log('User unlock result:', result);
    
    if (result.matchedCount > 0) {
      console.log('✅ User account unlocked successfully');
    } else {
      console.log('❌ User not found');
    }
    
  } catch (error) {
    console.error('Error unlocking user:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

unlockUser();