# TODO

> 当前迭代的活跃任务清单。长期路线图见 [ROADMAP.md](./ROADMAP.md)。
> 服务端任务在 [neko-hub](../neko-hub) 仓库，本文件仅跟踪客户端（VSCode 插件）。

---

## 🟢 P2 — 增强功能

- [ ] neko-engine 渲染补齐：shapes / keyframes（effects ✅ subtitles ✅）
- [ ] neko-tools 音频静音检测 UI（数据层已就绪，仅缺 AudioDiffViewer 沉默区域可视化）

---

## 🔵 P3 — 长期功能

- [ ] Diff/LSP AI 增强（CLIP 语义打分 + Whisper ASR Diff + Demucs 音源分离 + VQA，按需推进）— [ADR](./docs/architecture/lsp.md)
- [ ] neko-agent MCP 客户端重连退避（低复杂度，低优先级）
- [ ] neko-model AI MCP Tools：`face.generate_params` / `face.from_image` / `face.adjust`
- [ ] neko-sketch S.4：`sketch.generate` / `style_transfer` / 跨模块集成
- [ ] `neko://` 协议 + MediaResolver 代理/原始自动切换（Phase 6.6 客户端，依赖服务端）
- [ ] ONNX 跨平台打包：随扩展分发 onnxruntime 动态库（Windows/Linux）
- [ ] neko-live 虚拟制片（MediaPipe + VMC + VRM + 录制 + 推流）
- [ ] VR/AR 沉浸式创作（远期 Phase 7）
- [ ] Git LFS 集成（.gitignore/.gitattributes 模板 + pHash + OID 自动填充）

---

## 📋 技术债务

- [x] ESLint 升级 ✅（`prefer-const`/`no-useless-escape` error；security 误报规则关闭；1837→0 error / 895 warn）
- [x] 国际化扩展 ✅（neko-model/neko-story webview i18n + neko-market/neko-auth L10N 补齐）

**扫描基线**：`pnpm build` ✅ | `pnpm test` ✅ | `pnpm lint` 0 error ✅ | **0 循环依赖** ✅

---

*最后更新：2026-03-26*
