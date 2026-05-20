//! MOC3 binary format parser
//!
//! Based on OpenL2D MOC3 Spec v1.0, not derived from Cubism SDK.
//! Parses the .moc3 binary format into intermediate data structures
//! that the loader converts into ECS components.

use crate::loader::LoadError;
use glam::Vec2;

// ─── Magic bytes and header offsets ──────────────────────────────────────────

const MOC3_MAGIC: &[u8; 4] = b"MOC3";

/// Offset table pointer addresses (fixed positions in the MOC3 header)
#[allow(dead_code)]
mod offsets {
    // Element count table pointer at 0x40
    pub const ELEMENT_COUNT_TABLE_PTR: usize = 0x40;

    // Part offsets (pointer addresses in header)
    pub const PART_IDS: usize = 0x4C;
    pub const PART_KEYFORM_BINDING_SOURCES_INDICES: usize = 0x50;
    pub const PART_KEYFORM_SOURCES_BEGIN: usize = 0x54;
    pub const PART_KEYFORM_SOURCES_COUNT: usize = 0x58;
    pub const PART_IS_VISIBLE: usize = 0x5C;
    pub const PART_IS_ENABLED: usize = 0x60;
    pub const PART_PARENT_INDICES: usize = 0x64;

    // Deformer offsets
    pub const DEFORMER_IDS: usize = 0x68;
    pub const DEFORMER_KEYFORM_BINDING_SOURCES_INDICES: usize = 0x70;
    pub const DEFORMER_IS_VISIBLE: usize = 0x74;
    pub const DEFORMER_IS_ENABLED: usize = 0x78;
    pub const DEFORMER_PARENT_PART_INDICES: usize = 0x7C;
    pub const DEFORMER_PARENT_DEFORMER_INDICES: usize = 0x80;
    pub const DEFORMER_TYPES: usize = 0x84;
    pub const DEFORMER_SPECIFIC_SOURCES_INDICES: usize = 0x88;

    // Warp deformer offsets
    pub const WARP_DEFORMER_KEYFORM_BINDING_SOURCES_INDICES: usize = 0x8C;
    pub const WARP_DEFORMER_KEYFORM_SOURCES_BEGIN: usize = 0x90;
    pub const WARP_DEFORMER_KEYFORM_SOURCES_COUNT: usize = 0x94;
    pub const WARP_DEFORMER_VERTEX_COUNTS: usize = 0x98;
    pub const WARP_DEFORMER_ROWS: usize = 0x9C;
    pub const WARP_DEFORMER_COLUMNS: usize = 0xA0;

    // Rotation deformer offsets
    pub const ROTATION_DEFORMER_KEYFORM_BINDING_SOURCES_INDICES: usize = 0xA4;
    pub const ROTATION_DEFORMER_KEYFORM_SOURCES_BEGIN: usize = 0xA8;
    pub const ROTATION_DEFORMER_KEYFORM_SOURCES_COUNT: usize = 0xAC;
    pub const ROTATION_DEFORMER_BASE_ANGLES: usize = 0xB0;

    // ArtMesh offsets
    pub const ART_MESH_IDS: usize = 0xC4;
    pub const ART_MESH_KEYFORM_BINDING_SOURCES_INDICES: usize = 0xC8;
    pub const ART_MESH_KEYFORM_SOURCES_BEGIN: usize = 0xCC;
    pub const ART_MESH_KEYFORM_SOURCES_COUNT: usize = 0xD0;
    pub const ART_MESH_IS_VISIBLE: usize = 0xD4;
    pub const ART_MESH_IS_ENABLED: usize = 0xD8;
    pub const ART_MESH_PARENT_PART_INDICES: usize = 0xDC;
    pub const ART_MESH_PARENT_DEFORMER_INDICES: usize = 0xE0;
    pub const ART_MESH_TEXTURE_INDICES: usize = 0xE4;
    pub const ART_MESH_DRAWABLE_FLAGS: usize = 0xE8;
    pub const ART_MESH_POSITION_INDEX_SOURCES_COUNT: usize = 0xEC;
    pub const ART_MESH_UV_SOURCES_BEGIN: usize = 0xF0;
    pub const ART_MESH_POSITION_INDEX_SOURCES_BEGIN: usize = 0xF4;
    pub const ART_MESH_VERTEX_COUNTS: usize = 0xF8;

    // Parameter offsets
    pub const PARAMETER_IDS: usize = 0x108;
    pub const PARAMETER_MAX_VALUES: usize = 0x10C;
    pub const PARAMETER_MIN_VALUES: usize = 0x110;
    pub const PARAMETER_DEFAULT_VALUES: usize = 0x114;
    pub const PARAMETER_IS_REPEAT: usize = 0x118;
    pub const PARAMETER_BINDING_SOURCES_BEGIN: usize = 0x120;
    pub const PARAMETER_BINDING_SOURCES_COUNT: usize = 0x124;

