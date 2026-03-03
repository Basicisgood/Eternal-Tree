
// src/commands/daily.js
const { SlashCommandBuilder } = require('discord.js');

// === utils：請確認你的實際檔名，若不是 loot.js，改這行路徑即可 ===
let drawFromLootTable, LOGIN_LOOT_TABLE;
try {
  ({ drawFromLootTable, LOGIN_LOOT_TABLE } = require('../utils/loot'));
} catch (e) {
  console.warn('[DAILY] utils/loot 載入失敗或不存在，將以無掉落模式運作：', e?.message || e);
  drawFromLootTable = null;
  LOGIN_LOOT_TABLE = null;
}

/* --------------------------------
 * 安全公告：優先用 GuildConfig.announceChannelId，否則退回 systemChannelId
 * -------------------------------- */
async function safeSendToAnnounce(guild, cfg, message) {
  try {
    const chId = cfg?.announceChannelId ?? guild?.systemChannelId;
    if (!guild || !chId) return;
    const ch = await guild.channels.fetch(chId).catch(() => null);
    if (!ch || !ch.isTextBased()) return;
    await ch.send({ content: message });
  } catch {
    // 靜默忽略，不讓指令失敗
  }
}

// 小型除錯 logger（以玩家為單位記錄）
const dbg = (uid) => (...args) => console.log(`[CMD:daily][u=${uid}]`, ...args);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('領取每日登入獎勵（抽取道具）'),

  /**
   * @param {{ interaction: import('discord.js').ChatInputCommandInteraction, client: import('discord.js').Client, models: any }} ctx
   */
  async execute({ interaction, client, models }) {
    const User = models?.User;
    const GuildConfig = models?.GuildConfig;
    const uid = interaction.user?.id;
    const log = dbg(uid);

    try {
      await interaction.deferReply({ ephemeral: true });

      // 1) 模型就緒檢查
      if (!User || !GuildConfig) {
        log('models not ready');
        await interaction.editReply('系統尚未就緒（資料模型未載入）。請稍後再試。');
        return;
      }

      const guildId = interaction.guildId;
      const cfg = await GuildConfig.findOne({ guildId }).lean().catch((e) => {
        log('GuildConfig find error:', e?.message || e);
        return null;
      });

      const tz = cfg?.timezone || 'Asia/Hong_Kong';
      const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
      log('ctx', { guildId, tz, today });

      // 2) 取得或建立玩家（確保 inventory 是陣列，userId 存字串）
      let user = await User.findOne({ guildId, userId: String(uid) }).catch((e) => null);
      if (!user) {
        log('user not found → creating');
        user = await User.create({
          guildId,
          userId: String(uid),
          level: 1,
          exp: 0,
          dailyExpToday: 0,
          inventory: [],
        }).catch((e) => {
          log('User.create error:', e?.code || e?.name, e?.message || e);
          throw e;
        });
      } else {
        // 舊資料補強
        if (!Array.isArray(user.inventory)) {
          log('patch: inventory was not array → reset []');
          user.inventory = [];
        }
        if (typeof user.userId !== 'string') {
          log('patch: userId not string → toString()');
          user.userId = String(user.userId);
        }
      }

      // 3) 每日一次檢查（按伺服器時區）
      const claimed = user.dailyClaimedAt
        ? user.dailyClaimedAt.toLocaleDateString('en-CA', { timeZone: tz })
        : null;
      log('claimed check', { claimed, today });

      if (claimed === today) {
        await interaction.editReply('你今天已領取過登入獎勵。');
        return;
      }

      // 4) 抽戰利品（缺 utils/loot → 無掉落但仍算成功簽到）
      let loot = null;
      if (typeof drawFromLootTable === 'function' && LOGIN_LOOT_TABLE) {
        try {
          loot = drawFromLootTable(LOGIN_LOOT_TABLE);
          log('loot', loot);
        } catch (e) {
          log('drawFromLootTable error:', e?.message || e);
          loot = null;
        }
      } else {
        log('loot disabled (no utils/loot)');
      }

      if (loot) {
        user.inventory.push({
          rarity: loot.rarity,
          name: loot.name,
          obtainedAt: new Date(),
          source: 'daily',
        });
      }
      user.dailyClaimedAt = new Date();

      // 5) 儲存（明確捕捉常見錯誤）
      try {
        await user.save();
      } catch (e) {
        // 常見：E11000 duplicate key (索引/型別不一致造成二次建立)
        if (e?.code === 11000 || /E11000/i.test(e?.message || '')) {
          log('save duplicate key; fallback to findOneAndUpdate');
          await User.findOneAndUpdate(
            { guildId, userId: String(uid) },
            {
              $set: {
                dailyClaimedAt: user.dailyClaimedAt,
              },
              ...(loot
                ? {
                    $push: {
                      inventory: {
                        rarity: loot.rarity,
                        name: loot.name,
                        obtainedAt: new Date(),
                        source: 'daily',
                      },
                    },
                  }
                : {}),
            },
            { upsert: true, new: true }
          ).catch((err2) => {
            log('fallback upsert failed:', err2?.message || err2);
            throw err2;
          });
        } else {
          log('user.save error:', e?.name, e?.message || e);
          throw e;
        }
      }

      // 6) 回覆玩家
      const replyText = loot
        ? `🎁 你獲得了 **${loot.rarity}**：${loot.name}`
        : '✅ 已完成今日簽到。（目前未啟用掉落表或暫無獎勵）';
      await interaction.editReply(replyText).catch((e) => log('editReply error:', e?.message || e));

      // 7) 稀有自動公告（史詩 / 傳說）
      if (loot && (loot.rarity === '史詩' || loot.rarity === '傳說')) {
        await safeSendToAnnounce(
          interaction.guild,
          cfg,
          `🎉 ${interaction.user} 在 **/daily** 抽中 **${loot.rarity}**：${loot.name}！`
        );
      }
    } catch (err) {
      console.error('[CMD ERROR] /daily', err);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '執行 /daily 時發生錯誤，請稍後再試。', ephemeral: true });
        } else {
          await interaction.editReply('執行 /daily 時發生錯誤，請稍後再試。');
        }
      } catch {}
    }
  },
};
