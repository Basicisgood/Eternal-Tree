
# Discord RPG 等級 & 職業 & 抽獎 Bot（繁體中文）

> 免寫程式：只要把檔案部署到免費平台、填入 Token，就能在你的伺服器使用！

---

## ✨ 功能總覽
- EXP/等級系統（Lv1 → Lv100），等級上限 100
- 文字訊息每則 +20 EXP，60 秒冷卻（防洗頻）
- 語音頻道每滿 30 分鐘 +50 EXP（需至少 2 名真人、且未自我靜音/自我靜音聽）
- 每日活躍度上限（Daily Cap）：200 EXP（到頂可使用 `/adventure` 冒險抽獎）
- 每日登入 `/daily`：抽取道具（普通/精良/史詩/傳說），**史詩/傳說會廣播**
- 職業路線：戰士系、法師系、獵手系、刺客系、蒙面超人系
  - Lv1 = 冒險者、Lv10 = 高級冒險者
  - Lv20 起選擇其中一條路線，自動在 Lv30/40/…/90 進化
  - Lv100 一律「天帝」
- 自動授予/移除稱號（以 Discord 角色表示）
- 指令（Slash）：`/profile`、`/daily`、`/adventure`、`/job choose`、`/job current`、`/inventory`、`/ranking`
- 防濫用：訊息最短長度、冷卻；語音需真人/非 AFK/非自我靜音
- 全面繁中介面

---

## 🚀 快速開始（最簡單）

