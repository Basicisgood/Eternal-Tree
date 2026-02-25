
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { expNeededForNextLevel } = require('../utils/exp');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('伺服器排行榜（依等級、總 EXP）'),
  async execute({ interaction, models: { User } }) {
    const list = await User.find({ guildId: interaction.guildId }).sort({ level: -1, totalExp: -1 }).limit(10);
    if (!list.length) return interaction.reply({ content: '目前沒有資料。', ephemeral: true });

    const lines = await Promise.all(list.map(async (u, idx) => {
      const member = await interaction.guild.members.fetch(u.userId).catch(()=>null);
      const name = member ? member.user.username : u.userId;
      return `#${idx+1} **${name}** — Lv.${u.level}（總 EXP：${u.totalExp}）`;
    }));

    const embed = new EmbedBuilder()
      .setColor(0xFF8F00)
      .setTitle('伺服器排行榜 TOP 10')
      .setDescription(lines.join('
'))
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: false });
  }
};
