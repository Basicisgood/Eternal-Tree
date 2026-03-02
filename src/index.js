
// src/index.js (v5)
require('dotenv').config();

const express = require('express');
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  REST,
  Routes,
  PermissionFlagsBits,
} = require('discord.js');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const dns = require('dns');
const dnsp = require('dns').promises;

/* =========================
 * BOOT BANNER（確認新檔已生效）
 * ========================= */
console.log('===================================================');
console.log('=  ETERNAL-TREE BOT :: INDEX v5 (IPv4 + Timeout PF) =');
console.log('=  If you do NOT see this line, code not updated   =');
console.log('===================================================');

/* 強制 DNS 以 IPv4 優先，避免節點 IPv6 路徑不通造成卡住 */
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
const GUILD_ID = process.env.GUILD_ID;
const MONGODB_URI = process.env.MONGODB_URI;
const PORT = process.env.PORT || 10000;

console.log('[ENV CHECK]', {
  token: DISCORD_TOKEN ? 'SET' : 'MISSING',
  tokenLen: DISCORD_TOKEN?.length ?? 0,
  guild: GUILD_ID,
  hasMongo: !!MONGODB_URI,
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
    GatewayIntentBits.GuildMembers,   // Dev Portal 勾 SERVER MEMBERS INTENT
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // Dev Portal 勾 MESSAGE CONTENT INTENT
  ],
  partials: [Partials.Channel],
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

  // 連 MongoDB
  if (!MONGODB_URI) {
    console.error('[FATAL] MONGODB_URI is missing. Exiting.');
    process.exit(1);
  }
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('[MONGO] Connected');
  } catch (e) {
    console.error('[MONGO] Failed to connect:', e?.message || e);
    process.exit(1);
  }

  // 取得目標 Guild 並註冊 Slash 指令（Guild scope）
  if (!GUILD_ID) {
    console.error('[CONFIG] GUILD_ID is missing. Slash commands will not be registered.');
  } else {
    try {
      const g = await client.guilds.fetch(GUILD_ID);
      console.log('[READY] Target guild fetched:', g?.name, g?.id);

      const data = client.commands.map((c) => c.data.toJSON());
      await g.commands.set(data);
      console.log(`[SLASH] Registered ${data.length} commands to guild ${g.id}`);
    } catch (e) {
      console.error(
        '[SLASH] Failed to fetch/register guild commands. Check: bot in guild? GUILD_ID correct? permissions?',
        e?.message || e
      );
    }
  }

  // Presence（顯示線上狀態）
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
  if (!interaction.isChatInputCommand()) return;
  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;

  try {
    await cmd.execute({ interaction, client, models: loadModels() });
  } catch (err) {
    console.error(`[CMD ERROR] /${interaction.commandName}`, err);
    try {
      if (!interaction.deferred && !interaction.replied) {
        // 64 = MessageFlags.Ephemeral
        await interaction.reply({ content: '執行指令時發生錯誤，請稍後再試。', flags: 64 });
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
 * 工具：帶逾時的 fetch（Node 18 有全域 fetch）
 * ========================= */
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
 * ✅ 登入前 REST「預檢」：先 DNS，再 REST
 * ========================= */
(async () => {
  console.log('[PREFLIGHT] Start');

  // 0) DNS 檢查（IPv4 優先）
  try {
    const a = await dnsp.lookup('discord.com');
    const b = await dnsp.lookup('gateway.discord.gg');
    console.log('[PREFLIGHT] DNS OK:', { discord: a?.address, gateway: b?.address });
  } catch (e) {
    console.error('[PREFLIGHT] DNS lookup FAILED. Possible egress/DNS issue.', e?.message || e);
  }

  // 1) 應用資訊（驗證 Token）
  try {
    const r1 = await fetchWithTimeout(
      'https://discord.com/api/v10/oauth2/applications/@me',
      { headers: { Authorization: `Bot ${DISCORD_TOKEN}` } },
      8000
    );
    if (!r1.ok) {
      const body = await r1.text();
      console.error('[PREFLIGHT] /oauth2/applications/@me FAILED:', r1.status, body);
    } else {
      const app = await r1.json();
      console.log('[PREFLIGHT] oauth2CurrentApplication OK:', { id: app.id, name: app.name });

      const perms =
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.EmbedLinks;
      const invite = `https://discord.com/api/oauth2/authorize?client_id=${app.id}&permissions=${perms}&scope=bot%20applications.commands`;
      console.log('[PREFLIGHT] Invite URL (use this to ensure the bot is in your target guild):', invite);
    }
  } catch (e) {
    console.error('[PREFLIGHT] oauth2CurrentApplication TIMEOUT/ERROR:', e?.message || e);
  }

  // 2) Gateway Bot
  try {
    const r2 = await fetchWithTimeout(
      'https://discord.com/api/v10/gateway/bot',
      { headers: { Authorization: `Bot ${DISCORD_TOKEN}` } },
      8000
    );
    if (!r2.ok) {
      const body = await r2.text();
      console.error('[PREFLIGHT] /gateway/bot FAILED:', r2.status, body);
    } else {
      const gw = await r2.json();
      console.log('[PREFLIGHT] gatewayBot OK. session_start_limit:', gw.session_start_limit);
    }
  } catch (e) {
    console.error('[PREFLIGHT] gatewayBot TIMEOUT/ERROR:', e?.message || e);
  }

  console.log('[PREFLIGHT] End → calling client.login()');

  client
    .login(DISCORD_TOKEN)
    .then(() => console.log('[LOGIN] Login promise resolved'))
    .catch((err) => console.error('[LOGIN] failed:', err?.message || err));
})();

/* =========================
 * Watchdog：15 秒未 READY → 輸出診斷
 * ========================= */
setTimeout(async () => {
  if (!client.isReady?.() && !client.user) {
    console.error('[WATCHDOG] Client is not READY after 15s.');

    try {
      const r1 = await fetchWithTimeout(
        'https://discord.com/api/v10/oauth2/applications/@me',
        { headers: { Authorization: `Bot ${DISCORD_TOKEN}` } },
        8000
      );
      console.log('[WATCHDOG] /oauth2/applications/@me status:', r1.status);
    } catch (e) {
      console.error('[WATCHDOG] oauth2CurrentApplication TIMEOUT/ERROR:', e?.message || e);
    }

    try {
      const r2 = await fetchWithTimeout(
        'https://discord.com/api/v10/gateway/bot',
        { headers: { Authorization: `Bot ${DISCORD_TOKEN}` } },
        8000
      );
      console.log('[WATCHDOG] /gateway/bot status:', r2.status);
    } catch (e) {
      console.error('[WATCHDOG] gatewayBot TIMEOUT/ERROR:', e?.message || e);
    }

    try {
      const a = await dnsp.lookup('discord.com');
      const b = await dnsp.lookup('gateway.discord.gg');
      console.log('[WATCHDOG] DNS OK:', { discord: a?.address, gateway: b?.address });
    } catch (e) {
      console.error('[WATCHDOG] DNS lookup FAILED. Possible egress/DNS issue.', e?.message || e);
    }

    console.error('[WATCHDOG] Hints:');
    console.error('- 檢查 Dev Portal 是否勾 Privileged Intents（SERVER MEMBERS、MESSAGE CONTENT）。');
    console.error('- 確認 Bot 已加入 GUILD_ID 指定的伺服器，且 GUILD_ID 正確。');
    console.error('- 若仍卡住，請把 [PREFLIGHT]/[LOGIN]/[READY]/[WATCHDOG] 全段輸出貼上來，我來進一步判斷。');
  }
}, 15_000);

/* =========================
 * 全域例外（避免進程直接退出）
 * ========================= */
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});
