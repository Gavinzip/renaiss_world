# Renaiss World

Discord 文字冒險 / 戰鬥 Bot。

## 目前系統現況（已對齊程式）
- 核心流程：`/start` 建立新討論串 → 選語言 → 選流派（正派 / 機變派）→ 孵化寵物 → 開始探險。
- 冒險敘事：AI 先出故事，再補 7 個選項按鈕。
- 主線：被動觸發，沒有固定主線按鈕。
- 戰鬥：支援手動 / AI 戰鬥，並有逃跑失敗機制。
- 地圖：主要為查看用途；移動由劇情事件觸發。
- 設定：可切換語言、錢包操作、查看 `renaiss世界` 背景導讀。

## 戰鬥與招式（實作中）
- 目前戰鬥主流程使用：
  - `modules/systems/pet/pet-system.js`（寵物、招式池、孵化、復活）
  - `modules/systems/battle/battle-system.js`（回合計算、傷害、逃跑）
- 招式資料採 Tier 1~3（不是 5 品質武學境界制）。
- 目前實作資料量：
  - 正派招式 23
  - 機變派招式 20
  - 初始招式 2

## 重要模組
- `bot.js`：Discord 互動、按鈕流程、主選單、故事與戰鬥串接。
- `modules/content/storyteller.js`：AI 生成故事與選項。
- `modules/content/story/main-story.js`：被動主線推進與終局分歧。
- `modules/content/event-system.js`：事件與世界事件廣播。
- `modules/content/world-map.js`：地圖與地區資料。
- `modules/content/wish-pool-ai.js`：許願池判定與結果套用。
- `modules/systems/player/wallet-system.js`：錢包綁定與資產同步。
- `modules/systems/gacha/gacha-system.js`：開包與招式抽取。
- `modules/core/game-core.js`：世界狀態、玩家存檔、記憶與全域邏輯。

## 根目錄 JS 分類
- 文件：`docs/ROOT_JS_CLASSIFICATION.md`
- 檢查：`npm run audit:root-js`

## 開發測試腳本位置
- `tools/tests/ai-play-review.js`
- `tools/tests/auto-test-5players.js`
- `tools/tests/test-ai-flow.js`
- `tools/tests/test-api.js`

## 資料目錄
- `data/players/`：玩家存檔
- `data/pets.json`：寵物資料
- `data/world.json`：世界狀態
- `data/player_threads.json`：玩家討論串映射
- `data/user_wallets.json`：錢包資料

## 啟動
1. 安裝依賴
```bash
npm install
```
2. 設定環境變數（`.env`）
- `DISCORD_TOKEN`
- `MINIMAX_API_KEY`
- `AI_GLOBAL_CONCURRENCY`
- `AI_RATE_LIMIT_RETRIES`
- `AI_RATE_LIMIT_RETRY_DELAY_MS`
- `SQLITE_BUSY_TIMEOUT_MS`
3. 啟動
```bash
node bot.js
```
4. 伺服器啟動（未指定 `APP_ENV` 時預設 `server`）
```bash
npm run start:server
```
5. 本機啟動
```bash
npm run start
```

## 已移除舊草案
舊版「武學完整境界/內功屬性草案模組」已移除，避免與目前上線玩法混淆。
