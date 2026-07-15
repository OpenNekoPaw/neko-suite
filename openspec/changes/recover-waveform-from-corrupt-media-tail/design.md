## Context

The failing source is a fragmented MP4 whose first 139.3 seconds decode correctly. Its final `moof` contains an unfinished audio `traf/trun`: the nested box sizes extend to end-of-file and the sample count describes media payload bytes as thousands of AAC packet entries. FFmpeg therefore returns a long contiguous run of `AVERROR_INVALIDDATA` from `send_packet`, followed by `AVERROR(EPERM)`. `FfmpegAudioDecoder` currently skips only `InvalidData` and propagates the later `EPERM`, so `generate_waveform_blocking` discards the entire derived waveform. The same malformed metadata reports 1795 seconds of audio even though only about 139 seconds are decodable.

This is an L3 Rust Engine/media change. The source is an external, read-only media boundary where bounded recovery is valid, but internal contract failures and wholly undecodable media must remain fail-visible.

### Five-layer analysis

- **Responsibility:** `engine-audio` owns FFmpeg packet/decode state and classifies a contiguous corrupt tail. `engine-kernel` owns waveform aggregation and finalizes its derived duration. Host API, Extension, and Webview continue to transport and render the Engine result.
- **Dependency:** all new logic stays in Rust Engine crates. No TypeScript computation, feature-package MP4 parser, Webview file access, or cross-extension dependency is introduced.
- **Interface:** `FfmpegAudioDecoder` gains a narrow opt-in corrupt-tail policy and read-only recovery state. Existing `AudioDecoder`, Host API, N-API, CLI, and JSON response contracts remain unchanged.
- **Extension:** another derived sequential preview can explicitly opt into the same decoder policy; strict analysis/export callers retain the existing terminal-error behavior without parallel decoders or format-specific adapters.
- **Testing:** pure policy tests cover every classification branch, focused waveform tests cover recovered duration finalization, and the Engine CLI exercises the original malformed fMP4 through the real service path. Clean and wholly invalid inputs remain separate negative controls.

Shared-foundation and reuse audit: the existing `FfmpegAudioDecoder`, Engine error types, tracing diagnostics, and `WaveformData` are the correct shared owners. Video streaming has a bounded consecutive-decode-error policy, but its seek/hardware-decoder lifecycle differs; copying that recovery loop would couple unrelated streaming semantics. No new shared DTO, registry, cache, path resolver, client, component, or UI surface is required.

## Goals / Non-Goals

**Goals:**

- Return a usable, bounded waveform for a source with a decodable prefix and a structurally corrupt trailing audio fragment.
- Recover only from a proven contiguous corrupt-packet sequence after valid decoded output.
- Bound packet processing and warning volume for malformed sample tables.
- Report the recovered waveform duration and peak count from actual decoded samples.
- Preserve fail-visible behavior for open failures, wholly undecodable inputs, and unrelated FFmpeg errors.

**Non-Goals:**

- Repair, rewrite, or silently replace the source media.
- Add a general MP4 parser or container validator to feature packages.
- Change loudness, silence detection, playback, transcode, export, or final-quality validation to accept truncated input.
- Add a Webview fallback waveform generator or change Engine request/response DTOs.

## Decisions

### 1. Make corrupt-tail recovery an explicit decoder policy

`FfmpegAudioDecoder` will keep terminal recovery disabled by default. Waveform generation will opt into a concrete `RecoverAfterValidOutput` policy. The decoder will track whether it emitted valid output, the current contiguous corrupt-packet count, and whether it terminated through recovery.

This keeps the FFmpeg state transition in the component that owns `send_packet` while preventing tolerant preview semantics from leaking into loudness, silence, export, or other callers.

Alternative rejected: catch `Operation not permitted` in `generate_waveform_blocking`. The caller cannot prove that the error followed decoder corruption, and string/error-code matching outside the decoder would swallow unrelated failures.

### 2. Recover only from a bounded, contiguous corrupt tail

The existing behavior of skipping isolated `AVERROR_INVALIDDATA` packets remains. A successful packet resets the corrupt streak. In opt-in mode, the decoder terminates as a recovered tail only when valid decoded output already exists and either:

- `send_packet` returns `EPERM` while a corrupt streak is active, matching the reproduced unfinished-`trun` state; or
- the corrupt streak reaches a fixed safety budget, preventing malformed packet tables from driving unbounded work and warnings.

If the same budget is reached before any valid frame, the decoder returns an explicit decode failure. `EPERM` without a preceding corrupt streak remains an error. Recovery emits one structured warning containing the recovery event, last valid position, and corrupt packet count; individual warnings are bounded rather than repeated for every bogus entry.

Alternative rejected: treat every `EPERM` as EOF. FFmpeg uses POSIX-style errors for multiple conditions, so an unconditional mapping would hide real decoder misuse.

Alternative rejected: parse and validate MP4 `trun` boxes before FFmpeg. It would duplicate container semantics, cover only one format, and move recovery away from the decoder state that proves valid output and the exact failure sequence.

### 3. Finalize recovered waveforms from decoded sample count

Waveform aggregation will continue using header duration for clean media. When and only when the decoder reports corrupt-tail recovery, `generate_waveform_blocking` will set duration to `decoded_samples / output_sample_rate` and truncate every channel peak vector to `ceil(duration * peaks_per_second)`.

This avoids returning the corrupt container's fabricated 1795-second duration while preserving clean-media compatibility, including normal encoder delay and metadata rounding.

Alternative rejected: always replace header duration with decoded sample count. That creates unnecessary output changes for normal media and can erase intentional timeline duration metadata.

### 4. Keep recovery observable without changing public waveform DTOs

The Engine will emit a structured tracing warning for the recovery event. The existing waveform response remains the derived result contract; no compatibility field, fallback response, or Webview-specific branch is added. A future product requirement for user-visible media-health diagnostics can introduce a separate typed diagnostic contract rather than overloading waveform data.

## Risks / Trade-offs

- **[A long mid-stream corrupt region may be treated as a terminal tail]** → Recovery is opt-in for non-authoritative waveform preview, requires prior valid output and a contiguous safety budget, and never mutates or validates the source as healthy.
- **[The safety budget could be too low for unusually damaged but later recoverable audio]** → Keep it as a named Engine constant with branch tests and validate against the real fixture; do not expose speculative user configuration.
- **[A partial waveform can hide source damage from the timeline]** → Emit an explicit structured warning; export and quality-analysis paths remain strict and source bytes remain unchanged.
- **[No small committed fixture exactly reproduces FFmpeg's malformed final `trun`]** → Lock the error-state classifier and duration finalization with deterministic unit tests, and retain the original Engine CLI command as path-level verification evidence. Do not commit the 104 MB user fixture.

## Migration Plan

1. Add failing policy and waveform-finalization tests.
2. Add the opt-in decoder recovery state and wire only `generate_waveform_blocking` to it.
3. Run focused Rust tests, clean-media controls, the original malformed-media CLI reproduction, and the Cut Webview runtime path.
4. Rollback is code-only: remove the opt-in policy and finalization call. No source media, project data, cache schema, or public contract migration is involved.

## Open Questions

- None. A typed user-visible corrupt-media diagnostic is intentionally deferred because this change does not alter the public waveform response contract.
