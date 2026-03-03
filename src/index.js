
// src/index.js (v6 - Stable Startup: RL-safe PREFLIGHT, Mongo retry, Slash controlled, 120s Watchdog)
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
console.log('=  ETERNAL-TREE BOT :: INDEX v6 (Stable Startup)   =');
console.log('=  If you do NOT see this line, code not updated   =');
console.log('===================================================');

/* =========================
 * NET: IPv4 優先（避免 IPv6 路徑不通）
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
const STARTUP_PREFLIGHT = process.env.STARTUP_PREFLIGHT !== '0'; // 預設啟動時進行 REST 預檢
const REGISTER_COMMANDS = process.env.REGISTER_COMMANDS === '1'; // 預設不註冊，部署/調整時手動開

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
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
});

client.commands = new Collection();

/* =========================
 * 動態載入指令
 * ========================= */
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const files = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    const mod = require(path.join(commandsPath, file));
    if (mod?.data && mod?.execute) client.commands.set(mod.data.name, mod);
  }
  console.log(`[BOOT] Loaded ${client.commands.size} command modules.`);
} else {
  console.log('[BOOT] No commands directory found.');
}

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
 * Ready
 * ========================= */
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

  // ---- Presence（顯示線上狀態）----
  try {
    await client.user.setPresence({
      activities: [{ name: '/profile /adventure', type: 0 }],
      status: 'online',
    });
    console.log('[READY] Presence set.');
  } catch (e) {
    console.error('[READY] Presence failed:', e?.message || e);
  }
});

/* =========================
 * Interaction Handler
 * ========================= */
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand?.()) return;
  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;

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
    } catch (_) {}
  }
});

/* =========================
 * Models Loader（集中引入，避免循環引用）
 * ========================= */
function loadModels() {
  const { User } = require('./models/user');
  const { GuildConfig } = require('./models/config');
  return { User, GuildConfig };
}

/* =========================
 * 工具：sleep 與帶逾時的 fetch（Node 18 有全域 fetch）
 * ========================= */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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
      return null; // 呼叫端視情況是否再試
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
 *  - DNS 檢查
 *  - /oauth2/applications/@me（驗證 Token）
 *  - /gateway/bot（觀察 Identify 配額）
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
    // 1) 應用資訊（驗證 Token）
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

    // 2) Gateway Bot（觀察 Identify 配額）
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
 * 優雅關閉（避免平台殺進程造成無限重啟風暴）
 * ========================= */
function gracefulShutdown(signal) {
  console.log(`[SHUTDOWN] Received ${signal}, destroying client...`);
  try {
    client?.destroy?.();
  } catch {}
  setTimeout(() => process.exit(0), 1500);
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

/* =========================
 * 全域例外（避免進程直接退出）
 * ========================= */
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});
