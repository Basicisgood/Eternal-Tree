// src/utils/exp.js
const { User } = require('../models/user');

const LEVEL_CAP = 100;

/*=====================================================
=            Daily Reset: EXP Control                =
=====================================================*/
function resetDailyExpIfNeeded(userDoc, now = new Date()) {
  // 取得今天日期字串 (YYYY-MM-DD)
  const todayStr = now.toISOString().slice(0, 10);

  // 如果沒有紀錄，或紀錄不是今天，就重置
  if (!userDoc.lastDailyReset || userDoc.lastDailyReset !== todayStr) {
    userDoc.dailyExpToday = 0;
    userDoc.lastDailyReset = todayStr;
  }
}

/*=====================================================
=            Old: Level & EXP Calculation            =
=====================================================*/
function expNeededForNextLevel(currentLevel) {
  if (currentLevel >= LEVEL_CAP) return Infinity;
  return 100 + Math.max(0, currentLevel - 1) * 50;
}

async function addExpWithDailyCap(userDoc, cfg, amount) {
  // 每次加 EXP 前先檢查是否跨日
  resetDailyExpIfNeeded(userDoc);

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

/*=====================================================
=              New: Message EXP Rule (1m)            =
=====================================================*/
function canGainMsgExp(userDoc, now = Date.now()) {
  const last = userDoc.lastMsgExpAt ? userDoc.lastMsgExpAt.getTime() : 0;
  return now - last >= 60 * 1000; // 1 分鐘
}

/*=====================================================
=             New: Voice EXP Rule (30m)              =
=====================================================*/
function shouldGrantVoiceExp(userDoc, now = Date.now()) {
  const last = userDoc.lastVoiceExpAt ? userDoc.lastVoiceExpAt.getTime() : 0;
  return now - last >= 30 * 60 * 1000; // 30 分鐘
}

/*=====================================================
=                     Export                         =
=====================================================*/
module.exports = {
  LEVEL_CAP,
  expNeededForNextLevel,
  addExpWithDailyCap,
  canGainMsgExp,
  shouldGrantVoiceExp,
  resetDailyExpIfNeeded, // 新增匯出，方便其他地方呼叫
};
