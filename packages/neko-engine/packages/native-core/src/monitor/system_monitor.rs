//! System resource monitoring for export performance tracking
//!
//! Provides CPU, memory, and GPU usage monitoring during video export.

use sysinfo::{Pid, ProcessRefreshKind, RefreshKind, System};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// System resource snapshot at a point in time
#[derive(Debug, Clone)]
pub struct ResourceSnapshot {
    /// CPU usage percentage (0.0 - 100.0)
    pub cpu_usage_percent: f64,
    /// GPU usage percentage (0.0 - 100.0), None if unavailable
    pub gpu_usage_percent: Option<f64>,
    /// Process memory usage in bytes
    pub memory_bytes: u64,
    /// GPU VRAM usage in bytes, None if unavailable
    pub vram_bytes: Option<u64>,
    /// Timestamp of this snapshot
    pub timestamp: Instant,
}

impl Default for ResourceSnapshot {
    fn default() -> Self {
        Self {
            cpu_usage_percent: 0.0,
            gpu_usage_percent: None,
            memory_bytes: 0,
            vram_bytes: None,
            timestamp: Instant::now(),
        }
    }
}

/// System monitor for tracking resource usage during export
pub struct SystemMonitor {
    /// sysinfo System instance
    system: System,
    /// Current process ID
    pid: Pid,
    /// Peak memory usage
    peak_memory: Arc<AtomicU64>,
    /// Peak VRAM usage
    peak_vram: Arc<AtomicU64>,
    /// Accumulated CPU samples for averaging
    cpu_samples: Vec<f64>,
    /// Accumulated GPU samples for averaging
    gpu_samples: Vec<f64>,
    /// Last refresh time
    last_refresh: Instant,
    /// Minimum refresh interval
    refresh_interval: Duration,
    /// Last snapshot for rate-limited returns
    last_snapshot: ResourceSnapshot,
}

impl SystemMonitor {
    /// Create a new system monitor
    pub fn new() -> Self {
        let mut system = System::new_with_specifics(
            RefreshKind::new()
                .with_processes(ProcessRefreshKind::new().with_cpu().with_memory()),
        );

        let pid = Pid::from_u32(std::process::id());

        // Prime sysinfo with initial refresh so the first sample() returns
        // non-zero memory data. sysinfo requires at least one prior refresh
        // to populate baseline process metrics.
        system.refresh_process_specifics(
            pid,
            ProcessRefreshKind::new().with_cpu().with_memory(),
        );

        // Set last_refresh to the past so the first sample() call is not
        // rate-limited and actually performs a refresh.
        let past = Instant::now() - Duration::from_secs(1);

        Self {
            system,
            pid,
            peak_memory: Arc::new(AtomicU64::new(0)),
            peak_vram: Arc::new(AtomicU64::new(0)),
            cpu_samples: Vec::new(),
            gpu_samples: Vec::new(),
            last_refresh: past,
            refresh_interval: Duration::from_millis(100), // 10 Hz sampling
            last_snapshot: ResourceSnapshot::default(),
        }
    }

    /// Sample current resource usage
    pub fn sample(&mut self) -> ResourceSnapshot {
        // Rate limit refreshes
        if self.last_refresh.elapsed() < self.refresh_interval {
            return self.last_snapshot.clone();
        }

        self.system.refresh_process_specifics(
            self.pid,
            ProcessRefreshKind::new().with_cpu().with_memory(),
        );
        self.last_refresh = Instant::now();

        let (cpu_usage, memory_bytes) = if let Some(process) = self.system.process(self.pid) {
            (process.cpu_usage() as f64, process.memory())
        } else {
            (0.0, 0)
        };

        // Update peak memory
        let prev_peak = self.peak_memory.load(Ordering::Relaxed);
        if memory_bytes > prev_peak {
            self.peak_memory.store(memory_bytes, Ordering::Relaxed);
        }

        // Sample CPU
        self.cpu_samples.push(cpu_usage);

        // GPU monitoring (platform-specific, may return None)
        let (gpu_usage, vram_bytes) = self.sample_gpu();

        if let Some(gpu) = gpu_usage {
            self.gpu_samples.push(gpu);
        }

        if let Some(vram) = vram_bytes {
            let prev_vram = self.peak_vram.load(Ordering::Relaxed);
            if vram > prev_vram {
                self.peak_vram.store(vram, Ordering::Relaxed);
            }
        }

        let snapshot = ResourceSnapshot {
            cpu_usage_percent: cpu_usage,
            gpu_usage_percent: gpu_usage,
            memory_bytes,
            vram_bytes,
            timestamp: Instant::now(),
        };

        self.last_snapshot = snapshot.clone();
        snapshot
    }

