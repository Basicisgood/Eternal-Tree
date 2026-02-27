
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection, EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const mongoose = require('mongoose');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');

const { User } = require('./models/user');
const { GuildConfig } = require('./models/config');
const { addExpWithDailyCap, expNeededForNextLevel, LEVEL_CAP } = require('./utils/exp');
const { ensureAnnounceChannelByName, sendToAnnounce } = require('./utils/channel');
const { onLevelMilestoneUpdateRoles } = require('./utils/roles');
const { LOGIN_LOOT_TABLE, drawFromLootTable } = require('./utils/loot');
const { CLASS_LINES, getTitleForLevel } = require('./utils/titles');

const GUILD_ID = process.env.GUILD_ID;
const ANNOUNCE_CHANNEL_NAME = process.env.ANNOUNCE_CHANNEL_NAME || '任務大廳';

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

async function getGuildConfig(guildId) {
  let cfg = await GuildConfig.findOne({ guildId });
  if (!cfg) {
    cfg = await GuildConfig.create({
      guildId,
      timezone: 'Asia/Hong_Kong',
      dailyCap: 200,
      messageExp: 20,
      messageCooldownSec: 60,
      voiceBlockMinutes: 30,
      voicePerBlockExp: 50,
      announceChannelName: ANNOUNCE_CHANNEL_NAME
    });
  }
  return cfg;
}

client.once('ready', async () => {
  console.log(`已登入：${client.user.tag}`);

  // 資料庫連線
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('缺少 MONGODB_URI');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('MongoDB 連線成功');
  } catch (e) {
    console.error('MongoDB 連線失敗', e);
    process.exit(1);
  }

  // 註冊 Slash 指令（公會註冊，立即生效）
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const commandsData = client.commands.map(c => c.data.toJSON());
    await guild.commands.set(commandsData);
    console.log('已在公會註冊 Slash 指令');
  } catch (e) {
    console.error('註冊指令失敗，請確認 GUILD_ID 與權限', e);
  }

  // 確保公告頻道存在
  const guild = client.guilds.cache.get(GUILD_ID);
  if (guild) {
    await ensureAnnounceChannelByName(guild, ANNOUNCE_CHANNEL_NAME);
  }

  // 每日重置（香港時區 00:00）
  cron.schedule('0 0 * * *', async () => {
    try {
      await User.updateMany({ guildId: GUILD_ID }, { $set: { dailyExpToday: 0, dailyClaimedAt: null, adventureUsedAt: null } });
      console.log('每日重置完成');
    } catch (e) { console.error('每日重置失敗', e); }
  }, { timezone: 'Asia/Hong_Kong' });
});

// 文字訊息 → EXP（每則 20 EXP，60 秒冷卻）
client.on('messageCreate', async (msg) => {
  try {
    if (!msg.guild || msg.guild.id !== GUILD_ID) return;
    if (msg.author.bot) return;
    if (!msg.content || msg.content.trim().length < 5) return; // 太短不計

    const cfg = await getGuildConfig(msg.guild.id);

    const user = await User.findOneAndUpdate(
      { guildId: msg.guild.id, userId: msg.author.id },
      { $setOnInsert: { level: 1, exp: 0, dailyExpToday: 0 } },
      { new: true, upsert: true }
    );

    const now = Date.now();
    if (user.lastMessageExpAt && (now - user.lastMessageExpAt.getTime())/1000 < cfg.messageCooldownSec) {
      return;
    }

    const result = await addExpWithDailyCap(user, cfg, cfg.messageExp);
    user.lastMessageExpAt = new Date();
    await user.save();

    if (result.leveledUp) {
      const title = getTitleForLevel(user.level, user.classLine);
      await onLevelMilestoneUpdateRoles(msg.guild, msg.member, title);

      const embed = new EmbedBuilder()
        .setColor(0x00C853)
        .setTitle('等級提升！')
        .setDescription(`${msg.author} 升到 **Lv.${user.level}**（當前 EXP：${user.exp}/${expNeededForNextLevel(user.level)}）\n稱號：**${title}**`)
        .setTimestamp();
      await msg.channel.send({ embeds: [embed] }).catch(()=>{});
    }
  } catch (e) { console.error('messageCreate error', e); }
});

// 語音：進出房 → 結算
client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    const guild = newState.guild || oldState.guild;
    if (!guild || guild.id !== GUILD_ID) return;
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const cfg = await getGuildConfig(guild.id);

    const user = await User.findOneAndUpdate(
      { guildId: guild.id, userId: member.id },
      { $setOnInsert: { level: 1, exp: 0, dailyExpToday: 0, voiceSession: { joinedAt: null, channelId: null } } },
      { new: true, upsert: true }
    );

    const joined = !oldState.channelId && newState.channelId;
    const left = oldState.channelId && !newState.channelId;
    const moved = oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId;

    async function settle() {
      if (!user.voiceSession?.joinedAt) return;
      const chId = user.voiceSession.channelId;
      const ch = guild.channels.cache.get(chId);
      if (!ch || ch.type !== ChannelType.GuildVoice) return;

      const humanCount = ch.members.filter(m => !m.user.bot).size;
      if (humanCount < 1) return; // 需至少 1 名真人

      // 取目前狀態
      const s = guild.members.cache.get(member.id)?.voice;
      if (!s || s.selfMute || s.selfDeaf) return; // 自我靜音/自我靜音聽不給

      const diffMs = Date.now() - new Date(user.voiceSession.joinedAt).getTime();
      const minutes = Math.floor(diffMs / 60000);
      const blocks = Math.floor(minutes / cfg.voiceBlockMinutes);
      if (blocks <= 0) return;

      const gain = blocks * cfg.voicePerBlockExp;
      const result = await addExpWithDailyCap(user, cfg, gain);
      await user.save();

      if (result.leveledUp) {
        const title = getTitleForLevel(user.level, user.classLine);
        const gMember = await guild.members.fetch(member.id);
        await onLevelMilestoneUpdateRoles(guild, gMember, title);
        await sendToAnnounce(guild, `📈 ${gMember} 語音活躍升到 **Lv.${user.level}**！稱號：**${title}**`);
      }
    }

    if (joined || moved) {
      // 結算上一房
      if (user.voiceSession?.joinedAt) {
        await settle();
      }
      user.voiceSession = { joinedAt: new Date(), channelId: newState.channelId };
      await user.save();
    }

    if (left) {
      await settle();
      user.voiceSession = { joinedAt: null, channelId: null };
      await user.save();
    }
  } catch (e) { console.error('voiceStateUpdate error', e); }
});

// 互動（Slash 指令）
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute({ client, interaction, models: { User, GuildConfig }, utils: {
      addExpWithDailyCap, expNeededForNextLevel, drawFromLootTable, LOGIN_LOOT_TABLE, CLASS_LINES, getTitleForLevel,
      onLevelMilestoneUpdateRoles, sendToAnnounce
    }});
  } catch (e) {
    console.error(e);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: '執行指令時發生錯誤。', ephemeral: true }).catch(()=>{});
    } else {
      await interaction.reply({ content: '執行指令時發生錯誤。', ephemeral: true }).catch(()=>{});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

// 引入 Express
const express = require("express");
const app = express();

// Render 會提供 PORT 環境變數，預設用 3000
const PORT = process.env.PORT || 3000;

// 建立一個簡單的路由，顯示 Bot 狀態
app.get("/", (req, res) => {
  res.send("Discord Bot is running");
});



// 啟動伺服器
app.listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});
