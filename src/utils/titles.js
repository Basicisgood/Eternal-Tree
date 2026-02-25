
const CLASS_LINES = {
  warrior: ['戰士','狂戰士','龍騎士','戰神','鋼鐵守護者','王者之刃','不滅戰魂','永恆武聖'],
  mage:    ['法師','元素法師','大魔導士','星辰賢者','虛空術士','時空支配者','天界大法師','永恆魔導王'],
  hunter:  ['獵手','神射手','影行者','荒野之王','狩魂者','天隼領主','幻影獵神','永恆獵王'],
  assassin:['刺客','暗影刺客','血刃殺手','幽冥行者','夜幕之王','幻影修羅','冥界之刃','永恆影皇'],
  masked:  ['蒙面超人','蒙面勇者','蒙面騎士','蒙面戰神','蒙面霸者','蒙面王者','蒙面傳奇','永恆蒙面帝']
};

const COMMON_TITLES = { 1: '冒險者', 10: '高級冒險者' };
const LINE_LEVELS = [20,30,40,50,60,70,80,90];

function getTitleForLevel(level, classLine) {
  if (level >= 100) return '天帝';
  if (level >= 10 && level < 20) return '高級冒險者';
  if (level < 10) return '冒險者';
  if (!classLine) return '未選擇職業線';

  // 找對應 index
  let idx = -1;
  for (let i = 0; i < LINE_LEVELS.length; i++) {
    if (level >= LINE_LEVELS[i]) idx = i;
  }
  if (idx === -1) return '未選擇職業線'; // Lv20 前未選擇

  const titles = CLASS_LINES[classLine] || [];
  return titles[idx] || '未選擇職業線';
}

function allPossibleTitles() {
  const set = new Set(['冒險者','高級冒險者','天帝']);
  Object.values(CLASS_LINES).forEach(arr => arr.forEach(t => set.add(t)));
  return Array.from(set);
}

module.exports = { CLASS_LINES, COMMON_TITLES, LINE_LEVELS, getTitleForLevel, allPossibleTitles };
