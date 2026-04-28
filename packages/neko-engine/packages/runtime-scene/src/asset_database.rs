//! Authoring asset database for runtime-scene.
//!
//! The database owns stable asset handles and authoring descriptors. GPU caches
//! in engine-kernel are derived from these descriptors and must not become the
//! metadata source for exporters or inspectors.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct AssetHandle {
    pub guid: String,
}

impl AssetHandle {
    pub fn new(guid: impl Into<String>) -> Self {
        Self { guid: guid.into() }
    }

    pub fn for_mesh(uri: &str, primitive_index: usize) -> Self {
        Self::new(format!("mesh:{}#primitive:{}", uri, primitive_index))
    }

    pub fn for_material(uri: &str, material_index: usize) -> Self {
        Self::new(format!("material:{}#index:{}", uri, material_index))
    }

    pub fn for_texture(uri: &str, texture_index: usize) -> Self {
        Self::new(format!("texture:{}#index:{}", uri, texture_index))
    }

    pub fn for_image(uri: &str, image_index: usize) -> Self {
        Self::new(format!("image:{}#index:{}", uri, image_index))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AssetKind {
    Mesh,
    Material,
    Texture,
    Image,
    LightProbe,
    CharacterDescription,
    CharacterDataBlock,
    MorphDescriptor,
    SkeletonDescriptor,
    SkinWeightAtlas,
    BlendShape,
    Other(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetMetadata {
    pub kind: AssetKind,
    pub source_path: Option<String>,
    pub import_settings: serde_json::Value,
    pub version: u64,
    pub dependencies: Vec<AssetHandle>,
}

impl AssetMetadata {
    pub fn new(kind: AssetKind) -> Self {
        Self {
            kind,
            source_path: None,
            import_settings: serde_json::Value::Object(Default::default()),
            version: 1,
            dependencies: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeshDescriptor {
    pub handle: AssetHandle,
    pub uri: String,
    pub primitive_index: usize,
    pub topology_version: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextureDescriptor {
    pub handle: AssetHandle,
    pub uri: String,
    pub texture_index: usize,
    pub color_space: TextureColorSpace,
    pub source_image: Option<AssetHandle>,
    pub sampler: Option<TextureSamplerDescriptor>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TextureColorSpace {
    Srgb,
    Linear,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct TextureSamplerDescriptor {
    pub mag_filter: Option<u32>,
    pub min_filter: Option<u32>,
    pub wrap_s: u32,
    pub wrap_t: u32,
}

impl Default for TextureSamplerDescriptor {
    fn default() -> Self {
        Self {
            mag_filter: None,
            min_filter: None,
            wrap_s: 10497,
            wrap_t: 10497,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageDescriptor {
    pub handle: AssetHandle,
    pub uri: Option<String>,
    pub mime_type: Option<String>,
    pub data: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterDescriptionDescriptor {
    pub handle: AssetHandle,
    pub uri: String,
    pub character_id: String,
    pub schema_version: u32,
    pub topology_version: u64,
    pub data_blocks: Vec<AssetHandle>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterDataBlockDescriptor {
    pub handle: AssetHandle,
    pub uri: String,
    pub kind: String,
    pub checksum: Option<String>,
    pub byte_length: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MorphAssetDescriptor {
    pub handle: AssetHandle,
    pub character_id: String,
    pub morph_id: String,
    pub data_block: Option<AssetHandle>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkeletonAssetDescriptor {
    pub handle: AssetHandle,
    pub character_id: String,
    pub skeleton_id: String,
    pub source: Option<AssetHandle>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkinWeightAtlasDescriptor {
    pub handle: AssetHandle,
    pub character_id: String,
    pub atlas_id: String,
    pub data_block: AssetHandle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlendShapeDescriptor {
    pub handle: AssetHandle,
    pub character_id: String,
    pub blend_shape_id: String,
    pub data_block: AssetHandle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaterialDescriptor {
    pub handle: AssetHandle,
    pub name: Option<String>,
    pub base_color_factor: [f32; 4],
    pub metallic_factor: f32,
    pub roughness_factor: f32,
    pub emissive_factor: [f32; 3],
    pub normal_scale: f32,
    pub occlusion_strength: f32,
    pub base_color_texture: Option<AssetHandle>,
    pub metallic_roughness_texture: Option<AssetHandle>,
    pub normal_texture: Option<AssetHandle>,
    pub occlusion_texture: Option<AssetHandle>,
    pub emissive_texture: Option<AssetHandle>,
}

impl MaterialDescriptor {
    pub fn new(handle: AssetHandle) -> Self {
        Self {
            handle,
            name: None,
            base_color_factor: [1.0, 1.0, 1.0, 1.0],
            metallic_factor: 0.0,
            roughness_factor: 0.5,
            emissive_factor: [0.0, 0.0, 0.0],
            normal_scale: 1.0,
            occlusion_strength: 1.0,
            base_color_texture: None,
            metallic_roughness_texture: None,
            normal_texture: None,
            occlusion_texture: None,
            emissive_texture: None,
        }
    }

    pub fn apply_patch(&mut self, patch: MaterialDescriptorPatch) {
        if let Some(base_color) = patch.base_color_factor {
            self.base_color_factor = base_color;
        }
        if let Some(metallic) = patch.metallic_factor {
            self.metallic_factor = metallic;
        }
        if let Some(roughness) = patch.roughness_factor {
            self.roughness_factor = roughness;
        }
        if let Some(emissive) = patch.emissive_factor {
            self.emissive_factor = emissive;
        }
        if let Some(occlusion_strength) = patch.occlusion_strength {
            self.occlusion_strength = occlusion_strength;
        }
    }
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
pub struct MaterialDescriptorPatch {
    pub base_color_factor: Option<[f32; 4]>,
    pub metallic_factor: Option<f32>,
    pub roughness_factor: Option<f32>,
    pub emissive_factor: Option<[f32; 3]>,
    pub occlusion_strength: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AssetDescriptor {
    Mesh(MeshDescriptor),
    Material(MaterialDescriptor),
    Texture(TextureDescriptor),
    Image(ImageDescriptor),
    CharacterDescription(CharacterDescriptionDescriptor),
    CharacterDataBlock(CharacterDataBlockDescriptor),
    MorphDescriptor(MorphAssetDescriptor),
    SkeletonDescriptor(SkeletonAssetDescriptor),
    SkinWeightAtlas(SkinWeightAtlasDescriptor),
    BlendShape(BlendShapeDescriptor),
}

impl AssetDescriptor {
    pub fn handle(&self) -> &AssetHandle {
        match self {
            Self::Mesh(descriptor) => &descriptor.handle,
            Self::Material(descriptor) => &descriptor.handle,
            Self::Texture(descriptor) => &descriptor.handle,
            Self::Image(descriptor) => &descriptor.handle,
            Self::CharacterDescription(descriptor) => &descriptor.handle,
            Self::CharacterDataBlock(descriptor) => &descriptor.handle,
            Self::MorphDescriptor(descriptor) => &descriptor.handle,
            Self::SkeletonDescriptor(descriptor) => &descriptor.handle,
            Self::SkinWeightAtlas(descriptor) => &descriptor.handle,
            Self::BlendShape(descriptor) => &descriptor.handle,
        }
    }

    pub fn kind(&self) -> AssetKind {
        match self {
            Self::Mesh(_) => AssetKind::Mesh,
            Self::Material(_) => AssetKind::Material,
            Self::Texture(_) => AssetKind::Texture,
            Self::Image(_) => AssetKind::Image,
            Self::CharacterDescription(_) => AssetKind::CharacterDescription,
            Self::CharacterDataBlock(_) => AssetKind::CharacterDataBlock,
            Self::MorphDescriptor(_) => AssetKind::MorphDescriptor,
            Self::SkeletonDescriptor(_) => AssetKind::SkeletonDescriptor,
            Self::SkinWeightAtlas(_) => AssetKind::SkinWeightAtlas,
            Self::BlendShape(_) => AssetKind::BlendShape,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AssetDatabase {
    metadata: HashMap<AssetHandle, AssetMetadata>,
    descriptors: HashMap<AssetHandle, AssetDescriptor>,
}

impl AssetDatabase {
    pub fn insert_descriptor(&mut self, descriptor: AssetDescriptor) {
        let handle = descriptor.handle().clone();
        self.metadata
            .entry(handle.clone())
            .or_insert_with(|| AssetMetadata::new(descriptor.kind()));
        self.descriptors.insert(handle, descriptor);
    }

    pub fn insert_metadata(&mut self, handle: AssetHandle, metadata: AssetMetadata) {
        self.metadata.insert(handle, metadata);
    }

    pub fn metadata(&self, handle: &AssetHandle) -> Option<&AssetMetadata> {
        self.metadata.get(handle)
    }

    pub fn descriptor(&self, handle: &AssetHandle) -> Option<&AssetDescriptor> {
        self.descriptors.get(handle)
    }

    pub fn mesh(&self, handle: &AssetHandle) -> Option<&MeshDescriptor> {
        match self.descriptor(handle) {
            Some(AssetDescriptor::Mesh(descriptor)) => Some(descriptor),
            _ => None,
        }
    }

    pub fn material(&self, handle: &AssetHandle) -> Option<&MaterialDescriptor> {
        match self.descriptor(handle) {
            Some(AssetDescriptor::Material(descriptor)) => Some(descriptor),
            _ => None,
        }
    }

    pub fn texture(&self, handle: &AssetHandle) -> Option<&TextureDescriptor> {
        match self.descriptor(handle) {
            Some(AssetDescriptor::Texture(descriptor)) => Some(descriptor),
            _ => None,
        }
    }

    pub fn image(&self, handle: &AssetHandle) -> Option<&ImageDescriptor> {
        match self.descriptor(handle) {
            Some(AssetDescriptor::Image(descriptor)) => Some(descriptor),
            _ => None,
        }
    }

    pub fn character_description(
        &self,
        handle: &AssetHandle,
    ) -> Option<&CharacterDescriptionDescriptor> {
        match self.descriptor(handle) {
            Some(AssetDescriptor::CharacterDescription(descriptor)) => Some(descriptor),
            _ => None,
        }
    }

    pub fn character_data_block(
        &self,
        handle: &AssetHandle,
    ) -> Option<&CharacterDataBlockDescriptor> {
        match self.descriptor(handle) {
            Some(AssetDescriptor::CharacterDataBlock(descriptor)) => Some(descriptor),
            _ => None,
        }
    }

    pub fn morph_descriptor(&self, handle: &AssetHandle) -> Option<&MorphAssetDescriptor> {
        match self.descriptor(handle) {
            Some(AssetDescriptor::MorphDescriptor(descriptor)) => Some(descriptor),
            _ => None,
        }
    }

    pub fn skeleton_descriptor(&self, handle: &AssetHandle) -> Option<&SkeletonAssetDescriptor> {
        match self.descriptor(handle) {
            Some(AssetDescriptor::SkeletonDescriptor(descriptor)) => Some(descriptor),
            _ => None,
        }
    }

    pub fn skin_weight_atlas(&self, handle: &AssetHandle) -> Option<&SkinWeightAtlasDescriptor> {
        match self.descriptor(handle) {
            Some(AssetDescriptor::SkinWeightAtlas(descriptor)) => Some(descriptor),
            _ => None,
        }
    }

    pub fn blend_shape(&self, handle: &AssetHandle) -> Option<&BlendShapeDescriptor> {
        match self.descriptor(handle) {
            Some(AssetDescriptor::BlendShape(descriptor)) => Some(descriptor),
            _ => None,
        }
    }

    pub fn merge(&mut self, other: AssetDatabase) {
        self.metadata.extend(other.metadata);
        self.descriptors.extend(other.descriptors);
    }

    pub fn update_material(
        &mut self,
        handle: AssetHandle,
        patch: MaterialDescriptorPatch,
    ) -> &MaterialDescriptor {
        let descriptor = self
            .descriptors
            .entry(handle.clone())
            .or_insert_with(|| AssetDescriptor::Material(MaterialDescriptor::new(handle.clone())));

        let AssetDescriptor::Material(material) = descriptor else {
            *descriptor = AssetDescriptor::Material(MaterialDescriptor::new(handle.clone()));
            let AssetDescriptor::Material(material) = descriptor else {
                unreachable!("descriptor was just replaced with material");
            };
            material.apply_patch(patch);
            self.metadata
                .entry(handle)
                .or_insert_with(|| AssetMetadata::new(AssetKind::Material));
            return material;
        };

        material.apply_patch(patch);
        self.metadata
            .entry(handle)
            .or_insert_with(|| AssetMetadata::new(AssetKind::Material));
        material
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asset_database_registers_descriptor_and_metadata() {
        let handle = AssetHandle::for_material("model.glb", 2);
        let mut database = AssetDatabase::default();

        database.insert_descriptor(AssetDescriptor::Material(MaterialDescriptor::new(
            handle.clone(),
        )));

        assert!(database.material(&handle).is_some());
        assert_eq!(
            database.metadata(&handle).map(|meta| &meta.kind),
            Some(&AssetKind::Material)
        );
    }

    #[test]
    fn asset_handles_are_stable_for_uri_and_index() {
        assert_eq!(
            AssetHandle::for_mesh("model.glb", 0),
            AssetHandle::for_mesh("model.glb", 0)
        );
        assert_ne!(
            AssetHandle::for_mesh("model.glb", 0),
            AssetHandle::for_mesh("model.glb", 1)
        );
    }

    #[test]
    fn material_updates_are_applied_to_authoring_descriptor() {
        let handle = AssetHandle::for_material("model.glb", 0);
        let mut database = AssetDatabase::default();

        let material = database.update_material(
            handle.clone(),
            MaterialDescriptorPatch {
                base_color_factor: Some([0.2, 0.3, 0.4, 1.0]),
                metallic_factor: Some(0.7),
                roughness_factor: Some(0.25),
                emissive_factor: Some([0.1, 0.2, 0.3]),
                occlusion_strength: Some(0.6),
            },
        );

        assert_eq!(material.base_color_factor, [0.2, 0.3, 0.4, 1.0]);
        assert_eq!(material.metallic_factor, 0.7);
        assert_eq!(material.roughness_factor, 0.25);
        assert_eq!(material.occlusion_strength, 0.6);
        assert_eq!(
            database.metadata(&handle).map(|meta| &meta.kind),
            Some(&AssetKind::Material)
        );
    }

    #[test]
    fn asset_database_registers_character_authoring_descriptors() {
        let character_handle = AssetHandle::new("character:ava");
        let block_handle = AssetHandle::new("character-data:ava:smile");
        let morph_handle = AssetHandle::new("character-morph:ava:Smile");
        let skeleton_handle = AssetHandle::new("character-skeleton:ava:main");
        let skin_handle = AssetHandle::new("character-skin:ava:main");
        let blend_shape_handle = AssetHandle::new("character-blend-shape:ava:Smile");
        let mut database = AssetDatabase::default();

        database.insert_descriptor(AssetDescriptor::CharacterDataBlock(
            CharacterDataBlockDescriptor {
                handle: block_handle.clone(),
                uri: "characters/ava.nkcdata".to_string(),
                kind: "morph-sparse-delta".to_string(),
                checksum: Some("fnv1a64:0000000000000000".to_string()),
                byte_length: Some(128),
            },
        ));
        database.insert_descriptor(AssetDescriptor::CharacterDescription(
            CharacterDescriptionDescriptor {
                handle: character_handle.clone(),
                uri: "characters/ava.nkc".to_string(),
                character_id: "ava".to_string(),
                schema_version: 1,
                topology_version: 3,
                data_blocks: vec![block_handle.clone()],
            },
        ));
        database.insert_descriptor(AssetDescriptor::MorphDescriptor(MorphAssetDescriptor {
            handle: morph_handle.clone(),
            character_id: "ava".to_string(),
            morph_id: "Smile".to_string(),
            data_block: Some(block_handle.clone()),
        }));
        database.insert_descriptor(AssetDescriptor::SkeletonDescriptor(
            SkeletonAssetDescriptor {
                handle: skeleton_handle.clone(),
                character_id: "ava".to_string(),
                skeleton_id: "main".to_string(),
                source: None,
            },
        ));
        database.insert_descriptor(AssetDescriptor::SkinWeightAtlas(
            SkinWeightAtlasDescriptor {
                handle: skin_handle.clone(),
                character_id: "ava".to_string(),
                atlas_id: "main".to_string(),
                data_block: block_handle.clone(),
            },
        ));
        database.insert_descriptor(AssetDescriptor::BlendShape(BlendShapeDescriptor {
            handle: blend_shape_handle.clone(),
            character_id: "ava".to_string(),
            blend_shape_id: "Smile".to_string(),
            data_block: block_handle.clone(),
        }));

        assert_eq!(
            database
                .character_description(&character_handle)
                .map(|descriptor| descriptor.character_id.as_str()),
            Some("ava")
        );
        assert!(database.character_data_block(&block_handle).is_some());
        assert!(database.morph_descriptor(&morph_handle).is_some());
        assert!(database.skeleton_descriptor(&skeleton_handle).is_some());
        assert!(database.skin_weight_atlas(&skin_handle).is_some());
        assert!(database.blend_shape(&blend_shape_handle).is_some());
        assert_eq!(
            database.metadata(&character_handle).map(|meta| &meta.kind),
            Some(&AssetKind::CharacterDescription)
        );
    }
}