    // Parameter binding offsets
    pub const KEYFORM_BINDING_INDICES: usize = 0x160;
    pub const KEYFORM_BINDING_BAND_SOURCES_BEGIN: usize = 0x164;
    pub const KEYFORM_BINDING_BAND_SOURCES_COUNT: usize = 0x168;
    pub const PARAMETER_BINDING_KEYS_SOURCES_BEGIN: usize = 0x16C;
    pub const PARAMETER_BINDING_KEYS_SOURCES_COUNT: usize = 0x170;

    // Keyform position / UV data
    pub const WARP_DEFORMER_KEYFORM_POSITION_SOURCES_BEGIN: usize = 0x130;
    pub const ROTATION_DEFORMER_KEYFORM_ANGLES: usize = 0x138;
    pub const ART_MESH_KEYFORM_POSITION_SOURCES_BEGIN: usize = 0x158;
    pub const KEYFORM_POSITION_SOURCES_XYS: usize = 0x15C;
    pub const KEY_VALUES: usize = 0x174;
    pub const UV_SOURCES_BEGIN: usize = 0x178;
    pub const POSITION_INDEX_SOURCES_BEGIN: usize = 0x17C;

    // Draw order
    pub const DRAW_ORDER_GROUP_OBJECT_INDICES: usize = 0x158;
    pub const DRAW_ORDER_GROUP_OBJECT_TYPES: usize = 0x15C;
    pub const DRAW_ORDER_GROUP_OBJECT_ORDERS: usize = 0x160;
}

// ─── Parsed data structures ──────────────────────────────────────────────────

/// Element counts parsed from the header
#[derive(Debug, Clone, Copy)]
pub struct ElementCounts {
    pub parts: u32,
    pub deformers: u32,
    pub warp_deformers: u32,
    pub rotation_deformers: u32,
    pub art_meshes: u32,
    pub parameters: u32,
    pub part_keyforms: u32,
    pub warp_deformer_keyforms: u32,
    pub rotation_deformer_keyforms: u32,
    pub art_mesh_keyforms: u32,
    pub keyform_positions: u32,
    pub parameter_binding_indices: u32,
    pub keyform_bindings: u32,
    pub parameter_bindings: u32,
    pub keys: u32,
    pub uvs: u32,
    pub position_indices: u32,
    pub drawable_masks: u32,
    pub draw_order_groups: u32,
    pub draw_order_group_objects: u32,
}

/// Parsed MOC3 parameter
#[derive(Debug, Clone)]
pub struct Moc3Parameter {
    pub id: String,
    pub min_value: f32,
    pub max_value: f32,
    pub default_value: f32,
    pub is_repeat: bool,
    pub binding_sources_begin: i32,
    pub binding_sources_count: i32,
}

/// Parsed MOC3 part (visibility group)
#[derive(Debug, Clone)]
pub struct Moc3Part {
    pub id: String,
    pub is_visible: bool,
    pub is_enabled: bool,
    pub parent_part_index: i32,
}

/// Deformer type
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum DeformerType {
    Warp,
    Rotation,
}

/// Parsed MOC3 deformer
#[derive(Debug, Clone)]
pub struct Moc3Deformer {
    pub id: String,
    pub deformer_type: DeformerType,
    pub is_visible: bool,
    pub is_enabled: bool,
    pub parent_part_index: i32,
    pub parent_deformer_index: i32,
    pub specific_index: i32,
}

/// Parsed warp deformer specific data
#[derive(Debug, Clone)]
pub struct Moc3WarpDeformer {
    pub vertex_count: u32,
    pub rows: u32,
    pub columns: u32,
    pub keyform_sources_begin: i32,
    pub keyform_sources_count: i32,
    pub keyform_position_sources_begin: i32,
    pub keyform_binding_sources_index: i32,
}

/// Parsed rotation deformer specific data
#[derive(Debug, Clone)]
pub struct Moc3RotationDeformer {
    pub base_angle: f32,
    pub keyform_sources_begin: i32,
    pub keyform_sources_count: i32,
    pub keyform_angles_begin: i32,
    pub keyform_binding_sources_index: i32,
}

/// Parsed MOC3 art mesh (drawable)
#[derive(Debug, Clone)]
pub struct Moc3ArtMesh {
    pub id: String,
    pub texture_index: u32,
    pub drawable_flags: u32,
    pub vertex_count: u32,
    pub is_visible: bool,
    pub is_enabled: bool,
    pub parent_deformer_index: i32,
    pub parent_part_index: i32,
    pub uv_sources_begin: i32,
    pub position_index_sources_begin: i32,
    pub position_index_sources_count: i32,
    pub keyform_position_sources_begin: i32,
    pub keyform_sources_begin: i32,
    pub keyform_sources_count: i32,
    pub keyform_binding_sources_index: i32,
}

