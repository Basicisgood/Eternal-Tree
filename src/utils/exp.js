
// src/utils/exp.js
const { User } = require('../models/user');

const LEVEL_CAP = 100;

/*=====================================================
=            Old: Level & EXP Calculation            =
=====================================================*/

function expNeededForNextLevel(currentLevel) {
  if (currentLevel >= LEVEL_CAP) return Infinity;
  return 100 + Math.max(0, currentLevel - 1) * 50;
}

async function addExpWithDailyCap(userDoc, cfg, amount) {
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
/*
  規則：
  - 在任何群組頻道發送訊息時
  - 字元 ≥ 5 才有效
  - 每位玩家每 60 秒最多一次
  - +20 EXP
  - => 在 messageCreate event 裡使用：
      if (canGainMsgExp(user, Date.now()) && msg.content.length >= 5) {
         const { gained } = await addExpWithDailyCap(user, cfg, 20);
         user.lastMsgExpAt = new Date();
         await user.save();
      }
*/

function canGainMsgExp(userDoc, now = Date.now()) {
  const last = userDoc.lastMsgExpAt ? userDoc.lastMsgExpAt.getTime() : 0;
  return now - last >= 60 * 1000; // 1 分鐘
}

/*=====================================================
=             New: Voice EXP Rule (30m)              =
=====================================================*/
/*
  規則：
  - 玩家在語音頻道
  - 每滿 30 分鐘給 50 EXP
  - => 在 voiceStateUpdate 中更新 userDoc.voiceJoinedAt
        以及定時檢查 shouldGrantVoiceExp()

      示例（在你的 event handler）：
        const now = Date.now();
        if (shouldGrantVoiceExp(user, now)) {
           const { gained } = await addExpWithDailyCap(user, cfg, 50);
           user.lastVoiceExpAt = new Date(now);
           await user.save();

           // 公告訊息
           const emojis = ['🎉','🔥','✨','💥','🏅'];
           const em = emojis[Math.floor(Math.random()*emojis.length)];
           announceChannel.send(
             `${member} 在語音頻道 **${channel.name}** 逗留了30分鐘，獲得了 **50EXP**，是個狠角色！ ${em}`
           );
        }
*/

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
};
