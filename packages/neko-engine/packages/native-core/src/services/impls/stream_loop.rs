//! StreamLoop - Decoding loop abstraction
//!
//! Provides frame pacing + playback state control + cancellation mechanism.
//! Video/Audio/Timeline start_stream all reuse this abstraction.

use crate::domain::FrameData;
use crate::encoder::EncodedPacket;
use crate::error::{Error, Result};
use neko_types::{FrameFormat, LoopRegion, StreamId};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{broadcast, watch, RwLock};
use tokio::task::JoinHandle;
use tokio::time::MissedTickBehavior;
use tokio_util::sync::CancellationToken;

/// Playback state (controlled externally via watch channel)
#[derive(Debug, Clone)]
pub struct PlaybackState {
    pub paused: bool,
    pub speed: f64,
    pub loop_region: Option<LoopRegion>,
    /// One-shot seek request, cleared after processing
    pub seek_to: Option<f64>,
}

impl Default for PlaybackState {
    fn default() -> Self {
        Self {
            paused: false,
            speed: 1.0,
            loop_region: None,
            seek_to: None,
        }
    }
}

/// Handle for a running decoding loop
pub struct StreamLoopHandle {
    pub stream_id: StreamId,
    pub cancel: CancellationToken,
    pub state_tx: watch::Sender<PlaybackState>,
    pub join_handle: JoinHandle<()>,
}

/// Manages active stream loops (held by Service)
pub struct ActiveStreams {
    loops: RwLock<HashMap<String, StreamLoopHandle>>,
}

impl ActiveStreams {
    pub fn new() -> Self {
        Self {
            loops: RwLock::new(HashMap::new()),
        }
    }

    /// Insert a new stream loop handle
    pub async fn insert(&self, handle: StreamLoopHandle) {
        let id = handle.stream_id.as_str().to_string();
        self.loops.write().await.insert(id, handle);
    }

    /// Check if a stream exists
    pub async fn contains(&self, stream_id: &StreamId) -> bool {
        self.loops.read().await.contains_key(stream_id.as_str())
    }

    /// Update playback state for a stream
    pub async fn update_state<F>(&self, stream_id: &StreamId, f: F) -> Result<()>
    where
        F: FnOnce(&mut PlaybackState),
    {
        let loops = self.loops.read().await;
        let handle = loops
            .get(stream_id.as_str())
            .ok_or_else(|| Error::Other(format!("Stream not found: {}", stream_id.as_str())))?;

        handle.state_tx.send_modify(f);
        Ok(())
    }

    /// Stop a stream by cancelling its loop and removing it
    pub async fn stop(&self, stream_id: &StreamId) -> Result<()> {
        let handle = {
            let mut loops = self.loops.write().await;
            loops.remove(stream_id.as_str())
        };

        if let Some(handle) = handle {
            handle.cancel.cancel();
            // Wait for the loop to finish (with timeout)
            let _ = tokio::time::timeout(Duration::from_secs(5), handle.join_handle).await;
            Ok(())
        } else {
            Err(Error::Other(format!(
                "Stream not found: {}",
                stream_id.as_str()
            )))
        }
    }

    /// Stop all active streams
    pub async fn stop_all(&self) {
        let handles: Vec<StreamLoopHandle> = {
            let mut loops = self.loops.write().await;
            loops.drain().map(|(_, h)| h).collect()
        };

        for handle in handles {
            handle.cancel.cancel();
            let _ = tokio::time::timeout(Duration::from_secs(5), handle.join_handle).await;
        }
    }

    /// Get count of active streams
    pub async fn count(&self) -> usize {
        self.loops.read().await.len()
    }
}

impl Default for ActiveStreams {
    fn default() -> Self {
        Self::new()
    }
}

/// Wall-clock based frame pacer for blocking threads
///
/// Uses `Instant` + `std::thread::sleep` for frame pacing inside `spawn_blocking`.
/// When a frame takes longer than expected, the next frame is produced immediately
/// (no skip, natural catch-up). This avoids the cumulative delay issue of
/// `MissedTickBehavior::Delay` in tokio intervals.
pub struct WallClockPacer {
    start_time: std::time::Instant,
    frame_number: u64,
    fps: f64,
    speed: f64,
}

impl WallClockPacer {
    /// Create a new wall-clock pacer
    pub fn new(fps: f64, speed: f64) -> Self {
        Self {
            start_time: std::time::Instant::now(),
            frame_number: 0,
            fps,
            speed: speed.max(0.1),
        }
    }