/// Parsed parameter binding
#[derive(Debug, Clone)]
pub struct Moc3ParameterBinding {
    pub keyform_binding_index: i32,
    pub keys_sources_begin: i32,
    pub keys_sources_count: i32,
}

/// Parsed key form binding.
///
/// Parameters/deformers/art meshes point into this table first. It then points
/// into a binding band row, which contains key value ranges for interpolation.
#[derive(Debug, Clone)]
pub struct Moc3KeyformBinding {
    pub band_sources_begin: i32,
    pub band_sources_count: i32,
}

/// Parsed key form position source.
///
/// MOC3 key form position begin fields point into this table first. Each row
/// then points into the flat XY float array where coordinates live.
#[derive(Debug, Clone)]
pub struct Moc3KeyformPositionSource {
    pub xys_begin: i32,
    pub xys_count: i32,
}

/// Complete parsed MOC3 data
#[derive(Debug)]
pub struct Moc3Data {
    pub version: u8,
    pub counts: ElementCounts,
    pub parameters: Vec<Moc3Parameter>,
    pub parts: Vec<Moc3Part>,
    pub deformers: Vec<Moc3Deformer>,
    pub warp_deformers: Vec<Moc3WarpDeformer>,
    pub rotation_deformers: Vec<Moc3RotationDeformer>,
    pub art_meshes: Vec<Moc3ArtMesh>,
    pub parameter_bindings: Vec<Moc3ParameterBinding>,
    pub keyform_bindings: Vec<Moc3KeyformBinding>,
    pub warp_deformer_keyform_position_sources: Vec<Moc3KeyformPositionSource>,
    pub rotation_deformer_keyform_angles: Vec<f32>,
    pub art_mesh_keyform_position_sources: Vec<Moc3KeyformPositionSource>,
    /// Flat array of key values (shared across all bindings)
    pub key_values: Vec<f32>,
    /// Flat array of UV coordinates (x, y pairs)
    pub uvs: Vec<Vec2>,
    /// Flat array of position indices (triangle indices)
    pub position_indices: Vec<u16>,
    /// Flat array of keyform XY values.
    pub keyform_position_xys: Vec<f32>,
}

// ─── Safe binary reader ──────────────────────────────────────────────────────

struct SafeReader<'a> {
    data: &'a [u8],
}

impl<'a> SafeReader<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { data }
    }

    fn len(&self) -> usize {
        self.data.len()
    }

    fn read_u8(&self, offset: usize) -> Result<u8, LoadError> {
        self.data
            .get(offset)
            .copied()
            .ok_or_else(|| LoadError::Moc3Error(format!("Read u8 out of bounds at 0x{:X}", offset)))
    }

    fn read_u16_le(&self, offset: usize) -> Result<u16, LoadError> {
        if offset + 2 > self.data.len() {
            return Err(LoadError::Moc3Error(format!(
                "Read u16 out of bounds at 0x{:X}",
                offset
            )));
        }
        Ok(u16::from_le_bytes([
            self.data[offset],
            self.data[offset + 1],
        ]))
    }

    fn read_u32_le(&self, offset: usize) -> Result<u32, LoadError> {
        if offset + 4 > self.data.len() {
            return Err(LoadError::Moc3Error(format!(
                "Read u32 out of bounds at 0x{:X}",
                offset
            )));
        }
        Ok(u32::from_le_bytes([
            self.data[offset],
            self.data[offset + 1],
            self.data[offset + 2],
            self.data[offset + 3],
        ]))
    }

    fn read_i32_le(&self, offset: usize) -> Result<i32, LoadError> {
        Ok(self.read_u32_le(offset)? as i32)
    }

    fn read_f32_le(&self, offset: usize) -> Result<f32, LoadError> {
        if offset + 4 > self.data.len() {
            return Err(LoadError::Moc3Error(format!(
                "Read f32 out of bounds at 0x{:X}",
                offset
            )));
        }
        Ok(f32::from_le_bytes([
            self.data[offset],
            self.data[offset + 1],
            self.data[offset + 2],
            self.data[offset + 3],
        ]))
    }

    /// Read a NUL-terminated string of up to `max_len` bytes
    fn read_cstr(&self, offset: usize, max_len: usize) -> Result<String, LoadError> {
        if offset + max_len > self.data.len() {
            return Err(LoadError::Moc3Error(format!(
                "Read cstr out of bounds at 0x{:X}",
                offset
            )));
        }
        let slice = &self.data[offset..offset + max_len];
        let end = slice.iter().position(|&b| b == 0).unwrap_or(max_len);
        String::from_utf8(slice[..end].to_vec())
            .map_err(|e| LoadError::Moc3Error(format!("Invalid UTF-8 at 0x{:X}: {}", offset, e)))
    }

    /// Read a u32 value that is itself a pointer (address) stored at `ptr_offset`
    fn read_ptr(&self, ptr_offset: usize) -> Result<u32, LoadError> {
        self.read_u32_le(ptr_offset)
    }
}

