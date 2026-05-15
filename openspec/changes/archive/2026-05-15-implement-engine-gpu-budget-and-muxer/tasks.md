## 1. Budget Controller

- [x] 1.1 Add `GpuBudgetController`, `PipelinePriority`, `GpuPermit`, and configuration types.
- [x] 1.2 Track per-pipeline frame-time EMA and weighted global EMA.
- [x] 1.3 Add queue completion delay signal using submitted work completion callbacks where available.
- [x] 1.4 Implement sustained pressure and recovery hysteresis windows.

## 2. Permit Integration

- [x] 2.1 Add permit acquisition and frame-time reporting to timeline GPU loops.
- [x] 2.2 Add permit acquisition and reporting to video/transcode loops.
- [x] 2.3 Add permit acquisition and reporting to export loops.
- [x] 2.4 Add pause/wait-for-resume protocol for transcode-priority callers.
- [x] 2.5 Add fair FIFO export queue behavior under pressure.

## 3. MuxerSink

- [x] 3.1 Add `MuxerSink` with synchronous `PipelineSink` front end and bounded async worker channel.
- [x] 3.2 Route `ExportService` through `MuxerSink` instead of direct `AsyncExportPipeline::submit_composited()`.
- [x] 3.3 Implement flush and close commands with oneshot acknowledgements.
- [x] 3.4 Verify GPU handle input support and fail fast when unavailable.

## 4. Preview Busy Contract

- [x] 4.1 Add retryable GPU busy artifact/error contract for preview providers.
- [x] 4.2 Map GPU busy preview responses to HTTP 503 and `Retry-After` where applicable.

## 5. Verification

- [x] 5.1 Add tests for permit decisions across interactive, export, and transcode priorities.
- [x] 5.2 Add tests for hysteresis and resume notification.
- [x] 5.3 Add MuxerSink flush/close ack tests.
- [x] 5.4 Run concurrent preview plus export verification and affected Rust tests.
