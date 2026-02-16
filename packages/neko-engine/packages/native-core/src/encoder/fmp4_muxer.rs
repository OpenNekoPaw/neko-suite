//! fMP4 Memory Muxer - Fragmented MP4 output to memory buffer
//!
//! Uses FFmpeg's custom avio I/O to write fMP4 data into memory instead of files.
//! Produces two types of output:
//! - Init segment (ftyp + moov): sent once at stream start
//! - Media segments (moof + mdat): sent periodically (every N frames)
//!
//! The movflags ensure MSE (MediaSource Extensions) compatibility:
//! - `frag_custom`: manual control over fragment boundaries
//! - `empty_moov`: moov contains no sample data (all in moof)
//! - `default_base_moof`: moof as offset base (required by MSE)
//! - `omit_tfhd_offset`: reduce overhead

use super::codec_ext::ContainerFormatExt;
use super::traits::{EncodedPacket, EncoderConfig, VideoCodec};
use crate::audio::AudioEncoderConfig;
use crate::error::{Error, Result};
use neko_types::AudioCodec;

use ffmpeg_next as ffmpeg;
use ffmpeg_next::ffi;
use ffmpeg_next::Rational;

use std::ffi::{c_void, CString};
use std::ptr;
use std::sync::{Arc, Mutex};

/// Shared write buffer used by the avio callback
type WriteBuffer = Arc<Mutex<Vec<u8>>>;

/// fMP4 memory muxer
///
/// Writes fragmented MP4 data to an in-memory buffer via custom avio I/O.
pub struct Fmp4Muxer {
    output_ctx: Option<ffmpeg::format::context::Output>,
    /// Raw pointer to avio context (owned, freed on drop)
    avio_ctx: *mut ffi::AVIOContext,
    /// Shared buffer that receives all muxer output
    write_buffer: WriteBuffer,
    video_stream_index: Option<usize>,
    audio_stream_index: Option<usize>,
    video_time_base: Rational,
    audio_time_base: Rational,
    header_written: bool,
    segment_sequence: u32,
}

// Safety: Fmp4Muxer is only used from a single thread (the muxing thread)
unsafe impl Send for Fmp4Muxer {}

impl Fmp4Muxer {
    pub fn new() -> Self {
        Self {
            output_ctx: None,
            avio_ctx: ptr::null_mut(),
            write_buffer: Arc::new(Mutex::new(Vec::new())),
            video_stream_index: None,
            audio_stream_index: None,
            video_time_base: Rational::new(1, 30),
            audio_time_base: Rational::new(1, 48000),
            header_written: false,
            segment_sequence: 0,
        }
    }

    /// Open the fMP4 muxer with video and audio stream configuration
    pub fn open(
        &mut self,
        video_config: &EncoderConfig,
        audio_config: Option<&AudioEncoderConfig>,
    ) -> Result<()> {
        unsafe {
            // 1. Allocate output format context for mp4
            let format_name = CString::new("mp4").unwrap();
            let mut ps: *mut ffi::AVFormatContext = ptr::null_mut();

            let ret = ffi::avformat_alloc_output_context2(
                &mut ps,
                ptr::null_mut(),
                format_name.as_ptr(),
                ptr::null(), // no filename
            );
            if ret < 0 || ps.is_null() {
                return Err(Error::Ffmpeg(format!(
                    "Failed to allocate output context: {}",
                    ret
                )));
            }

            // 2. Create custom avio context for memory output
            let avio_buf_size: usize = 64 * 1024; // 64KB internal buffer
            let avio_buffer = ffi::av_malloc(avio_buf_size) as *mut u8;
            if avio_buffer.is_null() {
                ffi::avformat_free_context(ps);
                return Err(Error::Ffmpeg("Failed to allocate avio buffer".into()));
            }

            // Store write_buffer as opaque pointer for the callback
            let write_buffer = Arc::new(Mutex::new(Vec::with_capacity(256 * 1024)));
            let opaque = Arc::into_raw(write_buffer.clone()) as *mut c_void;

            let avio_ctx = ffi::avio_alloc_context(
                avio_buffer,
                avio_buf_size as i32,
                1, // write_flag = 1
                opaque,
                None,                  // read_packet
                Some(avio_write_cb),   // write_packet
                None,                  // seek (not needed for streaming)
            );

            if avio_ctx.is_null() {
                ffi::av_free(avio_buffer as *mut c_void);
                ffi::avformat_free_context(ps);
                // Reconstruct Arc to drop it properly
                let _ = Arc::from_raw(opaque as *const Mutex<Vec<u8>>);
                return Err(Error::Ffmpeg("Failed to allocate avio context".into()));
            }

            // 3. Assign custom avio to format context
            (*ps).pb = avio_ctx;
            // Mark as non-file so FFmpeg doesn't try to open/close a file
            (*ps).flags |= ffi::AVFMT_FLAG_CUSTOM_IO as i32;

            // 4. Wrap in ffmpeg-next Output
            let mut output_ctx = ffmpeg::format::context::Output::wrap(ps);

            // 5. Add video stream
            self.add_video_stream(&mut output_ctx, video_config)?;

            // 6. Add audio stream (optional)
            if let Some(audio_cfg) = audio_config {
                self.add_audio_stream(&mut output_ctx, audio_cfg)?;
            }

            self.output_ctx = Some(output_ctx);
            self.avio_ctx = avio_ctx;
            self.write_buffer = write_buffer;
            self.header_written = false;
            self.segment_sequence = 0;

            tracing::info!(
                "fMP4 muxer opened: video={:?} {}x{}, audio={}",
                video_config.codec,
                video_config.width,
                video_config.height,
                audio_config.map_or("none".to_string(), |c| format!("{:?}", c.codec)),
            );

            Ok(())
        }
    }

