# 文档更新日志 - 2026-03-10

## 更新范围

更新了 `CONTRIBUTING.md` 和 `ARCHITECTURE.md` 两个核心文档，反映最近完成的架构改进。

## 主要更新内容

### 1. 统一引擎架构（EngineClient）

**CONTRIBUTING.md**:
- 更新项目结构说明，明确 `@neko/neko-client` 包含 EngineClient + 流媒体客户端
- 新增依赖关系图，展示统一引擎架构（端口从 3 降为 1）
- 新增 EngineClient 使用示例代码

**ARCHITECTURE.md**:
- 更新整体架构图，标注"统一 HTTP/WebSocket (axum, 单端口)"
- 重写"Extension Host ↔ Rust Engine"通信模式章节，详细说明 EngineClient 架构
- 更新包依赖图，反映 EngineClient 通信方式
- 更新核心数据流（视频播放流、视频导出流），使用 EngineClient API
- 调整 ADR 表格顺序，将"统一引擎架构"置于首位

### 2. 横切关注点统一

**CONTRIBUTING.md**:
- 新增"统一基础设施使用"章节，包含 Logger、i18n、EngineClient 的使用示例
- 更新项目结构说明，明确 `@neko/shared` 包含 Logger/i18n/Theme/Errors

**ARCHITECTURE.md**:
- 更新"权威来源单一"章节，补充 `@neko/neko-client` 和 `@neko/shared` 的职责
- 更新包依赖图，标注"Logger/i18n/Theme/Errors，零内部依赖"

### 3. Vitest 统一

**CONTRIBUTING.md**:
- 更新覆盖率配置章节，说明 Vitest 已统一到 v4.0.18
- 列出覆盖率阈值（Lines: 30%, Branches: 20%, Functions: 25%, Statements: 30%）
- 补充 Vitest v4 注意事项（构造函数 mock、无测试文件处理、exports 解析）

**ARCHITECTURE.md**:
- 更新技术栈表格，明确 Vitest 版本为 v4.0.18

### 4. 优先贡献领域

**CONTRIBUTING.md**:
- 更新优先贡献领域表格，新增"Effects/Shader 系统"和"i18n 翻译补充"
- 移除已完成的"流式 Diff"
- 新增"最新完成的架构改进"参考链接

### 5. 扩展激活依赖链

**ARCHITECTURE.md**:
- 补充说明：所有扩展通过 EngineClient 与 neko-engine 的统一 HTTP/WS 端口通信

## 关联 ADR 文档

- `docs/adr-unified-engine.md` - 统一引擎架构决策
- `docs/architecture/adr-cross-cutting-concerns.md` - 横切关注点统一决策

## 验证

- ✅ 构建通过：`pnpm build` 成功完成（2m44s）
- ✅ 文档一致性：CONTRIBUTING.md 和 ARCHITECTURE.md 描述一致
- ✅ 代码示例：新增的代码示例符合当前实现

## 后续建议

1. 考虑在 README.md 中添加"最近更新"章节，链接到本 CHANGELOG
2. 定期审查文档与代码的一致性，特别是在完成重大架构改进后
3. 补充 Shader/Effects 系统的详细文档（如果尚未完成）
