// src/commands/daily.js
const { SlashCommandBuilder } = require('discord.js');
const { addExpIgnoreCap } = require('../utils/exp'); 

// === utils：掉落表 ===
let drawFromLootTable, LOGIN_LOOT_TABLE;
try {
  ({ drawFromLootTable, LOGIN_LOOT_TABLE } = require('../utils/loot'));
} catch (e) {
  console.warn('[DAILY] utils/loot 未找到或載入失敗，將以無掉落模式運作：', e?.message || e);
  drawFromLootTable = null;
  LOGIN_LOOT_TABLE = null;
}

// 史詩風格句子生成
const epicSubjects = [ "火龍","巨狼","聖劍","黑暗之影","光之守護者","古老巨人","冰霜女王","雷霆戰士","星辰之子","深海巨獸","烈焰魔王","銀翼天使","荒原遊俠","血月祭司","永恆樹","黃金騎士","暗影刺客","天空之城","大地之靈","時光旅人" ];
const epicEvents = [ "從天上飛過","在大地咆哮","守護著王國","燃燒整片天空","撕裂黑暗","降臨戰場","呼喚古老力量","展開翅膀","喚醒沉睡巨人","踏碎群山","引爆雷霆","灑落星光","掀起海嘯","低語古老咒語","照亮夜空","吞噬希望","守望黎明","流淌血脈","開啟傳說","迎接宿命" ];
const epicEmojis = ["🐉","🐺","⚔️","🌑","🌟","🗿","❄️","⚡","✨","🐙","🔥","👼","🏹","🌕","🌳","🛡️","🕶️","🏰","🌍","⏳"];

function randomEpicSentence() {
  const subject = epicSubjects[Math.floor(Math.random() * epicSubjects.length)];
  const event = epicEvents[Math.floor(Math.random() * epicEvents.length)];
  const emoji = epicEmojis[Math.floor(Math.random() * epicEmojis.length)];
  return `${subject}${event} ${emoji}`;
}

// 史詩風格預言生成
const epicProphecies = [
  "將迎來無盡的試煉","注定成為王者","會在黑暗中點燃光明","將背負古老的詛咒","會喚醒沉睡的巨龍",
  "注定守護永恆之樹","會在星辰下覺醒","將踏上無歸之路","注定改寫命運","會在血月下崛起",
  "將引領黎明的到來","注定與雷霆同行","會在深海中尋得真理","將燃燒至最後一刻","注定與時光為敵",
  "會在荒原中孤行","將在天空之城加冕","注定承受大地之力","會在黃金王座上覺醒","將在永夜中低語",
  "注定與影子共舞","會在烈焰中重生","將在冰霜中沉睡","注定與星光同行","會在古老祭壇上覺醒",
  "將在戰場上留下傳說","注定與守護者並肩","會在命運之輪中旋轉","將在時光盡頭重生","注定迎接宿命"
];

function randomEpicProphecy(username) {
  const prophecy = epicProphecies[Math.floor(Math.random() * epicProphecies.length)];
  return `${username}${prophecy}`;
}

async function safeSendToAnnounce(guild, cfg, message) {
  try {
    const chId = cfg?.announceChannelId ?? guild?.systemChannelId;
    if (!guild || !chId) return;
    const ch = await guild.channels.fetch(chId).catch(() => null);
    if (!ch || !ch.isTextBased()) return;
    await ch.send({ content: message });
  } catch {}
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('領取每日登入獎勵（抽取道具 + 獲得EXP）'),

  async execute({ interaction, client, models }) {
    const User = models?.User;
    const GuildConfig = models?.GuildConfig;

    try {
      await interaction.deferReply({ ephemeral: true });

      if (!User || !GuildConfig) {
        await interaction.editReply('系統尚未就緒（資料模型未載入）。請稍後再試。');
        return;
      }

      const guildId = interaction.guildId;
      const cfg = await GuildConfig.findOne({ guildId }).lean();

      const user = await User.findOneAndUpdate(
        { guildId, userId: interaction.user.id },
        { $setOnInsert: { level: 1, exp: 0, dailyExpToday: 0, inventory: [] } },
        { new: true, upsert: true }
      );

      const tz = cfg?.timezone || 'Asia/Hong_Kong';
      const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
      const claimed = user.dailyClaimedAt
        ? user.dailyClaimedAt.toLocaleDateString('en-CA', { timeZone: tz })
        : null;

      if (claimed === today) {
        await interaction.editReply('你今天已領取過登入獎勵。');
        return;
      }

      // 抽戰利品
      let loot = null;
      if (typeof drawFromLootTable === 'function' && LOGIN_LOOT_TABLE) {
        loot = drawFromLootTable(LOGIN_LOOT_TABLE);
      }

      if (!Array.isArray(user.inventory)) user.inventory = [];
      if (loot) {
        user.inventory.push({
          rarity: loot.rarity,
          name: loot.name,
          obtainedAt: new Date(),
          source: 'daily',
        });
      }

      user.dailyClaimedAt = new Date();

      // 增加100EXP（無視Daily Cap）
      const expResult = await addExpIgnoreCap(user, 100);

      await user.save();

      // 回覆玩家（私訊）
      let replyText = loot
        ? `🎁 你獲得了 **${loot.rarity}**：${loot.name}\n✅ 你獲得了 100 EXP！`
        : '✅ 已完成今日簽到。（目前未啟用掉落表或暫無獎勵）\n✅ 你獲得了 100 EXP！';

      await interaction.editReply(replyText);

      // 全頻公告
      const epicSentence = randomEpicSentence();
      const prophecySentence = randomEpicProphecy(interaction.user.username);
      const announceText = loot
        ? `🌟 ${interaction.user.username} (Lv${user.level}) 已完成每日簽到，並獲得「${loot.name}」！\n${epicSentence}\n${prophecySentence}`
        : `🌟 ${interaction.user.username} (Lv${user.level}) 已完成每日簽到！\n${epicSentence}\n${prophecySentence}`;

      await safeSendToAnnounce(interaction.guild, cfg, announceText);

    } catch (err) {
      console.error('[CMD ERROR] /daily', err);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '執行 /daily 時發生錯誤，請稍後再試。', ephemeral: true });
        } else {
          await interaction.editReply('執行 /daily 時發生錯誤，請稍後再試。');
        }
      } catch {}
    }
  },
};
