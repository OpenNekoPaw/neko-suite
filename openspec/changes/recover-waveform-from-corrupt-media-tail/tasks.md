## 1. Regression Contracts

- [x] 1.1 Add decoder policy tests for valid-prefix recovery, pre-output corruption rejection, isolated-corruption reset, bounded corrupt streaks, and unrelated `EPERM` propagation; confirm they fail before implementation.
- [x] 1.2 Add waveform finalization tests proving recovered duration/peak truncation uses decoded sample count while clean-media metadata duration remains unchanged; confirm they fail before implementation.

## 2. Engine Implementation

- [x] 2.1 Add the opt-in corrupt-tail recovery policy and read-only recovery state to `FfmpegAudioDecoder`, with existing terminal behavior as the default.
- [x] 2.2 Implement bounded contiguous-corruption tracking, qualified `EPERM` recovery, pre-output fail-visible handling, successful-packet reset, and structured summary diagnostics without per-packet log flooding.
- [x] 2.3 Opt only waveform generation into recovery and finalize recovered `WaveformData` duration and channel peak lengths from decoded samples.

## 3. Verification And Cleanup

- [x] 3.1 Run `cargo fmt --check`, focused `neko-engine-audio` and `neko-engine-kernel` tests, and relevant `cargo clippy` checks.
- [x] 3.2 Rebuild the Engine CLI and verify clean `720P.mp4` remains successful while malformed `1080P.mp4` returns an approximately 139-second waveform, emits the recovery diagnostic, and leaves the source hash unchanged.
- [x] 3.3 Validate the affected Cut waveform path in the Extension Development Host with `vscode-extension-debugger`/the focused Webview functional path, or record the exact environmental blocker and residual risk.
- [x] 3.4 Remove all temporary `[DEBUG-*]` instrumentation and throwaway diagnostic artifacts, run `git diff --check`, and complete the Neko L3 quality review with residual risks recorded.
