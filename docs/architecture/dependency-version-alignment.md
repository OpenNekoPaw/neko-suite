# 依赖版本统一策略

## Context

neko-suite 是一个基于 `pnpm workspace` 的 monorepo。根包负责工作区级构建、测试、锁文件和覆盖率策略，而各业务子包按运行时大致分为以下几类：

- Webview 前端包
- VS Code Extension / Node 侧包
- CLI / TUI 包
- 共享类型与基础库包

在这类仓库中，依赖版本不需要全部一刀切统一，但**同一技术族、同一运行时、同一工具链层**必须保持收敛，否则很容易出现以下问题：

- `pnpm install --frozen-lockfile` 在 CI 中放大版本漂移
- `peerDependencies` 不兼容导致构建或测试启动失败
- 同一类包在本地和 CI 上表现不一致
- 锁文件里同时解析出多套核心工具版本，增加排障成本

本文档用于说明：

- 哪些版本必须统一
- 哪些版本建议统一
- 哪些版本可以按包独立演进
- 当前仓库的版本治理建议

---

## 现状快照

以下结论基于当前工作区依赖分布。

### 已经接近统一的部分

- Webview 包的 `vite` 已基本收敛到 `^6.4.2`
- Webview 包的 `@vitejs/plugin-react` 已基本收敛到 `^4.3.4`
- 大多数测试包的 `vitest` 已切到 `^4.1.2`
- Webview 包的 `tailwindcss`、`postcss`、`autoprefixer` 基本一致

### 仍然存在差异的部分

- `packages/neko-tools/package.json` 仍声明 `vitest: ^4.0.18`
- `packages/neko-agent/test-utils/package.json` 将 `vitest` 放在 `dependencies` 而不是 `devDependencies`
- 所有 Webview 基本都使用 `react/react-dom ^18.2.0`，但 `packages/neko-agent/packages/cli-tui/package.json` 使用 `react ^18.3.1`
- `typescript` 目前分散在 `^5.3.2`、`^5.4.0`、`^5.7.2`、`^5.8.3`
- `zustand` 当前存在 `4.4.7`、`4.5.0`、`5.0.0` 三档

---

## 分层治理原则

### 1. 工作区工具链层：必须统一

这类依赖直接影响根级脚本、锁文件解析、CI 和工作区一致性，必须由根包统一治理。

适用依赖：

- `vitest`
- `@vitest/coverage-v8`
- `vite`
- `@vitejs/plugin-react`
- 其他直接参与 Webview 构建链的 Vite 插件

统一方式：

- 根包声明统一版本
- 根包通过 `pnpm.overrides` 强制子包解析一致
- 子包版本声明保持同一技术线，不单独漂移

原因：

- 这组依赖存在严格 peer dependency 关系
- 版本不一致会直接影响 CI 可执行性
- 多套解析结果会让覆盖率、构建和 HMR 出现不可预测问题

---

### 2. 同运行时前端层：建议统一

所有 Webview 包处于相同的浏览器运行时和相似的构建模式，建议统一其前端基础设施版本。

适用依赖：

- `react`
- `react-dom`
- `@types/react`
- `@types/react-dom`
- `tailwindcss`
- `postcss`
- `autoprefixer`
- `jsdom`

原因：

- 同一类包共享同样的打包器、测试环境和样式工具
- 统一后更容易复制配置和迁移组件
- 可以降低类型差异和测试环境差异带来的摩擦

说明：

- Webview 包应尽量统一
- CLI / TUI 包不必强制跟随 Webview 的 React 小版本

---

### 3. 独立运行时业务层：可以按包演进

这类依赖不直接参与工作区核心构建链，也不跨运行时复用具体实现，可以允许差异存在。

适用依赖：

- `zustand`
- 特定媒体库
- AI SDK
- 与某个业务子域强绑定的包

原因：

- 它们通常不通过根包统一驱动
- 差异更多体现为业务能力差异，而不是基础设施冲突
- 强行统一可能引入不必要的升级成本

前提：

- 不跨包共享具体运行时实现
- 不在根级脚本中被统一直接调用

---

### 4. 编译器与类型系统层：分阶段统一

`typescript` 建议统一，但不应和本轮 `vite/vitest` 升级混做一轮。

原因：

- TypeScript 版本差异更常影响的是类型推断、编辑器体验和编译边界
- 升级 TypeScript 往往会连带暴露新的类型错误
- 与构建链升级同时进行会增加变量数，排障成本更高

建议：

- 先统一构建与测试链
- 再单独做一轮 TypeScript 基线升级

---

## 是否需要统一：结论矩阵

