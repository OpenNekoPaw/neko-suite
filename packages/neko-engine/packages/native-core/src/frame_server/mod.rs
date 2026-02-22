//! Frame Server module
//!
//! This module previously provided HTTP/WebSocket endpoints for frame streaming,
//! extraction, and media probing. These have been consolidated into the unified
//! ActionRouter dispatch protocol:
//!
//! - Frame extraction → `videos:capture`
//! - Frame compositing → `timelines:composite`
//! - Media probing → `videos:probe`
//! - Export → `timelines:export`, `timelines:export_progress`, `timelines:export_cancel`
//! - Streaming → `/v1/streams/:stream_id` (WebSocket)