    /// Write header and return the init segment (ftyp + moov)
    pub fn write_header(&mut self) -> Result<Vec<u8>> {
        let output_ctx = self
            .output_ctx
            .as_mut()
            .ok_or(Error::MuxerNotInitialized)?;

        if self.header_written {
            return Err(Error::InvalidParameter(
                "Header already written".to_string(),
            ));
        }

        // Set movflags for fMP4 / MSE compatibility
        unsafe {
            let key = CString::new("movflags").unwrap();
            let val = CString::new(
                "frag_custom+empty_moov+default_base_moof+omit_tfhd_offset",
            )
            .unwrap();
            ffi::av_opt_set(
                (*output_ctx.as_mut_ptr()).priv_data,
                key.as_ptr(),
                val.as_ptr(),
                0,
            );
        }

        // Clear buffer before writing header
        self.write_buffer.lock().unwrap().clear();

        output_ctx.write_header()?;
        self.header_written = true;

        // Flush avio to ensure all header data is in our buffer
        unsafe {
            ffi::avio_flush(self.avio_ctx);
        }

        // Capture init segment
        let mut buf = self.write_buffer.lock().unwrap();
        let init_segment = buf.clone();
        buf.clear();

        tracing::info!("fMP4 init segment: {} bytes", init_segment.len());
        Ok(init_segment)
    }

    /// Write a video packet to the current segment
    pub fn write_video_packet(&mut self, packet: &EncodedPacket) -> Result<()> {
        let output_ctx = self
            .output_ctx
            .as_mut()
            .ok_or(Error::MuxerNotInitialized)?;

        let stream_index = self
            .video_stream_index
            .ok_or_else(|| Error::InvalidParameter("No video stream".into()))?;

        if !self.header_written {
            return Err(Error::InvalidParameter("Header not written".into()));
        }

        // Rescale PTS from encoder time_base to stream time_base
        let stream = output_ctx.stream(stream_index).ok_or_else(|| {
            Error::InvalidParameter("Video stream not found".into())
        })?;
        let stream_tb = stream.time_base();
        let stream_tb_den = stream_tb.denominator() as i64;
        let video_tb_den = self.video_time_base.denominator() as i64;

        let scaled_pts = packet.pts * stream_tb_den / video_tb_den;
        let scaled_dts = packet.dts * stream_tb_den / video_tb_den;
        let scaled_duration = if packet.duration > 0 {
            packet.duration * stream_tb_den / video_tb_den
        } else {
            stream_tb_den / video_tb_den
        };

        // VideoToolbox with global_header produces packets in Annex B format
        // (start code prefixed). Since we converted extradata to AVCC, the MP4 muxer
        // won't auto-convert packets. We must convert them ourselves.
        if packet.pts == 0 {
            // Log first packet format for debugging
            let first_bytes: Vec<u8> = packet.data.iter().take(8).cloned().collect();
            let is_annex_b = packet.data.len() >= 4
                && ((packet.data[0] == 0 && packet.data[1] == 0 && packet.data[2] == 0 && packet.data[3] == 1)
                    || (packet.data[0] == 0 && packet.data[1] == 0 && packet.data[2] == 1));
            tracing::info!(
                "fMP4: first video packet: {} bytes, first_8={:02x?}, is_annex_b={}, keyframe={}",
                packet.data.len(), first_bytes, is_annex_b, packet.is_keyframe
            );
        }
        let packet_data = annex_b_to_avcc_packet(&packet.data);
        let mut ffmpeg_packet = ffmpeg::Packet::copy(&packet_data);
        ffmpeg_packet.set_stream(stream_index);
        ffmpeg_packet.set_pts(Some(scaled_pts));
        ffmpeg_packet.set_dts(Some(scaled_dts));
        ffmpeg_packet.set_duration(scaled_duration);

        if packet.is_keyframe {
            ffmpeg_packet.set_flags(ffmpeg::codec::packet::Flags::KEY);
        }

        ffmpeg_packet.write_interleaved(output_ctx)?;
        Ok(())
    }

