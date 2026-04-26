/**
 * Asset Manifest Types
 *
 * 统一资产注册表的类型基础。
 * 覆盖媒体素材、Shader、AI 模型、插件、预设等所有资产类型。
 */

// =============================================================================
// Asset Type
// =============================================================================

/** 统一资产类型 */
export type AssetType =
  // 媒体素材
  | 'video'
  | 'audio'
  | 'image'
  | 'sequence'
  // Shader
  | 'shader'
  | 'shader-preset'
  // AI 模型
  | 'ai-model'
  | 'lora'
  | 'embedding'
  // 插件 / Agent Skill
  | 'plugin'
  | 'skill'
  // 预设 / 模板 / LUT
  | 'preset'
  | 'template'
  | 'lut'
  // 3D 模型
  | '3d-model'
  // 2D Puppet 动作 / 表情预设
  | 'puppet-motion'
  // 文档
  | 'document'
  // ProviderCard expression context
  | 'provider-card';

// =============================================================================
// Asset Source
// =============================================================================

/** 资产来源 */
export type AssetManifestSource =
  | { kind: 'local'; path: string }
  | { kind: 'git-lfs'; oid: string; path: string }
  | { kind: 'registry'; registry: string; package: string; version: string; integrity?: string }
  | { kind: 'ai-generated'; taskId: string; model: string }
  | { kind: 'remote'; uri: string; checksum?: string };

// =============================================================================
// Type-Specific Metadata
// =============================================================================

/** Shader 元数据 */
export interface ShaderMetadata {
  language: 'wgsl' | 'glsl';
  stage: 'vertex' | 'fragment' | 'compute';
  inputs: ShaderInput[];
  preview?: string;
  compatibleWith: string[];
}

export interface ShaderInput {
  name: string;
  type: 'float' | 'vec2' | 'vec3' | 'vec4' | 'texture' | 'sampler';
  default?: number | number[];
  min?: number;
  max?: number;
  label?: string;
}

/** AI model metadata for marketplace distribution and runtime deployment */
export interface ModelMetadata {
  /** Model weight format */
  framework: 'onnx' | 'pytorch' | 'safetensors' | 'gguf';
  /** Primary task this model performs */
  task:
    | 'image-gen'
    | 'tts'
    | 'stt'
    | 'style-transfer'
    | 'upscale'
    | 'denoise'
    | 'transcribe'
    | 'clip'
    | 'chat'
    | 'embedding'
    | 'vision'
    | string;
  /** Model file size in bytes */
  size: number;
  /** Quantization level (e.g., 'q4_k_m', 'fp16', 'int8') */
  quantization?: string;
  /** Minimum VRAM required in MB */
  minVram?: number;
  /** Architecture name (e.g., 'realesrgan', 'whisper', 'llama', 'sdxl') */
  architecture?: string;
  /** Base model ID for LoRA / embedding / adapter */
  baseModel?: string;
}

/** 插件元数据 */
export interface PluginMetadata {
  entryPoint: string;
  apiVersion: string;
  permissions: string[];
  configSchema?: Record<string, unknown>;
}

/** 预设元数据 */
export interface PresetMetadata {
  presetType: 'export' | 'color' | 'transition' | 'effect' | 'lut' | 'template';
  targetApp?: string;
  parameters?: Record<string, unknown>;
}

/** Skill-specific marketplace metadata */
export interface SkillMarketMetadata {
  /** Skill domain tags */
  domain: string[];
  /** Associated ToolSet names */
  toolSets?: string[];
  /** Required MCP server names */
  mcpServers?: string[];
  /** LLM requirements */
  llmRequirements?: {
    capabilities: ('vision' | 'function-calling' | 'streaming')[];
    minContextWindow?: number;
  };
}

export type ProviderCardMarketTrustLevel = 'core' | 'community' | 'untrusted';

export interface ProviderCardSignature {
  readonly algorithm: 'sha256' | 'sha512' | 'ed25519';
  readonly value: string;
  readonly signedBy?: string;
}

/** Provider expression card marketplace metadata */
export interface ProviderCardMarketMetadata {
  /** Provider ID declared by the card frontmatter */
  providerId: string;
  /** Generation capabilities covered by this card */
  capabilities: ('image.generate' | 'video.generate' | 'audio.generate')[];
  /** Optional model ids this semantic profile applies to */
  modelIds?: string[];
  /** Provider card schema version */
  cardSchemaVersion?: string;
  /** Capability-protocol trust tier assigned by marketplace review */
  trustLevel?: ProviderCardMarketTrustLevel;
  /** Optional package/card signature metadata for reviewed marketplace packages */
  signature?: ProviderCardSignature;
}

/** Document metadata */
export interface DocumentMetadata {
  subtype: 'markdown' | 'pdf' | 'word' | 'pptx' | 'xlsx' | 'epub' | 'cbz' | 'fdx';
  pageCount?: number;
  wordCount?: number;
  language?: string;
  /** Whether text content can be extracted for AI analysis */
  textExtractable: boolean;
}

/** 类型特化元数据联合 */
export type AssetTypeMetadata =
  | { type: 'shader'; data: ShaderMetadata }
  | { type: 'model'; data: ModelMetadata }
  | { type: 'plugin'; data: PluginMetadata }
  | { type: 'preset'; data: PresetMetadata }
  | { type: 'skill'; data: SkillMarketMetadata }
  | { type: 'document'; data: DocumentMetadata }
  | { type: 'provider-card'; data: ProviderCardMarketMetadata };

// =============================================================================
// Distribution Info
// =============================================================================

/** 分发信息 */
export interface AssetDistribution {
  license: string;
  author: string;
  tags: string[];
  description?: string;
  homepage?: string;
  downloads?: number;
  checksum: string;

  // === Marketplace extensions ===

  /** Visibility level */
  visibility?: 'public' | 'private' | 'shared' | 'paid';
  /** Publisher unique identifier */
  publisherId?: string;
  /** Publisher display name */
  publisherName?: string;
  /** Whether the publisher is verified */
  verified?: boolean;
  /** Pricing info */
  pricing?: AssetPricing;
  /** Rating stats */
  rating?: { average: number; count: number };
  /** Screenshot URLs */
  screenshots?: string[];
  /** Compatibility requirements */
  compatibility?: AssetCompatibility;
}

/** Pricing model for marketplace assets */
export interface AssetPricing {
  model: 'free' | 'paid' | 'freemium';
  price?: number;
  currency?: string;
}

/** Version compatibility requirements */
export interface AssetCompatibility {
  /** Neko Suite version range (semver) */
  nekoSuiteVersion?: string;
  /** VSCode version range */
  vscodeVersion?: string;
  /** Engine version range */
  engineVersion?: string;
}

// =============================================================================
// Asset Dependency
// =============================================================================

/** 资产依赖 */
export interface AssetDependency {
  id: string;
  version: string;
  optional?: boolean;
}

// =============================================================================
// Asset Manifest
// =============================================================================

/** 统一资产清单 */
export interface AssetManifest {
  /** 唯一标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 语义化版本 */
  version: string;
  /** 资产类型 */
  type: AssetType;
  /** 来源 */
  source: AssetManifestSource;
  /** 类型特化元数据 */
  typeMetadata?: AssetTypeMetadata;
  /** 分发信息（社区资产） */
  distribution?: AssetDistribution;
  /** 依赖列表 */
  dependencies?: AssetDependency[];
  /** 缩略图/预览图路径 */
  thumbnail?: string;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}