// ─── Parser ──────────────────────────────────────────────────────────────────

/// Parse a MOC3 binary blob into intermediate data structures.
pub fn parse_moc3(data: &[u8]) -> Result<Moc3Data, LoadError> {
    let r = SafeReader::new(data);

    // Validate magic bytes
    if r.len() < 64 {
        return Err(LoadError::Moc3Error("File too short".to_string()));
    }
    if &data[0..4] != MOC3_MAGIC {
        return Err(LoadError::Moc3Error("Invalid magic bytes".to_string()));
    }

    let version = r.read_u8(4)?;

    // Read element count table
    let counts_addr = r.read_ptr(offsets::ELEMENT_COUNT_TABLE_PTR)? as usize;
    let counts = read_element_counts(&r, counts_addr)?;

    // Read parameters
    let parameters = read_parameters(&r, &counts)?;

    // Read parts
    let parts = read_parts(&r, &counts)?;

    // Read deformers
    let deformers = read_deformers(&r, &counts)?;

    // Read warp deformer specifics
    let warp_deformers = read_warp_deformers(&r, &counts)?;

    // Read rotation deformer specifics
    let rotation_deformers = read_rotation_deformers(&r, &counts)?;

    // Read art meshes
    let art_meshes = read_art_meshes(&r, &counts)?;

    // Read parameter bindings
    let parameter_bindings = read_parameter_bindings(&r, &counts)?;

    // Read keyform binding and position source indirection tables
    let keyform_bindings = read_keyform_bindings(&r, &counts)?;
    let warp_deformer_keyform_position_sources =
        read_warp_deformer_keyform_position_sources(&r, &counts)?;
    let rotation_deformer_keyform_angles = read_rotation_deformer_keyform_angles(&r, &counts)?;
    let art_mesh_keyform_position_sources = read_art_mesh_keyform_position_sources(&r, &counts)?;
    let keyform_position_xys = read_keyform_position_xys(&r, &counts)?;

    // Read key values
    let key_values = read_key_values(&r, &counts)?;

    // Read UVs
    let uvs = read_uvs(&r, &counts)?;

    // Read position indices
    let position_indices = read_position_indices(&r, &counts)?;

    Ok(Moc3Data {
        version,
        counts,
        parameters,
        parts,
        deformers,
        warp_deformers,
        rotation_deformers,
        art_meshes,
        parameter_bindings,
        keyform_bindings,
        warp_deformer_keyform_position_sources,
        rotation_deformer_keyform_angles,
        art_mesh_keyform_position_sources,
        key_values,
        uvs,
        position_indices,
        keyform_position_xys,
    })
}

fn read_element_counts(r: &SafeReader, addr: usize) -> Result<ElementCounts, LoadError> {
    Ok(ElementCounts {
        parts: r.read_u32_le(addr)?,
        deformers: r.read_u32_le(addr + 4)?,
        warp_deformers: r.read_u32_le(addr + 8)?,
        rotation_deformers: r.read_u32_le(addr + 12)?,
        art_meshes: r.read_u32_le(addr + 16)?,
        parameters: r.read_u32_le(addr + 20)?,
        part_keyforms: r.read_u32_le(addr + 24)?,
        warp_deformer_keyforms: r.read_u32_le(addr + 28)?,
        rotation_deformer_keyforms: r.read_u32_le(addr + 32)?,
        art_mesh_keyforms: r.read_u32_le(addr + 36)?,
        keyform_positions: r.read_u32_le(addr + 40)?,
        parameter_binding_indices: r.read_u32_le(addr + 44)?,
        keyform_bindings: r.read_u32_le(addr + 48)?,
        parameter_bindings: r.read_u32_le(addr + 52)?,
        keys: r.read_u32_le(addr + 56)?,
        uvs: r.read_u32_le(addr + 60)?,
        position_indices: r.read_u32_le(addr + 64)?,
        drawable_masks: r.read_u32_le(addr + 68)?,
        draw_order_groups: r.read_u32_le(addr + 72)?,
        draw_order_group_objects: r.read_u32_le(addr + 76)?,
    })
}

