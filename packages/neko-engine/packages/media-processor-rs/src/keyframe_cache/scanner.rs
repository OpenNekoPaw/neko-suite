//! IDR Frame Scanner
//!
//! Scans video files to identify true IDR (Instantaneous Decoder Refresh) frames.
//!
//! ## IDR vs Non-IDR I-frames
//!
//! FFmpeg's `is_key()` marks all I-frames, but not all I-frames are IDR frames.
//! IDR frames are special because they:
//! - Clear the reference picture buffer
//! - Allow random access without decoding previous frames
//!
//! ## NAL Unit Types
//!
//! - **H.264 (AVC)**: NAL type 5 = IDR slice
//! - **H.265 (HEVC)**: NAL type 19 = IDR_W_RADL, type 20 = IDR_N_LP

use std::path::Path;

use ffmpeg_next as ffmpeg;
use ffmpeg_next::format::input;
use ffmpeg_next::media::Type;

use super::types::KeyframeInfo;
use crate::error::{Error, Result};

/// Video codec type for NAL parsing
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VideoCodecType {
    /// H.264/AVC
    H264,
    /// H.265/HEVC
    H265,
    /// Other codec (use is_key() fallback)
    Other,
}

impl VideoCodecType {
    /// Detect codec type from FFmpeg codec ID
    pub fn from_codec_id(id: ffmpeg::codec::Id) -> Self {
        match id {
            ffmpeg::codec::Id::H264 => VideoCodecType::H264,
            ffmpeg::codec::Id::HEVC => VideoCodecType::H265,
            _ => VideoCodecType::Other,
        }
    }
}

/// IDR Frame Scanner
///
/// Scans a video file to identify all IDR frames by parsing NAL unit headers.
pub struct IdrScanner {
    path: String,
    codec_type: VideoCodecType,
    time_base: f64,
    width: u32,
    height: u32,
    duration: f64,
}

impl IdrScanner {
    /// Create a new scanner for the given video file
    pub fn new(path: impl Into<String>) -> Result<Self> {
        let path = path.into();

        if !Path::new(&path).exists() {
            return Err(Error::FileNotFound(path));
        }

        let input_ctx = input(&path)?;

        let stream = input_ctx
            .streams()
            .best(Type::Video)
            .ok_or_else(|| Error::Ffmpeg("No video stream found".to_string()))?;

        let codec_params = stream.parameters();
        let codec_id = codec_params.id();
        let codec_type = VideoCodecType::from_codec_id(codec_id);

        let time_base = stream.time_base();
        let time_base_f64 = time_base.numerator() as f64 / time_base.denominator() as f64;

        let context = ffmpeg::codec::context::Context::from_parameters(codec_params)?;
        let decoder = context.decoder().video()?;

        let width = decoder.width();
        let height = decoder.height();

        let duration = if stream.duration() > 0 {
            stream.duration() as f64 * time_base_f64
        } else {
            input_ctx.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64
        };

        Ok(Self {
            path,
            codec_type,
            time_base: time_base_f64,
            width,
            height,
            duration,
        })
    }

    /// Get the video codec type
    pub fn codec_type(&self) -> VideoCodecType {
        self.codec_type
    }

    /// Get video duration in seconds
    pub fn duration(&self) -> f64 {
        self.duration
    }

    /// Scan for all IDR frames in the video
    ///
    /// Returns a list of KeyframeInfo sorted by timestamp.
    pub fn scan_idr_frames(&self) -> Result<Vec<KeyframeInfo>> {
        let mut input_ctx = input(&self.path)?;

        let stream = input_ctx
            .streams()
            .best(Type::Video)
            .ok_or_else(|| Error::Ffmpeg("No video stream found".to_string()))?;

        let stream_index = stream.index();
        let mut keyframes = Vec::new();
        let mut frame_index: u64 = 0;

        for (stream, packet) in input_ctx.packets() {
            if stream.index() != stream_index {
                continue;
            }

            let is_key = packet.is_key();
            let pts = packet.pts().unwrap_or(0);
            let timestamp = pts as f64 * self.time_base;

            // Check if this is a true IDR frame
            let (is_idr, nal_type) = if is_key {
                self.check_idr_frame(&packet)
            } else {
                (false, 0)
            };

            if is_idr {
                keyframes.push(KeyframeInfo {
                    source_path: self.path.clone(),
                    timestamp,
                    frame_index,
                    width: self.width,
                    height: self.height,
                    is_idr: true,
                    nal_type,
                    pts,
                });
            }

            frame_index += 1;
        }

        // Sort by timestamp (should already be sorted, but ensure it)
        keyframes.sort_by(|a, b| a.timestamp.partial_cmp(&b.timestamp).unwrap());

        Ok(keyframes)
    }

