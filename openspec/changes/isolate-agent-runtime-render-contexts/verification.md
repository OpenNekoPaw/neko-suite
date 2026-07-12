# 验证记录

## 结论

Agent conversation、run、child-run、Tab render runtime、TUI application runtime 和 projection attachment 已迁移到显式 owner identity。Webview realm reload 使用新 endpoint epoch 重新附加 projection，并按完整 Tab binding 恢复历史、输入草稿和未来 turn 配置，不再使用 Timeline revision-gap fallback 或 active Tab 兜底。

当前实现级与构建验证通过。真实 VS Code functional runner 已启动隔离宿主和开发扩展，但在业务步骤前因 Webview bootstrap 未产生 active content frame 被分类为 infrastructure-fail，因此双 Tab reload 运行态验收仍未完成。

## 已执行验证

### 聚焦测试与构建

- Agent Types Webview protocol/host route：34 tests passed。
- Agent Webview controller/workspace/handler：60 tests passed。
- Tab realm state、runtime registry、React maximum update depth 回归：70 tests passed。
- Agent Extension conversation bridge/provider：54 tests passed。
- Desktop Agent host：21 tests passed；对应实现仍与并行 Desktop 工作重叠，尚未纳入本变更提交。
- `pnpm --dir packages/neko-agent compile`：通过，包含 Extension bundle、Webview `tsc` 和 Vite build。
- `pnpm build`：通过，33 tasks successful。
- `git diff --check`：本变更 owned files 通过。

### Agent evaluation

执行真实 provider-backed scenario：

```bash
node scripts/agent-eval/protocol-smoke.mjs \
  --manifest scripts/agent-eval/scenarios/stream-delivery-lifecycle.scenarios.json \
  --case stream-tool-text-order-and-final-answer
```

结果：`runtime-errors-empty`、final markers、真实 `GetContext` tool call、assistant/tool/assistant ordering 和 Markdown path events 均通过；470 events，`droppedPathEventCount: 0`。同时 `pnpm test:agent:eval` key-free harness 36/36 通过。Key-free harness 仅作为 runner 自测，真实行为结论来自上述 provider-backed case。

### Webview functional

执行：

```bash
pnpm test:webview:functional \
  --scenario scripts/webview-functional/scenarios/agent/agent-lifecycle-reload.p0.scenario.json
```

结果：`infrastructure-fail`。隔离 VS Code 1.128.0、fixture workspace 和四个开发扩展已启动；在执行 scenario step 前，runner 报告 `VS Code Webview bootstrap has no active content frame`。脱敏原始报告位于 `reports/webview-functional/agent.lifecycle-reload.p0/`（gitignored）。未将普通开发窗口、真实用户工作区、凭据或私有配置作为证据。

## 全局门禁阻塞

- `pnpm test`：被工作区并行 Model Webview `import.meta.url` 测试环境失败阻塞。
- Extension `tsc --noEmit`：被并行 perception、Skill 和 quality 改动错误阻塞。
- `pnpm check:unused`：报告并行新增 functional-test files 与既有 exports。
- `pnpm check:deps`：报告既有 `neko-content` cycles。
- `pnpm check:legacy-debt`：报告 85 个既有 blockers。
- Extension router 全文件测试存在并行 Skill 错误文案期望漂移；本变更新增 route 的聚焦断言通过。

这些失败未通过 fallback、改写无关测试或混入并行代码规避。

## 剩余风险

1. 需要修复或稳定 Webview functional runner 的 active content frame 启动路径，然后执行双 Tab、后台 Agent、切换、realm reload、历史与输入/配置恢复场景。
2. Desktop host 的 projection、activation、settings 和 conversation snapshot 对齐代码位于并行未提交修改中，需要由对应 owner 拆分提交并重跑 Desktop producer/consumer tests。
3. 全局 `pnpm test`、`pnpm check`、legacy 和 unused 门禁需在并行工作合并或清理后重跑，才能关闭 7.5、7.6 和 7.8。
