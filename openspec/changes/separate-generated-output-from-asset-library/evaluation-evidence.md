## Evaluation Scope

- Change: `separate-generated-output-from-asset-library`
- Decision: update `agent-runtime.workflow-controller` / `task-continuation`
- Canonical path: TUI input queue -> AgentSession -> image task -> task-result observation -> typed continuation -> generated `ResourceRef` -> `ReadImage`
- Forbidden fallback: generated-output id routed through `GetAsset`, implicit AssetLibrary membership, prompt-only image summary, or direct Agent runner

## Cases

- Updated: `agent-runtime.workflow-controller/task-continuation`
- Deterministic coverage: generated observation emits only `resource`; explicit AssetLibrary ids remain supported; `GetAsset(generated-id)` fails before import; imported AssetEntity id succeeds.
- Real case evidence: task terminal result linked to its observation id, typed continuation identity without diagnostics, `ReadImage` success, `GetAsset` absence, generated artifact digest/provenance/delivery/validator, runtime errors, and split terminal idle.
- External evaluator change: the existing artifact hard gate now supports a strict dynamic selector by artifact kind and optional provenance because generated resource ids are runtime-created. It still requires digest, delivered state, provenance, and valid owning validator.

## Verification

- Key-free validation: `pnpm test:agent:eval` passed 263 tests in 39 files; strict all-suite dry-run passed 26 suites and 38 cases.
- Focused deterministic TUI capability path: 25 tests passed across default capability assembly, content access, perception asset loading, and session runtime assembly. The pathless lifecycle `ResourceRef` test enters through the real `ToolRegistry` and resolves only through the supplied generated-output index.
- Extension red-capable repro: `pnpm exec vitest --run packages/neko-agent/packages/extension/src/services/__tests__/agentContentAccessRuntime.test.ts` failed before the fix with `content-cache-unsupported-source` and the exact diagnostic `Generated asset resource requires local generated asset metadata.` for `caller: read-image`.
- Extension deterministic path: 28 tests passed across the shared Platform resolver, Extension content runtime, Extension perception loader, `ReadImage`, and TUI default capability assembly. The Extension test executes the real `ReadImage` tool, consumes its perception card through `createLocalPerceptionAssetLoader`, and keeps the lifecycle ref pathless.
- Focused dry-run: passed for `agent-runtime.workflow-controller/task-continuation` with all 9 assertions accepted by the strict schema.
- Real TUI run: `run-mrk2bjpz`, report `report-run-mrk2bjpz`, outcome `pass`, model `nekoapi-chat/gpt-5.5`, effective configuration digest `sha256:cab5b8af9235db02b5823061743327c25fef5a7d60289f712b26188214758ca6`, fixture digest `sha256:789049929d67cf16d190dc363325175f3d63ef62ca210de508ede615e2376081`.
- Real report locations: `reports/agent-eval/agent-runtime.workflow-controller/task-continuation/run-mrk2bjpz/{result.json,evidence.json,artifact-manifest.json,quality-report.md,summary.json}`.
- Real hard gates: 9/9 passed. The task completed with `resultObservation.status=observed`; `ReadImage` succeeded; `GetAsset` was absent; `task-continuation-identity-incomplete` was absent; process order and all terminal-idle concerns passed; runtime errors and evidence dropped counts were zero.
- Artifact evidence: dynamic ref `res_1ymewyp`, digest `sha256:c7f58f67e6a9900bcce54d07c51f7fb1b6abc93a29f784fb313d38bc5289b00c`, provenance `generated-asset`, delivery `delivered`, validator `durable-resource-ref/valid`.
- Usage evidence: 145658 ms latency, 0 retries; provider token/cost counts were unavailable (`0` reported by the runtime projection).

## Extension Development Host Evidence

- `vscode-extension-debugger` preflight attached to the current VS Code CDP endpoint on port 9222; it found the built-in Extension Development Host page `[扩展开发宿主] settings.json — neko-test` and the `neko.neko-agent` Webview iframe.
- The built-in `Debug Dev (All)` session was restarted in place after `pnpm build:neko-agent`; no `code` command, Chrome, Playwright, `.vscode-test`, or standalone Electron host was used.
- The previously failing conversation was reopened and submitted: `请重新使用刚才完成任务提供的 resourceRef 调用 ReadImage，并通过感知分析实际图片。不要重新生成。`
- The real Extension turn reused pathless resource `res_1bpczcb`, completed `ReadImage`, reported `PNG`, `1024 × 1024`, and actual visual content (`橘白小猫在室内地毯上玩彩色毛线球`). The turn reached terminal `完成`; the new-turn DOM assertion recorded `readImage=true`, `readSucceeded=true`, `actualDimensions=true`, `missingMetadata=false`, and no active run status.
- Webview console evidence contained only the known VS Code container warning `Unrecognized feature: 'local-network-access'.`; no Neko content-access, CSP, or runtime error was emitted.

## Interpretation

- Confirmed implementation defect: generic presentation `assets[]` entries were implicitly projected as AssetLibrary refs even when the same entry carried a generated `ResourceRef`.
- Confirmed owner: Agent task-result normalization; AssetLibrary lookup and generated-output persistence were already behaving according to their ownership boundaries.
- Confirmed TUI assembly defect: the default content capability omitted both the binding-owned ResourceCache manifest store and the session-owned generated-output lookup required to materialize a pathless lifecycle ref.
- Confirmed continuation defect: the running-Agent auto-resume branch dropped `taskId`, `observationId`, `runId`, and policy while queueing the follow-up. Typed queue metadata now preserves the task-to-observation link; the real run contains no continuation diagnostic.
- Confirmed Extension assembly defect: activation created `AgentContentAccessRuntime` before the workspace `GeneratedAssetIndex` and supplied no generated-resource resolver. Extension now creates the existing index first and injects the same Platform resolver used by TUI.

## Residual Risk

- This is one real sample, so it proves the focused canonical path but does not establish a stability distribution.
- Output-content Judge and baseline stages were intentionally not configured because this change concerns deterministic identity/routing correctness rather than subjective image quality.
- Provider token and cost accounting remained unavailable in the reported runtime usage.
- Extension Development Host evidence reused one existing generated output and one host session; deterministic tests cover missing lookup and non-generated refs, but runtime acceptance is not a repeated stability sample.
