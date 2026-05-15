//! Kernel-owned terminal GPU readback target.

use std::fmt;
use std::sync::Arc;

use neko_engine_types::{GpuFrameReadback, PipelineContractError};

use super::GpuContext;

/// Terminal GPU readback target for snapshot-style consumers.
pub struct GpuReadbackTarget {
    ctx: Arc<GpuContext>,
    texture: wgpu::Texture,
    width: u32,
    height: u32,
}

impl fmt::Debug for GpuReadbackTarget {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("GpuReadbackTarget")
            .field("width", &self.width)
            .field("height", &self.height)
            .field("format", &self.texture.format())
            .finish()
    }
}

impl GpuReadbackTarget {
    /// Create a terminal readback target.
    pub fn new(ctx: Arc<GpuContext>, texture: wgpu::Texture, width: u32, height: u32) -> Self {
        Self {
            ctx,
            texture,
            width,
            height,
        }
    }
}

impl GpuFrameReadback for GpuReadbackTarget {
    fn read_rgba8(&self) -> std::result::Result<Vec<u8>, PipelineContractError> {
        let raw = self
            .ctx
            .read_texture_sync(&self.texture, self.width, self.height)
            .map_err(|err| PipelineContractError::ReadbackFailed(err.to_string()))?;

        if self.texture.format() == wgpu::TextureFormat::Rgba16Float {
            Ok(rgba16float_to_rgba8(&raw))
        } else {
            Ok(raw)
        }
    }

    fn width(&self) -> u32 {
        self.width
    }

    fn height(&self) -> u32 {
        self.height
    }
}

fn rgba16float_to_rgba8(data: &[u8]) -> Vec<u8> {
    let pixel_count = data.len() / 8;
    let mut output = Vec::with_capacity(pixel_count * 4);
    for chunk in data.chunks_exact(8) {
        let r = half_to_f32(u16::from_le_bytes([chunk[0], chunk[1]]));
        let g = half_to_f32(u16::from_le_bytes([chunk[2], chunk[3]]));
        let b = half_to_f32(u16::from_le_bytes([chunk[4], chunk[5]]));
        let a = half_to_f32(u16::from_le_bytes([chunk[6], chunk[7]]));
        output.push((r.clamp(0.0, 1.0) * 255.0) as u8);
        output.push((g.clamp(0.0, 1.0) * 255.0) as u8);
        output.push((b.clamp(0.0, 1.0) * 255.0) as u8);
        output.push((a.clamp(0.0, 1.0) * 255.0) as u8);
    }
    output
}

fn half_to_f32(bits: u16) -> f32 {
    let sign = ((bits >> 15) & 1) as u32;
    let exponent = ((bits >> 10) & 0x1f) as u32;
    let mantissa = (bits & 0x03ff) as u32;

    if exponent == 0 {
        if mantissa == 0 {
            f32::from_bits(sign << 31)
        } else {
            let mut m = mantissa;
            let mut e = 0i32;
            while (m & 0x0400) == 0 {
                m <<= 1;
                e += 1;
            }
            let f32_exp = (127 - 15 - e) as u32;
            let f32_mantissa = (m & 0x03ff) << 13;
            f32::from_bits((sign << 31) | (f32_exp << 23) | f32_mantissa)
        }
    } else if exponent == 31 {
        let f32_mantissa = mantissa << 13;
        f32::from_bits((sign << 31) | (0xff << 23) | f32_mantissa)
    } else {
        let f32_exp = exponent + 127 - 15;
        let f32_mantissa = mantissa << 13;
        f32::from_bits((sign << 31) | (f32_exp << 23) | f32_mantissa)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rgba16float_conversion_handles_white_pixel() {
        let one = 0x3c00u16.to_le_bytes();
        let data = [
            one[0], one[1], one[0], one[1], one[0], one[1], one[0], one[1],
        ];
        assert_eq!(rgba16float_to_rgba8(&data), vec![255, 255, 255, 255]);
    }
}
