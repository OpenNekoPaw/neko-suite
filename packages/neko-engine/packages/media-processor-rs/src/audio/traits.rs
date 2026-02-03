//! Audio codec traits and types

use crate::error::Result;

/// Audio sample format
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SampleFormat {
    /// Unsigned 8-bit
    U8,
    /// Signed 16-bit
    S16,
    /// Signed 32-bit
    S32,
    /// 32-bit float (default)
    #[default]
    F32,
    /// 64-bit float
    F64,
}

impl SampleFormat {
    /// Get bytes per sample
    pub fn bytes_per_sample(&self) -> usize {
        match self {
            SampleFormat::U8 => 1,
            SampleFormat::S16 => 2,
            SampleFormat::S32 | SampleFormat::F32 => 4,
            SampleFormat::F64 => 8,
        }
    }

    /// Get FFmpeg sample format name
    pub fn ffmpeg_name(&self) -> &'static str {
        match self {
            SampleFormat::U8 => "u8",
            SampleFormat::S16 => "s16",
            SampleFormat::S32 => "s32",
            SampleFormat::F32 => "flt",
            SampleFormat::F64 => "dbl",
        }
    }
}

/// Audio codec format
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum AudioCodec {
    /// AAC (default)
    #[default]
    Aac,
    /// MP3
    Mp3,
    /// Opus
    Opus,
    /// FLAC (lossless)
    Flac,
    /// PCM (uncompressed)
    Pcm,
}

impl AudioCodec {
    /// Get FFmpeg encoder name
    pub fn ffmpeg_encoder_name(&self) -> &'static str {
        match self {
            AudioCodec::Aac => "aac",
            AudioCodec::Mp3 => "libmp3lame",
            AudioCodec::Opus => "libopus",
            AudioCodec::Flac => "flac",
            AudioCodec::Pcm => "pcm_s16le",
        }
    }

    /// Get default bitrate for this codec (in bps)
    pub fn default_bitrate(&self) -> u64 {
        match self {
            AudioCodec::Aac => 128_000,
            AudioCodec::Mp3 => 192_000,
            AudioCodec::Opus => 96_000,
            AudioCodec::Flac => 0, // Lossless, no bitrate
            AudioCodec::Pcm => 0,  // Uncompressed
        }
    }

    /// Check if codec is lossless
    pub fn is_lossless(&self) -> bool {
        matches!(self, AudioCodec::Flac | AudioCodec::Pcm)
    }
}

/// Audio stream information
#[derive(Debug, Clone)]
pub struct AudioInfo {
    /// Sample rate in Hz
    pub sample_rate: u32,
    /// Number of channels
    pub channels: u16,
    /// Sample format
    pub sample_format: SampleFormat,
    /// Duration in seconds
    pub duration: f64,
    /// Codec name
    pub codec: String,
    /// Bitrate in bps (0 for lossless)
    pub bitrate: u64,
    /// Total number of samples
    pub total_samples: u64,
}

/// Decoded audio frame
#[derive(Debug)]
pub struct DecodedAudioFrame {
    /// Audio sample data (interleaved)
    pub data: Vec<u8>,
    /// Number of samples per channel
    pub samples: usize,
    /// Timestamp in seconds
    pub timestamp: f64,
    /// Sample rate
    pub sample_rate: u32,
    /// Number of channels
    pub channels: u16,
    /// Sample format
    pub format: SampleFormat,
}

impl DecodedAudioFrame {
    /// Get duration of this frame in seconds
    pub fn duration(&self) -> f64 {
        self.samples as f64 / self.sample_rate as f64
    }

    /// Get total byte size
    pub fn byte_size(&self) -> usize {
        self.samples * self.channels as usize * self.format.bytes_per_sample()
    }
}

/// Encoded audio packet
#[derive(Debug)]
pub struct EncodedAudioPacket {
    /// Encoded data
    pub data: Vec<u8>,
    /// Presentation timestamp (in time base units)
    pub pts: i64,
    /// Duration (in time base units)
    pub duration: i64,
    /// Stream index
    pub stream_index: usize,
}

/// Audio decoder trait
pub trait AudioDecoder {
    /// Open an audio file
    fn open(&mut self, path: &str) -> Result<AudioInfo>;

    /// Seek to a specific time position
    fn seek(&mut self, time_seconds: f64) -> Result<()>;

    /// Decode the next audio frame
    fn decode_next(&mut self) -> Result<Option<DecodedAudioFrame>>;

    /// Decode audio at specific time
    fn decode_at(&mut self, time_seconds: f64) -> Result<Option<DecodedAudioFrame>> {
        self.seek(time_seconds)?;
        self.decode_next()
    }

    /// Get current position in seconds
    fn position(&self) -> f64;

    /// Get audio info (must call open first)
    fn audio_info(&self) -> Option<&AudioInfo>;

    /// Close the decoder
    fn close(&mut self);
}

/// Audio encoder configuration
#[derive(Debug, Clone)]
pub struct AudioEncoderConfig {
    /// Sample rate in Hz
    pub sample_rate: u32,
    /// Number of channels
    pub channels: u16,
    /// Target bitrate in bps
    pub bitrate: u64,
    /// Audio codec
    pub codec: AudioCodec,
    /// Input sample format
    pub sample_format: SampleFormat,
}

impl AudioEncoderConfig {
    /// Create a new audio encoder config with defaults
    pub fn new(sample_rate: u32, channels: u16, codec: AudioCodec) -> Self {
        Self {
            sample_rate,
            channels,
            bitrate: codec.default_bitrate(),
            codec,
            sample_format: SampleFormat::default(),
        }
    }

    /// Set bitrate
    pub fn with_bitrate(mut self, bitrate: u64) -> Self {
        self.bitrate = bitrate;
        self
    }

    /// Set sample format
    pub fn with_sample_format(mut self, format: SampleFormat) -> Self {
        self.sample_format = format;
        self
    }
}

/// Audio encoder trait
pub trait AudioEncoder {
    /// Initialize the encoder
    fn open(&mut self, config: &AudioEncoderConfig) -> Result<()>;

    /// Encode audio samples
    /// `data` should be interleaved samples in the configured format
    /// `samples` is the number of samples per channel
    fn encode_frame(&mut self, data: &[u8], samples: usize) -> Result<Vec<EncodedAudioPacket>>;

    /// Flush the encoder and get remaining packets
    fn flush(&mut self) -> Result<Vec<EncodedAudioPacket>>;

    /// Close the encoder
    fn close(&mut self);

    /// Get current encoder configuration
    fn config(&self) -> Option<&AudioEncoderConfig>;

    /// Check if encoder is open
    fn is_open(&self) -> bool {
        self.config().is_some()
    }
}
