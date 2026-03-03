
// src/index.js (v6.2 - +Message/Voice EXP award)
require('dotenv').config();

const express = require('express');
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  PermissionFlagsBits,
} = require('discord.js');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const dns = require('dns');
const dnsp = require('dns').promises;

/* =========================
 * BOOT BANNER
 * ========================= */
console.log('===================================================');
console.log('=  ETERNAL-TREE BOT :: INDEX v6.2 (RecLoad+EXP)    =');
console.log('=  If you do NOT see this line, code not updated   =');
console.log('===================================================');

/* =========================
 * NET: IPv4 優先
 * ========================= */
if (typeof dns.setDefaultResultOrder === 'function') {
  try {
    dns.setDefaultResultOrder('ipv4first');
    console.log('[NET] DNS result order set to ipv4first');
  } catch (e) {
    console.warn('[NET] setDefaultResultOrder not applied:', e?.message || e);
  }
}

/* =========================
 * ENV
 * ========================= */
const RAW_TOKEN = process.env.DISCORD_TOKEN || '';
const DISCORD_TOKEN = RAW_TOKEN.trim();
const GUILD_ID = process.env.GUILD_ID || '';
const MONGODB_URI = process.env.MONGODB_URI || '';
const PORT = process.env.PORT || 10000;
const STARTUP_PREFLIGHT = process.env.STARTUP_PREFLIGHT !== '0';
const REGISTER_COMMANDS = process.env.REGISTER_COMMANDS === '1';

console.log('[ENV CHECK]', {
  token: DISCORD_TOKEN ? 'SET' : 'MISSING',
  tokenLen: DISCORD_TOKEN?.length ?? 0,
  guild: GUILD_ID || '(none)',
  hasMongo: !!MONGODB_URI,
  STARTUP_PREFLIGHT,
  REGISTER_COMMANDS,
});

/* =========================
 * Express（健康檢查）
 * ========================= */
const app = express();
app.get('/health', (_req, res) => res.status(200).send('OK'));
app.get('/', (_req, res) => res.status(200).send('Discord Bot is running'));
app.listen(PORT, () => console.log(`[HTTP] listening on :${PORT}`));

/* =========================
 * Discord Client（單一實例）
 * ========================= */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,   // 需在 Dev Portal 勾 SERVER MEMBERS
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // 需在 Dev Portal 勾 MESSAGE CONTENT
    GatewayIntentBits.GuildVoiceStates, // ← 語音 EXP 需要
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
});

client.commands = new Collection();

/* =========================
 * 動態載入指令（✅遞迴 + ✅多種匯出型態容錯 + ✅詳盡日誌）
 * ========================= */
const commandsDir = path.join(__dirname, 'commands');

function walk(dir) {
  const list = [];
  if (!fs.existsSync(dir)) return list;
  for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, dirent.name);
    if (dirent.isDirectory()) list.push(...walk(full));
    else if (dirent.isFile() && dirent.name.endsWith('.js')) list.push(full);
  }
  return list;
}

(function loadCommands() {
  const files = walk(commandsDir);
  const loaded = [];
  const skipped = [];
  const nameSeen = new Map();

  for (const file of files) {
    let mod;
    try {
      mod = require(file);
      // ESM default 兼容
      if (mod && mod.default) mod = mod.default;
    } catch (e) {
      skipped.push({ file, reason: `require failed: ${e?.message || e}` });
      continue;
    }

    const data = mod?.data;
    const handler = mod?.execute || mod?.run;

    if (!data || typeof data?.name !== 'string') {
      skipped.push({ file, reason: 'missing data or data.name' });
      continue;
    }
    if (typeof handler !== 'function') {
      skipped.push({ file, reason: 'missing execute/run function' });
      continue;
    }

    // 重名偵測
    if (nameSeen.has(data.name)) {
      console.warn(`[COMMAND WARNING] duplicate name "${data.name}" at:\n  - ${nameSeen.get(data.name)}\n  - ${file}\n  (Later one overwrites earlier)`);
    }
    nameSeen.set(data.name, file);

    client.commands.set(data.name, { data, execute: handler });
    loaded.push({ name: data.name, file });
  }

  console.log(`[BOOT] Commands scanned: ${files.length}`);
  console.log(`[BOOT] Commands loaded : ${loaded.length}`);
  if (loaded.length) {
    for (const { name, file } of loaded) {
      console.log(`  - ${name.padEnd(18)} ← ${path.relative(process.cwd(), file)}`);
    }
  }
  if (skipped.length) {
    console.log(`[BOOT] Commands skipped: ${skipped.length}`);
    for (const s of skipped) console.log(`  - ${path.relative(process.cwd(), s.file)} → ${s.reason}`);
  }
})();

