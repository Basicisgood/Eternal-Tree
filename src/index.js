
// src/index.js
require('dotenv').config();

const express = require('express');
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// ====== ENV ======
const GUILD_ID = process.env.GUILD_ID;
const MONGODB_URI = process.env.MONGODB_URI;
const PORT = process.env.PORT || 10000;

// ====== Express (Health Check) ======
const app = express();
app.get('/health', (_req, res) => res.status(200).send('OK'));
app.get('/', (_req, res) => res.status(200).send('Discord Bot is running'));
app.listen(PORT, () => console.log(`[HTTP] listening on :${PORT}`));

// ====== Discord Client (single instance) ======
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,   // 若未在 Dev Portal 勾選 SERVER MEMBERS INTENT，請先勾選
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent  // 若未在 Dev Portal 勾選 MESSAGE CONTENT INTENT，請先勾選
  ],
  partials: [Partials.Channel]
});

client.commands = new Collection();

// ====== Load Commands Dynamically ======
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const mod = require(path.join(commandsPath, file));
    if (mod?.data && mod?.execute) client.commands.set(mod.data.name, mod);
  }
}

console.log('[ENV CHECK]', {
  token: process.env.DISCORD_TOKEN ? 'SET' : 'MISSING',
  tokenLen: process.env.DISCORD_TOKEN?.length,
  guild: GUILD_ID,
  hasMongo: !!MONGODB_URI
});

// ====== Safe Debug (avoid token leak) ======
client.on('debug', (m) => {
  if (typeof m === 'string') {
    const lower = m.toLowerCase();
    if (lower.includes('provided token')) return; // 避免外洩 token
    if (lower.includes('heartbeat')) return;      // 心跳訊息太吵可略
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

// ====== Ready ======
client.once('ready', async () => {
  console.log(`[READY] Logged in as ${client.user.tag}`);
  console.log('[READY] Intents:', client.options.intents?.toArray?.() ?? 'n/a');
  console.log('[READY] Guild cache size:', client.guilds.cache.size);

  // 連 Mongo
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

  // 取得目標 Guild
  if (!GUILD_ID) {
    console.error('[CONFIG] GUILD_ID is missing. Slash commands will not be registered.');
  } else {
    try {
      const g = await client.guilds.fetch(GUILD_ID);
      console.log('[READY] Target guild fetched:', g?.name, g?.id);

      // 註冊公會 Slash 指令
      const data = client.commands.map(c => c.data.toJSON());
      await g.commands.set(data);
      console.log(`[SLASH] Registered ${data.length} commands to guild ${g.id}`);
    } catch (e) {
      console.error('[SLASH] Failed to fetch/register guild commands. Check: bot in guild? GUILD_ID correct? permissions?', e?.message || e);
    }
  }

  // Presence（幫助在成員列表看到「線上」）
  try {
    await client.user.setPresence({
      activities: [{ name: '/profile /adventure', type: 0 }], // Playing
      status: 'online'
    });
    console.log('[READY] Presence set.');
  } catch (e) {
    console.error('[READY] Presence failed:', e?.message || e);
  }
});

// ====== Interaction Handler ======
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
        // 使用 flags: 64 等同 Ephemeral
        await interaction.reply({ content: '執行指令時發生錯誤，請稍後再試。', flags: 64 });
      } else {
        await interaction.editReply({ content: '執行指令時發生錯誤，請稍後再試。' });
      }
    } catch (_) {}
  }
});

// ====== Models Loader (集中管理，避免循環引用) ======
function loadModels() {
  // 依你的專案結構調整
  const { User } = require('./models/user');
  const { GuildConfig } = require('./models/config');
  return { User, GuildConfig };
}

// ====== Login ======
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('[LOGIN] Login promise resolved'))
  .catch((err) => console.error('[LOGIN] failed:', err?.message || err));
