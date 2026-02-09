# 类型重复问题分析报告

## 概述

在 `neko-engine` 项目中发现了严重的类型重复问题。多个核心类型在不同的 crate 中有独立定义，导致需要手动进行类型转换，违反了 DRY 原则。

---

## 1. VideoCodec 重复定义

### 定义位置 1: `packages/types/src/codec.rs` (L8-15)
```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VideoCodec {
    #[default]
    H264,
    H265,
    Vp9,
    Av1,      // ← 独有
    ProRes,
}
```

**特点**:
- 有 `Serialize/Deserialize` (用于 JSON 序列化)
- 包含 `Av1` 变体
- 有 `as_str()` 和 `from_str()` 方法

---

### 定义位置 2: `packages/native-core/src/encoder/traits.rs` (L73-83)
```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VideoCodec {
    H264,
    H265,
    Vp9,
    ProRes,
    // 缺少 Av1
}
```

**特点**:
- **无** `Serialize/Deserialize`
- **不包含** `Av1` 变体
- 有 `ffmpeg_name()` 和 `default_bitrate()` 方法

---

### 定义位置 3: `packages/native-core/src/keyframe_cache/scanner.rs` (L27-35)
```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VideoCodecType {  // ← 不同的名字
    H264,
    H265,
    Other,  // ← 不同的设计
}
```

**特点**:
- 名字不同 (`VideoCodecType` vs `VideoCodec`)
- 只包含 H264/H265，其他用 `Other` 表示
- 专门用于 NAL 解析

---

### 类型转换代码

在 `packages/native-core/src/services/impls/video.rs` (L30-40):
```rust
/// Convert neko_types::VideoCodec → crate::encoder::VideoCodec
fn to_encoder_codec(codec: neko_types::VideoCodec) -> crate::encoder::VideoCodec {
    match codec {
        neko_types::VideoCodec::H264 => crate::encoder::VideoCodec::H264,
        neko_types::VideoCodec::H265 => crate::encoder::VideoCodec::H265,
        neko_types::VideoCodec::Vp9 => crate::encoder::VideoCodec::Vp9,
        neko_types::VideoCodec::ProRes => crate::encoder::VideoCodec::ProRes,
        // Av1 not supported by encoder, fall back to H264
        neko_types::VideoCodec::Av1 => crate::encoder::VideoCodec::H264,  // ⚠️ 数据丢失
    }
}
```

---

## 2. HwEncoderType 重复定义

### 定义位置 1: `packages/types/src/codec.rs` (L103-114)
```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HwEncoderType {
    #[default]
    None,
    Auto,
    VideoToolbox,
    Nvenc,
    Vaapi,
    Qsv,
    Amf,      // ← 独有
}
```

**特点**:
- 有 `Serialize/Deserialize`
- 包含 `Amf` 变体
- 有 `as_str()` 和 `is_hardware()` 方法

---

### 定义位置 2: `packages/native-core/src/encoder/traits.rs` (L11-26)
```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum HwEncoderType {
    #[default]
    None,
    VideoToolbox,
    Nvenc,
    Vaapi,
    Qsv,
    Auto,
    // 缺少 Amf
}
```

**特点**:
- **无** `Serialize/Deserialize`
- **不包含** `Amf` 变体
- 有 `encoder_name()`, `supports_codec()`, `device_type()` 方法

---

### 类型转换代码

在 `packages/native-core/src/services/impls/video.rs` (L42-54):
```rust
fn to_encoder_hw_type(hw: neko_types::HwEncoderType) -> crate::encoder::HwEncoderType {
    match hw {
        neko_types::HwEncoderType::None => crate::encoder::HwEncoderType::None,
        neko_types::HwEncoderType::Auto => crate::encoder::HwEncoderType::Auto,
        neko_types::HwEncoderType::VideoToolbox => crate::encoder::HwEncoderType::VideoToolbox,
        neko_types::HwEncoderType::Nvenc => crate::encoder::HwEncoderType::Nvenc,
        neko_types::HwEncoderType::Vaapi => crate::encoder::HwEncoderType::Vaapi,
        neko_types::HwEncoderType::Qsv => crate::encoder::HwEncoderType::Qsv,
        // Amf not supported by encoder, fall back to Auto
        neko_types::HwEncoderType::Amf => crate::encoder::HwEncoderType::Auto,  // ⚠️ 数据丢失
    }
}
```

