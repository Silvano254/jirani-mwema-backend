const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
  section: {
    type: String,
    required: true,
    unique: true,
    enum: ['biometric', 'notifications', 'security', 'system', 'general']
  },
  settings: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  version: {
    type: Number,
    default: 1
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
systemSettingsSchema.index({ section: 1 });
systemSettingsSchema.index({ updatedBy: 1 });
systemSettingsSchema.index({ createdAt: -1 });

// Static method to get settings by section
systemSettingsSchema.statics.getBySection = async function(section) {
  const settings = await this.findOne({ section, isActive: true });
  return settings ? settings.settings : null;
};

// Static method to update settings
systemSettingsSchema.statics.updateSettings = async function(section, newSettings, updatedBy) {
  const existingSettings = await this.findOne({ section });
  
  if (existingSettings) {
    existingSettings.settings = { ...existingSettings.settings, ...newSettings };
    existingSettings.updatedBy = updatedBy;
    existingSettings.version += 1;
    return await existingSettings.save();
  } else {
    return await this.create({
      section,
      settings: newSettings,
      updatedBy,
      version: 1
    });
  }
};

// Static method to get all settings
systemSettingsSchema.statics.getAllSettings = async function() {
  const settingsArray = await this.find({ isActive: true }).sort({ section: 1 });
  const settingsObject = {};
  
  settingsArray.forEach(setting => {
    settingsObject[setting.section] = setting.settings;
  });
  
  return settingsObject;
};

// Instance method to backup current settings
systemSettingsSchema.methods.createBackup = function() {
  return {
    section: this.section,
    settings: this.settings,
    version: this.version,
    backedUpAt: new Date()
  };
};

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);