
const { PermissionsBitField } = require('discord.js');
const { allPossibleTitles } = require('./titles');

async function ensureRole(guild, name) {
  let role = guild.roles.cache.find(r => r.name === name);
  if (role) return role;
  try {
    role = await guild.roles.create({ name, reason: '稱號自動建立' });
    return role;
  } catch (e) {
    console.warn('建立角色失敗，可能缺少 Manage Roles 權限');
    return null;
  }
}

async function onLevelMilestoneUpdateRoles(guild, member, title) {
  if (!title) return;
  const all = allPossibleTitles();
  const removeRoles = member.roles.cache.filter(r => all.includes(r.name));

  // 移除既有稱號
  for (const r of removeRoles.values()) {
    try { await member.roles.remove(r).catch(()=>{}); } catch {}
  }

  // 100 級固定天帝；其他級別按 title
  const roleName = title;
  const role = await ensureRole(guild, roleName);
  if (role) {
    try { await member.roles.add(role).catch(()=>{}); } catch {}
  }
}

module.exports = { onLevelMilestoneUpdateRoles };
