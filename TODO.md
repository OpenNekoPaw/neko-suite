# TODO

> 当前迭代的活跃任务清单。长期路线图见 [ROADMAP.md](./ROADMAP.md)。
> 服务端任务在 [neko-hub](../neko-hub) 仓库，本文件仅跟踪客户端（VSCode 插件）。

---

## ✅ P0 — GPU 管线零拷贝（已完成）

- [x] ~~消除 `processor.rs` readback~~ → 分析发现 `GpuProcessor` 是死代码（无调用者），导出管线已使用 `GpuStyleProcessor` texture-to-texture 路径。已删除。
- [x] ~~激活 `gpu_pipeline.rs` Phase 2~~ → 分析发现 `GpuPipeline` 是纯接口定义（无处理逻辑），macOS 已通过 `RgbaToNv12TextureConverter` + IOSurface 实现全链路零拷贝。已删除死代码。

**结论**：macOS 已完全零拷贝；Linux/Windows NV12 导出 readback 降级为 P2。
详见 [Property Panel GPU 管线分析](./docs/architecture/property-panel-pipeline.md#6-gpu-管线分析零拷贝状态)

---

## 🟡 P1 — 缺失 Shader 补齐

- [ ] Curves 曲线调色 GPU shader（UI 已完成，引擎无实现）
- [ ] Color Wheels 三向色轮 GPU shader（UI 已完成）
- [ ] HSL 选择性调色 GPU shader（8 色域独立调整，UI 已完成）
- [ ] Chroma Key 色度抠像 GPU shader（UI 已完成）
- [ ] Luma Key 亮度抠像 GPU shader（UI 已完成）
- [ ] Sharpen 锐化 GPU shader（UI 已完成）

---

## 🟢 P2 — 增强功能

- [ ] neko-engine 渲染补齐：shapes / keyframes（effects ✅ subtitles ✅）
- [ ] neko-tools 音频静音检测 UI（数据层已就绪，仅缺 AudioDiffViewer 沉默区域可视化）
- [ ] Linux/Windows NV12 导出零拷贝（激活 DMA-BUF/DXGI export 路径，消除 `rgba_to_nv12.rs` readback）
- [ ] `apply_custom_tex_fallback()` CPU round-trip 迁移到 GPU compute

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
- [x] neko-agent 类型去重 ✅（新建 `@neko-agent/types` 共享包，消除 9 处重复类型定义；`ToolParameters` 类型约束防止工具 schema 错误）
- [x] neko-agent Logger 去重 ✅（`createLoggerRegistry()` 工厂函数，4 份 ~20 LOC 样板 → 各 1 行）

**扫描基线**：`pnpm build` ✅ | `pnpm test` ✅ | `pnpm lint` 0 error ✅ | **0 循环依赖** ✅

---

*最后更新：2026-03-27*
