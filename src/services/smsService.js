const AfricasTalking = require('africastalking');
const logger = require('../utils/logger');

class SMSService {
  constructor() {
    if (!process.env.AT_API_KEY || !process.env.AT_USERNAME) {
      logger.warn('Africa\'s Talking credentials not configured');
      this.client = null;
      return;
    }

    this.client = AfricasTalking({
      apiKey: process.env.AT_API_KEY,
      username: process.env.AT_USERNAME,
    });

    this.sms = this.client.SMS;
  }

  // Send SMS message
  async sendSMS(phoneNumber, message) {
    if (!this.client) {
      logger.error('SMS service not configured');
      return false;
    }

    try {
      // Format phone number for Kenya
      const formattedNumber = this.formatPhoneNumber(phoneNumber);
      
      if (!formattedNumber) {
        logger.error(`Invalid phone number format: ${phoneNumber}`);
        return false;
      }

      // Use a simple sender ID or no sender ID to avoid blacklisting
      let options = {
        to: [formattedNumber],
        message: message,
        // Use a short, simple sender ID or leave it out
        from: 'JIRANI'
      };

      logger.info(`Sending SMS to ${formattedNumber}...`);
      let response = await this.sms.send(options);
      
      if (response.SMSMessageData.Recipients.length > 0) {
        const recipient = response.SMSMessageData.Recipients[0];
        
        if (recipient.status === 'Success') {
          logger.info(`SMS sent successfully to ${formattedNumber}: ${recipient.messageId}`);
          return true;
        } else {
          logger.error(`SMS failed to ${formattedNumber}: ${recipient.status} - ${recipient.description || 'No description'}`);
          
          // If we get blacklisted error, try without sender ID
          if (recipient.status.includes('blacklist') || recipient.status.includes('InvalidSenderId')) {
            logger.info('Retrying SMS without sender ID due to blacklist/invalid sender...');
            const optionsNoSender = {
              to: [formattedNumber],
              message: message
              // No sender ID
            };
            
            const retryResponse = await this.sms.send(optionsNoSender);
            if (retryResponse.SMSMessageData.Recipients.length > 0) {
              const retryRecipient = retryResponse.SMSMessageData.Recipients[0];
              if (retryRecipient.status === 'Success') {
                logger.info(`SMS retry successful to ${formattedNumber}: ${retryRecipient.messageId}`);
                return true;
              }
            }
          }
          
          return false;
        }
      }

      logger.error('No recipients in SMS response');
      return false;

    } catch (error) {
      logger.error('SMS sending error:', error);
      return false;
    }
  }

  // Send OTP SMS
  async sendOTP(phoneNumber, otp) {
    const message = `Your Jirani Mwema verification code is: ${otp}. Valid for 10 minutes. Do not share this code.`;
    return await this.sendSMS(phoneNumber, message);
  }

  // Send welcome message to new member
  async sendWelcomeMessage(phoneNumber, memberName) {
    const message = `Welcome to Jirani Mwema, ${memberName}! You have been successfully registered. Download our app to start managing your account.`;
    return await this.sendSMS(phoneNumber, message);
  }

  // Send contribution confirmation
  async sendContributionConfirmation(phoneNumber, amount, balance) {
    const message = `Contribution of KSh ${amount.toLocaleString()} received. Your current balance: KSh ${balance.toLocaleString()}. Thank you!`;
    return await this.sendSMS(phoneNumber, message);
  }

  // Send loan approval notification
  async sendLoanApproval(phoneNumber, amount, dueDate) {
    const message = `Your loan of KSh ${amount.toLocaleString()} has been approved. Repayment due: ${dueDate}. Terms apply.`;
    return await this.sendSMS(phoneNumber, message);
  }

  // Send loan rejection notification
  async sendLoanRejection(phoneNumber, reason) {
    const message = `Your loan request has been declined. Reason: ${reason}. Contact admin for more information.`;
    return await this.sendSMS(phoneNumber, message);
  }

  // Send meeting reminder
  async sendMeetingReminder(phoneNumber, meetingTitle, date, location) {
    const message = `Reminder: ${meetingTitle} on ${date} at ${location}. Please attend. Jirani Mwema.`;
    return await this.sendSMS(phoneNumber, message);
  }

  // Send proxy action confirmation
  async sendProxyConfirmation(phoneNumber, action, adminName) {
    const message = `Action performed on your behalf by ${adminName}: ${action}. Contact us if you have questions.`;
    return await this.sendSMS(phoneNumber, message);
  }

  // Send bulk SMS to multiple recipients
  async sendBulkSMS(phoneNumbers, message) {
    if (!this.client) {
      logger.error('SMS service not configured');
      return { success: false, results: [] };
    }

    const results = [];
    const batchSize = 100; // Africa's Talking limit
    
    for (let i = 0; i < phoneNumbers.length; i += batchSize) {
      const batch = phoneNumbers.slice(i, i + batchSize);
      const formattedNumbers = batch
        .map(num => this.formatPhoneNumber(num))
        .filter(num => num !== null);

      if (formattedNumbers.length === 0) continue;

      try {
        const options = {
          to: formattedNumbers,
          message: message,
          from: process.env.AT_SENDER_ID || 'JIRANI'
        };

        const response = await this.sms.send(options);
        
        if (response.SMSMessageData.Recipients) {
          results.push(...response.SMSMessageData.Recipients);
        }

        // Small delay between batches to avoid rate limiting
        if (i + batchSize < phoneNumbers.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        logger.error(`Bulk SMS batch error:`, error);
        // Continue with next batch
      }
    }

    const successCount = results.filter(r => r.status === 'Success').length;
    logger.info(`Bulk SMS completed: ${successCount}/${phoneNumbers.length} successful`);

    return {
      success: true,
      results: results,
      successCount: successCount,
      totalCount: phoneNumbers.length
    };
  }

  // Format phone number to Kenya format
  formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) return null;

    // Remove all non-digit characters except +
    let cleaned = phoneNumber.replace(/[^\d+]/g, '');

    // Handle different formats
    if (cleaned.startsWith('+254')) {
      return cleaned; // Already in correct format
    } else if (cleaned.startsWith('254')) {
      return '+' + cleaned; // Add + prefix
    } else if (cleaned.startsWith('0')) {
      return '+254' + cleaned.substring(1); // Replace 0 with +254
    } else if (cleaned.length === 9 && (cleaned.startsWith('7') || cleaned.startsWith('1'))) {
      // Support both Safaricom (7xx) and Airtel (1xx, some 7xx) numbers
      return '+254' + cleaned; // Add +254 prefix for 9-digit numbers
    }

    // Invalid format
    return null;
  }

  // Validate phone number format
  isValidPhoneNumber(phoneNumber) {
    const formatted = this.formatPhoneNumber(phoneNumber);
    if (!formatted) return false;

    // Kenya mobile numbers: 
    // Safaricom: +254 7xx xxx xxx (700-799)
    // Airtel: +254 73x xxx xxx, +254 78x xxx xxx, +254 1xx xxx xxx (100-199)
    // Telkom: +254 77x xxx xxx
    // Updated regex to support all major Kenya networks including Airtel
    const kenyaMobileRegex = /^\+254[17][0-9]{8}$/;
    return kenyaMobileRegex.test(formatted);
  }

  // Get SMS service status
  getServiceStatus() {
    return {
      configured: this.client !== null,
      provider: 'Africa\'s Talking',
      username: process.env.AT_USERNAME || 'Not configured'
    };
  }
}

module.exports = new SMSService();