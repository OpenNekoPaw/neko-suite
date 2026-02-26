# neko-tools Diff 重构计划

## 目标

将 neko-tools 的 diff 分析从 TypeScript 自实现改为委托给 Rust 引擎的原生 diff 接口。

## 架构变化

```
重构前:
  Analyzer → EngineMediaService → neko.engine.probeInternal / decodeAudio / extractFrame
  (TS 侧自己做 diff 计算，且 decodeAudio 调用了不存在的 audios:extract)

重构后:
  Analyzer → EngineMediaService.diff() → neko.engine.diff → Rust engine dispatch
  (委托给引擎原生 diff，TS 侧只做 Engine→Protocol 类型转换)
```

## 改动文件

### 1. neko-engine extension: 注册 `neko.engine.diff` 命令
- `packages/neko-engine/packages/extension/src/extension.ts`
- 新增 `neko.engine.diff` 命令，接收 (group, sourceA, sourceB, options?) 参数
- 内部调用 `engine.dispatchAction(group, 'diff', ...)`
- 同时移除有 bug 的 `neko.engine.decodeAudio` 命令

### 2. neko-tools EngineMediaService: 新增 diff 方法
- `packages/neko-tools/packages/extension/src/services/EngineMediaService.ts`
- 新增 `diff(group, sourceA, sourceB, options?)` 方法
- 调用 `neko.engine.diff` 命令
- 返回 `EngineDiffResult`

### 3. 四个 Analyzer 重构为引擎委托
- `AudioDiffAnalyzer.ts` → 调用 `engineMediaService.diff('audios', ...)`
- `VideoDiffAnalyzer.ts` → 调用 `engineMediaService.diff('videos', ...)`
- `TimelineDiffAnalyzer.ts` → 调用 `engineMediaService.diff('timelines', ...)`
- `ImageDiffAnalyzer.ts` → 调用 `engineMediaService.diff('images', ...)`
- 每个 Analyzer 负责: 写临时文件 → 调引擎 diff → Engine 类型转 Protocol 类型

### 4. 类型系统（无需改动）
- `diff.engine.ts` 已有完整的引擎类型
- `mediaDiffProtocol.ts` 已有展示层类型和转换注释