---

## 3. EncoderPreset 重复定义

### 定义位置 1: `packages/types/src/codec.rs` (L78-100)
```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EncoderPreset {
    Ultrafast,
    Fast,
    #[default]
    Medium,
    Slow,
    Veryslow,
}

impl EncoderPreset {
    pub fn as_str(&self) -> &'static str { ... }
}
```

---

### 定义位置 2: `packages/native-core/src/encoder/traits.rs` (L154-181)
```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum EncoderPreset {
    Ultrafast,
    Fast,
    #[default]
    Medium,
    Slow,
    Veryslow,
}

impl EncoderPreset {
    pub fn ffmpeg_name(&self) -> &'static str { ... }
}
```

**差异**:
- `types` 版本: `as_str()` + `Serialize/Deserialize`
- `encoder` 版本: `ffmpeg_name()` (功能相同，名字不同)

---

### 类型转换代码

在 `packages/native-core/src/services/impls/video.rs` (L56-65):
```rust
fn to_encoder_preset(preset: neko_types::EncoderPreset) -> crate::encoder::EncoderPreset {
    match preset {
        neko_types::EncoderPreset::Ultrafast => crate::encoder::EncoderPreset::Ultrafast,
        neko_types::EncoderPreset::Fast => crate::encoder::EncoderPreset::Fast,
        neko_types::EncoderPreset::Medium => crate::encoder::EncoderPreset::Medium,
        neko_types::EncoderPreset::Slow => crate::encoder::EncoderPreset::Slow,
        neko_types::EncoderPreset::Veryslow => crate::encoder::EncoderPreset::Veryslow,
    }
}
```

---

## 4. AudioCodec 重复定义

### 定义位置 1: `packages/types/src/codec.rs` (L40-76)
```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioCodec {
    #[default]
    Aac,
    Mp3,
    Opus,
    Flac,
    Pcm,
    Vorbis,  // ← 独有
}

impl AudioCodec {
    pub fn as_str(&self) -> &'static str { ... }
    pub fn from_str(s: &str) -> Option<Self> { ... }
}
```

---

### 定义位置 2: `packages/native-core/src/audio/traits.rs` (L44-87)
```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum AudioCodec {
    #[default]
    Aac,
    Mp3,
    Opus,
    Flac,
    Pcm,
    // 缺少 Vorbis
}

impl AudioCodec {
    pub fn ffmpeg_encoder_name(&self) -> &'static str { ... }
    pub fn default_bitrate(&self) -> u64 { ... }
    pub fn is_lossless(&self) -> bool { ... }
}
```

**差异**:
- `types` 版本: 包含 `Vorbis`，有 `Serialize/Deserialize`
- `audio` 版本: 缺少 `Vorbis`，有 FFmpeg 特定方法

---

## 5. 问题总结

### 5.1 重复定义统计

| 类型 | 定义位置 | 变体差异 | 方法差异 | 序列化支持 |
|------|---------|---------|---------|-----------|
| **VideoCodec** | `types/codec.rs` | 5 个 (含 Av1) | `as_str()`, `from_str()` | ✅ |
| | `encoder/traits.rs` | 4 个 (无 Av1) | `ffmpeg_name()`, `default_bitrate()` | ❌ |
| | `keyframe_cache/scanner.rs` | 3 个 (H264/H265/Other) | `from_codec_id()` | ❌ |
| **HwEncoderType** | `types/codec.rs` | 7 个 (含 Amf) | `as_str()`, `is_hardware()` | ✅ |
| | `encoder/traits.rs` | 6 个 (无 Amf) | `encoder_name()`, `supports_codec()`, `device_type()` | ❌ |
| **EncoderPreset** | `types/codec.rs` | 5 个 | `as_str()` | ✅ |
| | `encoder/traits.rs` | 5 个 | `ffmpeg_name()` | ❌ |
| **AudioCodec** | `types/codec.rs` | 6 个 (含 Vorbis) | `as_str()`, `from_str()` | ✅ |
| | `audio/traits.rs` | 5 个 (无 Vorbis) | `ffmpeg_encoder_name()`, `default_bitrate()`, `is_lossless()` | ❌ |

