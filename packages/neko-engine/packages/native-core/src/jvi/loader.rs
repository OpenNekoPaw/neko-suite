//! JVI file loader with path resolution
//!
//! Loads .jvi project files and resolves relative media paths.

use std::fs;
use std::path::{Path, PathBuf};

use crate::domain::Timeline;
use crate::error::{Error, Result};
use crate::export::ExportSettings;

use super::converter::ProjectConverter;
use super::types::ProjectData;

/// JVI file loader
pub struct JviLoader {
    /// Base directory for resolving relative paths (set during load)
    _base_dir: Option<PathBuf>,
}

impl JviLoader {
    /// Create a new JVI loader
    pub fn new() -> Self {
        Self { _base_dir: None }
    }

    /// Load a .jvi file and convert to Timeline + ExportSettings
    ///
    /// # Arguments
    /// * `path` - Path to the .jvi file
    ///
    /// # Returns
    /// A tuple of (Timeline, ExportSettings) ready for export
    pub fn load(&self, path: &Path) -> Result<(Timeline, ExportSettings)> {
        // Read file content
        let content = fs::read_to_string(path).map_err(|e| {
            Error::Other(format!(
                "Failed to read JVI file '{}': {}",
                path.display(),
                e
            ))
        })?;

        // Parse JSON
        let project: ProjectData = serde_json::from_str(&content).map_err(|e| {
            Error::Other(format!(
                "Failed to parse JVI file '{}': {}",
                path.display(),
                e
            ))
        })?;

        // Determine base directory for relative paths
        let base_dir = path
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."));

        // Convert to internal types with path resolution
        let converter = ProjectConverter::new(base_dir);
        converter.convert(project)
    }

    /// Load from JSON string (for WebSocket API)
    ///
    /// # Arguments
    /// * `json` - JSON string containing project data
    /// * `base_dir` - Base directory for resolving relative paths
    ///
    /// # Returns
    /// A tuple of (Timeline, ExportSettings) ready for export
    pub fn load_from_json(
        &self,
        json: &str,
        base_dir: PathBuf,
    ) -> Result<(Timeline, ExportSettings)> {
        let project: ProjectData = serde_json::from_str(json)
            .map_err(|e| Error::Other(format!("Failed to parse JVI JSON: {}", e)))?;

        let converter = ProjectConverter::new(base_dir);
        converter.convert(project)
    }
}

impl Default for JviLoader {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_load_from_json() {
        let json = r#"{
            "version": "1.0",
            "name": "test",
            "resolution": { "width": 1920, "height": 1080 },
            "fps": 30,
            "tracks": [
                {
                    "id": "track-1",
                    "name": "Main Track",
                    "type": "media",
                    "elements": [],
                    "muted": false
                }
            ]
        }"#;

        let loader = JviLoader::new();
        let result = loader.load_from_json(json, PathBuf::from("/tmp"));

        assert!(result.is_ok());
        let (timeline, settings) = result.unwrap();
        assert_eq!(settings.width, 1920);
        assert_eq!(settings.height, 1080);
        assert_eq!(settings.fps, 30.0);
        assert_eq!(timeline.tracks.len(), 1);
    }

    #[test]
    fn test_load_from_file() {
        let json = r#"{
            "version": "1.0",
            "name": "test",
            "resolution": { "width": 1280, "height": 720 },
            "fps": 60,
            "tracks": []
        }"#;

        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(json.as_bytes()).unwrap();

        let loader = JviLoader::new();
        let result = loader.load(temp_file.path());

        assert!(result.is_ok());
        let (_, settings) = result.unwrap();
        assert_eq!(settings.width, 1280);
        assert_eq!(settings.height, 720);
        assert_eq!(settings.fps, 60.0);
    }
}