| 依赖族 | 是否建议统一 | 统一范围 | 说明 |
| --- | --- | --- | --- |
| `vitest` / `@vitest/coverage-v8` | 必须 | 全工作区测试包 | 直接影响 CI 与覆盖率 |
| `vite` / `@vitejs/plugin-react` / Vite 插件 | 必须 | 所有 Webview 包 | 直接影响 Webview 构建链 |
| `react` / `react-dom` | 建议 | 所有 Webview 包 | 浏览器运行时一致，便于共享组件 |
| `@types/react` / `@types/react-dom` | 建议 | 所有 Webview 包 | 降低类型偏差 |
| `tailwindcss` / `postcss` / `autoprefixer` | 建议 | 所有 Webview 包 | 样式链最好统一 |
| `jsdom` | 建议 | 所有 DOM 测试包 | 保持测试环境一致 |
| `typescript` | 分阶段统一 | 工作区逐步推进 | 不建议和构建链升级混做 |
| `zustand` | 可选 | 仅共享状态层相关包 | 业务层依赖，可暂不强制 |
| CLI 专属 React 依赖 | 不强制 | CLI / TUI 自身 | 可与 Webview React 小版本不同 |

---

## 当前仓库的推荐基线

### A. 工作区构建与测试基线

建议作为当前统一目标：

- `vitest`: `4.1.x`
- `@vitest/coverage-v8`: `4.1.x`
- `vite`: `6.4.x`
- `@vitejs/plugin-react`: `4.3.x`
- `vite-plugin-static-copy`: `4.0.x`

说明：

- `Vitest 4.1+` 需要 `Vite 6+`
- 当前仓库不需要为了 `Vitest 4.1+` 直接跳到 `Vite 8`
- 将 `Vite 8` 作为下一轮独立升级更合理

---

### B. Webview React 生态基线

建议当前统一目标：

- `react`: `18.2.x`
- `react-dom`: `18.2.x`
- `@types/react`: `18.2.x`
- `@types/react-dom`: `18.2.x`

说明：

- 当前大多数 Webview 已在这一基线上
- `cli-tui` 使用 `react 18.3.x` 可保留为例外，不强制回退

---

### C. 样式与 DOM 测试基线

建议保持一致：

- `tailwindcss`: `3.3.x`
- `postcss`: `8.4.x`
- `autoprefixer`: `10.4.x`
- `jsdom`: `27.x`

---

### D. TypeScript 基线

建议策略：

- 当前阶段不强制立即统一
- 下一轮单独评估统一到 `5.8.x`

说明：

- 若直接在本轮统一 TypeScript，可能引入与 `vite/vitest` 升级无关的类型噪音

---

## 当前应优先修正的问题

以下问题优先级最高：

1. 将所有测试包的 `vitest` 声明收敛到同一技术线，避免同时存在 `4.0.x` 与 `4.1.x`
2. 将 `packages/neko-agent/test-utils/package.json` 中的 `vitest` 从 `dependencies` 调整到 `devDependencies`
3. 确保所有 Webview 包的 `vite` 与 `@vitejs/plugin-react` 使用兼容组合
4. 对根包继续保留 `pnpm.overrides`，防止后续新增包重新引入漂移

---

## 推荐执行顺序

### 第一阶段：收敛工作区工具链

- 统一 `vitest`
- 统一 `@vitest/coverage-v8`
- 统一 `vite`
- 统一 `@vitejs/plugin-react`
- 统一相关 Vite 插件

验证命令：

```bash
pnpm install --frozen-lockfile
pnpm test -- --run --coverage
```

---

### 第二阶段：收敛 Webview 运行时基础设施

- 统一 `react/react-dom`
- 统一 `@types/react/@types/react-dom`
- 统一 `tailwindcss/postcss/autoprefixer`
- 统一 `jsdom`

验证目标：

- 代表性 Webview 构建通过
- 代表性 Webview 测试通过

---

### 第三阶段：单独处理 TypeScript

- 确定工作区 TypeScript 目标版本
- 分批修复类型问题
- 避免与构建链升级同轮进行

---

## 维护约束

后续新增或修改依赖时，应遵守以下规则：

- 根包已通过 `overrides` 管控的构建/测试依赖，子包不得擅自升级到另一条技术线
- 新增 Webview 包时，应直接复用现有 Webview 基线版本
- 测试框架只能放在 `devDependencies`，不应进入运行时依赖
- 若某个包需要偏离公共基线，必须说明运行时原因，而不是“本地先能跑”

---

## 总结

本仓库不需要“所有依赖全部统一”，但必须做到：

- 工作区工具链统一
- Webview 前端基础设施尽量统一
- 独立运行时的业务依赖允许差异
- TypeScript 作为单独阶段治理

这套策略的目标不是追求表面整齐，而是减少 CI 不稳定、锁文件漂移和跨包维护成本。
