const SLASH_COMMANDS = [
  { name: 'start', description: '開始你的Renaiss星球冒險！（有存檔則繼續）' },
  { name: 'warstatus', description: '查看正派與 Digital 張力、勢力值與最近三次衝突' },
  {
    name: 'resetdata',
    description: '清空角色資料（需密碼）',
    options: [
      {
        type: 3,
        name: 'scope',
        description: '清空範圍：自己或所有人',
        required: true,
        choices: [
          { name: '自己', value: 'self' },
          { name: '所有人', value: 'all' }
        ]
      },
      {
        type: 3,
        name: 'password',
        description: '安全密碼',
        required: true
      }
    ]
  },
  {
    name: 'resetplayerhistory',
    description: '清空指定玩家全部角色資料（需密碼）',
    options: [
      {
        type: 3,
        name: 'player_id',
        description: '要清空歷史的玩家 Discord ID',
        required: true
      },
      {
        type: 3,
        name: 'password',
        description: '安全密碼',
        required: true
      }
    ]
  },
  {
    name: 'resetworld',
    description: '清空世界事件或重置整個世界（需密碼）',
    options: [
      {
        type: 3,
        name: 'mode',
        description: '清空範圍：events(只清事件) 或 all(整個世界重置)',
        required: true,
        choices: [
          { name: '世界事件', value: 'events' },
          { name: '全部世界', value: 'all' }
        ]
      },
      {
        type: 3,
        name: 'password',
        description: '安全密碼',
        required: true
      }
    ]
  },
  {
    name: 'backupworld',
    description: '手動備份世界/玩家/記憶資料到備份 Git（需密碼）',
    options: [
      {
        type: 3,
        name: 'password',
        description: '安全密碼',
        required: true
      },
      {
        type: 3,
        name: 'note',
        description: '備份備註（可選）',
        required: false
      }
    ]
  },
  {
    name: 'backupcheck',
    description: '檢查備份環境變數是否被程式讀到（需密碼）',
    options: [
      {
        type: 3,
        name: 'password',
        description: '安全密碼',
        required: true
      }
    ]
  },
  {
    name: 'pullworlddata',
    description: '從遠端備份 Git 拉最新資料並覆蓋伺服器資料（需密碼）',
    options: [
      {
        type: 3,
        name: 'password',
        description: '安全密碼',
        required: true
      }
    ]
  }
];

module.exports = {
  SLASH_COMMANDS
};
