
// src/index.js
require('dotenv').config();

const express = require('express');
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  REST,
  Routes,
} = require('discord.js');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const dns = require('dns').promises;

/* =========================
 * ENV
 * ========================= */
const RAW_TOKEN = process.env.DISCORD_TOKEN || '';
const DISCORD_TOKEN = RAW_TOKEN.trim(); // 修剪空白，避免隱形字元導致登入異常
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
    GatewayIntentBits.GuildMembers,   // 需在 Dev Portal 勾選 SERVER MEMBERS INTENT
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // 需在 Dev Portal 勾選 MESSAGE CONTENT INTENT
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
    if (lower.includes('provided token')) return; // 不印出 Token
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

  // Presence（協助你在 Discord 看到「線上」）
  try {
    await client.user.setPresence({
      activities: [{ name: '/profile /adventure', type: 0 }], // Playing
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
 * Watchdog：30 秒未 READY → 輸出診斷
 * ========================= */
setTimeout(async () => {
  if (!client.isReady?.() && !client.user) {
    console.error('[WATCHDOG] Client is not READY after 30s.');

    // 1) REST：檢查應用是否可取（驗證 Token 可用）
    try {
      const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
      const me = await rest.get(Routes.oauth2CurrentApplication());
      console.log('[WATCHDOG] REST oauth2CurrentApplication OK. App:', { id: me.id, name: me.name });
    } catch (e) {
      console.error('[WATCHDOG] REST oauth2CurrentApplication FAILED. Token/permissions suspect.', e?.status, e?.code, e?.message);
    }

    // 2) REST：Gateway Bot（需要 Bot Token）
    try {
      const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
      const gw = await rest.get(Routes.gatewayBot());
      console.log('[WATCHDOG] REST gatewayBot OK. session_start_limit:', gw.session_start_limit);
    } catch (e) {
      console.error('[WATCHDOG] REST gatewayBot FAILED.', e?.status, e?.code, e?.message);
    }

    // 3) DNS 測試：確認機器能解析 Discord 網域
    try {
      const a = await dns.lookup('discord.com');
      const b = await dns.lookup('gateway.discord.gg');
      console.log('[WATCHDOG] DNS OK:', { discord: a?.address, gateway: b?.address });
    } catch (e) {
      console.error('[WATCHDOG] DNS lookup FAILED. Possible egress/DNS issue.', e?.message || e);
    }

    console.error('[WATCHDOG] Hints:');
    console.error('- 檢查 Dev Portal 是否勾選 Privileged Intents（SERVER MEMBERS、MESSAGE CONTENT）。');
    console.error('- 確認 Bot 已加入 GUILD_ID 指定的伺服器，且 GUILD_ID 正確。');
    console.error('- 若仍卡住，請回貼 [WATCHDOG] 的完整輸出，我來進一步判斷。');
  }
}, 30_000);

/* =========================
 * Login
 * ========================= */
client
  .login(DISCORD_TOKEN)
  .then(() => console.log('[LOGIN] Login promise resolved'))
  .catch((err) => console.error('[LOGIN] failed:', err?.message || err));

/* =========================
 * 全域例外（避免進程直接退出）
 * ========================= */
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});
