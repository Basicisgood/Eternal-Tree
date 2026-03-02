// index.js
require('dotenv').config();

const express = require('express');
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

const { User } = require('./models/user');
const { GuildConfig } = require('./models/config');
const { addExpWithDailyCap, expNeededForNextLevel } = require('./utils/exp');
const { ensureAnnounceChannelByName, sendToAnnounce } = require('./utils/channel');
const { onLevelMilestoneUpdateRoles } = require('./utils/roles');
const { LOGIN_LOOT_TABLE, drawFromLootTable } = require('./utils/loot');
const { CLASS_LINES, getTitleForLevel } = require('./utils/titles');

const GUILD_ID = process.env.GUILD_ID;
const ANNOUNCE_CHANNEL_NAME = process.env.ANNOUNCE_CHANNEL_NAME || '任務大廳';

/* -------------------------- Express -------------------------- */
const app = express();
app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/', (req, res) => res.send('Discord Bot is running'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[LOG] HTTP server listening on :${PORT}`));

/* -------------------------- Discord Client -------------------------- */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel]
});

client.commands = new Collection();

// 動態載入指令
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
  }
}

/* -------------------------- Debug Logs -------------------------- */
console.log('[ENV CHECK]', {
  token: process.env.DISCORD_TOKEN ? 'SET' : 'MISSING',
  tokenLen: process.env.DISCORD_TOKEN?.length,
  guild: process.env.GUILD_ID
});

client.on('debug', m => console.log('[DJS DEBUG]', m));
client.on('warn', m => console.warn('[DJS WARN]', m));
client.on('error', e => console.error('[DJS ERROR]', e));
client.on('shardError', e => console.error('[DJS SHARD ERROR]', e));
client.on('disconnect', e => console.error('[DJS DISCONNECT]', e));

/* -------------------------- Ready Event -------------------------- */
client.once('ready', async () => {
  console.log(`[LOG] 已登入：${client.user.tag}`);

  // MongoDB 連線
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('[ERROR] 缺少 MONGODB_URI');
    process.exit(1);
  }
  try {
    await mongoose.connect(mongoUri);
    console.log('[LOG] MongoDB 連線成功');
  } catch (e) {
    console.error('[ERROR] MongoDB 連線失敗', e);
    process.exit(1);
  }

  // Slash 指令註冊
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const commandsData = client.commands.map(c => c.data.toJSON());
    await guild.commands.set(commandsData);
    console.log('[LOG] 已在公會註冊 Slash 指令');
  } catch (e) {
    console.error('[ERROR] 註冊指令失敗，請確認 GUILD_ID 與權限', e);
  }
});

/* -------------------------- Login -------------------------- */
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('[LOG] Login promise resolved'))
  .catch(err => console.error('[ERROR] Login failed', err));

// 檢查 Gateway 狀態
client.on('ready', () => {
  console.log(`[READY] Bot 已登入：${client.user.tag}`);
});

client.on('shardReady', (id, unavailableGuilds) => {
  console.log(`[SHARD READY] Shard ${id} 啟動完成，未能載入的公會：`, unavailableGuilds);
});

client.on('shardDisconnect', (event, id) => {
  console.error(`[SHARD DISCONNECT] Shard ${id} 斷線`, event);
});

client.on('shardReconnecting', id => {
  console.log(`[SHARD RECONNECTING] Shard ${id} 嘗試重新連線`);
});

client.on('shardResume', (id, replayedEvents) => {
  console.log(`[SHARD RESUME] Shard ${id} 恢復，重播事件數：${replayedEvents}`);
});

client.on('rateLimit', info => {
  console.warn('[RATE LIMIT]', info);
});

require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Debug log
console.log('[ENV CHECK]', {
  token: process.env.DISCORD_TOKEN ? 'SET' : 'MISSING',
  tokenLen: process.env.DISCORD_TOKEN?.length,
  guild: process.env.GUILD_ID
});

client.on('ready', () => {
  console.log(`[READY] Bot 已登入：${client.user.tag}`);
});

client.on('error', e => console.error('[CLIENT ERROR]', e));
client.on('shardError', e => console.error('[SHARD ERROR]', e));
client.on('disconnect', e => console.error('[DISCONNECT]', e));

client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('[LOGIN] Login promise resolved'))
  .catch(err => console.error('[LOGIN ERROR]', err));
