
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  guildId: { type: String, index: true },
  userId: { type: String, index: true },
  level: { type: Number, default: 1 },
  exp: { type: Number, default: 0 }, // 當前等級內的 EXP
  totalExp: { type: Number, default: 0 }, // 統計用途（排行榜）
  dailyExpToday: { type: Number, default: 0 },
  lastMessageExpAt: { type: Date, default: null },
  dailyClaimedAt: { type: Date, default: null },
  adventureUsedAt: { type: Date, default: null },
  classLine: { type: String, default: null }, // warrior/mage/hunter/assassin/masked
  inventory: [{
    rarity: String,
    name: String,
    obtainedAt: Date
  }],
  voiceSession: {
    joinedAt: { type: Date, default: null },
    channelId: { type: String, default: null }
  }
}, { timestamps: true });

userSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = { User: mongoose.model('User', userSchema) };