/* =========================
 * 安全 Debug（避免外洩 Token）
 * ========================= */
client.on('debug', (m) => {
  if (typeof m === 'string') {
    const lower = m.toLowerCase();
    if (lower.includes('provided token')) return; // 不印 Token
    if (lower.includes('heartbeat')) return;      // 避免心跳淹水
  }
  console.log('[DJS DEBUG]', m);
});
client.on('warn', (m) => console.warn('[DJS WARN]', m));
client.on('error', (e) => console.error('[DJS ERROR]', e));
client.on('shardError', (e) => console.error('[DJS SHARD ERROR]', e));
client.on('shardReady', (id, guilds) => console.log(`[SHARD READY] ${id}`, guilds));
client.on('shardReconnecting', (id) => console.log(`[SHARD RECONNECT] ${id}`));
client.on('shardDisconnect', (event, id) => console.log(`[SHARD DISCONNECT] ${id}`, event));
client.on('rateLimit', (info) => console.warn('[RATE LIMIT]', info));

/* =========================
 * EXP 工具
 * ========================= */
const {
  addExpWithDailyCap,
  canGainMsgExp,
  shouldGrantVoiceExp,
} = require('./utils/exp');

/* =========================
 * Ready
 * ========================= */
let voiceTicker = null;

client.once('ready', async () => {
  console.log(`[READY] Logged in as ${client.user.tag}`);
  console.log('[READY] Intents:', client.options.intents?.toArray?.() ?? 'n/a');
  console.log('[READY] Guild cache size:', client.guilds.cache.size);

  // ---- MongoDB：背景重試，不要退出進程 ----
  if (!MONGODB_URI) {
    console.warn('[MONGO] MONGODB_URI is missing. Bot will run without DB; retry disabled.');
  } else {
    (async function connectMongoWithRetry() {
      let delay = 5000;
      while (true) {
        try {
          await mongoose.connect(MONGODB_URI);
          console.log('[MONGO] Connected');
          break;
        } catch (e) {
          console.error('[MONGO] Failed to connect, will retry:', e?.message || e);
          await sleep(delay);
          delay = Math.min(delay * 2, 60000); // 指數退避，上限 60s
        }
      }
    })().catch(() => {});
  }

  // ---- Guild Slash：受環境變數控制，避免每次啟動都覆寫 ----
  if (!GUILD_ID) {
    console.warn('[SLASH] Skipped: GUILD_ID is missing.');
  } else if (REGISTER_COMMANDS) {
    try {
      const g = await client.guilds.fetch(GUILD_ID);
      console.log('[READY] Target guild fetched:', g?.name, g?.id);

      const data = client.commands.map((c) => c.data.toJSON());
      await g.commands.set(data);
      console.log(`[SLASH] Registered ${data.length} commands to guild ${g.id}`);
    } catch (e) {
      console.error('[SLASH] Register failed. Check bot in guild? GUILD_ID? permissions?', e?.message || e);
    }
  } else {
    console.log('[SLASH] Skipped registering (REGISTER_COMMANDS != 1).');
  }

  // ---- Presence ----
  try {
    await client.user.setPresence({
      activities: [{ name: '/profile /adventure', type: 0 }],
      status: 'online',
    });
    console.log('[READY] Presence set.');
  } catch (e) {
    console.error('[READY] Presence failed:', e?.message || e);
  }

  // ---- 語音 EXP Ticker（每 60 秒掃描一次）----
  if (!voiceTicker) {
    voiceTicker = setInterval(async () => {
      try {
        const { User, GuildConfig } = loadModels();
        for (const [guildId, guild] of client.guilds.cache) {
          const cfg = await GuildConfig.findOne({ guildId }).lean().catch(() => null);
          if (!cfg) continue;

          for (const [, vc] of guild.channels.cache.filter(ch => ch.isVoiceBased())) {
            for (const [, member] of vc.members) {
              if (!member || member.user?.bot) continue;

              const user = await safeFindOrCreateUser(User, guildId, member.id);
              const now = Date.now();

              // 初始化 lastVoiceExpAt（避免重啟後失去基準）
              if (!user.lastVoiceExpAt) {
                user.lastVoiceExpAt = new Date(now);
                await user.save().catch(() => {});
                continue;
              }

              if (shouldGrantVoiceExp(user, now)) {
                const { gained } = await addExpWithDailyCap(user, cfg, 50);
                if (gained > 0) {
                  user.lastVoiceExpAt = new Date(now);
                  await user.save().catch(() => {});
                  await announceVoiceGain(guild, cfg, member, vc, gained);
                }
              }
            }
          }
        }
      } catch (e) {
        console.error('[VOICE TICKER] Error:', e?.message || e);
      }
    }, 60_000);
    console.log('[READY] Voice EXP ticker started (60s).');
  }
});