fn read_parameters(
    r: &SafeReader,
    counts: &ElementCounts,
) -> Result<Vec<Moc3Parameter>, LoadError> {
    let n = counts.parameters as usize;
    let ids_addr = r.read_ptr(offsets::PARAMETER_IDS)? as usize;
    let max_addr = r.read_ptr(offsets::PARAMETER_MAX_VALUES)? as usize;
    let min_addr = r.read_ptr(offsets::PARAMETER_MIN_VALUES)? as usize;
    let default_addr = r.read_ptr(offsets::PARAMETER_DEFAULT_VALUES)? as usize;
    let repeat_addr = r.read_ptr(offsets::PARAMETER_IS_REPEAT)? as usize;
    let bind_begin_addr = r.read_ptr(offsets::PARAMETER_BINDING_SOURCES_BEGIN)? as usize;
    let bind_count_addr = r.read_ptr(offsets::PARAMETER_BINDING_SOURCES_COUNT)? as usize;

    let mut params = Vec::with_capacity(n);
    for i in 0..n {
        params.push(Moc3Parameter {
            id: r.read_cstr(ids_addr + i * 64, 64)?,
            max_value: r.read_f32_le(max_addr + i * 4)?,
            min_value: r.read_f32_le(min_addr + i * 4)?,
            default_value: r.read_f32_le(default_addr + i * 4)?,
            is_repeat: r.read_u32_le(repeat_addr + i * 4)? != 0,
            binding_sources_begin: r.read_i32_le(bind_begin_addr + i * 4)?,
            binding_sources_count: r.read_i32_le(bind_count_addr + i * 4)?,
        });
    }
    Ok(params)
}

fn read_parts(r: &SafeReader, counts: &ElementCounts) -> Result<Vec<Moc3Part>, LoadError> {
    let n = counts.parts as usize;
    let ids_addr = r.read_ptr(offsets::PART_IDS)? as usize;
    let visible_addr = r.read_ptr(offsets::PART_IS_VISIBLE)? as usize;
    let enabled_addr = r.read_ptr(offsets::PART_IS_ENABLED)? as usize;
    let parent_addr = r.read_ptr(offsets::PART_PARENT_INDICES)? as usize;

    let mut parts = Vec::with_capacity(n);
    for i in 0..n {
        parts.push(Moc3Part {
            id: r.read_cstr(ids_addr + i * 64, 64)?,
            is_visible: r.read_u32_le(visible_addr + i * 4)? != 0,
            is_enabled: r.read_u32_le(enabled_addr + i * 4)? != 0,
            parent_part_index: r.read_i32_le(parent_addr + i * 4)?,
        });
    }
    Ok(parts)
}

fn read_deformers(r: &SafeReader, counts: &ElementCounts) -> Result<Vec<Moc3Deformer>, LoadError> {
    let n = counts.deformers as usize;
    let ids_addr = r.read_ptr(offsets::DEFORMER_IDS)? as usize;
    let visible_addr = r.read_ptr(offsets::DEFORMER_IS_VISIBLE)? as usize;
    let enabled_addr = r.read_ptr(offsets::DEFORMER_IS_ENABLED)? as usize;
    let parent_part_addr = r.read_ptr(offsets::DEFORMER_PARENT_PART_INDICES)? as usize;
    let parent_deformer_addr = r.read_ptr(offsets::DEFORMER_PARENT_DEFORMER_INDICES)? as usize;
    let types_addr = r.read_ptr(offsets::DEFORMER_TYPES)? as usize;
    let specific_addr = r.read_ptr(offsets::DEFORMER_SPECIFIC_SOURCES_INDICES)? as usize;

    let mut deformers = Vec::with_capacity(n);
    for i in 0..n {
        let dtype = r.read_u32_le(types_addr + i * 4)?;
        deformers.push(Moc3Deformer {
            id: r.read_cstr(ids_addr + i * 64, 64)?,
            deformer_type: if dtype == 0 {
                DeformerType::Warp
            } else {
                DeformerType::Rotation
            },
            is_visible: r.read_u32_le(visible_addr + i * 4)? != 0,
            is_enabled: r.read_u32_le(enabled_addr + i * 4)? != 0,
            parent_part_index: r.read_i32_le(parent_part_addr + i * 4)?,
            parent_deformer_index: r.read_i32_le(parent_deformer_addr + i * 4)?,
            specific_index: r.read_i32_le(specific_addr + i * 4)?,
        });
    }
    Ok(deformers)
}

