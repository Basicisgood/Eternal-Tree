
// 登入與冒險使用相同掉落表；
// 注意：原始占比合計 90%，此處等比正規化。
// 轉為權重：普通 7000, 精良 1500, 史詩 400, 傳說 100 → 正規化到 10000。

const COMMON_ITEMS = [
  '火焰的頭盔','火焰的護甲','火焰的鞋子','火焰的短劍','火焰的長劍','火焰的弓箭','火焰的戒指',
  '寒冰的頭盔','寒冰的護甲','寒冰的鞋子','寒冰的短劍','寒冰的長劍','寒冰的弓箭','寒冰的戒指',
  '雷電的頭盔','雷電的護甲','雷電的鞋子','雷電的短劍','雷電的長劍','雷電的弓箭','雷電的戒指',
  '大地的頭盔','大地的護甲','大地的鞋子','大地的短劍','大地的長劍','大地的弓箭','大地的戒指',
  '惡魔的頭盔','惡魔的護甲','惡魔的鞋子','惡魔的短劍','惡魔的長劍','惡魔的弓箭','惡魔的戒指',
  '神聖的頭盔','神聖的護甲','神聖的鞋子','神聖的短劍','神聖的長劍','神聖的弓箭','神聖的戒指',
  '黑暗的頭盔','黑暗的護甲','黑暗的鞋子','黑暗的短劍','黑暗的長劍','黑暗的弓箭','黑暗的戒指'
];

const UNCOMMON_ITEMS = [
  '魔導王的頭盔','魔導王的護甲','魔導王的鞋子','魔導王的短劍','魔導王的長劍','魔導王的弓箭','魔導王的戒指',
  '騎士王的頭盔','騎士王的護甲','騎士王的鞋子','騎士王的短劍','騎士王的長劍','騎士王的弓箭','騎士王的戒指',
  '精靈王的頭盔','精靈王的護甲','精靈王的鞋子','精靈王的短劍','精靈王的長劍','精靈王的弓箭','精靈王的戒指'
];

const EPIC_ITEMS = [
  '遠古的頭盔','遠古的護甲','遠古的鞋子','遠古的短劍','遠古的長劍','遠古的弓箭','遠古的戒指',
  '未來的頭盔','未來的護甲','未來的鞋子','未來的短劍','未來的長劍','未來的弓箭','未來的戒指'
];

const LEGEND_ITEMS = [
  '世界樹的頭盔','世界樹的護甲','世界樹的鞋子','世界樹的短劍','世界樹的長劍','世界樹的弓箭','世界樹的戒指'
];

// 權重正規化：原始 7000:1500:400:100 → 依比例放大到 10000（實際總和即 9000，這裡直接沿用 7000/1500/400/100，總和 9000，
// 在抽取時以總和為基準，自然就是等比正規化效果）
const LOGIN_LOOT_TABLE = [
  { rarity: '普通', weight: 7000, items: COMMON_ITEMS },
  { rarity: '精良', weight: 1500, items: UNCOMMON_ITEMS },
  { rarity: '史詩', weight:  400, items: EPIC_ITEMS },
  { rarity: '傳說', weight:  100, items: LEGEND_ITEMS }
];

function drawFromLootTable(table) {
  const total = table.reduce((a, r) => a + r.weight, 0);
  let r = Math.floor(Math.random() * total) + 1;
  for (const row of table) {
    if (r <= row.weight) {
      const name = row.items[Math.floor(Math.random() * row.items.length)];
      return { rarity: row.rarity, name };
    }
    r -= row.weight;
  }
  // 保險返回
  const fallback = table[0];
  return { rarity: fallback.rarity, name: fallback.items[0] };
}

module.exports = { LOGIN_LOOT_TABLE, drawFromLootTable };