/* =========================
 * Interaction Handler
 * ========================= */
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand?.()) return;

  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) {
    console.warn(`[INTERACTION] Command not found: /${interaction.commandName}`);
    try {
      return await interaction.reply({ content: '這個指令目前不可用或尚未載入。', ephemeral: true });
    } catch {}
    return;
  }

  try {
    await cmd.execute({ interaction, client, models: loadModels() });
  } catch (err) {
    console.error(`[CMD ERROR] /${interaction.commandName}`, err);
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.reply({ content: '執行指令時發生錯誤，請稍後再試。', ephemeral: true });
      } else {
        await interaction.editReply({ content: '執行指令時發生錯誤，請稍後再試。' });
      }
    } catch {}
  }
});

/* =========================
 * Message EXP（≥5字、每人每 1 分鐘一次 → +20 EXP）
 * ========================= */
client.on('messageCreate', async (msg) => {
  try {
    if (!msg.guild || msg.author.bot) return;
    if (!msg.content || msg.content.trim().length < 5) return;

    const { User, GuildConfig } = loadModels();
    const guildId = msg.guild.id;
    const userId = msg.author.id;

    const cfg = await GuildConfig.findOne({ guildId }).lean().catch(() => null);
    if (!cfg) return;

    const user = await safeFindOrCreateUser(User, guildId, userId);
    const now = Date.now();
    if (!canGainMsgExp(user, now)) return;

    const { gained } = await addExpWithDailyCap(user, cfg, 20);
    if (gained > 0) {
      user.lastMsgExpAt = new Date(now);
      await user.save().catch(() => {});
    }
  } catch (e) {
    console.error('[MSG EXP] Error:', e?.message || e);
  }
});

/* =========================
 * Voice EXP：狀態變化（加入語音時初始化計時點）
 * ========================= */
client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    const member = newState.member || oldState.member;
    if (!member || member.user?.bot) return;

    const joined = !oldState.channelId && !!newState.channelId;
    const moved  = !!oldState.channelId && !!newState.channelId && oldState.channelId !== newState.channelId;

    if (joined || moved) {
      const { User } = loadModels();
      const user = await safeFindOrCreateUser(User, member.guild.id, member.id);
      user.lastVoiceExpAt = new Date(); // 從現在開始計
      await user.save().catch(() => {});
    }
  } catch (e) {
    console.error('[VOICE STATE] Error:', e?.message || e);
  }
});

/* =========================
 * Models Loader
 * ========================= */
function loadModels() {
  const { User } = require('./models/user');
  const { GuildConfig } = require('./models/config');
  return { User, GuildConfig };
}

/* =========================
 * 工具：User 取得/建立 + 公告 + 找頻道
 * ========================= */
async function safeFindOrCreateUser(User, guildId, userId) {
  let user = await User.findOne({ guildId, userId: String(userId) }).catch(() => null);
  if (!user) {
    // 嘗試以 Number 舊資料查找 → 轉回字串
    const uidNum = Number(userId);
    if (Number.isFinite(uidNum)) {
      user = await User.findOne({ guildId, userId: uidNum }).catch(() => null);
      if (user) {
        user.userId = String(userId);
        await user.save().catch(() => {});
      }
    }
  }
  if (!user) {
    user = await User.create({
      guildId,
      userId: String(userId),
      level: 1,
      exp: 0,
      dailyExpToday: 0,
      totalExp: 0,
      inventory: [],
    }).catch(() => null);
  }
  if (user && !Array.isArray(user.inventory)) user.inventory = [];
  return user;
}

async function announceVoiceGain(guild, cfg, member, voiceChannel, gained) {
  try {
    const ch = await resolveMissionHallChannel(guild, cfg);
    if (!ch) return;
    const emojis = ['🎉', '🔥', '✨', '💥', '🏅'];
    const em = emojis[Math.floor(Math.random() * emojis.length)];
    await ch.send({
      content: `${member} 在語音頻道 **${voiceChannel.name}** 逗留了30分鐘，獲得了 **${gained}EXP**，是個狠角色！ ${em}`,
    });
  } catch (e) {
    console.warn('[ANNOUNCE] Failed to announce voice gain:', e?.message || e);
  }
}

async function resolveMissionHallChannel(guild, cfg) {
  // 1) 優先找名稱為「任務大廳」的文字頻道
  const byName =
    guild.channels.cache.find(
      (c) => c.isTextBased?.() && (c.name === '任務大廳' || c.name === 'mission-hall')
    ) || null;
  if (byName) return byName;

  // 2) 退回 GuildConfig 的 announceChannelId
  const announceId = cfg?.announceChannelId;
  if (announceId) {
    const ch = await guild.channels.fetch(announceId).catch(() => null);
    if (ch && ch.isTextBased?.()) return ch;
  }

  // 3) 再退回系統頻道
  if (guild.systemChannelId) {
    const sys = await guild.channels.fetch(guild.systemChannelId).catch(() => null);
    if (sys && sys.isTextBased?.()) return sys;
  }
  return null;
}

