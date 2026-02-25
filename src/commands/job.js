
const { SlashCommandBuilder } = require('discord.js');
const { getTitleForLevel } = require('../utils/titles');
const { onLevelMilestoneUpdateRoles } = require('../utils/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('job')
    .setDescription('職業/稱號相關')
    .addSubcommand(sc => sc
      .setName('current')
      .setDescription('查看目前職業線與當前稱號'))
    .addSubcommand(sc => sc
      .setName('choose')
      .setDescription('在 Lv20（含）後選擇職業線')
      .addStringOption(opt => opt
        .setName('line')
        .setDescription('選擇你的職業線')
        .setRequired(true)
        .addChoices(
          { name: '戰士系', value: 'warrior' },
          { name: '法師系', value: 'mage' },
          { name: '獵手系', value: 'hunter' },
          { name: '刺客系', value: 'assassin' },
          { name: '蒙面超人系', value: 'masked' }
        )
      )
    ),
  async execute({ interaction, models: { User } }) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const user = await User.findOneAndUpdate(
      { guildId, userId: interaction.user.id },
      { $setOnInsert: { level: 1, exp: 0, dailyExpToday: 0 } },
      { new: true, upsert: true }
    );

    if (sub === 'current') {
      const title = getTitleForLevel(user.level, user.classLine);
      return interaction.reply({ content: `職業線：${user.classLine || '未選擇'}
稱號：${title}`, ephemeral: true });
    }

    if (sub === 'choose') {
      if (user.level < 20) {
        return interaction.reply({ content: '需達到 **Lv20** 才能選擇職業線。', ephemeral: true });
      }
      const line = interaction.options.getString('line');
      user.classLine = line;
      await user.save();

      const title = getTitleForLevel(user.level, user.classLine);
      await onLevelMilestoneUpdateRoles(interaction.guild, interaction.member, title);

      return interaction.reply({ content: `已選擇職業線：**${line}**；目前稱號：**${title}**`, ephemeral: true });
    }
  }
};
