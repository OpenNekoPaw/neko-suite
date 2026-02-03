# views/

视图组件模块，提供 VSCode 视图相关组件。

## 职责

实现状态栏和大纲视图等 VSCode UI 组件。

## 结构

```
views/
├── index.ts              # 模块导出
├── statusBar.ts          # 状态栏管理
└── outlineProvider.ts    # 大纲视图提供者
```

## 接口

| 导出 | 类型 | 用途 |
|------|------|------|
| `StatusBar` | 类 | 状态栏管理 |
| `VideoProjectOutlineProvider` | 类 | 大纲树视图 |

## 依赖

```
→ @uniedit/shared     # 项目类型
← extension.ts        # 视图注册
← commands/           # 命令操作
```

## 功能

**StatusBar**:
- 显示当前项目状态
- 显示导出进度
- 快捷操作入口

**OutlineProvider**:
- 显示时间线结构
- 轨道和元素树
- 点击跳转到元素