/* =========================
 * 工具：sleep + fetchWithTimeout
 * ========================= */
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

/* =========================
 * 安全 REST 包裝（尊重 Rate Limit）
 * ========================= */
async function safeFetchJSON(url, token, timeoutMs = 8000) {
  try {
    const res = await fetchWithTimeout(url, { headers: { Authorization: `Bot ${token}` } }, timeoutMs);

    if (res.status === 429) {
      const ra = res.headers.get('retry-after') || res.headers.get('x-ratelimit-reset-after');
      const wait = ra ? Math.ceil(parseFloat(ra) * 1000) : 5000;
      console.warn(`[RL] ${url} 429; wait ${wait}ms`);
      await sleep(wait);
      return null;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[REST] ${url} FAILED`, res.status, body);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error(`[REST] ${url} ERROR`, e?.message || e);
    return null;
  }
}

/* =========================
 * ✅ 登入前 PREFLIGHT（可關）
 * ========================= */
(async () => {
  console.log('[PREFLIGHT] Start');

  // 0) DNS
  try {
    const a = await dnsp.lookup('discord.com');
    const b = await dnsp.lookup('gateway.discord.gg');
    console.log('[PREFLIGHT] DNS OK:', { discord: a?.address, gateway: b?.address });
  } catch (e) {
    console.error('[PREFLIGHT] DNS lookup FAILED. Possible egress/DNS issue.', e?.message || e);
  }

  if (STARTUP_PREFLIGHT) {
    const app = await safeFetchJSON('https://discord.com/api/v10/oauth2/applications/@me', DISCORD_TOKEN);
    if (app?.id) {
      console.log('[PREFLIGHT] oauth2CurrentApplication OK:', { id: app.id, name: app.name });
      const perms =
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.EmbedLinks;
      const invite = `https://discord.com/api/oauth2/authorize?client_id=${app.id}&permissions=${perms}&scope=bot%20applications.commands`;
      console.log('[PREFLIGHT] Invite URL:', invite);
    }

    const gw = await safeFetchJSON('https://discord.com/api/v10/gateway/bot', DISCORD_TOKEN);
    if (gw?.session_start_limit) {
      console.log('[PREFLIGHT] gatewayBot OK. session_start_limit:', gw.session_start_limit);
      if (gw.session_start_limit.remaining === 0 && gw.session_start_limit.reset_after) {
        const wait = Math.ceil(gw.session_start_limit.reset_after);
        console.warn(`[PREFLIGHT] Identify remaining=0; wait ${wait}ms before login.`);
        await sleep(wait);
      }
    }
  } else {
    console.log('[PREFLIGHT] Skipped by STARTUP_PREFLIGHT=0');
  }

  console.log('[PREFLIGHT] End → calling client.login()');

  if (!DISCORD_TOKEN) {
    console.error('[LOGIN] DISCORD_TOKEN missing. Abort login.');
  } else {
    client
      .login(DISCORD_TOKEN)
      .then(() => console.log('[LOGIN] Login promise resolved'))
      .catch((err) => console.error('[LOGIN] failed:', err?.message || err));
  }
})();

/* =========================
 * Watchdog：120 秒未 READY 只提示，不打 REST
 * ========================= */
setTimeout(() => {
  if (!client.isReady?.() || !client.user) {
    const wsStatus = client?.ws?.status;
    console.error('[WATCHDOG] Not READY after 120s. ws.status=', wsStatus);
    console.error('[WATCHDOG] Hints:');
    console.error('- 檢查 Dev Portal 是否勾 Privileged Intents（SERVER MEMBERS、MESSAGE CONTENT），並且已儲存。');
    console.error('- 確認 Bot 已加入 GUILD_ID 指定的伺服器，且 GUILD_ID 正確。');
    console.error('- 避免頻繁重啟：DB 失敗不要立即 exit；健康檢查間隔與超時請放寬。');
    console.error('- 若 session_start_limit.remaining 用盡，請等待 reset_after 後再進行登入重試。');
  }
}, 120_000);

/* =========================
 * 優雅關閉
 * ========================= */
function gracefulShutdown(signal) {
  console.log(`[SHUTDOWN] Received ${signal}, destroying client...`);
  try { client?.destroy?.(); } catch {}
  if (voiceTicker) {
    clearInterval(voiceTicker);
    voiceTicker = null;
  }
  setTimeout(() => process.exit(0), 1500);
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

/* =========================
 * 全域例外
 * ========================= */
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});
