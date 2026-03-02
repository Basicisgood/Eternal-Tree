
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { expNeededForNextLevel } = require('../utils/exp');
const { getTitleForLevel } = require('../utils/titles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('查看你的等級、EXP 與稱號'),

  async execute({ interaction, models: { User } }) {
    try {
      // 先 ACK，避免 3 秒超時導致 Unknown interaction (10062)
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const user = await User.findOne({ guildId: interaction.guildId, userId: interaction.user.id });

      if (!user) {
        // 已 defer → 用 editReply 回覆
        return await interaction.editReply({
          content: '尚無資料，先多參與互動吧！'
        });
      }

      const need = expNeededForNextLevel(user.level);
      const title = getTitleForLevel(user.level, user.classLine);

      const embed = new EmbedBuilder()
        .setColor(0x29B6F6)
        .setTitle(`${interaction.user.username} 的個人資料`)
        .addFields(
          { name: '等級', value: `Lv.${user.level}`, inline: true },
          { name: '當前 EXP / 下一級需求', value: `${user.exp} / ${need === Infinity ? 'MAX' : need}`, inline: true },
          { name: '今日 EXP', value: `${user.dailyExpToday || 0} / 200`, inline: true },
          { name: '稱號', value: `${title}`, inline: false },
          { name: '職業線', value: `${user.classLine || '未選擇'}`, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      // 萬一在 defer 前就丟錯，補一次嘗試；若已回覆/超時就吞掉避免再丟 Unknown interaction
      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({
            content: '抱歉，處理你的個人資料時發生錯誤，請稍後再試。',
            flags: MessageFlags.Ephemeral
          });
        } else {
          await interaction.editReply({ content: '抱歉，處理你的個人資料時發生錯誤，請稍後再試。' });
        }
      } catch (_) {}
      console.error('[/profile] error:', err);
    }
  }
};
``
