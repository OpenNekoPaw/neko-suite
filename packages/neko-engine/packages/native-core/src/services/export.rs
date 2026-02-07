//! Export service trait
//!
//! Defines the interface for timeline export operations.
//! The service manages export jobs identified by job_id, supporting
//! start, progress query, and cancellation.

use crate::error::Result;
use crate::export::{ExportJobConfig, ExportProgress, ExportStartResponse};

/// Export service interface
///
/// Handles timeline export to video files with progress reporting.
/// Each export job is identified by a unique job_id.
#[allow(async_fn_in_trait)]
pub trait IExportService: Send + Sync {
    /// Start an export job
    ///
    /// Returns the job_id and total frames for progress tracking.
    async fn start(&self, config: ExportJobConfig) -> Result<ExportStartResponse>;

    /// Get export progress by job_id
    async fn progress(&self, job_id: &str) -> Option<ExportProgress>;

    /// Cancel an export job
    async fn cancel(&self, job_id: &str) -> Result<bool>;
}
