## Why

Waveform generation currently fails with the opaque FFmpeg error `Operation not permitted` when an otherwise playable fragmented MP4 ends with an unfinalized audio `traf/trun`. The decoder has already produced usable audio before the damaged tail, so the Cut timeline should receive a bounded partial waveform with an explicit recovery diagnostic instead of losing the entire derived preview.

## What Changes

- Add an Engine-owned corrupt-tail recovery contract for sequential audio decoding: recover only after at least one valid decoded frame and a contiguous corrupt-packet streak; keep open-time failures, first-packet failures, and unrelated decoder errors fail-visible.
- Stop malformed packet-table tails without repeatedly feeding non-advancing bogus packets into FFmpeg or emitting an unbounded warning stream.
- Build waveform duration and peak length from the samples actually decoded when the source duration metadata is inconsistent with recoverable media content.
- Preserve the existing Engine action and Webview message contracts; callers continue to request waveform data through the canonical Engine path.
- Add focused Rust regression coverage and verify the original `1080P.mp4` reproducer through the Engine CLI.
- Non-goals: repairing or rewriting the source media, adding an MP4 parser to feature packages, or making loudness/silence/export silently accept truncated sources.

## Capabilities

### New Capabilities

- `corrupt-media-waveform-recovery`: Defines when Engine waveform generation may return a bounded partial waveform for a media file with a damaged trailing audio fragment, and when corruption must remain an explicit failure.

### Modified Capabilities

- None.

## Impact

- Affected code: `packages/neko-engine/packages/engine-audio` decoder state/error handling and `packages/neko-engine/packages/engine-kernel` waveform aggregation.
- Affected runtime path: Cut/Audio waveform requests through the existing Host API, N-API, CLI, and `@neko/neko-client` action path.
- Public Engine request/response DTOs, Protobuf, `.nkv` files, source media bytes, and Webview UI contracts are unchanged.
- Compatibility: normal media behavior remains unchanged; damaged media that currently returns an opaque error may return a shorter derived waveform. The source remains read-only and can be reimported or repaired externally.
- Rollback: remove the recovery policy and actual-duration finalization; no persisted data migration is required because waveforms are rebuildable derived state.
