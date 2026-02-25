
const mongoose = require('mongoose');

const guildConfigSchema = new mongoose.Schema({
  guildId: { type: String, unique: true },
  timezone: { type: String, default: 'Asia/Hong_Kong' },
  dailyCap: { type: Number, default: 200 },
  messageExp: { type: Number, default: 20 },
  messageCooldownSec: { type: Number, default: 60 },
  voiceBlockMinutes: { type: Number, default: 30 },
  voicePerBlockExp: { type: Number, default: 50 },
  announceChannelName: { type: String, default: '任務大廳' }
}, { timestamps: true });

module.exports = { GuildConfig: mongoose.model('GuildConfig', guildConfigSchema) };
