

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('查看你的道具（最近 20 筆）'),
  async execute({ interaction, models: { User } }) {
    const user = await User.findOne({ guildId: interaction.guildId, userId: interaction.user.id });
    if (!user || !user.inventory || user.inventory.length === 0) {
      return interaction.reply({ content: '目前沒有道具。', ephemeral: true });
    }

    const latest = user.inventory.slice(-20).reverse();
    const lines = latest.map(i => `• [${i.rarity}] ${i.name}`);

    const embed = new EmbedBuilder()
      .setColor(0x8E24AA)
      .setTitle(`${interaction.user.username} 的背包（最近 20 筆）`)
      // 這一行是本次錯誤的關鍵修正：一定要用 '\n' 作為換行
      .setDescription(lines.join('\n'))
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
