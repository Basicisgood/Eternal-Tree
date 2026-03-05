// src/commands/battle.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { User } = require('../models/user');

let activeBattle = null;
let battlePool = 0;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('battle')
    .setDescription('向另一名玩家發起剪刀石頭布決鬥')
    .addUserOption(opt =>
      opt.setName('target')
        .setDescription('選擇要挑戰的玩家')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('choice')
        .setDescription('選擇剪刀/石頭/布')
        .setRequired(true)
        .addChoices(
          { name: '剪刀', value: 'scissors' },
          { name: '石頭', value: 'rock' },
          { name: '布', value: 'paper' }
        )),

  async execute({ interaction }) {
    const challenger = interaction.user;
    const target = interaction.options.getUser('target');
    const choice = interaction.options.getString('choice');

    if (challenger.id === target.id) {
      return interaction.reply({ content: '不能挑戰自己！', ephemeral: true });
    }
    if (activeBattle) {
      return interaction.reply({ content: '目前已有一場決鬥正在進行。', ephemeral: true });
    }

    const guildId = interaction.guild.id;
    const challengerDoc = await User.findOne({ guildId, userId: challenger.id });
    if (!challengerDoc || challengerDoc.totalExp < 20) {
      return interaction.reply({ content: '你的總EXP不足以發起決鬥。', ephemeral: true });
    }

    // 🔹 battle 扣除的是 totalExp，不經過 dailyCap
    challengerDoc.totalExp -= 20;
    await challengerDoc.save();
    battlePool += 20;

    activeBattle = {
      challenger,
      target,
      challengerChoice: choice,
      targetChoice: null,
      expires: Date.now() + 2 * 60 * 60 * 1000
    };

    const announceChannel = interaction.guild.channels.cache.find(c => c.name === '任務大廳');
    if (announceChannel) {
      announceChannel.send(`🎺 悠揚的號角聲響起，${challenger} 向 ${target} 發起了決鬥，只有懦夫才會怯戰！`);
    }

    const embed = new EmbedBuilder()
      .setTitle('⚔️ 決鬥挑戰')
      .setDescription(`${challenger} 向你發起了剪刀石頭布決鬥！\n請在 2 小時內選擇是否接受。`)
      .setColor(0xff0000);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('battle_accept').setLabel('接受').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('battle_reject').setLabel('拒絕').setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({ content: `${target}`, embeds: [embed], components: [row] });
  },

  // 匯出狀態給 index.js 使用
  getBattleState: () => ({ activeBattle, battlePool }),
  clearBattle: () => { activeBattle = null; battlePool = 0; }
};