    /// Wait until the next frame should be produced.
    /// If behind schedule, returns immediately (no frame skip).
    pub fn wait_for_next_frame(&mut self) {
        self.frame_number += 1;
        let expected = self.start_time
            + Duration::from_secs_f64(self.frame_number as f64 / (self.fps * self.speed));
        let now = std::time::Instant::now();
        if now < expected {
            std::thread::sleep(expected - now);
        }
    }

    /// Update playback speed, resetting the time base to avoid jumps
    pub fn update_speed(&mut self, speed: f64) {
        self.speed = speed.max(0.1);
        self.start_time = std::time::Instant::now();
        self.frame_number = 0;
    }

    /// Reset the pacer (e.g. after seek)
    pub fn reset(&mut self) {
        self.start_time = std::time::Instant::now();
        self.frame_number = 0;
    }
}

/// Frame pacer - controls decoding loop production rate
///
/// Uses tokio::time::interval with MissedTickBehavior::Delay
/// to maintain smooth frame pacing. When a tick is missed (e.g. slow decode),
/// the next tick is delayed rather than skipped, preventing frame drops.
pub struct FramePacer {
    interval: tokio::time::Interval,
    fps: f64,
    speed: f64,
}

impl FramePacer {
    /// Create a new frame pacer
    pub fn new(fps: f64, speed: f64) -> Self {
        let effective_speed = speed.max(0.1); // Prevent division by zero
        let duration = Duration::from_secs_f64(1.0 / (fps * effective_speed));
        let mut interval = tokio::time::interval(duration);
        interval.set_missed_tick_behavior(MissedTickBehavior::Delay);
        Self {
            interval,
            fps,
            speed: effective_speed,
        }
    }

    /// Update playback speed (recalculates interval)
    pub fn update_speed(&mut self, speed: f64) {
        let effective_speed = speed.max(0.1);
        if (effective_speed - self.speed).abs() < 0.001 {
            return; // No significant change
        }
        self.speed = effective_speed;
        let duration = Duration::from_secs_f64(1.0 / (self.fps * effective_speed));
        self.interval = tokio::time::interval(duration);
        self.interval.set_missed_tick_behavior(MissedTickBehavior::Delay);
    }

    /// Wait for next tick
    pub async fn tick(&mut self) {
        self.interval.tick().await;
    }
}

/// Pack an H.264 EncodedPacket into FrameData for broadcast transport
///
/// Wire format: [pts:i64 LE][dts:i64 LE][is_keyframe:u8][duration:i64 LE][H.264 NAL data...]
pub fn pack_h264_frame(packet: &EncodedPacket, width: u32, height: u32) -> FrameData {
    let header_size = 8 + 8 + 1 + 8; // pts + dts + is_keyframe + duration
    let mut data = Vec::with_capacity(header_size + packet.data.len());
    data.extend_from_slice(&packet.pts.to_le_bytes());
    data.extend_from_slice(&packet.dts.to_le_bytes());
    data.push(if packet.is_keyframe { 1 } else { 0 });
    data.extend_from_slice(&packet.duration.to_le_bytes());
    data.extend_from_slice(&packet.data);

    FrameData {
        data,
        width,
        height,
        format: FrameFormat::H264,
        timestamp: packet.pts as f64 / 1_000_000.0, // pts in time_base units → approximate seconds
    }
}

/// Pack PCM F32 audio data into FrameData for broadcast transport
///
/// Wire format: [pts_seconds:f64 LE (8B)][sample_rate:u32 LE (4B)][channels:u32 LE (4B)][PCM F32 data...]
pub fn pack_pcm_frame(pcm_data: &[u8], timestamp: f64, sample_rate: u32, channels: u32) -> FrameData {
    let header_size = 8 + 4 + 4; // pts_seconds + sample_rate + channels
    let mut data = Vec::with_capacity(header_size + pcm_data.len());
    data.extend_from_slice(&timestamp.to_le_bytes());
    data.extend_from_slice(&sample_rate.to_le_bytes());
    data.extend_from_slice(&channels.to_le_bytes());
    data.extend_from_slice(pcm_data);

    FrameData {
        data,
        width: sample_rate,
        height: channels,
        format: FrameFormat::PcmF32,
        timestamp,
    }
}