    /// Write an audio packet to the current segment
    pub fn write_audio_packet(&mut self, packet: &EncodedPacket) -> Result<()> {
        let output_ctx = self
            .output_ctx
            .as_mut()
            .ok_or(Error::MuxerNotInitialized)?;

        let stream_index = self
            .audio_stream_index
            .ok_or_else(|| Error::InvalidParameter("No audio stream".into()))?;

        if !self.header_written {
            return Err(Error::InvalidParameter("Header not written".into()));
        }

        let mut ffmpeg_packet = ffmpeg::Packet::copy(&packet.data);
        ffmpeg_packet.set_stream(stream_index);
        ffmpeg_packet.set_pts(Some(packet.pts));
        ffmpeg_packet.set_dts(Some(packet.dts));
        ffmpeg_packet.set_duration(packet.duration);

        ffmpeg_packet.write_interleaved(output_ctx)?;
        Ok(())
    }

    /// Flush the current fragment and return the media segment (moof + mdat)
    pub fn flush_segment(&mut self) -> Result<Vec<u8>> {
        let output_ctx = self
            .output_ctx
            .as_mut()
            .ok_or(Error::MuxerNotInitialized)?;

        if !self.header_written {
            return Err(Error::InvalidParameter("Header not written".into()));
        }

        // av_write_frame(ctx, NULL) triggers fragment flush with frag_custom
        unsafe {
            let ret = ffi::av_write_frame(output_ctx.as_mut_ptr(), ptr::null_mut());
            if ret < 0 {
                return Err(Error::Ffmpeg(format!(
                    "Failed to flush fragment: {}",
                    ret
                )));
            }
            ffi::avio_flush(self.avio_ctx);
        }

        // Capture media segment
        let mut buf = self.write_buffer.lock().unwrap();
        let segment = buf.clone();
        buf.clear();

        self.segment_sequence += 1;

        if segment.is_empty() {
            tracing::warn!("fMP4 flush produced empty segment (seq={})", self.segment_sequence);
        }

        Ok(segment)
    }

    /// Get current segment sequence number
    pub fn segment_sequence(&self) -> u32 {
        self.segment_sequence
    }

    /// Check if muxer is open and header written
    pub fn is_ready(&self) -> bool {
        self.output_ctx.is_some() && self.header_written
    }

