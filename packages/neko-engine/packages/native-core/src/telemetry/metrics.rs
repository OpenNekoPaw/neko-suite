//! Performance metrics for video export pipeline
//!
//! Provides atomic counters and timing metrics for tracking pipeline performance.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

/// Pipeline performance metrics
///
/// Thread-safe metrics collection for the video export pipeline.
/// All timing values are stored in nanoseconds for precision.
pub struct PipelineMetrics {
    // Timing accumulators (nanoseconds)
    decode_time_ns: AtomicU64,
    gpu_time_ns: AtomicU64,
    encode_time_ns: AtomicU64,
    mux_time_ns: AtomicU64,

    // Counters
    frames_processed: AtomicU64,
    bytes_written: AtomicU64,

    // Throughput tracking
    start_time: Instant,
}

impl Default for PipelineMetrics {
    fn default() -> Self {
        Self::new()
    }
}

impl PipelineMetrics {
    /// Create new metrics instance
    pub fn new() -> Self {
        Self {
            decode_time_ns: AtomicU64::new(0),
            gpu_time_ns: AtomicU64::new(0),
            encode_time_ns: AtomicU64::new(0),
            mux_time_ns: AtomicU64::new(0),
            frames_processed: AtomicU64::new(0),
            bytes_written: AtomicU64::new(0),
            start_time: Instant::now(),
        }
    }

    /// Reset all metrics
    pub fn reset(&self) {
        self.decode_time_ns.store(0, Ordering::Relaxed);
        self.gpu_time_ns.store(0, Ordering::Relaxed);
        self.encode_time_ns.store(0, Ordering::Relaxed);
        self.mux_time_ns.store(0, Ordering::Relaxed);
        self.frames_processed.store(0, Ordering::Relaxed);
        self.bytes_written.store(0, Ordering::Relaxed);
    }

    // ========== Timing recording ==========

    /// Record decode stage duration
    pub fn record_decode(&self, duration_ns: u64) {
        self.decode_time_ns.fetch_add(duration_ns, Ordering::Relaxed);
    }

    /// Record GPU pipeline duration
    pub fn record_gpu(&self, duration_ns: u64) {
        self.gpu_time_ns.fetch_add(duration_ns, Ordering::Relaxed);
    }

    /// Record encode stage duration
    pub fn record_encode(&self, duration_ns: u64) {
        self.encode_time_ns.fetch_add(duration_ns, Ordering::Relaxed);
    }

    /// Record mux stage duration
    pub fn record_mux(&self, duration_ns: u64) {
        self.mux_time_ns.fetch_add(duration_ns, Ordering::Relaxed);
    }

    // ========== Counter updates ==========

    /// Increment frame counter
    pub fn increment_frames(&self) {
        self.frames_processed.fetch_add(1, Ordering::Relaxed);
    }

    /// Add bytes written
    pub fn add_bytes_written(&self, bytes: u64) {
        self.bytes_written.fetch_add(bytes, Ordering::Relaxed);
    }

    // ========== Getters ==========

    /// Get total frames processed
    pub fn frames(&self) -> u64 {
        self.frames_processed.load(Ordering::Relaxed)
    }

    /// Get total bytes written
    pub fn bytes_written(&self) -> u64 {
        self.bytes_written.load(Ordering::Relaxed)
    }

    /// Get elapsed time since metrics creation
    pub fn elapsed_secs(&self) -> f64 {
        self.start_time.elapsed().as_secs_f64()
    }

    /// Calculate current FPS throughput
    pub fn current_fps(&self) -> f64 {
        let frames = self.frames();
        let elapsed = self.elapsed_secs();
        if elapsed > 0.0 {
            frames as f64 / elapsed
        } else {
            0.0
        }
    }

    /// Get average decode time per frame (milliseconds)
    pub fn avg_decode_ms(&self) -> f64 {
        let frames = self.frames();
        if frames > 0 {
            (self.decode_time_ns.load(Ordering::Relaxed) as f64 / 1_000_000.0) / frames as f64
        } else {
            0.0
        }
    }

    /// Get average GPU time per frame (milliseconds)
    pub fn avg_gpu_ms(&self) -> f64 {
        let frames = self.frames();
        if frames > 0 {
            (self.gpu_time_ns.load(Ordering::Relaxed) as f64 / 1_000_000.0) / frames as f64
        } else {
            0.0
        }
    }

    /// Get average encode time per frame (milliseconds)
    pub fn avg_encode_ms(&self) -> f64 {
        let frames = self.frames();
        if frames > 0 {
            (self.encode_time_ns.load(Ordering::Relaxed) as f64 / 1_000_000.0) / frames as f64
        } else {
            0.0
        }
    }

    /// Get average mux time per frame (milliseconds)
    pub fn avg_mux_ms(&self) -> f64 {
        let frames = self.frames();
        if frames > 0 {
            (self.mux_time_ns.load(Ordering::Relaxed) as f64 / 1_000_000.0) / frames as f64
        } else {
            0.0
        }
    }

    /// Log summary to tracing
    pub fn log_summary(&self) {
        let frames = self.frames();
        if frames == 0 {
            tracing::info!("Pipeline metrics: no frames processed");
            return;
        }

        tracing::info!(
            frames = frames,
            fps = format!("{:.2}", self.current_fps()),
            decode_avg_ms = format!("{:.2}", self.avg_decode_ms()),
            gpu_avg_ms = format!("{:.2}", self.avg_gpu_ms()),
            encode_avg_ms = format!("{:.2}", self.avg_encode_ms()),
            mux_avg_ms = format!("{:.2}", self.avg_mux_ms()),
            bytes_written = self.bytes_written(),
            elapsed_secs = format!("{:.2}", self.elapsed_secs()),
            "Pipeline metrics summary"
        );
    }
}

/// RAII guard for timing a code section
pub struct TimingGuard<'a, F>
where
    F: FnOnce(u64),
{
    start: Instant,
    recorder: Option<F>,
    _phantom: std::marker::PhantomData<&'a ()>,
}

impl<'a, F> TimingGuard<'a, F>
where
    F: FnOnce(u64),
{
    /// Create a new timing guard
    pub fn new(recorder: F) -> Self {
        Self {
            start: Instant::now(),
            recorder: Some(recorder),
            _phantom: std::marker::PhantomData,
        }
    }
}

impl<F> Drop for TimingGuard<'_, F>
where
    F: FnOnce(u64),
{
    fn drop(&mut self) {
        if let Some(recorder) = self.recorder.take() {
            let elapsed_ns = self.start.elapsed().as_nanos() as u64;
            recorder(elapsed_ns);
        }
    }
}

/// Create a timing guard that records to the given metrics
#[macro_export]
macro_rules! time_decode {
    ($metrics:expr) => {
        $crate::telemetry::metrics::TimingGuard::new(|ns| $metrics.record_decode(ns))
    };
}

#[macro_export]
macro_rules! time_gpu {
    ($metrics:expr) => {
        $crate::telemetry::metrics::TimingGuard::new(|ns| $metrics.record_gpu(ns))
    };
}

#[macro_export]
macro_rules! time_encode {
    ($metrics:expr) => {
        $crate::telemetry::metrics::TimingGuard::new(|ns| $metrics.record_encode(ns))
    };
}

#[macro_export]
macro_rules! time_mux {
    ($metrics:expr) => {
        $crate::telemetry::metrics::TimingGuard::new(|ns| $metrics.record_mux(ns))
    };
}