    /// Scan for IDR frames after a specific timestamp
    ///
    /// Returns up to `max_frames` IDR frames starting from `start_time`.
    pub fn scan_idr_frames_from(
        &self,
        start_time: f64,
        max_frames: usize,
    ) -> Result<Vec<KeyframeInfo>> {
        let all_frames = self.scan_idr_frames()?;

        let frames: Vec<KeyframeInfo> = all_frames
            .into_iter()
            .filter(|f| f.timestamp >= start_time)
            .take(max_frames)
            .collect();

        Ok(frames)
    }

    /// Check if a packet contains an IDR frame by parsing NAL unit header
    fn check_idr_frame(&self, packet: &ffmpeg::Packet) -> (bool, u8) {
        let data = match packet.data() {
            Some(d) if !d.is_empty() => d,
            _ => return (false, 0),
        };

        match self.codec_type {
            VideoCodecType::H264 => self.check_h264_idr(data),
            VideoCodecType::H265 => self.check_h265_idr(data),
            VideoCodecType::Other => {
                // Fallback: trust is_key() for unknown codecs
                (packet.is_key(), 0)
            }
        }
    }

    /// Check for H.264 IDR frame
    ///
    /// H.264 NAL unit header format:
    /// - Byte 0: forbidden_zero_bit (1) | nal_ref_idc (2) | nal_unit_type (5)
    /// - NAL type 5 = IDR slice
    fn check_h264_idr(&self, data: &[u8]) -> (bool, u8) {
        // Find NAL unit start
        let nal_start = self.find_nal_start(data);

        if let Some(start) = nal_start {
            if start < data.len() {
                let nal_type = data[start] & 0x1F;
                // H.264 IDR: nal_unit_type == 5
                return (nal_type == 5, nal_type);
            }
        }

        // AVCC format (no start code): first byte after length prefix
        if data.len() >= 5 {
            // AVCC uses 4-byte length prefix
            let nal_type = data[4] & 0x1F;
            return (nal_type == 5, nal_type);
        }

        (false, 0)
    }

    /// Check for H.265 IDR frame
    ///
    /// H.265 NAL unit header format (2 bytes):
    /// - Byte 0: forbidden_zero_bit (1) | nal_unit_type (6) | nuh_layer_id[5:0] (1)
    /// - Byte 1: nuh_layer_id[0] (1) | nuh_temporal_id_plus1 (3) | reserved (4)
    /// - NAL type 19 = IDR_W_RADL, type 20 = IDR_N_LP
    fn check_h265_idr(&self, data: &[u8]) -> (bool, u8) {
        // Find NAL unit start
        let nal_start = self.find_nal_start(data);

        if let Some(start) = nal_start {
            if start < data.len() {
                // H.265: nal_unit_type is bits 1-6 of first byte
                let nal_type = (data[start] >> 1) & 0x3F;
                // H.265 IDR: nal_unit_type == 19 (IDR_W_RADL) or 20 (IDR_N_LP)
                return (nal_type == 19 || nal_type == 20, nal_type);
            }
        }

        // HVCC format (no start code)
        if data.len() >= 6 {
            // HVCC uses 4-byte length prefix
            let nal_type = (data[4] >> 1) & 0x3F;
            return (nal_type == 19 || nal_type == 20, nal_type);
        }

        (false, 0)
    }

