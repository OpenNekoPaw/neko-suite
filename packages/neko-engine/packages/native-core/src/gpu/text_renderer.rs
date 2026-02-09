//! Text Renderer - CPU-side text rasterization to RGBA buffer
//!
//! Uses `cosmic-text` for font shaping, layout, and rasterization.
//! The output RGBA buffer is uploaded to a wgpu texture for GPU compositing.
//!
//! Pipeline:
//! ```text
//! TextElementData → [cosmic-text layout + rasterize] → RGBA Vec<u8>
//!   → [queue.write_texture] → wgpu::Texture → GpuLayer
//! ```

use std::sync::Arc;

use cosmic_text::{
    Attrs, Buffer as CosmicBuffer, Color as CosmicColor, Family, FontSystem, Metrics,
    Shaping, SwashCache, Weight, Style,
};

use crate::gpu::GpuContext;

/// Result of text rasterization
pub struct RasterizedText {
    /// RGBA pixel data (premultiplied alpha)
    pub data: Vec<u8>,
    /// Texture width in pixels
    pub width: u32,
    /// Texture height in pixels
    pub height: u32,
}

/// GPU text renderer
///
/// Rasterizes text to RGBA buffers using cosmic-text, then uploads
/// to wgpu textures for compositing in the export pipeline.
pub struct TextRenderer {
    /// Font system (manages font database and shaping)
    font_system: FontSystem,
    /// Glyph cache for rasterization
    swash_cache: SwashCache,
    /// GPU context for texture creation
    gpu_ctx: Arc<GpuContext>,
}

impl TextRenderer {
    /// Create a new TextRenderer
    ///
    /// Initializes the font system with system fonts.
    pub fn new(gpu_ctx: Arc<GpuContext>) -> Self {
        let font_system = FontSystem::new();
        let swash_cache = SwashCache::new();

        Self {
            font_system,
            swash_cache,
            gpu_ctx,
        }
    }

    /// Rasterize text to an RGBA buffer
    ///
    /// Returns the pixel data and dimensions, or None if the text is empty.
    pub fn rasterize(
        &mut self,
        text: &str,
        font_family: &str,
        font_size: f32,
        color_hex: &str,
        font_weight: &str,
        font_style: &str,
        max_width: Option<f32>,
    ) -> Option<RasterizedText> {
        if text.is_empty() {
            return None;
        }

        // Parse color
        let (r, g, b, a) = parse_hex_color(color_hex);
        let text_color = CosmicColor::rgba(r, g, b, a);

        // Build font attributes
        let weight = match font_weight {
            "bold" | "700" => Weight::BOLD,
            "semibold" | "600" => Weight::SEMIBOLD,
            "medium" | "500" => Weight::MEDIUM,
            "light" | "300" => Weight::LIGHT,
            "thin" | "100" => Weight::THIN,
            _ => Weight::NORMAL,
        };

        let style = match font_style {
            "italic" => Style::Italic,
            "oblique" => Style::Oblique,
            _ => Style::Normal,
        };

        let family = match font_family {
            "serif" => Family::Serif,
            "monospace" | "mono" => Family::Monospace,
            "cursive" => Family::Cursive,
            "fantasy" => Family::Fantasy,
            name if name.is_empty() => Family::SansSerif,
            name => Family::Name(name),
        };

        let attrs = Attrs::new()
            .family(family)
            .weight(weight)
            .style(style);

        // Create text buffer with metrics
        // Line height = 1.2x font size (standard)
        let metrics = Metrics::new(font_size, font_size * 1.2);
        let mut buffer = CosmicBuffer::new(&mut self.font_system, metrics);

        // Set text content
        let width_limit = max_width.unwrap_or(f32::MAX);
        buffer.set_size(&mut self.font_system, Some(width_limit), None);
        buffer.set_text(&mut self.font_system, text, attrs, Shaping::Advanced);

        // Shape and layout
        buffer.shape_until_scroll(&mut self.font_system, false);

        // Calculate bounding box
        let (buf_width, buf_height) = self.measure_buffer(&buffer);
        if buf_width == 0 || buf_height == 0 {
            return None;
        }

        // Rasterize to RGBA buffer
        let mut pixels = vec![0u8; (buf_width * buf_height * 4) as usize];

        buffer.draw(
            &mut self.font_system,
            &mut self.swash_cache,
            text_color,
            |x, y, w, h, color| {
                // Draw callback: fill rectangle at (x, y) with size (w, h)
                let cr = color.r();
                let cg = color.g();
                let cb = color.b();
                let ca = color.a();

                if ca == 0 {
                    return;
                }

                for dy in 0..h as i32 {
                    for dx in 0..w as i32 {
                        let px = x + dx;
                        let py = y + dy;

                        if px < 0 || py < 0 || px >= buf_width as i32 || py >= buf_height as i32 {
                            continue;
                        }

                        let idx = ((py as u32 * buf_width + px as u32) * 4) as usize;
                        if idx + 3 >= pixels.len() {
                            continue;
                        }

                        // Alpha compositing (premultiplied)
                        let src_a = ca as f32 / 255.0;
                        let dst_a = pixels[idx + 3] as f32 / 255.0;
                        let out_a = src_a + dst_a * (1.0 - src_a);

                        if out_a > 0.0 {
                            pixels[idx] = ((cr as f32 * src_a + pixels[idx] as f32 * dst_a * (1.0 - src_a)) / out_a) as u8;
                            pixels[idx + 1] = ((cg as f32 * src_a + pixels[idx + 1] as f32 * dst_a * (1.0 - src_a)) / out_a) as u8;
                            pixels[idx + 2] = ((cb as f32 * src_a + pixels[idx + 2] as f32 * dst_a * (1.0 - src_a)) / out_a) as u8;
                            pixels[idx + 3] = (out_a * 255.0) as u8;
                        }
                    }
                }
            },
        );

        Some(RasterizedText {
            data: pixels,
            width: buf_width,
            height: buf_height,
        })
    }

