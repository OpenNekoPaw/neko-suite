# types/

类型定义模块，定义 Webview 本地使用的类型。

## 职责

定义 Webview 组件和逻辑使用的 TypeScript 类型。

## 结构

```
types/
├── index.ts              # 类型导出
├── element.ts            # 元素类型扩展
├── track.ts              # 轨道类型扩展
├── effects.ts            # 特效类型
├── transition.ts         # 转场类型
├── animation.ts          # 动画类型
├── keyframe.ts           # 关键帧类型
├── mask.ts               # 遮罩类型
├── subtitle.ts           # 字幕类型
├── audio.ts              # 音频类型
├── rendering.ts          # 渲染类型
├── ui.ts                 # UI 类型
└── message.ts            # 消息类型
```

## 依赖

```
→ @neko/shared # 基础类型
← 所有其他模块   # 类型引用
```

## 与 shared 的关系

```
@neko/shared: 跨包共享的基础类型
webview/types:   Webview 特有的扩展类型

// 示例：扩展元素类型
interface WebviewElement extends TimelineElement {
  // Webview 特有的属性
  renderCache?: ImageBitmap;
}
```