---

### 5.2 核心问题

#### 问题 1: 数据丢失风险
```rust
// Av1 被强制转换为 H264
neko_types::VideoCodec::Av1 => crate::encoder::VideoCodec::H264

// Amf 被强制转换为 Auto
neko_types::HwEncoderType::Amf => crate::encoder::HwEncoderType::Auto
```

#### 问题 2: 维护成本高
- 新增编解码器需要修改 3 处定义
- 手动维护转换函数，容易出错
- 测试覆盖困难

#### 问题 3: 类型安全性差
- 转换函数可能遗漏新增的变体
- 编译器无法检测不一致性

#### 问题 4: 违反 DRY 原则
- 相同的枚举定义重复 2-3 次
- 相同的方法逻辑重复实现

---

## 6. 根因分析

### 6.1 架构设计问题

```
packages/types/          ← 公共类型 (带序列化)
    ↓ (不能直接使用)
packages/native-core/    ← 内部实现 (重新定义)
    ↓ (手动转换)
packages/native-api/     ← API 层 (使用两种类型)
```

**问题**: `native-core` 不依赖 `types`，导致类型隔离。

---

### 6.2 为什么会重复定义？

1. **序列化需求不同**
   - `types`: 需要 `Serialize/Deserialize` 用于 JSON API
   - `native-core`: 不需要序列化，只需要内部逻辑

2. **方法职责不同**
   - `types`: 通用方法 (`as_str()`, `from_str()`)
   - `native-core`: FFmpeg 特定方法 (`ffmpeg_name()`, `encoder_name()`)

3. **变体支持不同**
   - `types`: 包含所有理论支持的编解码器
   - `native-core`: 只包含当前实现的编解码器

---

## 7. 影响范围

### 7.1 受影响的文件

| 文件 | 角色 | 问题 |
|------|------|------|
| `packages/types/src/codec.rs` | 类型定义 | 定义了 4 个重复类型 |
| `packages/native-core/src/encoder/traits.rs` | 类型定义 | 重复定义 3 个类型 |
| `packages/native-core/src/audio/traits.rs` | 类型定义 | 重复定义 AudioCodec |
| `packages/native-core/src/keyframe_cache/scanner.rs` | 类型定义 | 重复定义 VideoCodecType |
| `packages/native-core/src/services/impls/video.rs` | 类型转换 | 包含 3 个转换函数 (L30-65) |
| `packages/native-api/src/controllers/video.rs` | API 层 | 使用 `neko_types::*` |

---

### 7.2 转换函数位置

所有转换函数都在 `packages/native-core/src/services/impls/video.rs`:

```rust
// L30-40
fn to_encoder_codec(codec: neko_types::VideoCodec) -> crate::encoder::VideoCodec

// L42-54
fn to_encoder_hw_type(hw: neko_types::HwEncoderType) -> crate::encoder::HwEncoderType

// L56-65
fn to_encoder_preset(preset: neko_types::EncoderPreset) -> crate::encoder::EncoderPreset
```

**注意**: `AudioCodec` 目前没有转换函数，因为 `VideoService` 不直接使用音频编码器。

---

## 8. 重构建议

### 方案 A: 统一到 `types` crate (推荐)

**优点**:
- 单一数据源
- 类型安全
- 易于维护

**实施步骤**:
1. 在 `types` crate 中添加 FFmpeg 特定方法
2. 为 `types` 添加 feature flag 控制序列化
3. `native-core` 依赖 `types`
4. 删除重复定义和转换函数

**示例**:
```rust
// packages/types/src/codec.rs
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub enum VideoCodec {
    H264,
    H265,
    Vp9,
    Av1,
    ProRes,
}

impl VideoCodec {
    // 通用方法
    pub fn as_str(&self) -> &'static str { ... }

    // FFmpeg 特定方法 (feature gated)
    #[cfg(feature = "ffmpeg")]
    pub fn ffmpeg_name(&self) -> &'static str { ... }
}
```

