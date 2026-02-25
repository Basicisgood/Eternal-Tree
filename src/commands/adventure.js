
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('adventure')
    .setDescription('達到當日滿分（200 EXP）後可進行冒險抽獎'),
  async execute({ interaction, models: { User, GuildConfig }, utils: { drawFromLootTable, LOGIN_LOOT_TABLE, sendToAnnounce } }) {
    const guildId = interaction.guildId;
    const cfg = await GuildConfig.findOne({ guildId });
    const user = await User.findOneAndUpdate(
      { guildId, userId: interaction.user.id },
      { $setOnInsert: { level: 1, exp: 0, dailyExpToday: 0 } },
      { new: true, upsert: true }
    );

    if ((user.dailyExpToday || 0) < (cfg?.dailyCap || 200)) {
      return interaction.reply({ content: `你今日活躍度不足（${user.dailyExpToday || 0}/${cfg?.dailyCap || 200} EXP）。達到滿分後再來！`, ephemeral: true });
    }

    const today = new Date().toLocaleDateString('en-CA', { timeZone: cfg?.timezone || 'Asia/Hong_Kong' });
    const used = user.adventureUsedAt ? user.adventureUsedAt.toLocaleDateString('en-CA', { timeZone: cfg?.timezone || 'Asia/Hong_Kong' }) : null;
    if (used === today) {
      return interaction.reply({ content: '你今天已冒險過了，明天再來！', ephemeral: true });
    }

    const loot = drawFromLootTable(LOGIN_LOOT_TABLE);
    user.inventory.push({ rarity: loot.rarity, name: loot.name, obtainedAt: new Date() });
    user.adventureUsedAt = new Date();
    await user.save();

    await interaction.reply({ content: `🗺️ 冒險獎勵：**${loot.rarity}** ${loot.name}`, ephemeral: true });

    if ((loot.rarity === '史詩' || loot.rarity === '傳說')) {
      await sendToAnnounce(interaction.guild, `🌟 ${interaction.user} 在 **/adventure** 抽中 **${loot.rarity}**：${loot.name}！`);
    }
  }
};
