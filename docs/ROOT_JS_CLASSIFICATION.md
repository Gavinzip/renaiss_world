# Root JS 分類（分層版）

目標：根目錄只保留 `bot.js`；舊根目錄主程式已按職責分類到 `modules/core`、`modules/content`、`modules/systems`。

## 根目錄規則
- 允許：`bot.js`
- 其他 `.js` 不應出現在根目錄

## 模組分層（關鍵檔案）
- Core
  - `modules/core/storage-paths.js`
  - `modules/core/game-core.js`
- Content
  - `modules/content/storyteller.js`
  - `modules/content/event-system.js`
  - `modules/content/world-map.js`
  - `modules/content/story/main-story.js`
  - `modules/content/story/island-story.js`
- Systems
  - `modules/systems/pet/pet-system.js`
  - `modules/systems/battle/battle-system.js`
  - `modules/systems/gacha/gacha-system.js`
  - `modules/systems/market/economy-system.js`
  - `modules/systems/player/wallet-system.js`
  - `modules/systems/data/memory-index.js`
  - `modules/systems/data/world-backup.js`

## 檢查規則
- 指令：`npm run audit:root-js`
- 腳本：`tools/audit-root-js-layout.js`
- 會檢查：
  - 根目錄是否只有 `bot.js`
  - 分層後關鍵檔案是否存在
  - `modules/app` 是否仍有 `.js`（應為空）