    /// Get average CPU usage over all samples
    pub fn avg_cpu_usage(&self) -> f64 {
        if self.cpu_samples.is_empty() {
            0.0
        } else {
            self.cpu_samples.iter().sum::<f64>() / self.cpu_samples.len() as f64
        }
    }

    /// Get average GPU usage over all samples
    pub fn avg_gpu_usage(&self) -> Option<f64> {
        if self.gpu_samples.is_empty() {
            None
        } else {
            Some(self.gpu_samples.iter().sum::<f64>() / self.gpu_samples.len() as f64)
        }
    }

    /// Get peak memory usage
    pub fn peak_memory(&self) -> u64 {
        self.peak_memory.load(Ordering::Relaxed)
    }

    /// Get peak VRAM usage
    pub fn peak_vram(&self) -> Option<u64> {
        let vram = self.peak_vram.load(Ordering::Relaxed);
        if vram > 0 {
            Some(vram)
        } else {
            None
        }
    }

    /// Reset statistics
    pub fn reset(&mut self) {
        self.cpu_samples.clear();
        self.gpu_samples.clear();
        self.peak_memory.store(0, Ordering::Relaxed);
        self.peak_vram.store(0, Ordering::Relaxed);
    }

    /// Platform-specific GPU sampling for macOS
    ///
    /// Uses Metal API to query VRAM allocation. GPU utilization percentage
    /// is not available through public macOS APIs (would require IOKit
    /// private frameworks), so only VRAM is reported.
    #[cfg(target_os = "macos")]
    fn sample_gpu(&self) -> (Option<f64>, Option<u64>) {
        let device = metal::Device::system_default();
        match device {
            Some(dev) => {
                let allocated = dev.current_allocated_size() as u64;
                // GPU utilization not available via public Metal API
                (None, Some(allocated))
            }
            None => (None, None),
        }
    }

    /// Platform-specific GPU sampling for Linux
    #[cfg(target_os = "linux")]
    fn sample_gpu(&self) -> (Option<f64>, Option<u64>) {
        // Linux: Try NVML for NVIDIA, or sysfs for AMD
        // TODO: Implement NVML integration for NVIDIA GPUs
        // TODO: Implement sysfs reading for AMD GPUs
        (None, None)
    }

    /// Platform-specific GPU sampling for Windows
    #[cfg(target_os = "windows")]
    fn sample_gpu(&self) -> (Option<f64>, Option<u64>) {
        // Windows: Use NVML or DirectX performance counters
        // TODO: Implement NVML or DXGI adapter memory info
        (None, None)
    }

    /// Fallback for other platforms
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    fn sample_gpu(&self) -> (Option<f64>, Option<u64>) {
        (None, None)
    }
}

impl Default for SystemMonitor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_system_monitor_creation() {
        let monitor = SystemMonitor::new();
        assert_eq!(monitor.avg_cpu_usage(), 0.0);
        assert!(monitor.avg_gpu_usage().is_none());
    }

    #[test]
    fn test_system_monitor_sample() {
        let mut monitor = SystemMonitor::new();

        // First sample
        let snapshot = monitor.sample();
        assert!(snapshot.memory_bytes > 0);

        // Wait for rate limit
        std::thread::sleep(Duration::from_millis(150));

        // Second sample
        let snapshot2 = monitor.sample();
        assert!(snapshot2.memory_bytes > 0);
    }

    #[test]
    fn test_system_monitor_reset() {
        let mut monitor = SystemMonitor::new();

        // Sample some data
        monitor.sample();
        std::thread::sleep(Duration::from_millis(150));
        monitor.sample();

        // Reset
        monitor.reset();

        assert_eq!(monitor.avg_cpu_usage(), 0.0);
        assert_eq!(monitor.peak_memory(), 0);
    }
}
