
const { ChannelType, PermissionFlagsBits } = require('discord.js');

async function ensureAnnounceChannelByName(guild, name) {
  const exists = guild.channels.cache.find(ch => ch.name === name || ch.name === name.replace(/[#]/g,''));
  if (exists) return exists;
  try {
    const ch = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      reason: '自動建立公告頻道'
    });
    return ch;
  } catch (e) {
    console.warn('建立公告頻道失敗（可能缺少 Manage Channels 權限）');
    return null;
  }
}

async function sendToAnnounce(guild, content) {
  const name = process.env.ANNOUNCE_CHANNEL_NAME || '🎬任務大廳';
  let ch = guild.channels.cache.find(c => c.type === ChannelType.GuildText && (c.name === name || c.name === name.replace(/[#]/g,'')));
  if (!ch) ch = await ensureAnnounceChannelByName(guild, name);
  if (!ch) return;
  try { await ch.send({ content }); } catch {}
}

module.exports = { ensureAnnounceChannelByName, sendToAnnounce };
