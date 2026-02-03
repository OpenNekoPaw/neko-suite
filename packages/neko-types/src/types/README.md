# types/

共享类型定义模块，提供项目核心数据结构定义。

## 职责

集中定义 Extension ↔ Webview 通信协议和项目数据结构。

## 结构

```
types/
├── index.ts              # 类型汇总导出
│
├── project.ts            # 项目结构
├── element.ts            # 元素类型
├── track.ts              # 轨道类型
├── timelineTrack.ts      # 时间线轨道
│
├── message.ts            # 消息协议
├── config.ts             # 配置类型
├── task.ts               # 任务类型
│
├── animation.ts          # 动画类型
├── keyframe.ts           # 关键帧
├── easing.ts             # 缓动函数
│
├── effects.ts            # 特效类型
├── transition.ts         # 转场类型
├── mask.ts               # 遮罩类型
├── shape.ts              # 形状类型
│
├── colorCorrection.ts    # 色彩校正
├── blendMode.ts          # 混合模式
│
├── audio.ts              # 音频类型
├── subtitle.ts           # 字幕类型
├── speed.ts              # 速度控制
│
├── transform.ts          # 变换类型
├── geometry.ts           # 几何类型
│
└── aiAction.ts           # AI 动作
```

## 类型分类

| 分类 | 文件 | 用途 |
|------|------|------|
| **项目结构** | project, element, track | 项目数据模型 |
| **通信协议** | message, config, task | Extension ↔ Webview |
| **视觉效果** | effects, transition, animation | 特效和动画 |
| **媒体相关** | audio, subtitle, speed | 音频和字幕 |
| **几何变换** | transform, geometry, mask | 空间变换 |

## 依赖关系

```
shared (被所有其他包依赖)
    ├── extension   ← 依赖 shared
    ├── webview     ← 依赖 shared
    ├── assistant   ← 依赖 shared
    ├── media-engine← 依赖 shared
    └── platform    ← 依赖 shared
```

## 设计原则

1. **纯类型**：不包含运行时代码
2. **单一来源**：所有共享类型集中定义
3. **向后兼容**：使用可选属性
4. **文档化**：每个类型都有 JSDoc
