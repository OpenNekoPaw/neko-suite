# shared/src

Layer 0 主入口及各子模块。所有目录的设计原则见 [包级 README](../../README.md)。

## 目录索引

```
src/
├── index.ts          # Layer 0 主入口（导出除 vscode/ 外的所有内容）
│
├── types/            # 核心类型定义（50+ 文件）
│   ├── project / element / track / timelineTrack
│   ├── animation / keyframe / easing
│   ├── effects / transition / mask / shape / blendMode / colorCorrection
│   ├── audio / subtitle / speed / transform / geometry
│   ├── agent / skill / task / tool / mcp / canvas（Agent + AI 类型）
│   ├── message / config / exportProtocol / mediaDiffProtocol（IPC 协议）
│   ├── asset/        # 资产管理（manifest / entity / registry / protocol…）
│   └── mediaEngine/  # 媒体引擎接口（engine / decoder / encoder / effects…）
│
├── operations/       # EditOperation 指令系统（apply / invert / helpers）
│
├── errors/           # 错误基础设施（BaseError + IErrorHandler）
│
├── logger/           # 日志接口（ILogger + ConsoleLogger + ILogTransport）
│
├── i18n/             # 国际化服务（II18nService / I18nService / react / webview）
│
├── theme/            # 主题（VSCode CSS Token + nekoTailwindPreset）
│
├── config/           # 统一配置（reader / adapter / normalizer）
│
├── core/             # 核心工具（ConcurrencyPool）
│
├── tools/            # Agent 工具基类（BaseTool）
│
├── utils/            # 通用工具函数（animation / media / colorCorrectionMapping）
│
├── generated/        # Protobuf 生成类型（timeline.engine / diff.engine）
│
└── vscode/           # Layer 1（Extension Host 专用，不从主入口导出）
    └── extension/    # OutputChannelTransport / VSCodeErrorHandler / i18n-bridge
```

## 子模块说明

| 目录 | 层级 | 说明 |
|------|------|------|
| `types/` | Layer 0 | 纯类型，零运行时代码 |
| `operations/` | Layer 0 | EditOperation 指令序列，支持 apply / invert / undo |
| `errors/` | Layer 0 | BaseError 抽象 + IErrorHandler 接口 |
| `logger/` | Layer 0 | ILogger 接口 + ConsoleLogger 默认实现 |
| `i18n/` | Layer 0/2 | Core 导出接口；`react.tsx` / `webview.ts` 含 DOM/React 依赖 |
| `theme/` | Layer 0 | 设计 Token 常量 + Tailwind 预设 |
| `config/` | Layer 0 | 三阶段配置管道（读取 → 适配 → 规范化） |
| `core/` | Layer 0 | 并发池等通用运行时工具 |
| `tools/` | Layer 0 | Agent 工具定义基类 |
| `utils/` | Layer 0 | 动画插值 / 媒体类型检测 / 色彩映射 |
| `generated/` | Layer 0 | 自动生成，勿手动修改（`pnpm generate:types`） |
| `vscode/extension/` | Layer 1 | VSCode-only；通过 `@neko/shared/vscode/extension` 导入 |
