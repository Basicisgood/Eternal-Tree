
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('領取每日登入獎勵（抽取道具）'),
  async execute({ interaction, models: { User, GuildConfig }, utils: { drawFromLootTable, LOGIN_LOOT_TABLE, sendToAnnounce } }) {
    const guildId = interaction.guildId;
    const user = await User.findOneAndUpdate(
      { guildId, userId: interaction.user.id },
      { $setOnInsert: { level: 1, exp: 0, dailyExpToday: 0 } },
      { new: true, upsert: true }
    );

    const cfg = await GuildConfig.findOne({ guildId });
    const today = new Date().toLocaleDateString('en-CA', { timeZone: cfg?.timezone || 'Asia/Hong_Kong' });
    const claimed = user.dailyClaimedAt ? user.dailyClaimedAt.toLocaleDateString('en-CA', { timeZone: cfg?.timezone || 'Asia/Hong_Kong' }) : null;

    if (claimed === today) {
      return interaction.reply({ content: '你今天已領取過登入獎勵。', ephemeral: true });
    }

    const loot = drawFromLootTable(LOGIN_LOOT_TABLE);
    user.inventory.push({ rarity: loot.rarity, name: loot.name, obtainedAt: new Date() });
    user.dailyClaimedAt = new Date();
    await user.save();

    await interaction.reply({ content: `🎁 你獲得了 **${loot.rarity}**：${loot.name}`, ephemeral: true });

    if ((loot.rarity === '史詩' || loot.rarity === '傳說')) {
      await sendToAnnounce(interaction.guild, `🎉 ${interaction.user} 在 **/daily** 抽中 **${loot.rarity}**：${loot.name}！`);
    }
  }
};
