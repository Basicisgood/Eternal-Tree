
// src/commands/profile.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { expNeededForNextLevel } = require('../utils/exp');

let getTitleForLevel = () => '未設定';
try {
  // 若你確定有 titles 模組，就保留這行；否則會用上方預設函式
  ({ getTitleForLevel } = require('../utils/titles'));
} catch (_) {}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('查看你的等級、EXP 與稱號'),

  /**
   * @param {{ interaction: import('discord.js').ChatInputCommandInteraction, models: any }} ctx
   */
  async execute({ interaction, models: { User, GuildConfig } }) {
    try {
      // 先 ACK，避免 3 秒超時
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId;
      const userId = interaction.user.id;

      // 讀取使用者
      const user = await User.findOne({ guildId, userId });
      if (!user) {
        return await interaction.editReply({ content: '尚無資料，先多參與互動吧！' });
      }

      // 讀取伺服器設定（顯示每日上限）
      const cfg = await GuildConfig.findOne({ guildId }).lean().catch(() => null);
      const dailyCap = cfg?.dailyCap ?? 200;

      // 等級 & 稱號
      const need = expNeededForNextLevel(user.level);
      const title = getTitleForLevel(user.level, user.classLine);

      const embed = new EmbedBuilder()
        .setColor(0x29B6F6)
        .setTitle(`${interaction.user.username} 的個人資料`)
        .addFields(
          { name: '等級', value: `Lv.${user.level}`, inline: true },
          { name: '當前 EXP / 下一級需求', value: `${user.exp} / ${need === Infinity ? 'MAX' : need}`, inline: true },
          { name: '今日 EXP', value: `${user.dailyExpToday || 0} / ${dailyCap}`, inline: true },
          { name: '總 EXP', value: `${user.totalExp || 0}`, inline: true },
          { name: '稱號', value: `${title}`, inline: true },
          { name: '職業線', value: `${user.classLine || '未選擇'}`, inline: true },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      // 萬一在 defer 前就丟錯，補一次嘗試；已回覆/超時就吞掉
      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({ content: '抱歉，處理你的個人資料時發生錯誤，請稍後再試。', ephemeral: true });
        } else {
          await interaction.editReply({ content: '抱歉，處理你的個人資料時發生錯誤，請稍後再試。' });
        }
      } catch (_) {}
      console.error('[/profile] error:', err);
    }
  }
};