fn read_warp_deformers(
    r: &SafeReader,
    counts: &ElementCounts,
) -> Result<Vec<Moc3WarpDeformer>, LoadError> {
    let n = counts.warp_deformers as usize;
    let vertex_counts_addr = r.read_ptr(offsets::WARP_DEFORMER_VERTEX_COUNTS)? as usize;
    let rows_addr = r.read_ptr(offsets::WARP_DEFORMER_ROWS)? as usize;
    let cols_addr = r.read_ptr(offsets::WARP_DEFORMER_COLUMNS)? as usize;
    let begin_addr = r.read_ptr(offsets::WARP_DEFORMER_KEYFORM_SOURCES_BEGIN)? as usize;
    let count_addr = r.read_ptr(offsets::WARP_DEFORMER_KEYFORM_SOURCES_COUNT)? as usize;
    let position_begin_addr =
        r.read_ptr(offsets::WARP_DEFORMER_KEYFORM_POSITION_SOURCES_BEGIN)? as usize;
    let binding_addr = r.read_ptr(offsets::WARP_DEFORMER_KEYFORM_BINDING_SOURCES_INDICES)? as usize;

    let mut warps = Vec::with_capacity(n);
    for i in 0..n {
        warps.push(Moc3WarpDeformer {
            vertex_count: r.read_u32_le(vertex_counts_addr + i * 4)?,
            rows: r.read_u32_le(rows_addr + i * 4)?,
            columns: r.read_u32_le(cols_addr + i * 4)?,
            keyform_sources_begin: r.read_i32_le(begin_addr + i * 4)?,
            keyform_sources_count: r.read_i32_le(count_addr + i * 4)?,
            keyform_position_sources_begin: r.read_i32_le(position_begin_addr + i * 4)?,
            keyform_binding_sources_index: r.read_i32_le(binding_addr + i * 4)?,
        });
    }
    Ok(warps)
}

fn read_rotation_deformers(
    r: &SafeReader,
    counts: &ElementCounts,
) -> Result<Vec<Moc3RotationDeformer>, LoadError> {
    let n = counts.rotation_deformers as usize;
    let angle_addr = r.read_ptr(offsets::ROTATION_DEFORMER_BASE_ANGLES)? as usize;
    let begin_addr = r.read_ptr(offsets::ROTATION_DEFORMER_KEYFORM_SOURCES_BEGIN)? as usize;
    let count_addr = r.read_ptr(offsets::ROTATION_DEFORMER_KEYFORM_SOURCES_COUNT)? as usize;
    let angles_begin_addr = r.read_ptr(offsets::ROTATION_DEFORMER_KEYFORM_ANGLES)? as usize;
    let binding_addr =
        r.read_ptr(offsets::ROTATION_DEFORMER_KEYFORM_BINDING_SOURCES_INDICES)? as usize;

    let mut rotations = Vec::with_capacity(n);
    for i in 0..n {
        rotations.push(Moc3RotationDeformer {
            base_angle: r.read_f32_le(angle_addr + i * 4)?,
            keyform_sources_begin: r.read_i32_le(begin_addr + i * 4)?,
            keyform_sources_count: r.read_i32_le(count_addr + i * 4)?,
            keyform_angles_begin: r.read_i32_le(angles_begin_addr + i * 4)?,
            keyform_binding_sources_index: r.read_i32_le(binding_addr + i * 4)?,
        });
    }
    Ok(rotations)
}

fn read_art_meshes(r: &SafeReader, counts: &ElementCounts) -> Result<Vec<Moc3ArtMesh>, LoadError> {
    let n = counts.art_meshes as usize;
    let ids_addr = r.read_ptr(offsets::ART_MESH_IDS)? as usize;
    let tex_addr = r.read_ptr(offsets::ART_MESH_TEXTURE_INDICES)? as usize;
    let flags_addr = r.read_ptr(offsets::ART_MESH_DRAWABLE_FLAGS)? as usize;
    let vc_addr = r.read_ptr(offsets::ART_MESH_VERTEX_COUNTS)? as usize;
    let visible_addr = r.read_ptr(offsets::ART_MESH_IS_VISIBLE)? as usize;
    let enabled_addr = r.read_ptr(offsets::ART_MESH_IS_ENABLED)? as usize;
    let parent_part_addr = r.read_ptr(offsets::ART_MESH_PARENT_PART_INDICES)? as usize;
    let parent_deformer_addr = r.read_ptr(offsets::ART_MESH_PARENT_DEFORMER_INDICES)? as usize;
    let uv_begin_addr = r.read_ptr(offsets::ART_MESH_UV_SOURCES_BEGIN)? as usize;
    let idx_begin_addr = r.read_ptr(offsets::ART_MESH_POSITION_INDEX_SOURCES_BEGIN)? as usize;
    let idx_count_addr = r.read_ptr(offsets::ART_MESH_POSITION_INDEX_SOURCES_COUNT)? as usize;
    let position_begin_addr =
        r.read_ptr(offsets::ART_MESH_KEYFORM_POSITION_SOURCES_BEGIN)? as usize;
    let kf_begin_addr = r.read_ptr(offsets::ART_MESH_KEYFORM_SOURCES_BEGIN)? as usize;
    let kf_count_addr = r.read_ptr(offsets::ART_MESH_KEYFORM_SOURCES_COUNT)? as usize;
    let kf_binding_addr = r.read_ptr(offsets::ART_MESH_KEYFORM_BINDING_SOURCES_INDICES)? as usize;

    let mut meshes = Vec::with_capacity(n);
    for i in 0..n {
        meshes.push(Moc3ArtMesh {
            id: r.read_cstr(ids_addr + i * 64, 64)?,
            texture_index: r.read_u32_le(tex_addr + i * 4)?,
            drawable_flags: r.read_u32_le(flags_addr + i * 4)?,
            vertex_count: r.read_u32_le(vc_addr + i * 4)?,
            is_visible: r.read_u32_le(visible_addr + i * 4)? != 0,
            is_enabled: r.read_u32_le(enabled_addr + i * 4)? != 0,
            parent_part_index: r.read_i32_le(parent_part_addr + i * 4)?,
            parent_deformer_index: r.read_i32_le(parent_deformer_addr + i * 4)?,
            uv_sources_begin: r.read_i32_le(uv_begin_addr + i * 4)?,
            position_index_sources_begin: r.read_i32_le(idx_begin_addr + i * 4)?,
            position_index_sources_count: r.read_i32_le(idx_count_addr + i * 4)?,
            keyform_position_sources_begin: r.read_i32_le(position_begin_addr + i * 4)?,
            keyform_sources_begin: r.read_i32_le(kf_begin_addr + i * 4)?,
            keyform_sources_count: r.read_i32_le(kf_count_addr + i * 4)?,
            keyform_binding_sources_index: r.read_i32_le(kf_binding_addr + i * 4)?,
        });
    }
    Ok(meshes)
}

