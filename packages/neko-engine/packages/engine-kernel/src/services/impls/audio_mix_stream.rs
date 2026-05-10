//! Mix stream — multi-track audio mixing stream loop.
//!
//! Spawns a blocking thread that runs `AudioMixdown::mix_buffer()` in a loop,
//! packing output as PCM f32le frames and broadcasting via the stream infrastructure.

use crate::domain::FrameData;
use crate::error::Result;
use crate::services::audio_mixdown::{AudioMixdown, MixdownConfig};
use crate::services::impls::stream_loop::{
    create_stream_channels, eof_idle_wait, pack_pcm_f32le_stream_frame, ActiveStreams,
    StreamLoopHandle, WallClockPacer, EOF_IDLE_TIMEOUT,
};
use neko_engine_types::StreamId;
use std::sync::Arc;
use tokio::sync::broadcast;

/// Start a multi-track mix stream.
///
/// Creates an `AudioMixdown` from `config`, spawns a blocking decode/mix loop,
/// and returns `(StreamId, Receiver)` for registration in the `StreamRegistry`.
pub async fn start_mix_stream(
    config: MixdownConfig,
    session_id: &str,
    active_streams: Arc<ActiveStreams>,
) -> Result<(StreamId, broadcast::Receiver<FrameData>)> {
    let (stream_id, tx, rx, cancel, _state_tx, state_rx) =
        create_stream_channels(session_id, 64);

    let cancel_clone = cancel.clone();
    let streams_clone = active_streams.clone();
    let stream_id_clone = stream_id.clone();

    let join_handle = tokio::task::spawn_blocking(move || {
        let sample_rate = config.sample_rate;
        let channels = config.channels;

        let mut mixdown = AudioMixdown::new(config);
        if let Err(e) = mixdown.initialize() {
            tracing::error!("Mix stream: failed to initialize mixdown: {}", e);
            return;
        }

        let total_duration = mixdown.total_duration();
        let buffer_size = mixdown.buffer_size();
        let buf_duration = buffer_size as f64 / sample_rate as f64;

        let mut pacer = WallClockPacer::new(
            (sample_rate as f64 / buffer_size as f64).min(120.0),
            1.0,
        );
        let mut current_speed = 1.0;
        let mut current_time = 0.0;
        let mut last_seen_paused = false;
        let mut last_seek_seq: u64 = 0;

        loop {
            if cancel_clone.is_cancelled() {
                break;
            }

            let state = state_rx.borrow().clone();

            // Handle seek
            if let Some(time) = state.seek_to {
                if state.seek_seq != last_seek_seq {
                    last_seek_seq = state.seek_seq;
                    current_time = time;
                    mixdown.reset();
                    pacer.reset();
                }
            }

            // Pause→resume: reset pacer
            if last_seen_paused && !state.paused {
                pacer.reset();
            }
            last_seen_paused = state.paused;

            if state.paused {
                std::thread::sleep(std::time::Duration::from_millis(16));
                continue;
            }

            // Speed change
            if (state.speed - current_speed).abs() > 0.001 {
                current_speed = state.speed;
                pacer.update_speed(current_speed);
            }

            // Mix at current time
            match mixdown.mix_buffer(current_time) {
                Ok(buf) => {
                    let pcm_bytes: &[u8] = bytemuck::cast_slice(&buf.data);
                    let packed = pack_pcm_f32le_stream_frame(
                        pcm_bytes,
                        current_time,
                        buf_duration,
                        sample_rate,
                        channels,
                    );
                    let _ = tx.send(packed);
                    current_time += buf_duration * current_speed;
                }
                Err(e) => {
                    tracing::warn!("Mix stream buffer error: {}", e);
                    break;
                }
            }

            // EOF check
            if current_time >= total_duration {
                let state = state_rx.borrow().clone();
                if let Some(ref region) = state.loop_region {
                    current_time = region.in_point;
                    mixdown.reset();
                    pacer.reset();
                } else {
                    match eof_idle_wait(
                        &cancel_clone,
                        &state_rx,
                        last_seek_seq,
                        EOF_IDLE_TIMEOUT,
                    ) {
                        Some(time) => {
                            current_time = time;
                            mixdown.reset();
                            pacer.reset();
                        }
                        None => break,
                    }
                }
            }

            pacer.wait_for_next_frame();
        }

        mixdown.close();

        let rt = tokio::runtime::Handle::current();
        rt.block_on(streams_clone.remove(stream_id_clone.as_str()));
    });

    let handle = StreamLoopHandle {
        stream_id: stream_id.clone(),
        cancel,
        state_tx: _state_tx,
        join_handle,
        linked_stream_id: None,
    };
    active_streams.insert(handle).await;

    Ok((stream_id, rx))
}
