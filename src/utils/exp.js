
const { User } = require('../models/user');

const LEVEL_CAP = 100;

function expNeededForNextLevel(currentLevel) {
  if (currentLevel >= LEVEL_CAP) return Infinity;
  // Lv1->2: 100；每升一級所需 +50
  // 需求 = 100 + (currentLevel - 1) * 50
  return 100 + Math.max(0, (currentLevel - 1)) * 50;
}

async function addExpWithDailyCap(userDoc, cfg, amount) {
  // 若已達每日上限，無效
  const canGain = Math.max(0, cfg.dailyCap - (userDoc.dailyExpToday || 0));
  const gain = Math.min(canGain, amount);
  let leveledUp = false;

  if (gain > 0) {
    userDoc.exp += gain;
    userDoc.totalExp = (userDoc.totalExp || 0) + gain;
    userDoc.dailyExpToday = (userDoc.dailyExpToday || 0) + gain;

    while (userDoc.level < LEVEL_CAP) {
      const need = expNeededForNextLevel(userDoc.level);
      if (userDoc.exp >= need) {
        userDoc.exp -= need;
        userDoc.level += 1;
        leveledUp = true;
      } else break;
    }
  }
  return { leveledUp, gained: gain };
}

module.exports = { LEVEL_CAP, expNeededForNextLevel, addExpWithDailyCap };