/// Pack an Opus encoded audio packet into FrameData for broadcast transport
///
/// Wire format: [pts:i64 LE (8B)][duration:i64 LE (8B)][sample_rate:u32 LE (4B)][channels:u16 LE (2B)][Opus data...]
pub fn pack_opus_frame(packet: &crate::audio::EncodedAudioPacket, sample_rate: u32, channels: u16) -> FrameData {
    let header_size = 8 + 8 + 4 + 2; // pts + duration + sample_rate + channels
    let mut data = Vec::with_capacity(header_size + packet.data.len());
    data.extend_from_slice(&packet.pts.to_le_bytes());
    data.extend_from_slice(&packet.duration.to_le_bytes());
    data.extend_from_slice(&sample_rate.to_le_bytes());
    data.extend_from_slice(&channels.to_le_bytes());
    data.extend_from_slice(&packet.data);

    let timestamp = packet.pts as f64 / sample_rate as f64;

    FrameData {
        data,
        width: sample_rate,
        height: channels as u32,
        format: FrameFormat::Opus,
        timestamp,
    }
}

/// fMP4 WebSocket message types
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Fmp4MessageType {
    /// Init segment (ftyp + moov) — sent once at stream start
    Init = 0x01,
    /// Media segment (moof + mdat) — sent periodically
    Segment = 0x02,
    /// Flush signal — sent after seek to reset client state
    Flush = 0x03,
}

/// Pack an fMP4 segment into FrameData for broadcast transport
///
/// Wire format: [type: u8][payload...]
pub fn pack_fmp4_message(msg_type: Fmp4MessageType, payload: &[u8], timestamp: f64) -> FrameData {
    let mut data = Vec::with_capacity(1 + payload.len());
    data.push(msg_type as u8);
    data.extend_from_slice(payload);

    FrameData {
        data,
        width: 0,
        height: 0,
        format: FrameFormat::Fmp4,
        timestamp,
    }
}

