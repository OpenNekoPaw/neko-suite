# hooks/

自定义 React Hooks，封装通用逻辑和状态管理。

## 职责

提供可复用的 Hooks，封装 VSCode 消息通信、键盘快捷键、渲染等逻辑。

## 结构

```
hooks/
├── index.ts                 # Hooks 导出
├── useVSCodeMessaging.ts    # VSCode 消息通信
├── useKeyboardShortcuts.ts  # 键盘快捷键
├── useShallowStore.ts       # 浅比较 Store
├── useCompositorRender.ts   # GPU 渲染
├── useTimeline.ts           # 时间线操作
├── usePlayback.ts           # 播放控制
├── useSelection.ts          # 选择管理
├── useHistory.ts            # 撤销重做
├── useDragDrop.ts           # 拖放操作
└── useResize.ts             # 尺寸调整
```

## 主要 Hooks

| Hook | 用途 |
|------|------|
| `useVSCodeMessaging` | 与 Extension Host 通信 |
| `useKeyboardShortcuts` | 注册快捷键 |
| `useShallowStore` | 优化 Store 订阅 |
| `useCompositorRender` | GPU 渲染控制 |
| `useTimeline` | 时间线操作封装 |
| `usePlayback` | 播放/暂停/跳转 |

## 依赖

```
→ stores/         # 状态读写
→ rendering/      # GPU 渲染
→ utils/          # 工具函数
← components/     # UI 组件使用
```