---

### 方案 B: 使用 From/Into trait

**优点**:
- 保持现有架构
- 类型转换更标准

**缺点**:
- 仍然有重复定义
- 数据丢失问题依然存在

**示例**:
```rust
impl From<neko_types::VideoCodec> for crate::encoder::VideoCodec {
    fn from(codec: neko_types::VideoCodec) -> Self {
        match codec {
            neko_types::VideoCodec::H264 => Self::H264,
            // ...
        }
    }
}
```

---

### 方案 C: 使用 newtype pattern

**优点**:
- 类型安全
- 可以添加特定方法

**缺点**:
- 增加包装层
- 性能开销（虽然可以优化掉）

---

## 9. 推荐行动计划

### Phase 1: 立即修复 (1-2 天)
1. ✅ 记录所有重复定义和转换位置
2. 🔧 为缺失的变体添加支持 (Av1, Amf, Vorbis)
3. 🔧 统一方法命名 (`as_str()` vs `ffmpeg_name()`)

### Phase 2: 架构重构 (3-5 天)
1. 🏗️ 在 `types` crate 添加 feature flags
2. 🏗️ 迁移 FFmpeg 特定方法到 `types`
3. 🏗️ 更新 `native-core` 依赖 `types`
4. 🧹 删除重复定义和转换函数

### Phase 3: 测试和验证 (2-3 天)
1. ✅ 添加单元测试覆盖所有变体
2. ✅ 集成测试验证类型转换
3. 📝 更新文档

---

## 10. 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 破坏现有 API | 高 | 保持 `types` crate 的公共 API 不变 |
| 编译错误 | 中 | 分阶段迁移，每步都编译通过 |
| 性能回退 | 低 | Feature flags 可以零成本抽象 |
| 测试覆盖不足 | 中 | 先写测试再重构 |

---

## 11. 结论

当前的类型重复问题严重违反了 DRY 原则，导致：
- ❌ 维护成本高（3 处定义需要同步）
- ❌ 数据丢失风险（Av1 → H264, Amf → Auto）
- ❌ 类型安全性差（手动转换容易出错）
- ❌ 测试困难（需要测试转换逻辑）

**推荐方案**: 采用方案 A（统一到 `types` crate），通过 feature flags 控制序列化和 FFmpeg 特定功能。

**预期收益**:
- ✅ 单一数据源，易于维护
- ✅ 消除手动转换函数
- ✅ 编译器保证类型一致性
- ✅ 支持所有编解码器变体

---

## 附录: 完整的重复定义对比表

### VideoCodec 完整对比

| 变体 | types | encoder | scanner | 说明 |
|------|-------|---------|---------|------|
| H264 | ✅ | ✅ | ✅ | 全部支持 |
| H265 | ✅ | ✅ | ✅ | 全部支持 |
| Vp9 | ✅ | ✅ | ❌ (Other) | scanner 不区分 |
| Av1 | ✅ | ❌ | ❌ (Other) | encoder 不支持 |
| ProRes | ✅ | ✅ | ❌ (Other) | scanner 不区分 |

### HwEncoderType 完整对比

| 变体 | types | encoder | 说明 |
|------|-------|---------|------|
| None | ✅ | ✅ | 全部支持 |
| Auto | ✅ | ✅ | 全部支持 |
| VideoToolbox | ✅ | ✅ | 全部支持 |
| Nvenc | ✅ | ✅ | 全部支持 |
| Vaapi | ✅ | ✅ | 全部支持 |
| Qsv | ✅ | ✅ | 全部支持 |
| Amf | ✅ | ❌ | encoder 不支持 |

### AudioCodec 完整对比

| 变体 | types | audio | 说明 |
|------|-------|-------|------|
| Aac | ✅ | ✅ | 全部支持 |
| Mp3 | ✅ | ✅ | 全部支持 |
| Opus | ✅ | ✅ | 全部支持 |
| Flac | ✅ | ✅ | 全部支持 |
| Pcm | ✅ | ✅ | 全部支持 |
| Vorbis | ✅ | ❌ | audio 不支持 |