fn read_parameter_bindings(
    r: &SafeReader,
    counts: &ElementCounts,
) -> Result<Vec<Moc3ParameterBinding>, LoadError> {
    let n = counts.parameter_bindings as usize;
    let indices_addr = r.read_ptr(offsets::KEYFORM_BINDING_INDICES)? as usize;
    let begin_addr = r.read_ptr(offsets::PARAMETER_BINDING_KEYS_SOURCES_BEGIN)? as usize;
    let count_addr = r.read_ptr(offsets::PARAMETER_BINDING_KEYS_SOURCES_COUNT)? as usize;

    let mut bindings = Vec::with_capacity(n);
    for i in 0..n {
        bindings.push(Moc3ParameterBinding {
            keyform_binding_index: r.read_i32_le(indices_addr + i * 4)?,
            keys_sources_begin: r.read_i32_le(begin_addr + i * 4)?,
            keys_sources_count: r.read_i32_le(count_addr + i * 4)?,
        });
    }
    Ok(bindings)
}

fn read_keyform_bindings(
    r: &SafeReader,
    counts: &ElementCounts,
) -> Result<Vec<Moc3KeyformBinding>, LoadError> {
    let n = counts.keyform_bindings as usize;
    let begin_addr = r.read_ptr(offsets::KEYFORM_BINDING_BAND_SOURCES_BEGIN)? as usize;
    let count_addr = r.read_ptr(offsets::KEYFORM_BINDING_BAND_SOURCES_COUNT)? as usize;

    let mut bindings = Vec::with_capacity(n);
    for i in 0..n {
        bindings.push(Moc3KeyformBinding {
            band_sources_begin: r.read_i32_le(begin_addr + i * 4)?,
            band_sources_count: r.read_i32_le(count_addr + i * 4)?,
        });
    }
    Ok(bindings)
}

fn read_warp_deformer_keyform_position_sources(
    r: &SafeReader,
    counts: &ElementCounts,
) -> Result<Vec<Moc3KeyformPositionSource>, LoadError> {
    let n = counts.warp_deformer_keyforms as usize;
    let begin_addr = r.read_ptr(offsets::WARP_DEFORMER_KEYFORM_POSITION_SOURCES_BEGIN)? as usize;
    read_position_sources(r, begin_addr, n)
}

fn read_rotation_deformer_keyform_angles(
    r: &SafeReader,
    counts: &ElementCounts,
) -> Result<Vec<f32>, LoadError> {
    let n = counts.rotation_deformer_keyforms as usize;
    let addr = r.read_ptr(offsets::ROTATION_DEFORMER_KEYFORM_ANGLES)? as usize;
    let mut values = Vec::with_capacity(n);
    for i in 0..n {
        values.push(r.read_f32_le(addr + i * 4)?);
    }
    Ok(values)
}

fn read_art_mesh_keyform_position_sources(
    r: &SafeReader,
    counts: &ElementCounts,
) -> Result<Vec<Moc3KeyformPositionSource>, LoadError> {
    let n = counts.art_mesh_keyforms as usize;
    let begin_addr = r.read_ptr(offsets::ART_MESH_KEYFORM_POSITION_SOURCES_BEGIN)? as usize;
    read_position_sources(r, begin_addr, n)
}

