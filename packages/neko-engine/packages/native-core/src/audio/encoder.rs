//! FFmpeg-based audio encoder

use super::traits::{AudioCodec, AudioEncoder, AudioEncoderConfig, EncodedAudioPacket, SampleFormat};
use crate::error::{Error, Result};

use ffmpeg_next as ffmpeg;
use ffmpeg_next::codec::Id;
use ffmpeg_next::format::Sample;
use ffmpeg_next::software::resampling::Context as ResamplerContext;
use ffmpeg_next::util::frame::audio::Audio as AudioFrame;
use ffmpeg_next::{ChannelLayout, Dictionary, Rational};

/// FFmpeg audio encoder
pub struct FfmpegAudioEncoder {
    encoder: Option<ffmpeg::encoder::Audio>,
    resampler: Option<ResamplerContext>,
    config: Option<AudioEncoderConfig>,
    pts: i64,
    time_base: Rational,
    frame_size: usize,
}

impl FfmpegAudioEncoder {
    /// Create a new audio encoder
    pub fn new() -> Self {
        Self {
            encoder: None,
            resampler: None,
            config: None,
            pts: 0,
            time_base: Rational::new(1, 48000),
            frame_size: 1024,
        }
    }

    /// Get FFmpeg codec ID for audio codec
    fn codec_id(codec: AudioCodec) -> Id {
        match codec {
            AudioCodec::Aac => Id::AAC,
            AudioCodec::Mp3 => Id::MP3,
            AudioCodec::Opus => Id::OPUS,
            AudioCodec::Flac => Id::FLAC,
            AudioCodec::Pcm => Id::PCM_S16LE,
        }
    }

    /// Convert SampleFormat to FFmpeg Sample format (planar for encoding)
    #[allow(dead_code)]
    fn to_ffmpeg_sample_format_planar(format: SampleFormat) -> Sample {
        match format {
            SampleFormat::U8 => Sample::U8(ffmpeg::format::sample::Type::Planar),
            SampleFormat::S16 => Sample::I16(ffmpeg::format::sample::Type::Planar),
            SampleFormat::S32 => Sample::I32(ffmpeg::format::sample::Type::Planar),
            SampleFormat::F32 => Sample::F32(ffmpeg::format::sample::Type::Planar),
            SampleFormat::F64 => Sample::F64(ffmpeg::format::sample::Type::Planar),
        }
    }

    /// Convert SampleFormat to FFmpeg Sample format (packed for input)
    fn to_ffmpeg_sample_format_packed(format: SampleFormat) -> Sample {
        match format {
            SampleFormat::U8 => Sample::U8(ffmpeg::format::sample::Type::Packed),
            SampleFormat::S16 => Sample::I16(ffmpeg::format::sample::Type::Packed),
            SampleFormat::S32 => Sample::I32(ffmpeg::format::sample::Type::Packed),
            SampleFormat::F32 => Sample::F32(ffmpeg::format::sample::Type::Packed),
            SampleFormat::F64 => Sample::F64(ffmpeg::format::sample::Type::Packed),
        }
    }

    /// Get the preferred sample format for encoder
    fn encoder_sample_format(codec: AudioCodec) -> Sample {
        match codec {
            AudioCodec::Aac => Sample::F32(ffmpeg::format::sample::Type::Planar),
            AudioCodec::Mp3 => Sample::I16(ffmpeg::format::sample::Type::Planar),
            AudioCodec::Opus => Sample::I16(ffmpeg::format::sample::Type::Packed),
            AudioCodec::Flac => Sample::I16(ffmpeg::format::sample::Type::Packed),
            AudioCodec::Pcm => Sample::I16(ffmpeg::format::sample::Type::Packed),
        }
    }

    /// Get channel layout for channel count
    fn channel_layout_for_channels(channels: u16) -> ChannelLayout {
        match channels {
            1 => ChannelLayout::MONO,
            2 => ChannelLayout::STEREO,
            6 => ChannelLayout::_5POINT1,
            8 => ChannelLayout::_7POINT1,
            _ => ChannelLayout::default(channels as i32),
        }
    }

    /// Receive encoded packets from encoder
    fn receive_packets(&mut self) -> Result<Vec<EncodedAudioPacket>> {
        let encoder = self.encoder.as_mut().ok_or(Error::EncoderNotInitialized)?;
        let mut packets = Vec::new();
        let mut packet = ffmpeg::Packet::empty();

        loop {
            match encoder.receive_packet(&mut packet) {
                Ok(_) => {
                    packets.push(EncodedAudioPacket {
                        data: packet.data().unwrap_or(&[]).to_vec(),
                        pts: packet.pts().unwrap_or(0),
                        duration: packet.duration(),
                        stream_index: 0,
                    });
                }
                Err(ffmpeg::Error::Other { errno }) if errno == ffmpeg::error::EAGAIN => {
                    break;
                }
                Err(ffmpeg::Error::Eof) => {
                    break;
                }
                Err(e) => {
                    return Err(Error::EncodeFailed(e.to_string()));
                }
            }
        }

        Ok(packets)
    }
}