    /// Copy all video codec parameters from an encoder's AVCodecContext to the
    /// muxer's video stream codecpar using `avcodec_parameters_from_context()`.
    ///
    /// This is the standard FFmpeg pattern and correctly handles:
    /// - Extradata format conversion (Annex B → AVCC for H.264 in MP4)
    /// - Codec profile/level
    /// - Pixel format, color space, etc.
    ///
    /// # Safety
    /// `encoder_ctx` must be a valid pointer to an open AVCodecContext.
    /// The encoder must remain open until this method returns.
    ///
    /// Must be called after `open()` and before `write_header()`.
    pub unsafe fn copy_video_params_from_encoder(
        &mut self,
        encoder_ctx: *const ffi::AVCodecContext,
    ) -> Result<()> {
        let output_ctx = self
            .output_ctx
            .as_mut()
            .ok_or(Error::MuxerNotInitialized)?;

        let stream_index = self
            .video_stream_index
            .ok_or_else(|| Error::InvalidParameter("No video stream".into()))?;

        if self.header_written {
            return Err(Error::InvalidParameter(
                "Cannot set codec params after header is written".into(),
            ));
        }

        if encoder_ctx.is_null() {
            return Err(Error::InvalidParameter("Encoder context is null".into()));
        }

        let stream = output_ctx.stream(stream_index).ok_or_else(|| {
            Error::InvalidParameter("Video stream not found".into())
        })?;
        let codecpar = (*stream.as_ptr()).codecpar;
        if codecpar.is_null() {
            return Err(Error::Ffmpeg("Stream codecpar is null".into()));
        }

        // Copy all codec parameters from encoder context to stream codecpar
        let ret = ffi::avcodec_parameters_from_context(codecpar, encoder_ctx);
        if ret < 0 {
            return Err(Error::Ffmpeg(format!(
                "avcodec_parameters_from_context failed: {}",
                ret
            )));
        }

        // Log what was copied
        let extradata_size = (*codecpar).extradata_size as usize;
        let profile = (*codecpar).profile;
        let level = (*codecpar).level;
        tracing::info!(
            "fMP4: copied encoder params to stream {}: extradata={} bytes, profile={}, level={}",
            stream_index,
            extradata_size,
            profile,
            level,
        );

        // VideoToolbox with AV_CODEC_FLAG_GLOBAL_HEADER produces extradata in Annex B
        // format (start code prefixed), but outputs packet data in AVCC format (4-byte
        // length prefixed). FFmpeg's MP4 muxer checks extradata[0]: if it's not 0x01
        // (AVCC), it assumes ALL packet data is also Annex B and tries to convert it.
        // This double-converts the already-AVCC packets, corrupting the bitstream.
        //
        // Fix: manually convert extradata from Annex B → AVCC so the muxer sees
        // AVCC extradata and passes the already-AVCC packets through unchanged.
        if extradata_size > 4 && !(*codecpar).extradata.is_null() {
            let extradata = std::slice::from_raw_parts((*codecpar).extradata, extradata_size);
            if extradata[..4] == [0x00, 0x00, 0x00, 0x01] {
                tracing::info!(
                    "fMP4: extradata is Annex B ({} bytes), converting to AVCC",
                    extradata_size
                );
                match annex_b_to_avcc(extradata) {
                    Ok(avcc_data) => {
                        // Replace extradata in codecpar with AVCC format
                        ffi::av_free((*codecpar).extradata as *mut c_void);
                        let new_buf = ffi::av_malloc(
                            avcc_data.len() + ffi::AV_INPUT_BUFFER_PADDING_SIZE as usize,
                        ) as *mut u8;
                        if !new_buf.is_null() {
                            std::ptr::copy_nonoverlapping(
                                avcc_data.as_ptr(),
                                new_buf,
                                avcc_data.len(),
                            );
                            std::ptr::write_bytes(
                                new_buf.add(avcc_data.len()),
                                0,
                                ffi::AV_INPUT_BUFFER_PADDING_SIZE as usize,
                            );
                            (*codecpar).extradata = new_buf;
                            (*codecpar).extradata_size = avcc_data.len() as i32;
                            tracing::info!(
                                "fMP4: extradata converted to AVCC ({} bytes)",
                                avcc_data.len()
                            );
                        } else {
                            tracing::error!("fMP4: failed to allocate buffer for AVCC extradata");
                        }
                    }
                    Err(e) => {
                        tracing::error!("fMP4: Annex B → AVCC conversion failed: {}", e);
                    }
                }
            } else if extradata_size > 0 && extradata[0] == 1 {
                tracing::info!("fMP4: extradata is already AVCC ({} bytes)", extradata_size);
            }
        }

        Ok(())
    }

