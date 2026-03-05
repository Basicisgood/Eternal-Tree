// src/index.js (精簡版 v6.3)
require('dotenv').config();

const express = require('express');
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
} = require('discord.js');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

/* =========================
 * BOOT BANNER
 * ========================= */
console.log('===================================================');
console.log('=  ETERNAL-TREE BOT :: INDEX v6.3 (EXP System)     =');
console.log('===================================================');

/* =========================
 * ENV
 * ========================= */
const RAW_TOKEN = process.env.DISCORD_TOKEN || '';
const DISCORD_TOKEN = RAW_TOKEN.trim();
const GUILD_ID = process.env.GUILD_ID || '';
const MONGODB_URI = process.env.MONGODB_URI || '';
const PORT = process.env.PORT || 10000;
const REGISTER_COMMANDS = process.env.REGISTER_COMMANDS === '1';

console.log('[ENV CHECK]', {
  token: DISCORD_TOKEN ? 'SET' : 'MISSING',
  guild: GUILD_ID || '(none)',
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
 * Discord Client
 * ========================= */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
});
client.commands = new Collection();

/* =========================
 * 動態載入指令
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
  for (const file of files) {
    try {
      let mod = require(file);
      if (mod && mod.default) mod = mod.default;
      const data = mod?.data;
      const handler = mod?.execute || mod?.run;
      if (data?.name && typeof handler === 'function') {
        client.commands.set(data.name, { data, execute: handler });
        console.log(`[COMMAND] Loaded: ${data.name}`);
      }
    } catch (e) {
      console.warn(`[COMMAND] Failed to load ${file}:`, e?.message || e);
    }
  }
})();

/* =========================
 * EXP 工具
 * ========================= */
const { addExpWithDailyCap } = require('./utils/exp');

/* =========================
 * Ready
 * ========================= */
let voiceTicker = null;
client.once('ready', async () => {
  console.log(`[READY] Logged in as ${client.user.tag}`);

  // MongoDB 連線
  if (MONGODB_URI) {
    try {
      await mongoose.connect(MONGODB_URI);
      console.log('[MONGO] Connected');
    } catch (e) {
      console.error('[MONGO] Failed to connect:', e?.message || e);
    }
  }

  // Slash 指令註冊
  if (GUILD_ID && REGISTER_COMMANDS) {
    try {
      const g = await client.guilds.fetch(GUILD_ID);
      const data = client.commands.map((c) => c.data.toJSON());
      await g.commands.set(data);
      console.log(`[SLASH] Registered ${data.length} commands`);
    } catch (e) {
      console.error('[SLASH] Register failed:', e?.message || e);
    }
  }

  // Presence
  try {
    await client.user.setPresence({
      activities: [{ name: '/profile /adventure', type: 0 }],
      status: 'online',
    });
  } catch {}

  // Voice EXP Ticker
  if (!voiceTicker) {
    voiceTicker = setInterval(() => settleVoiceExpAllGuilds().catch(err =>
      console.error('[VOICE TICKER] Error:', err?.message || err)
    ), 60_000);
    console.log('[READY] Voice EXP ticker started (60s).');
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
        await interaction.reply({ content: '執行指令時發生錯誤。', ephemeral: true });
      } else {
        await interaction.editReply({ content: '執行指令時發生錯誤。' });
      }
    } catch {}
  }
});

/* =========================
 * Message EXP
 * ========================= */
client.on('messageCreate', async (msg) => {
  try {
    if (!msg.guild || msg.author.bot) return;
    const content = (msg.content || '').trim();
    if (content.length < 5) return;

    const { User, GuildConfig } = loadModels();
    const cfg = await GuildConfig.findOne({ guildId: msg.guild.id }).lean().catch(() => null);
    if (!cfg) return;

    const user = await safeFindOrCreateUser(User, msg.guild.id, msg.author.id);
    const now = Date.now();
    const last = user.lastMessageExpAt ? user.lastMessageExpAt.getTime() : 0;
    if (now - last < 60_000) return;

    const { gained } = await addExpWithDailyCap(user, cfg, 20);
    if (gained > 0) {
      user.lastMessageExpAt = new Date(now);
      await user.save().catch(() => {});
    }
  } catch (e) {
    console.error('[MSG EXP] Error:', e?.message || e);
  }
});

/* =========================
 * Voice EXP
 * ========================= */
client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    const member = newState.member || oldState.member;
    if (!member || member.user?.bot) return;

    const joined = !oldState.channelId && !!newState.channelId;
    const moved  = !!oldState.channelId && !!newState.channelId && oldState.channelId !== newState.channelId;
    const left   = !!oldState.channelId && !newState.channelId;

    const { User, GuildConfig } = loadModels();
    const cfg = await GuildConfig.findOne({ guildId: member.guild.id }).lean().catch(() => null);
    if (!cfg) return;

    const user = await safeFindOrCreateUser(User, member.guild.id, member.id);
    if (!user.voiceSession) user.voiceSession = { joinedAt: null, channelId: null };

    const now = Date.now();
    if (joined || moved) {
      user.voiceSession.joinedAt = new Date(now);
      user.voiceSession.channelId = newState.channelId;
      await user.save().catch(() => {});
      return;
    }

    if (left && user.voiceSession?.joinedAt) {
      const elapsedMs = now - new Date(user.voiceSession.joinedAt).getTime();
      const awards = Math.floor(elapsedMs / (30 * 60 * 1000));
      if (awards > 0) {
        const toGive = awards * 50;
        const { gained } = await addExpWithDailyCap(user, cfg, toGive);
        if (gained > 0) {
          await user.save().catch(() => {});
          const vcName = oldState.channel?.name || '語音頻道';
          for (let i = 0; i < awards; i++) {
            await announceVoiceGain(member.guild, cfg, member, vcName, 50).catch(() => {});
          }
        }
      }
      user.voiceSession.joinedAt = null;
      user.voiceSession.channelId = null;
      await user.save().catch(() => {});
    }
  } catch (e) {
    console.error('[VOICE STATE] Error:', e?.message || e);
  }
});

/* =========================
 * 定時掃描所有公會語音成員
 * ========================= */
async function
