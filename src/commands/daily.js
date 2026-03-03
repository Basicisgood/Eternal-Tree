// src/commands/daily.js
const { SlashCommandBuilder } = require('discord.js');

// === utils：請確認你的實際檔名，若不是 loot.js，改這行路徑即可 ===
let drawFromLootTable, LOGIN_LOOT_TABLE;
try {
  ({ drawFromLootTable, LOGIN_LOOT_TABLE } = require('../utils/loot'));
} catch (e) {
  console.warn('[DAILY] utils/loot 未找到或載入失敗，將以無掉落模式運作：', e?.message || e);
  drawFromLootTable = null;
  LOGIN_LOOT_TABLE = null;
}

/* --------------------------------
 * 安全公告：優先用 GuildConfig.announceChannelId，否則退回 systemChannelId
 * -------------------------------- */
async function safeSendToAnnounce(guild, cfg, message) {
  try {
    const chId = cfg?.announceChannelId ?? guild?.systemChannelId;
    if (!guild || !chId) return;
    const ch = await guild.channels.fetch(chId).catch(() => null);
    if (!ch || !ch.isTextBased()) return;
    await ch.send({ content: message });
  } catch {
    // 靜默忽略，不讓指令失敗
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('領取每日登入獎勵（抽取道具）'),

  /**
   * @param {{ interaction: import('discord.js').ChatInputCommandInteraction, client: import('discord.js').Client, models: any }} ctx
   */
  async execute({ interaction, client, models }) {
    const User = models?.User;
    const GuildConfig = models?.GuildConfig;

    try {
      // 先回覆（避免 3 秒超時）
      await interaction.deferReply({ ephemeral: true });

      // 模型未就緒的保護
      if (!User || !GuildConfig) {
        await interaction.editReply('系統尚未就緒（資料模型未載入）。請稍後再試。');
        return;
      }

      const guildId = interaction.guildId;
      const cfg = await GuildConfig.findOne({ guildId }).lean();

      // 取得或建立玩家（確保有 inventory）
      const user = await User.findOneAndUpdate(
        { guildId, userId: interaction.user.id },
        { $setOnInsert: { level: 1, exp: 0, dailyExpToday: 0, inventory: [] } },
        { new: true, upsert: true }
      );

      // 每日一次檢查（按伺服器時區）
      const tz = cfg?.timezone || 'Asia/Hong_Kong';
      const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
      const claimed = user.dailyClaimedAt
        ? user.dailyClaimedAt.toLocaleDateString('en-CA', { timeZone: tz })
        : null;

      if (claimed === today) {
        await interaction.editReply('你今天已領取過登入獎勵。');
        return;
      }

      // 抽戰利品（若 loot 工具缺失 → 無掉落但仍算成功簽到）
      let loot = null;
      if (typeof drawFromLootTable === 'function' && LOGIN_LOOT_TABLE) {
        loot = drawFromLootTable(LOGIN_LOOT_TABLE);
      }

      // inventory 保障
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
      await user.save();

      // 回覆玩家
      const replyText = loot
        ? `🎁 你獲得了 **${loot.rarity}**：${loot.name}`
        : '✅ 已完成今日簽到。（目前未啟用掉落表或暫無獎勵）';

      await interaction.editReply(replyText);

      // 稀有自動公告（史詩 / 傳說）
      if (loot && (loot.rarity === '史詩' || loot.rarity === '傳說')) {
        await safeSendToAnnounce(
          interaction.guild,
          cfg,
          `🎉 ${interaction.user} 在 **/daily** 抽中 **${loot.rarity}**：${loot.name}！`
        );
      }
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
