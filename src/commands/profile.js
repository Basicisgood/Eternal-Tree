
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { expNeededForNextLevel } = require('../utils/exp');
const { getTitleForLevel } = require('../utils/titles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('查看你的等級、EXP 與稱號'),
  async execute({ interaction, models: { User } }) {
    const user = await User.findOne({ guildId: interaction.guildId, userId: interaction.user.id });
    if (!user) return interaction.reply({ content: '尚無資料，先多參與互動吧！', ephemeral: true });

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
        { name: '職業線', value: `${user.classLine || '未選擇'}`, inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