impl Default for FfmpegAudioEncoder {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioEncoder for FfmpegAudioEncoder {
    fn open(&mut self, config: &AudioEncoderConfig) -> Result<()> {
        // Find encoder
        let codec = ffmpeg::encoder::find(Self::codec_id(config.codec))
            .ok_or_else(|| Error::Ffmpeg(format!("Audio codec {:?} not found", config.codec)))?;

        // Create encoder context
        let _context = ffmpeg::codec::context::Context::new_with_codec(codec);
        let mut encoder = _context.encoder().audio()?;

        // Set encoding parameters
        encoder.set_rate(config.sample_rate as i32);

        let channel_layout = Self::channel_layout_for_channels(config.channels);
        encoder.set_channel_layout(channel_layout);

        // Set sample format
        let encoder_format = Self::encoder_sample_format(config.codec);
        encoder.set_format(encoder_format);

        // Set bitrate (if not lossless)
        if !config.codec.is_lossless() && config.bitrate > 0 {
            encoder.set_bit_rate(config.bitrate as usize);
        }

        // Set time base
        self.time_base = Rational::new(1, config.sample_rate as i32);
        encoder.set_time_base(self.time_base);

        // Build encoder options
        let opts = Dictionary::new();

        // Open encoder
        let encoder = encoder.open_with(opts)?;

        // Get frame size from encoder
        self.frame_size = encoder.frame_size() as usize;
        if self.frame_size == 0 {
            self.frame_size = 1024; // Default frame size
        }

        // Setup resampler if input format differs from encoder format
        let input_format = Self::to_ffmpeg_sample_format_packed(config.sample_format);
        let needs_resampling = input_format != encoder_format;

        if needs_resampling {
            let resampler = ResamplerContext::get(
                input_format,
                channel_layout,
                config.sample_rate,
                encoder_format,
                channel_layout,
                config.sample_rate,
            )?;

            self.resampler = Some(resampler);
        }

        self.encoder = Some(encoder);
        self.config = Some(config.clone());
        self.pts = 0;

        tracing::info!(
            "Audio encoder opened: {:?}, {} Hz, {} channels, {} bps",
            config.codec,
            config.sample_rate,
            config.channels,
            config.bitrate
        );

        Ok(())
    }

    fn encode_frame(&mut self, data: &[u8], samples: usize) -> Result<Vec<EncodedAudioPacket>> {
        let config = self.config.as_ref().ok_or(Error::EncoderNotInitialized)?;
        let encoder = self.encoder.as_mut().ok_or(Error::EncoderNotInitialized)?;

        // Create input frame
        let input_format = Self::to_ffmpeg_sample_format_packed(config.sample_format);
        let channel_layout = Self::channel_layout_for_channels(config.channels);

        let mut input_frame = AudioFrame::new(input_format, samples, channel_layout);
        input_frame.set_rate(config.sample_rate);

        // Copy data to frame
        let plane_data = input_frame.data_mut(0);
        let copy_size = data.len().min(plane_data.len());
        plane_data[..copy_size].copy_from_slice(&data[..copy_size]);

        // Resample if needed
        let frame_to_encode = if let Some(ref mut resampler) = self.resampler {
            let mut output = AudioFrame::empty();
            resampler.run(&input_frame, &mut output)?;
            output
        } else {
            input_frame
        };

        // Set PTS
        let mut frame = frame_to_encode;
        frame.set_pts(Some(self.pts));
        self.pts += samples as i64;

        // Send frame to encoder
        encoder.send_frame(&frame)?;

        // Receive encoded packets
        self.receive_packets()
    }

    fn flush(&mut self) -> Result<Vec<EncodedAudioPacket>> {
        let encoder = self.encoder.as_mut().ok_or(Error::EncoderNotInitialized)?;

        // Send EOF
        encoder.send_eof()?;

        // Receive remaining packets
        self.receive_packets()
    }

    fn close(&mut self) {
        self.encoder = None;
        self.resampler = None;
        self.config = None;
        self.pts = 0;
    }

    fn config(&self) -> Option<&AudioEncoderConfig> {
        self.config.as_ref()
    }
}

impl Drop for FfmpegAudioEncoder {
    fn drop(&mut self) {
        self.close();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_codec_bitrate() {
        assert_eq!(AudioCodec::Aac.default_bitrate(), 128_000);
        assert_eq!(AudioCodec::Mp3.default_bitrate(), 192_000);
        assert_eq!(AudioCodec::Opus.default_bitrate(), 96_000);
        assert_eq!(AudioCodec::Flac.default_bitrate(), 0);
    }

    #[test]
    fn test_audio_encoder_config() {
        let config = AudioEncoderConfig::new(48000, 2, AudioCodec::Aac)
            .with_bitrate(256_000);

        assert_eq!(config.sample_rate, 48000);
        assert_eq!(config.channels, 2);
        assert_eq!(config.bitrate, 256_000);
    }
}
