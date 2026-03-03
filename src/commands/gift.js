
// src/commands/gift.js
const { SlashCommandBuilder } = require('discord.js');
const { addExpWithDailyCap } = require('../utils/exp');

// 50 個 RPG 風格事件（送禮時會隨機抽 1 條）
const GIFT_EVENTS = [
  '你在古樹樹洞發現一張泛黃的祈願紙條，微風把祝福帶向遠方。',
  '晨霧未散，林間鈴蘭輕響，像為旅者加持。',
  '樹梢上的精靈丟下一片會發光的葉子，落在他肩頭。',
  '溪水倒映的月輪在白天閃爍，似乎在低語命運的方向。',
  '遠方傳來獸角的迴鳴，卻變作溫柔的守護。',
  '古碑上的符紋忽然淡亮，像在回應一個善意的心願。',
  '你拾起一枚覆滿苔蘚的徽章，它在他手中微微發熱。',
  '風捲起落葉形成漩渦，拂去旅途的塵埃。',
  '一根青藤輕輕纏住小腿，隨即鬆開，像在行禮。',
  '林間的鈴蘭小鹿停下腳步，朝他點了點頭。',
  '你把一束薄荷綁在他的背包上，清涼的氣息一路相隨。',
  '石徑旁的風鈴草齊聲鳴動，奏出啟程的前奏。',
  '你在營火邊寫下一句鼓勵，火星帶走了話語。',
  '老樹半空長出新芽，尖端凝著一顆淚珠似的露水。',
  '你從行囊取出護身符替他拂去陰影。',
  '環形蘑菇圈亮起微光，像在邀請他跳一支舞。',
  '你替他在指尖畫下一道符，像星光掠過。',
  '樹冠落下一根羽毛，輕輕停在他髮間。',
  '晨光穿過樹縫形成光梯，正好落在他的腳尖。',
  '你把一張地圖的缺角補齊了，路徑變得清晰。',
  '遠處鐘塔敲響一次，回聲為他定下幸運的節拍。',
  '你在水面擲下小石，七圈漣漪化成七道祝福。',
  '遠風帶來花粉，落在他掌心，像微小的星塵。',
  '你把自己的護符繩結打在他的手腕上。',
  '一隻發光的螢火蟲停在他肩頭，亮起方向。',
  '你替他擦亮腰間的銅鈴，叮噹一聲很清脆。',
  '森林的影子向後退去，為他讓開一條路。',
  '你把一沓手寫的冒險訣竅塞進他的口袋。',
  '苔階邊的石像眨了眨眼，像是默許了盟約。',
  '你將溪邊的白石拋給他，石上浮現守護的紋理。',
  '古井內映出他的身影，周圍多了光點環繞。',
  '你為他在樹皮上刻下符號，指引下一段旅程。',
  '一陣松香與泥土味襲來，像是大地的擁抱。',
  '你把一枚乾燥的楓葉夾進他手札的扉頁。',
  '枝頭的鳥兒改唱他最喜歡的調子。',
  '你在路標上貼了一張幸運符，方向更加篤定。',
  '古道旁的燈籠忽明忽暗，最後穩穩亮起。',
  '你替他整了整披風，塵土啪的一聲散開。',
  '一串足跡在泥地上自動延伸，為他標出捷徑。',
  '你把火漆印章按在他封好的信上，烙下光輝。',
  '松果在腳邊彈了三下，像在保證旅途順遂。',
  '你將口袋裡最後一塊糖分他一半。',
  '遠處傳來悠長的笛聲，替他壯膽。',
  '你把一盞小小的魂燈掛在他腰間。',
  '老樹樹心砰然一震，像在為他祈福。',
  '你在他的靴跟釘上新的鐵片，腳步更加鏗鏘。',
  '薄霧中浮現一條銀線，牽引他向前。',
  '你將短暫的迷茫揉成紙團丟進火堆。',
  '落日餘暉把他的影子染成金色。',
  '你輕敲古鐘，為他敲定一份好運。'
];

function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gift')
    .setDescription('今天挑一位用戶，贈送 20 EXP（每天限一次）')
    .addUserOption(opt =>
      opt.setName('target')
        .setDescription('要贈送 EXP 的對象')
        .setRequired(true)
    ),

  /**
   * @param {{ interaction: import('discord.js').ChatInputCommandInteraction, models: any }} ctx
   */
  async execute({ interaction, models: { User, GuildConfig } }) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId;
    const donorId = interaction.user.id;
    const targetUser = interaction.options.getUser('target', true);

    // 基本防呆
    if (!targetUser || targetUser.bot) {
      return interaction.editReply('無效的對象（不可贈送給機器人）。');
    }
    if (targetUser.id === donorId) {
      return interaction.editReply('不能把禮物送給自己喔！');
    }

    // 讀取設定
    const cfg = await GuildConfig.findOne({ guildId }).lean().catch(() => null);
    const tz = cfg?.timezone || 'Asia/Hong_Kong';
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: tz });

    // 取得/建立捐贈者與受贈者
    const donor = await User.findOneAndUpdate(
      { guildId, userId: donorId },
      { $setOnInsert: { level: 1, exp: 0, totalExp: 0, dailyExpToday: 0, inventory: [], giftGivenAt: null } },
      { new: true, upsert: true }
    );
    const receiver = await User.findOneAndUpdate(
      { guildId, userId: targetUser.id },
      { $setOnInsert: { level: 1, exp: 0, totalExp: 0, dailyExpToday: 0, inventory: [] } },
      { new: true, upsert: true }
    );

    // 每日一次限制（依伺服器時區）
    const donorUsed = donor.giftGivenAt
      ? donor.giftGivenAt.toLocaleDateString('en-CA', { timeZone: tz })
      : null;
    if (donorUsed === todayStr) {
      return interaction.editReply('你今天已經贈送過一次 EXP 了，明天再來吧！');
    }

    // 結算：受贈者 +20 EXP（套用每日上限）
    const { gained } = await addExpWithDailyCap(receiver, cfg || { dailyCap: 200 }, 20);
    await receiver.save();

    // 標記捐贈者今日已使用
    donor.giftGivenAt = new Date();
    await donor.save();

    // 在頻道公告
    const eventText = pickOne(GIFT_EVENTS);
    const gainedText = gained > 0 ? `獲得了 **${gained}EXP**` : '今日已達上限，未能獲得額外 EXP';
    const announce = `🌳 ${eventText}\n→ ${targetUser} ${gainedText}。\n**一切都是來自世界樹的安排。**`;

    try {
      await interaction.channel.send({ content: announce });
    } catch (_) {
      // 若當前頻道不可發言，則忽略公告，但不影響回覆
    }

    // 回覆贈送者（ephemeral）
    await interaction.editReply(`已將禮物送給 ${targetUser}！${gained > 0 ? `（+${gained} EXP）` : '（對方今日已達上限）'}`);
  },
};
