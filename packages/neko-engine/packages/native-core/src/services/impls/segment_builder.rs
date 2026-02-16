//! SegmentBuilder - Collects encoded A/V packets and produces fMP4 segments
//!
//! Supports two segmentation modes:
//! - FixedFrames: flush every N video frames (for All-Intra / gop_size=1)
//! - KeyframeDriven: flush at keyframe boundaries (for standard GOP)

use crate::audio::AudioEncoderConfig;
use crate::encoder::EncodedPacket;
use crate::encoder::{EncoderConfig, Fmp4Muxer};
use crate::error::{Error, Result};

/// Segmentation mode
#[derive(Debug, Clone, Copy)]
pub enum SegmentMode {
    /// Flush every N video frames (for All-Intra encoding)
    FixedFrames(u32),
    /// Flush at keyframe boundaries (for standard GOP encoding)
    KeyframeDriven,
}

/// Builds fMP4 segments from encoded A/V packets
pub struct SegmentBuilder {
    muxer: Fmp4Muxer,
    /// Video frames in current segment
    video_frame_count: u32,
    /// Segmentation mode
    mode: SegmentMode,
    /// Whether init segment has been produced
    init_sent: bool,
}

impl SegmentBuilder {
    /// Create a new SegmentBuilder
    pub fn new(
        video_config: &EncoderConfig,
        audio_config: Option<&AudioEncoderConfig>,
        mode: SegmentMode,
    ) -> Result<Self> {
        let mut muxer = Fmp4Muxer::new();
        muxer.open(video_config, audio_config)?;

        Ok(Self {
            muxer,
            video_frame_count: 0,
            mode,
            init_sent: false,
        })
    }

    /// Produce the init segment (ftyp + moov). Can only be called once.
    pub fn init_segment(&mut self) -> Result<Vec<u8>> {
        if self.init_sent {
            return Err(Error::Other("Init segment already produced".into()));
        }
        let init = self.muxer.write_header()?;
        self.init_sent = true;
        Ok(init)
    }

    /// Write a video packet. Returns a media segment if a flush boundary is reached.
    pub fn write_video(&mut self, packet: &EncodedPacket) -> Result<Option<Vec<u8>>> {
        if !self.init_sent {
            return Err(Error::Other("Must call init_segment() first".into()));
        }

        self.muxer.write_video_packet(packet)?;
        self.video_frame_count += 1;

        let should_flush = match self.mode {
            SegmentMode::FixedFrames(n) => self.video_frame_count >= n,
            SegmentMode::KeyframeDriven => packet.is_keyframe && self.video_frame_count > 1,
        };

        if should_flush {
            let segment = self.muxer.flush_segment()?;
            self.video_frame_count = match self.mode {
                SegmentMode::FixedFrames(_) => 0,
                SegmentMode::KeyframeDriven => 1,
            };
            if !segment.is_empty() {
                return Ok(Some(segment));
            }
        }

        Ok(None)
    }

    /// Write an audio packet. Does not trigger flush (driven by video frames).
    pub fn write_audio(&mut self, packet: &EncodedPacket) -> Result<()> {
        if !self.init_sent {
            return Err(Error::Other("Must call init_segment() first".into()));
        }
        self.muxer.write_audio_packet(packet)
    }

    /// Force flush the current segment (e.g. on seek or stop)
    pub fn force_flush(&mut self) -> Result<Option<Vec<u8>>> {
        if !self.init_sent || self.video_frame_count == 0 {
            return Ok(None);
        }
        let segment = self.muxer.flush_segment()?;
        self.video_frame_count = 0;
        if segment.is_empty() {
            Ok(None)
        } else {
            Ok(Some(segment))
        }
    }

    /// Reset the builder for a new stream (e.g. after seek)
    ///
    /// Creates a fresh muxer. Caller must re-send init_segment to the client.
    pub fn reset(
        &mut self,
        video_config: &EncoderConfig,
        audio_config: Option<&AudioEncoderConfig>,
    ) -> Result<()> {
        // Drop old muxer
        self.muxer = Fmp4Muxer::new();
        self.muxer.open(video_config, audio_config)?;
        self.video_frame_count = 0;
        self.init_sent = false;
        Ok(())
    }

    /// Copy video codec parameters from encoder context. Must be called before `init_segment()`.
    ///
    /// # Safety
    /// `encoder_ctx` must be a valid pointer to an open AVCodecContext.
    pub unsafe fn copy_video_params_from_encoder(
        &mut self,
        encoder_ctx: *const ffmpeg_next::ffi::AVCodecContext,
    ) -> Result<()> {
        self.muxer.copy_video_params_from_encoder(encoder_ctx)
    }

    /// Set video AVCC extradata from the first keyframe's Annex B packet data.
    /// Must be called before `init_segment()`.
    pub fn set_video_extradata_from_keyframe(&mut self, packet_data: &[u8]) -> Result<()> {
        self.muxer.set_video_extradata_from_keyframe(packet_data)
    }

    /// Current segment sequence number
    pub fn segment_sequence(&self) -> u32 {
        self.muxer.segment_sequence()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::encoder::VideoCodec;

    #[test]
    fn test_segment_builder_creation() {
        let video_config = EncoderConfig::new(1920, 1080, 30.0, VideoCodec::H264);
        let builder = SegmentBuilder::new(&video_config, None, SegmentMode::FixedFrames(15));
        assert!(builder.is_ok());
    }
}
