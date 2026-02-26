const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ComponentType
} = require('discord.js');

/**
 * 工具：隨機抽樣不重複
 */
function sampleSize(arr, n) {
  const copy = [...arr];
  const picked = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    picked.push(copy.splice(idx, 1)[0]);
  }
  return picked;
}

/**
 * 工具：權重亂數
 * weights: { key: weightNumber }
 */
function weightedPick(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of entries) {
    if ((r -= w) <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

/**
 * 稀有度排序（供「大成功」時兩抽取較佳者）
 */
const RARITY_ORDER = { '普通': 1, '稀有': 2, '史詩': 3, '傳說': 4 };

/**
 * 30 個 RPG 趣味事件選項（第二階段會隨機抽 3 個）
 * 每個事件都提供一段故事化的描述，作為 Embed 內容與公告摘要的一部分。
 */
const EVENT_POOL = [
  { id: 'cave_runes',       label: '進入洞穴觀察牆壁刻痕',    flavor: '你點起微光，古老的刻痕隱約發亮……' },
  { id: 'shout_challenge',  label: '大聲呼喊挑戰魔物',        flavor: '回音在山谷間震盪，似乎有東西被引來。' },
  { id: 'magic_conch',      label: '拿出神奇海螺詢問命運',    flavor: '你貼近海螺，彷彿聽見遠方的潮汐。' },
  { id: 'stick_probe',      label: '用樹枝輕敲地面試探陷阱',  flavor: '咔嗒一聲，地面傳來空洞的回應。' },
  { id: 'slime_friend',     label: '才坐下就有史萊姆靠近',    flavor: '黏糊糊地扭動著，對你充滿好奇。' },
  { id: 'follow_birds',     label: '跟著鳥鳴聲前進',          flavor: '鳥鳴時遠時近，像在引導你。' },
  { id: 'chase_light',      label: '對遠方的光點追逐',        flavor: '光點忽明忽滅，像在調皮地引誘。' },
  { id: 'greet_sprite',     label: '嘗試跟森林精靈打招呼',    flavor: '微風吹過，樹葉沙沙，像在回應。' },
  { id: 'weird_nut',        label: '拾起地上的奇怪樹果',      flavor: '散著淡淡清香，表皮有細小紋路。' },
  { id: 'moss_stone',       label: '靠近神秘的苔蘚石碑',      flavor: '指尖觸碰那層綠意，一陣冰涼。' },
  { id: 'ruin_bell',        label: '敲響廢墟鐘塔的殘破鐘錘',  flavor: '低沉鐘鳴像跨越時空。' },
  { id: 'loot_ruins',       label: '在廢墟中翻箱倒櫃',        flavor: '碎木與塵埃之間，或許有意外之喜。' },
  { id: 'goblin_trade',     label: '與哥布林交易可疑物品',    flavor: '牠露出狡黠笑容，手裡的小包裹鼓鼓的。' },
  { id: 'orc_duel',         label: '挑釁獸人守衛',            flavor: '粗重鼻息與戰意在空氣中翻湧。' },
  { id: 'armor_remnant',    label: '觀看古老盔甲遺骸',        flavor: '殘留著微弱魔力的痕跡。' },
  { id: 'air_slash',        label: '嘗試劃開空氣釋放劍氣',    flavor: '你專注一息，劍鋒破空。' },
  { id: 'smoking_camp',     label: '靠近冒煙的營火',          flavor: '炭火發出細小的噼啪聲。' },
  { id: 'magic_circle',     label: '踩上古代魔法陣',          flavor: '符文微微浮現，一股力量湧起。' },
  { id: 'wish_ribbon',      label: '將布條綁在樹上祈願',      flavor: '布條隨風擺動，像在答覆。' },
  { id: 'throw_stone',      label: '遠距離丟石頭探查動靜',    flavor: '嘭的一聲，某處似乎被驚動了。' },
  { id: 'dusty_door',       label: '推開布滿灰塵的地下門',    flavor: '沉重門軸嘎吱作響。' },
  { id: 'broken_statue',    label: '對著斷裂的雕像祈禱',      flavor: '你閉上雙眼，心神微動。' },
  { id: 'loose_brick',      label: '踢開鬆動的石磚',          flavor: '碎屑散落，露出一個小洞。' },
  { id: 'wall_symbols',     label: '調查牆上的奇怪符號',      flavor: '紋樣似乎能拼成某種圖案。' },
  { id: 'chandelier',       label: '撥動古董吊燈',            flavor: '燭台輕輕晃動，塵埃簌簌而下。' },
  { id: 'summon_fire',      label: '嘗試召喚火元素',          flavor: '手心逐漸溫熱，光點閃爍。' },
  { id: 'abyss_pebble',     label: '對著深淵丟下一顆石頭',    flavor: '滴答——回音不知從何處傳來。' },
  { id: 'mysterious_pool',  label: '把手伸入神祕水池',        flavor: '水波紋擴散，冰涼刺骨。' },
  { id: 'blow_dust',        label: '用力吹掉地板粉塵',        flavor: '塵土飛揚，露出隱約的線條。' },
  { id: 'seal_poem',        label: '在封印石門前吟誦古詩',  flavor: '低吟間，似有共鳴回應。' },
];

/**
 * 冒險主題（第一階段）
 */
const ADVENTURE_CONFIG = {
  goblin:  { name: '討伐哥布林',      color: '#3BA55C', outcome: { success: 0.6, jackpot: 0.1, nothing: 0.3 } },
  phoenix: { name: '尋找不死鳥羽毛',  color: '#E67E22', outcome: { success: 0.55, jackpot: 0.15, nothing: 0.30 } },
  slime:   { name: '討伐史萊姆',      color: '#00C2FF', outcome: { success: 0.60, jackpot: 0.10, nothing: 0.30 } },
  orc:     { name: '討伐獸人',        color: '#CE3B3B', outcome: { success: 0.55, jackpot: 0.15, nothing: 0.30 } },
  dungeon: { name: '地下城探險',      color: '#8E44AD', outcome: { success: 0.50, jackpot: 0.15, nothing: 0.35 } },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('adventure')
    .setDescription('達到當日滿分（200 EXP）後可進行多階段冒險（三選一事件）'),

  async execute({ interaction, models: { User, GuildConfig }, utils: { drawFromLootTable, LOGIN_LOOT_TABLE, sendToAnnounce } }) {
    const guildId = interaction.guildId;
    const cfg = await GuildConfig.findOne({ guildId });

    // 取得或建立玩家
    const user = await User.findOneAndUpdate(
      { guildId, userId: interaction.user.id },
      { $setOnInsert: { level: 1, exp: 0, dailyExpToday: 0, inventory: [] } },
      { new: true, upsert: true }
    );

    // 每日 EXP 滿分檢查
    const dailyCap = cfg?.dailyCap ?? 200;
    if ((user.dailyExpToday || 0) < dailyCap) {
      return interaction.reply({
        content: `你今日活躍度不足（${user.dailyExpToday || 0}/${dailyCap} EXP）。達到滿分後再來！`,
        ephemeral: true
      });
    }

    // 每日一次檢查（按伺服器時區）
    const tz = cfg?.timezone || 'Asia/Hong_Kong';
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
    const used = user.adventureUsedAt
      ? user.adventureUsedAt.toLocaleDateString('en-CA', { timeZone: tz })
      : null;
    if (used === today) {
      return interaction.reply({ content: '你今天已冒險過了，明天再來！', ephemeral: true });
    }

    // 第 1 階段：選擇冒險主題
    const step1Menu = new StringSelectMenuBuilder()
      .setCustomId(`adv_step1_${interaction.id}`)
      .setPlaceholder('選擇今日的冒險主題')
      .addOptions([
        { label: ADVENTURE_CONFIG.goblin.name,  value: 'goblin',  description: '簡單的戰鬥，掉落基本素材。' },
        { label: ADVENTURE_CONFIG.phoenix.name, value: 'phoenix', description: '難度較高，掉落珍貴素材。' },
        { label: ADVENTURE_CONFIG.slime.name,   value: 'slime',   description: '中等難度，掉落濃縮史萊姆液。' },
        { label: ADVENTURE_CONFIG.orc.name,     value: 'orc',     description: '高戰力敵人，可能獲得武器部件。' },
        { label: ADVENTURE_CONFIG.dungeon.name, value: 'dungeon', description: '最高難度，多種隨機事件。' },
      ]);

    const step1Row = new ActionRowBuilder().addComponents(step1Menu);
    const step1Embed = new EmbedBuilder()
      .setTitle('🗺️ 多階段冒險開始！')
      .setDescription('**第 1 步：** 請先選擇今日的冒險主題。')
      .setColor('#00A8FF')
      .setTimestamp();

    await interaction.reply({ embeds: [step1Embed], components: [step1Row], ephemeral: true });

    const replyMsg = await interaction.fetchReply();

    const step1Collector = replyMsg.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 30_000,
      filter: i => i.customId === `adv_step1_${interaction.id}` && i.user.id === interaction.user.id,
      max: 1
    });

    step1Collector.on('end', async (collected) => {
      if (collected.size === 0) {
        // 超時處理：停用元件
        const disabledRow = new ActionRowBuilder().addComponents(step1Menu.setDisabled(true));
        return replyMsg.edit({
          embeds: [EmbedBuilder.from(step1Embed).setFooter({ text: '操作逾時，請重新使用 /adventure。' })],
          components: [disabledRow]
        }).catch(() => {});
      }
    });

    step1Collector.on('collect', async (i) => {
      const advKey = i.values[0];
      const adv = ADVENTURE_CONFIG[advKey];

      // 第 2 階段：從 30 個事件中抽 3 個讓玩家三選一
      const options3 = sampleSize(EVENT_POOL, 3);

      const step2Menu = new StringSelectMenuBuilder()
        .setCustomId(`adv_step2_${interaction.id}`)
        .setPlaceholder(`選擇你的行動（${adv.name}）`)
        .addOptions(options3.map((opt, idx) => ({
          label: `${String.fromCharCode(65 + idx)}. ${opt.label}`,
          value: opt.id,
          description: opt.flavor.slice(0, 80)
        })));

      const step2Row = new ActionRowBuilder().addComponents(step2Menu);
      const step2Embed = new EmbedBuilder()
        .setTitle(`⚔️ ${adv.name}`)
        .setColor(adv.color)
        .setDescription([
          '**第 2 步：** 請在以下三個選項中選擇其一：',
          '',
          options3.map((opt, idx) => `**${String.fromCharCode(65 + idx)}. ${opt.label}**\n> ${opt.flavor}`).join('\n\n')
        ].join('\n'))
        .setTimestamp();

      await i.update({ embeds: [step2Embed], components: [step2Row] });

      // 針對第二階段建立收集器
      const step2Collector = replyMsg.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 30_000,
        filter: j => j.customId === `adv_step2_${interaction.id}` && j.user.id === interaction.user.id,
        max: 1
      });

      step2Collector.on('end', async (collected) => {
        if (collected.size === 0) {
          const disabledRow = new ActionRowBuilder().addComponents(step2Menu.setDisabled(true));
          return replyMsg.edit({
            embeds: [EmbedBuilder.from(step2Embed).setFooter({ text: '操作逾時，請重新使用 /adventure。' })],
            components: [disabledRow]
          }).catch(() => {});
        }
      });

      step2Collector.on('collect', async (j) => {
        const choiceId = j.values[0];
        const chosen = options3.find(o => o.id === choiceId);

        // 決定結果（成功 / 大成功 / 空手）
        // 可依不同主題微調機率（已在 ADVENTURE_CONFIG.outcome 設定）
        const outcomeKey = weightedPick(adv.outcome); // 'success' | 'jackpot' | 'nothing'

        let resultTitle = '';
        let resultDesc = '';
        let resultColor = adv.color;
        let loot = null;

        // 一律計為「今天已冒險過」——無論有沒有獲得物品
        user.adventureUsedAt = new Date();

        if (outcomeKey === 'nothing') {
          // 空手而回
          resultTitle = `😢 空手而回：${adv.name}`;
          resultDesc = [
            `你選擇了「**${chosen.label}**」。`,
            '你探索了許久，但似乎運氣不太好……',
            '什麼也沒找到，只好垂頭喪氣地回到村莊了。',
            '',
            '💡 小提示：你可以點「📣 全頻通告」分享你今天做了什麼任務、遇到了什麼結果，讓大家給你加油！'
          ].join('\n');
          resultColor = '#95A5A6';
          await user.save();
        } else {
          // 成功 / 大成功：抽戰利品
          if (outcomeKey === 'jackpot') {
            // 兩抽取較佳
            const a = drawFromLootTable(LOGIN_LOOT_TABLE);
            const b = drawFromLootTable(LOGIN_LOOT_TABLE);
            loot = (RARITY_ORDER[a.rarity] >= RARITY_ORDER[b.rarity]) ? a : b;
            resultTitle = `🏆 大成功：${adv.name}`;
          } else {
            loot = drawFromLootTable(LOGIN_LOOT_TABLE);
            resultTitle = `🎉 成功：${adv.name}`;
          }

          // 寫入背包
          user.inventory.push({
            rarity: loot.rarity,
            name: loot.name,
            obtainedAt: new Date(),
            adventureType: advKey,
            choiceId
          });
          await user.save();

          resultDesc = [
            `你選擇了「**${chosen.label}**」。`,
            chosen.flavor,
            '',
            `**🎁 獲得戰利品：** ⭐ **${loot.rarity}** — ${loot.name}`,
            '',
            '若想讓大家一起見證你的冒險成果，可點下方「📣 全頻通告」！'
          ].join('\n');
        }

        // 結果 Embed
        const resultEmbed = new EmbedBuilder()
          .setTitle(resultTitle)
          .setDescription(resultDesc)
          .setColor(resultColor)
          .setThumbnail(j.user.displayAvatarURL())
          .setTimestamp();

        // 稀有自動公告（沿用你原本的規則）
        if (loot && (loot.rarity === '史詩' || loot.rarity === '傳說')) {
          await sendToAnnounce(
            interaction.guild,
            `🌟 ${interaction.user} 在 **/adventure**（${adv.name}）選擇「${chosen.label}」，抽中 **${loot.rarity}**：${loot.name}！`
          ).catch(() => {});
        }

        // 提供是否「全頻通告」的按鈕（任何結果都可宣告）
        const btnAnnounce = new ButtonBuilder()
          .setCustomId(`adv_announce_${interaction.id}`)
          .setLabel('📣 全頻通告')
          .setStyle(ButtonStyle.Primary);
        const btnClose = new ButtonBuilder()
          .setCustomId(`adv_close_${interaction.id}`)
          .setLabel('關閉')
          .setStyle(ButtonStyle.Secondary);
        const btnRow = new ActionRowBuilder().addComponents(btnAnnounce, btnClose);

        await j.update({ embeds: [resultEmbed], components: [btnRow] });

        // 等待按鈕互動
        const btnCollector = replyMsg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 30_000,
          filter: x =>
            (x.customId === `adv_announce_${interaction.id}` || x.customId === `adv_close_${interaction.id}`) &&
            x.user.id === interaction.user.id,
          max: 1
        });

        btnCollector.on('end', async (bc) => {
          if (bc.size === 0) {
            // 超時 → 停用按鈕
            await replyMsg.edit({
              embeds: [EmbedBuilder.from(resultEmbed).setFooter({ text: '互動已結束。' })],
              components: [new ActionRowBuilder().addComponents(btnAnnounce.setDisabled(true), btnClose.setDisabled(true))]
            }).catch(() => {});
          }
        });

        btnCollector.on('collect', async (btn) => {
          if (btn.customId === `adv_close_${interaction.id}`) {
            return btn.update({
              embeds: [EmbedBuilder.from(resultEmbed).setFooter({ text: '互動已關閉。' })],
              components: [new ActionRowBuilder().addComponents(btnAnnounce.setDisabled(true), btnClose.setDisabled(true))]
            });
          }

          // 使用者選擇公告
          const summary = loot
            ? `成功獲得 **${loot.rarity}：${loot.name}**！`
            : '雖然什麼都沒有得到，但勇氣可嘉！';
          const announceText =
            `📣 ${interaction.user} 進行了 **${adv.name}**，選擇「${chosen.label}」，${summary}` +
            (loot ? ' 🎉' : ' 💪');

          await sendToAnnounce(interaction.guild, announceText).catch(() => {});
          await btn.update({
            embeds: [EmbedBuilder.from(resultEmbed).setFooter({ text: '✅ 已通告至全頻。' })],
            components: [new ActionRowBuilder().addComponents(btnAnnounce.setDisabled(true), btnClose.setDisabled(true))]
          });
        });
      });
    });
  }
};