### 1) 建立與設定 Discord Bot
1. 前往 [Discord Developer Portal](https://discord.com/developers/applications) → New Application
2. 建立 Bot（左側 **Bot** 分頁 → **Add Bot**）
3. 啟用 **Privileged Gateway Intents**：
   - PRESENCE INTENT（可不勾）
   - **SERVER MEMBERS INTENT** ✅（授予/移除角色用）
   - **MESSAGE CONTENT INTENT** ✅（訊息給 EXP 用）
4. 複製 **Bot Token** 並填入 `.env`
5. 產生邀請連結（左側 **OAuth2 → URL Generator**）：
   - Scopes：`bot`、`applications.commands`
   - Bot Permissions：`Send Messages`, `Embed Links`, `Manage Roles`, `Read Message History`, `View Channels`（若要自動建立頻道，需 `Manage Channels`）
   - 用產生的 URL 邀請到你的伺服器

### 2) 建立 MongoDB Atlas（免費）
1. 前往 [MongoDB Atlas](https://www.mongodb.com/atlas/database) 註冊
2. 建立免費叢集（Shared / Free Tier）
3. 建立資料庫使用者，記下帳號與密碼
4. Network Access 加入 `0.0.0.0/0`
5. 複製連線字串，填入 `.env` 的 `MONGODB_URI`

### 3) 部署到 Render（免費）
1. 到 [Render](https://render.com) 建立帳號
2. 建立 **Web Service** → 選擇 **Node** → 連結你的 Git 倉庫（或上傳壓縮包）
3. Build Command：`npm install`
4. Start Command：`npm start`
5. 設定環境變數（Secrets）：把 `.env` 內容逐項填入
6. 部署成功後，Bot 會自動上線

> 你也可以用 Railway / Replit / VPS，步驟類似：安裝相依套件、設定環境變數、啟動 `npm start`。

---

## 🔧 設定檔 `.env`
複製 `.env.example` → 重新命名為 `.env`，並填上你的資訊。

```env
DISCORD_TOKEN=你的Token
MONGODB_URI=你的Atlas連線字串
GUILD_ID=635520111440297985
ANNOUNCE_CHANNEL_NAME=🎬任務大廳
DEFAULT_LOCALE=zh-TW
```

---

## 🧠 遊戲規則（本專案內建）
- EXP 單位：**EXP**
- 每日上限（Daily Cap）：**200 EXP**（跨來源累計）
- 文字訊息：**每則 20 EXP**（同用戶 60 秒冷卻；長度需 ≥ 5 字）
- 語音：**每 30 分鐘 50 EXP**（至少 2 名真人、未自我靜音/自我靜音聽）
- 等級：
  - 初始 **Lv1**
  - **升到 Lv2 需要 100 EXP**
  - **之後每提升一級，所需 EXP 比前一級多 50**（例：Lv2→3 需 150、Lv3→4 需 200…）
  - 上限 **Lv100**（達成後稱號固定為「天帝」）

### 登入獎勵（/daily）
- 獎勵為 **抽取道具**，稀有度（原始占比）：
  - 普通 70%｜精良 15%｜史詩 4%｜傳說 1%
- 因合計為 90%，本 Bot **採等比正規化**至 100%（維持相對比例）：
  - 普通 ≈ 77.78%｜精良 ≈ 16.67%｜史詩 ≈ 4.44%｜傳說 ≈ 1.11%
- 史詩/傳說：會在 **🎬任務大廳** 公告

### 冒險（/adventure）
- 條件：今日 EXP 達 **200/200**
- 每日 1 次，掉落表 **與登入獎勵相同**（可在未來版本分離配置）
- 史詩/傳說：會在 **🎬任務大廳** 公告

### 職業與稱號
- Lv1：冒險者 → Lv10：高級冒險者（共通）
- **Lv20 起**，可選擇以下任一路線，之後在 Lv30/40/…/90 自動進化：
  - 戰士系：戰士 → 狂戰士 → 龍騎士 → 戰神 → 鋼鐵守護者 → 王者之刃 → 不滅戰魂 → 永恆武聖
  - 法師系：法師 → 元素法師 → 大魔導士 → 星辰賢者 → 虛空術士 → 時空支配者 → 天界大法師 → 永恆魔導王
  - 獵手系：獵手 → 神射手 → 影行者 → 荒野之王 → 狩魂者 → 天隼領主 → 幻影獵神 → 永恆獵王
  - 刺客系：刺客 → 暗影刺客 → 血刃殺手 → 幽冥行者 → 夜幕之王 → 幻影修羅 → 冥界之刃 → 永恆影皇
  - 蒙面超人系：蒙面超人 → 蒙面勇者 → 蒙面騎士 → 蒙面戰神 → 蒙面霸者 → 蒙面王者 → 蒙面傳奇 → 永恆蒙面帝
- **Lv100**：天帝（覆蓋任何路線稱號）
- Bot 會自動建立同名角色作為稱號，並授予/移除

---

## 🧾 指令清單
- `/profile`：查看等級、當前 EXP / 下一級需求、今日進度、當前稱號
- `/daily`：領取登入獎勵（抽道具）
- `/adventure`：達成當日滿分後可抽獎
- `/job current`：查看目前所選職業線與下一個等級稱號
- `/job choose <line>`：在 Lv20（含）可選擇職業線：`warrior | mage | hunter | assassin | masked`
- `/inventory`：查看已獲得道具
- `/ranking`：伺服器排行榜（依等級與累積 EXP 排）

---

## 🔐 權限需求
- 機器人邀請時：`bot` + `applications.commands`
- 權限：`View Channels`, `Send Messages`, `Embed Links`, `Read Message History`, `Manage Roles`, `Manage Channels`（若需自動建立「🎬任務大廳」）

---

## ❓ 常見問題
- **看不到指令？** 確認 `.env` 的 `GUILD_ID` 正確，且 Bot 有 `applications.commands` scope；重新啟動一次。
- **訊息沒給 EXP？** 在 Bot 設定確保已啟用 **MESSAGE CONTENT INTENT**；訊息需 ≥ 5 字且 60 秒冷卻內不重複加成。
- **角色授予失敗？** Bot 的角色必須在伺服器角色階層中**高於**要授予的角色。

---

## 🧩 自訂（未來）
- 你可以要求我幫你調整掉落表、獎勵、冒險與登入使用不同表、加入商城/貨幣系統、任務系統、更多管理介面等等。

祝你遊戲愉快！
