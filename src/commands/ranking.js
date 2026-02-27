
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
// 你有用到 expNeededForNextLevel 可保留；若未使用也可移除
const { expNeededForNextLevel } = require('../utils/exp');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('伺服器排行榜（依等級、總 EXP）'),
  async execute({ interaction, models: { User } }) {
    // 1) 從資料庫取前 10 名
    const list = await User.find({ guildId: interaction.guildId })
      .sort({ level: -1, totalExp: -1 })
      .limit(10);

    if (!list.length) {
      return interaction.reply({ content: '目前沒有資料。', ephemeral: true });
    }

    // 2) 批次抓取需要的 GuildMember，避免一個一個 fetch
    const ids = list.map(u => u.userId);
    let membersMap = new Map();
    try {
      // 這會回傳 Collection<string, GuildMember>
      const coll = await interaction.guild.members.fetch({ user: ids });
      membersMap = coll;
    } catch (e) {
      // 有些成員可能已離開或取不到，不影響後續輸出
      // console.error('批次抓取成員失敗', e);
    }

    // 3) 產生每一行文字：暱稱優先（displayName），抓不到則回退到 userId
    const lines = list.map((u, idx) => {
      const member = membersMap.get(u.userId);
      // ✅ 使用伺服器內暱稱（沒有暱稱時 displayName 會等於 username）
      const name = member ? member.displayName : u.userId;
      return `#${idx + 1} **${name}** — Lv.${u.level}（總 EXP：${u.totalExp}）`;
    });

    // 4) 回覆 Embed
    const embed = new EmbedBuilder()
      .setColor(0xFF8F00)
      .setTitle('伺服器排行榜 TOP 10')
      .setDescription(lines.join('\n')) // 用 '\n' 串接
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: false });
  }
};
