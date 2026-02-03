# stores/

Zustand 状态管理，管理编辑器的全局状态。

## 职责

使用 Zustand 管理项目、时间线、播放、选择等编辑器状态。

## 结构

```
stores/
├── editor-store.ts       # 主 Store 定义
└── slices/               # 状态切片
    ├── projectSlice.ts   # 项目状态
    ├── playbackSlice.ts  # 播放状态
    ├── selectionSlice.ts # 选择状态
    ├── historySlice.ts   # 撤销重做
    ├── uiStateSlice.ts   # UI 状态
    ├── elementOpsSlice.ts # 元素操作
    ├── trackOpsSlice.ts  # 轨道操作
    ├── keyframeSlice.ts  # 关键帧操作
    ├── clipboardSlice.ts # 剪贴板
    ├── shapeOpsSlice.ts  # 形状操作
    └── elementSplitSlice.ts # 元素分割
```

## 状态切片

| Slice | 用途 |
|-------|------|
| `projectSlice` | 项目数据（轨道、元素） |
| `playbackSlice` | 播放状态（时间、播放中） |
| `selectionSlice` | 选中的元素/轨道 |
| `historySlice` | 撤销/重做栈 |
| `uiStateSlice` | UI 状态（缩放、滚动） |
| `elementOpsSlice` | 元素 CRUD 操作 |
| `trackOpsSlice` | 轨道 CRUD 操作 |

## 依赖

```
→ @neko/shared # 项目类型
← hooks/          # Hooks 使用
← components/     # 组件使用
```

## 使用示例

```typescript
import { useStore } from './stores/editor-store';

// 读取状态
const currentTime = useStore(state => state.currentTime);

// 调用 action
const { setCurrentTime, addElement } = useStore();
```