fn read_position_sources(
    r: &SafeReader,
    begin_addr: usize,
    n: usize,
) -> Result<Vec<Moc3KeyformPositionSource>, LoadError> {
    let mut sources = Vec::with_capacity(n);
    for i in 0..n {
        let row_addr = begin_addr + i * 8;
        sources.push(Moc3KeyformPositionSource {
            xys_begin: r.read_i32_le(row_addr)?,
            xys_count: r.read_i32_le(row_addr + 4)?,
        });
    }
    Ok(sources)
}

fn read_keyform_position_xys(
    r: &SafeReader,
    counts: &ElementCounts,
) -> Result<Vec<f32>, LoadError> {
    let n = counts.keyform_positions as usize;
    let addr = r.read_ptr(offsets::KEYFORM_POSITION_SOURCES_XYS)? as usize;
    let mut values = Vec::with_capacity(n);
    for i in 0..n {
        values.push(r.read_f32_le(addr + i * 4)?);
    }
    Ok(values)
}

fn read_key_values(r: &SafeReader, counts: &ElementCounts) -> Result<Vec<f32>, LoadError> {
    let n = counts.keys as usize;
    let addr = r.read_ptr(offsets::KEY_VALUES)? as usize;
    let mut values = Vec::with_capacity(n);
    for i in 0..n {
        values.push(r.read_f32_le(addr + i * 4)?);
    }
    Ok(values)
}

fn read_uvs(r: &SafeReader, counts: &ElementCounts) -> Result<Vec<Vec2>, LoadError> {
    let n = counts.uvs as usize;
    let addr = r.read_ptr(offsets::UV_SOURCES_BEGIN)? as usize;
    let mut uvs = Vec::with_capacity(n);
    for i in 0..n {
        let x = r.read_f32_le(addr + i * 8)?;
        let y = r.read_f32_le(addr + i * 8 + 4)?;
        uvs.push(Vec2::new(x, y));
    }
    Ok(uvs)
}

fn read_position_indices(r: &SafeReader, counts: &ElementCounts) -> Result<Vec<u16>, LoadError> {
    let n = counts.position_indices as usize;
    let addr = r.read_ptr(offsets::POSITION_INDEX_SOURCES_BEGIN)? as usize;
    let mut indices = Vec::with_capacity(n);
    for i in 0..n {
        indices.push(r.read_u16_le(addr + i * 2)?);
    }
    Ok(indices)
}

// ─── Utility functions ───────────────────────────────────────────────────────

/// Check if data starts with MOC3 magic bytes
pub fn is_moc3(data: &[u8]) -> bool {
    data.len() >= 4 && &data[0..4] == MOC3_MAGIC
}

/// Blend mode from drawable flags
pub fn blend_mode_from_flags(flags: u32) -> crate::components::BlendMode {
    // Bits 0-1: blend mode (0=Normal, 1=Add, 2=Multiply)
    match flags & 0x03 {
        1 => crate::components::BlendMode::Add,
        2 => crate::components::BlendMode::Multiply,
        _ => crate::components::BlendMode::Normal,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_moc3() {
        assert!(is_moc3(b"MOC3xxxx"));
        assert!(!is_moc3(b"TRNSRTS\0"));
        assert!(!is_moc3(b"MOC"));
    }

    #[test]
    fn test_safe_reader_basic() {
        let data = vec![0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08];
        let r = SafeReader::new(&data);
        assert_eq!(r.read_u8(0).unwrap(), 0x01);
        assert_eq!(r.read_u16_le(0).unwrap(), 0x0201);
        assert_eq!(r.read_u32_le(0).unwrap(), 0x04030201);
    }

    #[test]
    fn test_safe_reader_bounds() {
        let data = vec![0x01, 0x02];
        let r = SafeReader::new(&data);
        assert!(r.read_u32_le(0).is_err());
        assert!(r.read_u8(2).is_err());
    }

    #[test]
    fn test_safe_reader_cstr() {
        let mut data = vec![0u8; 64];
        data[0] = b'P';
        data[1] = b'a';
        data[2] = b'r';
        data[3] = b'a';
        data[4] = b'm';
        data[5] = 0;
        let r = SafeReader::new(&data);
        assert_eq!(r.read_cstr(0, 64).unwrap(), "Param");
    }

    #[test]
    fn test_blend_mode_from_flags() {
        assert_eq!(
            blend_mode_from_flags(0),
            crate::components::BlendMode::Normal
        );
        assert_eq!(blend_mode_from_flags(1), crate::components::BlendMode::Add);
        assert_eq!(
            blend_mode_from_flags(2),
            crate::components::BlendMode::Multiply
        );
    }

    #[test]
    fn test_parse_moc3_too_short() {
        let data = vec![0u8; 10];
        assert!(parse_moc3(&data).is_err());
    }

    #[test]
    fn test_parse_moc3_wrong_magic() {
        let mut data = vec![0u8; 256];
        data[0..8].copy_from_slice(b"TRNSRTS\0");
        assert!(parse_moc3(&data).is_err());
    }
}
