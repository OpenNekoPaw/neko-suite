## 1. CLI contract and routing

- [x] 1.1 Add direct media command types, model-resolution contract, result DTO, and fail-visible diagnostics for image/video/audio.
- [x] 1.2 Register the three flat Commander commands and prove they no longer enter the default prompt/interactive Agent path.
- [x] 1.3 Add English and Chinese CLI help/result/diagnostic presentation plus shell completion entries.

## 2. Direct media runtime

- [x] 2.1 Implement the injected direct media command orchestrator for submit, terminal wait, validation, and text/JSON projection.
- [x] 2.2 Compose the concrete Node runtime from existing config, SQLite Task storage, generated asset index, CLI Platform, `submitMediaTurn`, and `NodeMediaTaskDeliveryHost`.
- [x] 2.3 Ensure audio submits canonical text-to-audio without music/TTS inference and ensure every direct failure remains fail-visible without Agent fallback.

## 3. Path-level tests

- [x] 3.1 Add orchestrator tests for all media kinds, explicit/default model selection, stable asset delivery, task failure, and missing-model rejection.
- [x] 3.2 Add CLI action tests that poison interactive/Agent execution and assert image/video/audio direct routing, JSON output, and nonzero diagnostics.
- [x] 3.3 Add or update architecture guards proving the direct CLI module does not import AgentSession/runtime execution APIs.

## 4. Documentation and validation

- [x] 4.1 Update TUI/CLI user documentation for flat commands, options, direct-path semantics, outputs, and breaking interpretation of `neko image|video|audio`.
- [x] 4.2 Run focused `@neko/app-tui` tests, typecheck/build, OpenSpec validation, `git diff --check`, and applicable legacy/unused checks.
- [x] 4.3 Record Evaluation disposition and path/no-fallback evidence; run focused real Agent evaluation only if implementation changes Agent behavior.
- [x] 4.4 Perform `neko-quality-review`, resolve blocking findings, and record unexecuted provider-backed smoke tests and residual risk.
