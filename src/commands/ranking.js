
// src/commands/ranking.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
// 若未使用 expNeededForNextLevel 可移除
// const { expNeededForNextLevel } = require('../utils/exp');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('伺服器排行榜（依等級、總 EXP）'),

  /**
   * @param {{ interaction: import('discord.js').ChatInputCommandInteraction, models: any }} ctx
   */
  async execute({ interaction, models: { User } }) {
    try {
      await interaction.deferReply({ ephemeral: false });

      // 1) 前 10 名：等級 desc → 總 EXP desc
      const list = await User.find({ guildId: interaction.guildId })
        .sort({ level: -1, totalExp: -1 })
        .limit(10);

      if (!list.length) {
        return interaction.editReply({ content: '目前沒有資料。' });
      }

      // 2) 批次抓取需要的 GuildMember（可能有成員已離開）
      const ids = list.map(u => u.userId);
      let membersMap = new Map();
      try {
        const coll = await interaction.guild.members.fetch({ user: ids });
        membersMap = coll;
      } catch (_) {
        // 忽略，後面會 fallback mention
      }

      // 3) 產生每行
      const lines = list.map((u, idx) => {
        const member = membersMap.get(u.userId);
        const name = member ? member.displayName : `<@${u.userId}>`;
        return `#${idx + 1} **${name}** — Lv.${u.level}（總 EXP：${u.totalExp || 0}）`;
      });

      // 4) 回覆 Embed
      const embed = new EmbedBuilder()
        .setColor(0xFF8F00)
        .setTitle('伺服器排行榜 TOP 10')
        .setDescription(lines.join('\n'))
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[/ranking] error:', err);
      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({ content: '處理排行榜時發生錯誤。', ephemeral: true });
        } else {
          await interaction.editReply({ content: '處理排行榜時發生錯誤。' });
        }
      } catch (_) {}
    }
  }