/// Create a new stream with broadcast channel and control channels
///
/// Returns (StreamId, broadcast::Receiver, CancellationToken, watch::Receiver<PlaybackState>, watch::Sender<PlaybackState>)
pub fn create_stream_channels(
    session_id: &str,
    buffer_size: usize,
) -> (
    StreamId,
    broadcast::Sender<FrameData>,
    broadcast::Receiver<FrameData>,
    CancellationToken,
    watch::Sender<PlaybackState>,
    watch::Receiver<PlaybackState>,
) {
    let stream_id = StreamId::new(session_id);
    let (tx, rx) = broadcast::channel(buffer_size);
    let cancel = CancellationToken::new();
    let (state_tx, state_rx) = watch::channel(PlaybackState::default());

    (stream_id, tx, rx, cancel, state_tx, state_rx)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_playback_state_default() {
        let state = PlaybackState::default();
        assert!(!state.paused);
        assert!((state.speed - 1.0).abs() < f64::EPSILON);
        assert!(state.loop_region.is_none());
        assert!(state.seek_to.is_none());
    }

    #[tokio::test]
    async fn test_frame_pacer_creation() {
        let pacer = FramePacer::new(30.0, 1.0);
        assert!((pacer.fps - 30.0).abs() < f64::EPSILON);
        assert!((pacer.speed - 1.0).abs() < f64::EPSILON);
    }

    #[tokio::test]
    async fn test_frame_pacer_speed_update() {
        let mut pacer = FramePacer::new(30.0, 1.0);
        pacer.update_speed(2.0);
        assert!((pacer.speed - 2.0).abs() < f64::EPSILON);
    }

    #[tokio::test]
    async fn test_frame_pacer_min_speed() {
        let pacer = FramePacer::new(30.0, 0.0);
        assert!((pacer.speed - 0.1).abs() < f64::EPSILON);
    }

    #[tokio::test]
    async fn test_active_streams_lifecycle() {
        let streams = ActiveStreams::new();
        assert_eq!(streams.count().await, 0);

        let cancel = CancellationToken::new();
        let (state_tx, _state_rx) = watch::channel(PlaybackState::default());
        let cancel_clone = cancel.clone();
        let join_handle = tokio::spawn(async move {
            cancel_clone.cancelled().await;
        });

        let stream_id = StreamId::new("test");
        let handle = StreamLoopHandle {
            stream_id: stream_id.clone(),
            cancel,
            state_tx,
            join_handle,
        };

        streams.insert(handle).await;
        assert_eq!(streams.count().await, 1);
        assert!(streams.contains(&stream_id).await);

        streams.stop(&stream_id).await.unwrap();
        assert_eq!(streams.count().await, 0);
    }

    #[tokio::test]
    async fn test_active_streams_update_state() {
        let streams = ActiveStreams::new();
        let cancel = CancellationToken::new();
        let (state_tx, mut state_rx) = watch::channel(PlaybackState::default());
        let cancel_clone = cancel.clone();
        let join_handle = tokio::spawn(async move {
            cancel_clone.cancelled().await;
        });

        let stream_id = StreamId::new("test");
        let handle = StreamLoopHandle {
            stream_id: stream_id.clone(),
            cancel: cancel.clone(),
            state_tx,
            join_handle,
        };

        streams.insert(handle).await;

        // Update pause state
        streams
            .update_state(&stream_id, |s| s.paused = true)
            .await
            .unwrap();

        state_rx.changed().await.unwrap();
        assert!(state_rx.borrow().paused);

        // Update speed
        streams
            .update_state(&stream_id, |s| s.speed = 2.0)
            .await
            .unwrap();

        state_rx.changed().await.unwrap();
        assert!((state_rx.borrow().speed - 2.0).abs() < f64::EPSILON);

        // Cleanup
        cancel.cancel();
        streams.stop_all().await;
    }

    #[test]
    fn test_pack_h264_frame() {
        let packet = EncodedPacket {
            data: vec![0x00, 0x00, 0x00, 0x01, 0x67], // SPS NAL
            pts: 1000,
            dts: 900,
            is_keyframe: true,
            duration: 33333,
            stream_index: 0,
        };

        let frame = pack_h264_frame(&packet, 1920, 1080);
        assert_eq!(frame.width, 1920);
        assert_eq!(frame.height, 1080);
        assert_eq!(frame.format, FrameFormat::H264);

        // Verify header
        let header_size = 8 + 8 + 1 + 8;
        assert_eq!(frame.data.len(), header_size + packet.data.len());

        // Verify pts
        let pts = i64::from_le_bytes(frame.data[0..8].try_into().unwrap());
        assert_eq!(pts, 1000);

        // Verify is_keyframe
        assert_eq!(frame.data[16], 1);
    }

    #[test]
    fn test_create_stream_channels() {
        let (stream_id, _tx, _rx, _cancel, _state_tx, _state_rx) =
            create_stream_channels("test_session", 64);

        assert!(stream_id.as_str().starts_with("strm_"));
    }

    #[test]
    fn test_wall_clock_pacer_creation() {
        let pacer = WallClockPacer::new(30.0, 1.0);
        assert!((pacer.fps - 30.0).abs() < f64::EPSILON);
        assert!((pacer.speed - 1.0).abs() < f64::EPSILON);
        assert_eq!(pacer.frame_number, 0);
    }

    #[test]
    fn test_wall_clock_pacer_min_speed() {
        let pacer = WallClockPacer::new(30.0, 0.0);
        assert!((pacer.speed - 0.1).abs() < f64::EPSILON);
    }

    #[test]
    fn test_wall_clock_pacer_speed_update() {
        let mut pacer = WallClockPacer::new(30.0, 1.0);
        pacer.wait_for_next_frame();
        assert_eq!(pacer.frame_number, 1);

        pacer.update_speed(2.0);
        assert!((pacer.speed - 2.0).abs() < f64::EPSILON);
        assert_eq!(pacer.frame_number, 0); // Reset on speed change
    }

    #[test]
    fn test_wall_clock_pacer_reset() {
        let mut pacer = WallClockPacer::new(30.0, 1.0);
        pacer.wait_for_next_frame();
        pacer.wait_for_next_frame();
        assert_eq!(pacer.frame_number, 2);

        pacer.reset();
        assert_eq!(pacer.frame_number, 0);
    }

    #[test]
    fn test_pack_pcm_frame() {
        let pcm_data: Vec<u8> = vec![0u8; 4 * 1024]; // 1024 f32 samples
        let frame = pack_pcm_frame(&pcm_data, 1.5, 48000, 2);

        assert_eq!(frame.format, FrameFormat::PcmF32);
        assert_eq!(frame.width, 48000);
        assert_eq!(frame.height, 2);
        assert!((frame.timestamp - 1.5).abs() < f64::EPSILON);

        // Verify header
        let header_size = 8 + 4 + 4; // pts + sample_rate + channels
        assert_eq!(frame.data.len(), header_size + pcm_data.len());

        // Verify pts
        let pts = f64::from_le_bytes(frame.data[0..8].try_into().unwrap());
        assert!((pts - 1.5).abs() < f64::EPSILON);

        // Verify sample_rate
        let sr = u32::from_le_bytes(frame.data[8..12].try_into().unwrap());
        assert_eq!(sr, 48000);

        // Verify channels
        let ch = u32::from_le_bytes(frame.data[12..16].try_into().unwrap());
        assert_eq!(ch, 2);
    }
}