    /// Upload rasterized text to a wgpu texture
    ///
    /// Creates an Rgba8Unorm texture and writes the pixel data.
    pub fn upload_to_texture(&self, rasterized: &RasterizedText) -> wgpu::Texture {
        let texture = self.gpu_ctx.device().create_texture(&wgpu::TextureDescriptor {
            label: Some("Text Texture"),
            size: wgpu::Extent3d {
                width: rasterized.width,
                height: rasterized.height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_DST
                | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });

        self.gpu_ctx.queue().write_texture(
            wgpu::ImageCopyTexture {
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &rasterized.data,
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(rasterized.width * 4),
                rows_per_image: Some(rasterized.height),
            },
            wgpu::Extent3d {
                width: rasterized.width,
                height: rasterized.height,
                depth_or_array_layers: 1,
            },
        );

        texture
    }

    /// Measure the bounding box of a laid-out text buffer
    fn measure_buffer(&self, buffer: &CosmicBuffer) -> (u32, u32) {
        let mut max_x: f32 = 0.0;
        let mut max_y: f32 = 0.0;

        for run in buffer.layout_runs() {
            // Track maximum x extent
            for glyph in run.glyphs.iter() {
                let glyph_right = glyph.x + glyph.w;
                if glyph_right > max_x {
                    max_x = glyph_right;
                }
            }
            // Track maximum y extent (line_y is baseline, add line_height)
            let line_bottom = run.line_y + run.line_height;
            if line_bottom > max_y {
                max_y = line_bottom;
            }
        }

        // Add small padding to avoid clipping
        let width = (max_x.ceil() as u32 + 2).max(1);
        let height = (max_y.ceil() as u32 + 2).max(1);

        (width, height)
    }
}

/// Parse a hex color string to (r, g, b, a)
///
/// Supports: `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`, and without `#` prefix.
fn parse_hex_color(hex: &str) -> (u8, u8, u8, u8) {
    let hex = hex.trim_start_matches('#');

    match hex.len() {
        // #RGB
        3 => {
            let r = u8::from_str_radix(&hex[0..1], 16).unwrap_or(255);
            let g = u8::from_str_radix(&hex[1..2], 16).unwrap_or(255);
            let b = u8::from_str_radix(&hex[2..3], 16).unwrap_or(255);
            (r * 17, g * 17, b * 17, 255)
        }
        // #RGBA
        4 => {
            let r = u8::from_str_radix(&hex[0..1], 16).unwrap_or(255);
            let g = u8::from_str_radix(&hex[1..2], 16).unwrap_or(255);
            let b = u8::from_str_radix(&hex[2..3], 16).unwrap_or(255);
            let a = u8::from_str_radix(&hex[3..4], 16).unwrap_or(255);
            (r * 17, g * 17, b * 17, a * 17)
        }
        // #RRGGBB
        6 => {
            let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(255);
            let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(255);
            let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(255);
            (r, g, b, 255)
        }
        // #RRGGBBAA
        8 => {
            let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(255);
            let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(255);
            let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(255);
            let a = u8::from_str_radix(&hex[6..8], 16).unwrap_or(255);
            (r, g, b, a)
        }
        // Default: white
        _ => {
            tracing::warn!("Invalid hex color '{}', defaulting to white", hex);
            (255, 255, 255, 255)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_hex_color_6digit() {
        assert_eq!(parse_hex_color("#FF0000"), (255, 0, 0, 255));
        assert_eq!(parse_hex_color("#00FF00"), (0, 255, 0, 255));
        assert_eq!(parse_hex_color("#0000FF"), (0, 0, 255, 255));
        assert_eq!(parse_hex_color("FFFFFF"), (255, 255, 255, 255));
    }

    #[test]
    fn test_parse_hex_color_8digit() {
        assert_eq!(parse_hex_color("#FF000080"), (255, 0, 0, 128));
        assert_eq!(parse_hex_color("#00FF00FF"), (0, 255, 0, 255));
    }

    #[test]
    fn test_parse_hex_color_3digit() {
        assert_eq!(parse_hex_color("#F00"), (255, 0, 0, 255));
        assert_eq!(parse_hex_color("#FFF"), (255, 255, 255, 255));
    }

    #[test]
    fn test_parse_hex_color_invalid() {
        assert_eq!(parse_hex_color("invalid"), (255, 255, 255, 255));
        assert_eq!(parse_hex_color(""), (255, 255, 255, 255));
    }
}