    /// Find NAL unit start code (0x000001 or 0x00000001)
    ///
    /// Returns the index of the first byte after the start code.
    fn find_nal_start(&self, data: &[u8]) -> Option<usize> {
        if data.len() < 4 {
            return None;
        }

        // Check for 4-byte start code: 0x00000001
        if data[0] == 0 && data[1] == 0 && data[2] == 0 && data[3] == 1 {
            return Some(4);
        }

        // Check for 3-byte start code: 0x000001
        if data[0] == 0 && data[1] == 0 && data[2] == 1 {
            return Some(3);
        }

        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_codec_type_detection() {
        assert_eq!(
            VideoCodecType::from_codec_id(ffmpeg::codec::Id::H264),
            VideoCodecType::H264
        );
        assert_eq!(
            VideoCodecType::from_codec_id(ffmpeg::codec::Id::HEVC),
            VideoCodecType::H265
        );
        assert_eq!(
            VideoCodecType::from_codec_id(ffmpeg::codec::Id::VP9),
            VideoCodecType::Other
        );
    }

    #[test]
    fn test_h264_nal_parsing() {
        let scanner = IdrScanner {
            path: String::new(),
            codec_type: VideoCodecType::H264,
            time_base: 1.0 / 30.0,
            width: 1920,
            height: 1080,
            duration: 10.0,
        };

        // Annex B format with 4-byte start code + IDR NAL (type 5)
        let idr_data = vec![0x00, 0x00, 0x00, 0x01, 0x65]; // 0x65 = 0b01100101, type = 5
        let (is_idr, nal_type) = scanner.check_h264_idr(&idr_data);
        assert!(is_idr);
        assert_eq!(nal_type, 5);

        // Non-IDR I-frame (type 1)
        let non_idr_data = vec![0x00, 0x00, 0x00, 0x01, 0x41]; // 0x41 = 0b01000001, type = 1
        let (is_idr, nal_type) = scanner.check_h264_idr(&non_idr_data);
        assert!(!is_idr);
        assert_eq!(nal_type, 1);
    }

    #[test]
    fn test_h265_nal_parsing() {
        let scanner = IdrScanner {
            path: String::new(),
            codec_type: VideoCodecType::H265,
            time_base: 1.0 / 30.0,
            width: 1920,
            height: 1080,
            duration: 10.0,
        };

        // Annex B format with 4-byte start code + IDR_W_RADL NAL (type 19)
        // Type 19 = 0b010011, shifted left by 1 = 0b0100110 = 0x26
        let idr_data = vec![0x00, 0x00, 0x00, 0x01, 0x26, 0x01];
        let (is_idr, nal_type) = scanner.check_h265_idr(&idr_data);
        assert!(is_idr);
        assert_eq!(nal_type, 19);

        // IDR_N_LP (type 20)
        // Type 20 = 0b010100, shifted left by 1 = 0b0101000 = 0x28
        let idr_nlp_data = vec![0x00, 0x00, 0x00, 0x01, 0x28, 0x01];
        let (is_idr, nal_type) = scanner.check_h265_idr(&idr_nlp_data);
        assert!(is_idr);
        assert_eq!(nal_type, 20);
    }

    #[test]
    fn test_find_nal_start() {
        let scanner = IdrScanner {
            path: String::new(),
            codec_type: VideoCodecType::H264,
            time_base: 1.0 / 30.0,
            width: 1920,
            height: 1080,
            duration: 10.0,
        };

        // 4-byte start code
        let data4 = vec![0x00, 0x00, 0x00, 0x01, 0x65];
        assert_eq!(scanner.find_nal_start(&data4), Some(4));

        // 3-byte start code
        let data3 = vec![0x00, 0x00, 0x01, 0x65];
        assert_eq!(scanner.find_nal_start(&data3), Some(3));

        // No start code (AVCC format)
        let avcc = vec![0x00, 0x00, 0x00, 0x10, 0x65];
        assert_eq!(scanner.find_nal_start(&avcc), None);
    }
}
