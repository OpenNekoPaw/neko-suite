# neko-sketch TODO

> 活跃实现任务与结构性维护项的单一清单。已落地能力以当前代码和 `README.md` / `ARCHITECTURE.md` 的稳定边界为准，不在 TODO 或 Roadmap 中保存完成台账。

## P0 — 合入前阻塞项

当前无开放 P0。

## P1 — 当前重点

| 事项 | 类型 | 验收标准 |
| ---- | ---- | -------- |
| PSD 真实外部 fixtures | 兼容性验证 | `test-fixtures/psd/manifest.json` 至少覆盖 Photoshop / Photopea / Krita 样本；`psd-external-fixtures.test.ts` 不再因空 manifest skip |
| PSD 语义增强 | 功能增强 | pass-through group、文本层、智能对象、调整层、蒙版、图层样式都有明确 `PsdImportIssue`，详情报告包含 `layerPath` |
| `.nks` JSON Schema | 格式治理 | 为 `.nks` v1.2 补 JSON Schema 与 schema drift test；`@neko/shared/nks` 继续作为迁移入口 |
| AI palette / brushPreset undo 语义 | 产品决策 | 明确 palette / brushPreset apply 是否进入 history；若进入，补 history 快照与回归测试；若不进入，同步 TODO/README 说明 |

## P2 — 功能开发

| 功能 | 依赖 | 建议切入点 |
| ---- | ---- | ---------- |
| AI Outpainting | AI context snapshot、mask、画布扩展、history | 先做 contract-first：operation、context asset、扩展画布策略、取消/回滚语义 |
| Portrait Retouching | Selection、局部 mask、肤色/人脸区域检测 | 先做非破坏式新图层输出，不直接改原图层 |
| Shadow Maps (SDF) | SDF distance field、LightPass 扩展 | 先实现独立 SDF 生成与可视化调试，再接入阴影 pass |
| Liquify / Mesh Warp | Mesh displacement、交互 brush、history | 先做单图层 mesh warp 数据模型和撤销快照 |
| Bezier 高阶打磨 | Vector layer model | 快捷键、路径 join/split、框选反馈、复制偏移策略、path 命名 |
| Cross-module export | neko-cut / neko-canvas / neko-assets 协议 | 明确 PNG sequence、SVG/vector、asset registration 三条输出契约 |

## P3 — 结构性维护

| 事项 | 原因 | 建议拆分 |
| ---- | ---- | -------- |
| 拆分 `SketchCanvas.tsx` | 当前组件混合指针调度、WebGL、history、AI、vector、selection preview，SRP 压力大 | `vector-overlay/`、`selection-preview/`、`clone-stamp-controller/`、`sketch-canvas-effects.ts` |
| 多 webview 实例隔离回归 | history/selection/renderer-local cache 需要防止跨实例污染 | 增加两个 store 实例的单元测试，覆盖 history 与 region applier 隔离 |

## 暂不建议投入

- PSD 导出：导出端语义损耗大，优先保证 PSD 导入与 `.nks` 原生编辑真源稳定。
- 完整 Photoshop 图层语义：`LayerData` / `.nks` 仍是唯一编辑真源，PSD 只作为有损 adapter。