    /// Set video AVCC extradata from the first keyframe's Annex B packet data.
    ///
    /// When `global_header` is not used, the encoder embeds SPS/PPS in each keyframe.
    /// This method extracts SPS/PPS NALs from the packet, builds an AVCC
    /// `AVCDecoderConfigurationRecord`, and sets it as extradata on the video stream's
    /// codecpar. Must be called before `write_header()`.
    pub fn set_video_extradata_from_keyframe(&mut self, packet_data: &[u8]) -> Result<()> {
        let output_ctx = self
            .output_ctx
            .as_mut()
            .ok_or(Error::MuxerNotInitialized)?;

        let stream_index = self
            .video_stream_index
            .ok_or_else(|| Error::InvalidParameter("No video stream".into()))?;

        if self.header_written {
            return Err(Error::InvalidParameter(
                "Cannot set extradata after header is written".into(),
            ));
        }

        // The keyframe packet (Annex B) should contain SPS + PPS + IDR slice.
        // annex_b_to_avcc() extracts SPS/PPS and builds AVCC record.
        let avcc_data = annex_b_to_avcc(packet_data)?;

        let stream = output_ctx.stream(stream_index).ok_or_else(|| {
            Error::InvalidParameter("Video stream not found".into())
        })?;

        unsafe {
            let codecpar = (*stream.as_ptr()).codecpar;
            if codecpar.is_null() {
                return Err(Error::Ffmpeg("Stream codecpar is null".into()));
            }

            // Free old extradata if any
            if !(*codecpar).extradata.is_null() {
                ffi::av_free((*codecpar).extradata as *mut c_void);
                (*codecpar).extradata = ptr::null_mut();
                (*codecpar).extradata_size = 0;
            }

            let buf = ffi::av_malloc(
                avcc_data.len() + ffi::AV_INPUT_BUFFER_PADDING_SIZE as usize,
            ) as *mut u8;
            if buf.is_null() {
                return Err(Error::Ffmpeg("Failed to allocate AVCC extradata buffer".into()));
            }

            std::ptr::copy_nonoverlapping(avcc_data.as_ptr(), buf, avcc_data.len());
            std::ptr::write_bytes(
                buf.add(avcc_data.len()),
                0,
                ffi::AV_INPUT_BUFFER_PADDING_SIZE as usize,
            );
            (*codecpar).extradata = buf;
            (*codecpar).extradata_size = avcc_data.len() as i32;

            tracing::info!(
                "fMP4: set AVCC extradata from keyframe ({} bytes) on stream {}",
                avcc_data.len(),
                stream_index,
            );
        }

        Ok(())
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    fn add_video_stream(
        &mut self,
        output_ctx: &mut ffmpeg::format::context::Output,
        config: &EncoderConfig,
    ) -> Result<()> {
        let codec_id = match config.codec {
            VideoCodec::H264 => ffmpeg::codec::Id::H264,
            VideoCodec::H265 => ffmpeg::codec::Id::HEVC,
            VideoCodec::Vp9 => ffmpeg::codec::Id::VP9,
            VideoCodec::Av1 => ffmpeg::codec::Id::AV1,
            VideoCodec::ProRes => ffmpeg::codec::Id::PRORES,
        };

        let codec = ffmpeg::encoder::find(codec_id)
            .ok_or_else(|| Error::Ffmpeg(format!("Video codec {:?} not found", config.codec)))?;

        let mut stream = output_ctx.add_stream(codec)?;
        let stream_index = stream.index();

        let time_base = Rational::new(1, config.fps as i32);
        stream.set_time_base(time_base);

        unsafe {
            let mut params = stream.parameters();
            let p = params.as_mut_ptr();
            (*p).codec_type = ffi::AVMediaType::AVMEDIA_TYPE_VIDEO;
            (*p).codec_id = codec_id.into();
            (*p).width = config.width as i32;
            (*p).height = config.height as i32;
            (*p).bit_rate = config.bitrate as i64;
            (*p).format = ffi::AVPixelFormat::AV_PIX_FMT_YUV420P as i32;
            (*p).framerate.num = config.fps as i32;
            (*p).framerate.den = 1;
        }

        self.video_stream_index = Some(stream_index);
        self.video_time_base = time_base;

        tracing::debug!(
            "fMP4: added video stream idx={}, {:?} {}x{} {}fps",
            stream_index, config.codec, config.width, config.height, config.fps,
        );

        Ok(())
    }

    fn add_audio_stream(
        &mut self,
        output_ctx: &mut ffmpeg::format::context::Output,
        config: &AudioEncoderConfig,
    ) -> Result<()> {
        let codec_id = match config.codec {
            AudioCodec::Aac => ffmpeg::codec::Id::AAC,
            AudioCodec::Opus => ffmpeg::codec::Id::OPUS,
            AudioCodec::Mp3 => ffmpeg::codec::Id::MP3,
            AudioCodec::Flac => ffmpeg::codec::Id::FLAC,
            AudioCodec::Pcm => ffmpeg::codec::Id::PCM_S16LE,
            AudioCodec::Vorbis => ffmpeg::codec::Id::VORBIS,
        };

        let codec = ffmpeg::encoder::find(codec_id)
            .ok_or_else(|| Error::Ffmpeg(format!("Audio codec {:?} not found", config.codec)))?;

        let mut stream = output_ctx.add_stream(codec)?;
        let stream_index = stream.index();

        let time_base = Rational::new(1, config.sample_rate as i32);
        stream.set_time_base(time_base);

        unsafe {
            let mut params = stream.parameters();
            let p = params.as_mut_ptr();
            (*p).codec_type = ffi::AVMediaType::AVMEDIA_TYPE_AUDIO;
            (*p).codec_id = codec_id.into();
            (*p).sample_rate = config.sample_rate as i32;
            (*p).ch_layout.nb_channels = config.channels as i32;
            (*p).bit_rate = config.bitrate as i64;
            // frame_size is required by MP4 muxer for audio codecs
            // Opus default: 960 samples (20ms at 48kHz)
            // AAC default: 1024 samples
            (*p).frame_size = match config.codec {
                AudioCodec::Opus => 960,
                AudioCodec::Aac => 1024,
                _ => 1024,
            };

            // Opus in MP4 requires OpusHead extradata (≥19 bytes)
            if config.codec == AudioCodec::Opus {
                let opus_head = build_opus_head(config.channels as u8, config.sample_rate);
                let buf = ffi::av_malloc(opus_head.len() + ffi::AV_INPUT_BUFFER_PADDING_SIZE as usize)
                    as *mut u8;
                if !buf.is_null() {
                    std::ptr::copy_nonoverlapping(opus_head.as_ptr(), buf, opus_head.len());
                    std::ptr::write_bytes(
                        buf.add(opus_head.len()),
                        0,
                        ffi::AV_INPUT_BUFFER_PADDING_SIZE as usize,
                    );
                    (*p).extradata = buf;
                    (*p).extradata_size = opus_head.len() as i32;
                    tracing::debug!(
                        "fMP4: set Opus extradata (OpusHead) {} bytes on stream {}",
                        opus_head.len(),
                        stream_index,
                    );
                }
            }
        }

        self.audio_stream_index = Some(stream_index);
        self.audio_time_base = time_base;

        tracing::debug!(
            "fMP4: added audio stream idx={}, {:?} {}Hz {}ch",
            stream_index, config.codec, config.sample_rate, config.channels,
        );

        Ok(())
    }
}

impl Default for Fmp4Muxer {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for Fmp4Muxer {
    fn drop(&mut self) {
        // Write trailer if header was written
        if self.header_written {
            if let Some(ref mut ctx) = self.output_ctx {
                let _ = ctx.write_trailer();
            }
        }

        // Drop output_ctx first (it references avio_ctx)
        self.output_ctx = None;

        // Free avio context and reconstruct the Arc to drop it
        if !self.avio_ctx.is_null() {
            unsafe {
                let opaque = (*self.avio_ctx).opaque;
                if !opaque.is_null() {
                    // Reconstruct Arc to properly drop the write buffer
                    let _ = Arc::from_raw(opaque as *const Mutex<Vec<u8>>);
                }
                // Note: avio_context_free also frees the internal buffer
                ffi::avio_context_free(&mut self.avio_ctx);
            }
        }
    }
}

// =============================================================================
// avio write callback
// =============================================================================

/// Custom avio write callback — appends data to the shared write buffer
unsafe extern "C" fn avio_write_cb(
    opaque: *mut c_void,
    buf: *const u8,
    buf_size: i32,
) -> i32 {
    if opaque.is_null() || buf.is_null() || buf_size <= 0 {
        return -1;
    }

    let write_buffer = &*(opaque as *const Mutex<Vec<u8>>);
    let data = std::slice::from_raw_parts(buf, buf_size as usize);

    match write_buffer.lock() {
        Ok(mut buffer) => {
            buffer.extend_from_slice(data);
            buf_size
        }
        Err(_) => -1,
    }
}

// =============================================================================
// Annex B → AVCC conversion
// =============================================================================

/// Convert H.264 Annex B extradata (start codes) to AVCC format (AVCDecoderConfigurationRecord).
///
/// AVCC format:
/// ```text
/// [version: u8 = 1]
/// [profile_idc: u8]
/// [profile_compat: u8]
/// [level_idc: u8]
/// [0xFF: u8]  (length_size_minus_one = 3, i.e. 4-byte NAL lengths)
/// [0xE0 | num_sps: u8]
/// for each SPS: [sps_length: u16 BE] [sps_data...]
/// [num_pps: u8]
/// for each PPS: [pps_length: u16 BE] [pps_data...]
/// ```
fn annex_b_to_avcc(data: &[u8]) -> Result<Vec<u8>> {
    // Parse NAL units by splitting on start codes (00 00 00 01 or 00 00 01)
    let mut nals: Vec<&[u8]> = Vec::new();
    let mut i = 0;

    while i < data.len() {
        // Detect start code
        let sc_len;
        if i + 3 < data.len() && data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 0 && data[i + 3] == 1 {
            sc_len = 4;
        } else if i + 2 < data.len() && data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 1 {
            sc_len = 3;
        } else {
            i += 1;
            continue;
        }

        let nal_start = i + sc_len;
        i = nal_start;

        // Find next start code or end of data
        let mut nal_end = data.len();
        let mut j = nal_start;
        while j < data.len() {
            if j + 3 < data.len() && data[j] == 0 && data[j + 1] == 0 && data[j + 2] == 0 && data[j + 3] == 1 {
                nal_end = j;
                break;
            }
            if j + 2 < data.len() && data[j] == 0 && data[j + 1] == 0 && data[j + 2] == 1 {
                nal_end = j;
                break;
            }
            j += 1;
        }

        // Strip trailing zeros from NAL (emulation prevention artifacts)
        while nal_end > nal_start && data[nal_end - 1] == 0 {
            nal_end -= 1;
        }

        if nal_start < nal_end {
            nals.push(&data[nal_start..nal_end]);
        }
        i = nal_end;
    }

    // Separate SPS (type 7) and PPS (type 8)
    let mut sps_list: Vec<&[u8]> = Vec::new();
    let mut pps_list: Vec<&[u8]> = Vec::new();

    for nal in &nals {
        if nal.is_empty() { continue; }
        let nal_type = nal[0] & 0x1F;
        match nal_type {
            7 => sps_list.push(nal),
            8 => pps_list.push(nal),
            _ => {
                tracing::debug!("annex_b_to_avcc: ignoring NAL type {}", nal_type);
            }
        }
    }

    tracing::info!(
        "annex_b_to_avcc: parsed {} NALs total, {} SPS, {} PPS",
        nals.len(), sps_list.len(), pps_list.len()
    );

    if sps_list.is_empty() {
        return Err(Error::InvalidParameter("No SPS found in Annex B extradata".into()));
    }
    if pps_list.is_empty() {
        return Err(Error::InvalidParameter("No PPS found in Annex B extradata".into()));
    }

    // Build AVCDecoderConfigurationRecord
    let sps = sps_list[0];
    let profile_idc = if sps.len() > 1 { sps[1] } else { 0x4D };
    let profile_compat = if sps.len() > 2 { sps[2] } else { 0x00 };
    let level_idc = if sps.len() > 3 { sps[3] } else { 0x28 };

    let mut avcc = Vec::with_capacity(64);
    avcc.push(1);              // configurationVersion
    avcc.push(profile_idc);    // AVCProfileIndication
    avcc.push(profile_compat); // profile_compatibility
    avcc.push(level_idc);      // AVCLevelIndication
    avcc.push(0xFF);           // lengthSizeMinusOne = 3 (4-byte NAL lengths) | reserved 0xFC

    // SPS entries
    avcc.push(0xE0 | (sps_list.len() as u8 & 0x1F)); // numOfSequenceParameterSets | reserved 0xE0
    for sps in &sps_list {
        let len = sps.len() as u16;
        avcc.push((len >> 8) as u8);
        avcc.push((len & 0xFF) as u8);
        avcc.extend_from_slice(sps);
    }

    // PPS entries
    avcc.push(pps_list.len() as u8); // numOfPictureParameterSets
    for pps in &pps_list {
        let len = pps.len() as u16;
        avcc.push((len >> 8) as u8);
        avcc.push((len & 0xFF) as u8);
        avcc.extend_from_slice(pps);
    }

    tracing::info!(
        "annex_b_to_avcc: {} → {} bytes (profile={}, level={})",
        data.len(), avcc.len(), profile_idc, level_idc
    );

    Ok(avcc)
}

/// Convert H.264 packet data from Annex B format (start code prefixed) to AVCC format
/// (4-byte big-endian length prefixed).
///
/// This is required because the init segment's avcC box declares `lengthSizeMinusOne = 3`
/// (4-byte NAL lengths), so the actual NAL units in mdat must use matching length prefixes
/// instead of start codes.
///
/// If the data doesn't contain Annex B start codes, it's returned as-is (assumed already AVCC).
fn annex_b_to_avcc_packet(data: &[u8]) -> Vec<u8> {
    if data.len() < 4 {
        return data.to_vec();
    }

    // Quick check: if data doesn't start with a start code, assume it's already AVCC
    let starts_with_sc = (data[0] == 0 && data[1] == 0 && data[2] == 0 && data[3] == 1)
        || (data[0] == 0 && data[1] == 0 && data[2] == 1);
    if !starts_with_sc {
        return data.to_vec();
    }

    // Collect NAL unit boundaries: (start, end) pairs
    let mut nals: Vec<(usize, usize)> = Vec::new();
    let mut i = 0;

    while i < data.len() {
        // Detect start code
        let sc_len;
        if i + 3 < data.len()
            && data[i] == 0
            && data[i + 1] == 0
            && data[i + 2] == 0
            && data[i + 3] == 1
        {
            sc_len = 4;
        } else if i + 2 < data.len()
            && data[i] == 0
            && data[i + 1] == 0
            && data[i + 2] == 1
        {
            sc_len = 3;
        } else {
            i += 1;
            continue;
        }

        let nal_start = i + sc_len;

        // Find next start code or end of data
        let mut nal_end = data.len();
        let mut j = nal_start;
        while j + 3 < data.len() {
            if data[j] == 0 && data[j + 1] == 0 {
                if data[j + 2] == 1 || (j + 3 < data.len() && data[j + 2] == 0 && data[j + 3] == 1) {
                    nal_end = j;
                    break;
                }
            }
            j += 1;
        }

        if nal_start < nal_end {
            nals.push((nal_start, nal_end));
        }
        i = nal_end;
    }

    if nals.is_empty() {
        return data.to_vec();
    }

    // Build AVCC output: [4-byte BE length][NAL data] for each NAL unit
    let mut out = Vec::with_capacity(data.len());
    for (start, end) in &nals {
        let nal_len = (end - start) as u32;
        out.extend_from_slice(&nal_len.to_be_bytes());
        out.extend_from_slice(&data[*start..*end]);
    }

    out
}

/// Build an OpusHead structure for Opus in MP4/fMP4.
///
/// OpusHead format (19 bytes for mono/stereo):
/// ```text
/// [magic: "OpusHead" (8 bytes)]
/// [version: u8 = 1]
/// [channels: u8]
/// [pre_skip: u16 LE = 312 (6.5ms at 48kHz)]
/// [sample_rate: u32 LE]
/// [output_gain: i16 LE = 0]
/// [channel_mapping_family: u8 = 0 (mono/stereo)]
/// ```
fn build_opus_head(channels: u8, sample_rate: u32) -> Vec<u8> {
    let mut head = Vec::with_capacity(19);
    head.extend_from_slice(b"OpusHead");       // magic
    head.push(1);                               // version
    head.push(channels);                        // channel count
    head.extend_from_slice(&312u16.to_le_bytes()); // pre-skip (6.5ms)
    head.extend_from_slice(&sample_rate.to_le_bytes()); // input sample rate
    head.extend_from_slice(&0i16.to_le_bytes()); // output gain
    head.push(0);                               // channel mapping family (0 = mono/stereo)
    head
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fmp4_muxer_creation() {
        let muxer = Fmp4Muxer::new();
        assert!(!muxer.is_ready());
        assert_eq!(muxer.segment_sequence(), 0);
    }
}
