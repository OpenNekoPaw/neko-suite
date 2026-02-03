/**
 * WebGPU Type Declarations
 * 基础的 WebGPU 类型定义，用于 TypeScript 编译
 *
 * 注意：这是一个简化版本，只包含项目使用的类型
 * 完整类型请参考 @webgpu/types 包
 */

// =============================================================================
// Navigator Extension
// =============================================================================

interface Navigator {
  readonly gpu: GPU;
}

// =============================================================================
// GPU Types
// =============================================================================

interface GPU {
  requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
  getPreferredCanvasFormat(): GPUTextureFormat;
}

interface GPURequestAdapterOptions {
  powerPreference?: 'low-power' | 'high-performance';
  forceFallbackAdapter?: boolean;
}

interface GPUAdapter {
  readonly features: ReadonlySet<string>;
  readonly limits: GPUSupportedLimits;
  requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
}

interface GPUSupportedLimits {
  readonly maxTextureDimension1D: number;
  readonly maxTextureDimension2D: number;
  readonly maxTextureDimension3D: number;
  readonly maxTextureArrayLayers: number;
  readonly maxBindGroups: number;
  readonly maxBindingsPerBindGroup: number;
  readonly maxDynamicUniformBuffersPerPipelineLayout: number;
  readonly maxDynamicStorageBuffersPerPipelineLayout: number;
  readonly maxSampledTexturesPerShaderStage: number;
  readonly maxSamplersPerShaderStage: number;
  readonly maxStorageBuffersPerShaderStage: number;
  readonly maxStorageTexturesPerShaderStage: number;
  readonly maxUniformBuffersPerShaderStage: number;
  readonly maxUniformBufferBindingSize: number;
  readonly maxStorageBufferBindingSize: number;
  readonly minUniformBufferOffsetAlignment: number;
  readonly minStorageBufferOffsetAlignment: number;
  readonly maxVertexBuffers: number;
  readonly maxBufferSize: number;
  readonly maxVertexAttributes: number;
  readonly maxVertexBufferArrayStride: number;
  readonly maxInterStageShaderComponents: number;
  readonly maxColorAttachments: number;
  readonly maxColorAttachmentBytesPerSample: number;
  readonly maxComputeWorkgroupStorageSize: number;
  readonly maxComputeInvocationsPerWorkgroup: number;
  readonly maxComputeWorkgroupSizeX: number;
  readonly maxComputeWorkgroupSizeY: number;
  readonly maxComputeWorkgroupSizeZ: number;
  readonly maxComputeWorkgroupsPerDimension: number;
}

interface GPUDeviceDescriptor {
  label?: string;
  requiredFeatures?: Iterable<string>;
  requiredLimits?: Record<string, number>;
}

// =============================================================================
// Device
// =============================================================================

interface GPUDevice {
  readonly features: ReadonlySet<string>;
  readonly limits: GPUSupportedLimits;
  readonly queue: GPUQueue;
  readonly lost: Promise<GPUDeviceLostInfo>;

  destroy(): void;

  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
  createTexture(descriptor: GPUTextureDescriptor): GPUTexture;
  createSampler(descriptor?: GPUSamplerDescriptor): GPUSampler;
  createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout;
  createPipelineLayout(descriptor: GPUPipelineLayoutDescriptor): GPUPipelineLayout;
  createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
  createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
  createComputePipeline(descriptor: GPUComputePipelineDescriptor): GPUComputePipeline;
  createRenderPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline;
  createCommandEncoder(descriptor?: GPUCommandEncoderDescriptor): GPUCommandEncoder;
  createRenderBundleEncoder(descriptor: GPURenderBundleEncoderDescriptor): GPURenderBundleEncoder;
  createQuerySet(descriptor: GPUQuerySetDescriptor): GPUQuerySet;
  importExternalTexture(descriptor: GPUExternalTextureDescriptor): GPUExternalTexture;
}

interface GPUDeviceLostInfo {
  readonly reason: 'unknown' | 'destroyed';
  readonly message: string;
}

// =============================================================================
// Queue
// =============================================================================

interface GPUQueue {
  submit(commandBuffers: Iterable<GPUCommandBuffer>): void;
  writeBuffer(buffer: GPUBuffer, bufferOffset: number, data: BufferSource, dataOffset?: number, size?: number): void;
  writeTexture(destination: GPUImageCopyTexture, data: BufferSource, dataLayout: GPUImageDataLayout, size: GPUExtent3DStrict): void;
  copyExternalImageToTexture(
    source: GPUImageCopyExternalImage,
    destination: GPUImageCopyTextureTagged,
    copySize: GPUExtent3DStrict
  ): void;
}

// =============================================================================
// Buffer
// =============================================================================

interface GPUBufferDescriptor {
  label?: string;
  size: number;
  usage: GPUBufferUsageFlags;
  mappedAtCreation?: boolean;
}

interface GPUBuffer {
  readonly size: number;
  readonly usage: GPUBufferUsageFlags;
  readonly mapState: 'unmapped' | 'pending' | 'mapped';
  mapAsync(mode: GPUMapModeFlags, offset?: number, size?: number): Promise<void>;
  getMappedRange(offset?: number, size?: number): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}

type GPUBufferUsageFlags = number;
type GPUMapModeFlags = number;

declare const GPUBufferUsage: {
  readonly MAP_READ: GPUBufferUsageFlags;
  readonly MAP_WRITE: GPUBufferUsageFlags;
  readonly COPY_SRC: GPUBufferUsageFlags;
  readonly COPY_DST: GPUBufferUsageFlags;
  readonly INDEX: GPUBufferUsageFlags;
  readonly VERTEX: GPUBufferUsageFlags;
  readonly UNIFORM: GPUBufferUsageFlags;
  readonly STORAGE: GPUBufferUsageFlags;
  readonly INDIRECT: GPUBufferUsageFlags;
  readonly QUERY_RESOLVE: GPUBufferUsageFlags;
};

declare const GPUMapMode: {
  readonly READ: GPUMapModeFlags;
  readonly WRITE: GPUMapModeFlags;
};

// =============================================================================
// Texture
// =============================================================================

interface GPUTextureDescriptor {
  label?: string;
  size: GPUExtent3DStrict;
  mipLevelCount?: number;
  sampleCount?: number;
  dimension?: GPUTextureDimension;
  format: GPUTextureFormat;
  usage: GPUTextureUsageFlags;
  viewFormats?: Iterable<GPUTextureFormat>;
}

interface GPUTexture {
  readonly width: number;
  readonly height: number;
  readonly depthOrArrayLayers: number;
  readonly mipLevelCount: number;
  readonly sampleCount: number;
  readonly dimension: GPUTextureDimension;
  readonly format: GPUTextureFormat;
  readonly usage: GPUTextureUsageFlags;
  createView(descriptor?: GPUTextureViewDescriptor): GPUTextureView;
  destroy(): void;
}

interface GPUTextureView {}

interface GPUTextureViewDescriptor {
  label?: string;
  format?: GPUTextureFormat;
  dimension?: GPUTextureViewDimension;
  aspect?: GPUTextureAspect;
  baseMipLevel?: number;
  mipLevelCount?: number;
  baseArrayLayer?: number;
  arrayLayerCount?: number;
}

type GPUTextureDimension = '1d' | '2d' | '3d';
type GPUTextureViewDimension = '1d' | '2d' | '2d-array' | 'cube' | 'cube-array' | '3d';
type GPUTextureAspect = 'all' | 'stencil-only' | 'depth-only';
type GPUTextureFormat = string;
type GPUTextureUsageFlags = number;

declare const GPUTextureUsage: {
  readonly COPY_SRC: GPUTextureUsageFlags;
  readonly COPY_DST: GPUTextureUsageFlags;
  readonly TEXTURE_BINDING: GPUTextureUsageFlags;
  readonly STORAGE_BINDING: GPUTextureUsageFlags;
  readonly RENDER_ATTACHMENT: GPUTextureUsageFlags;
};

// =============================================================================
// Sampler
// =============================================================================

interface GPUSamplerDescriptor {
  label?: string;
  addressModeU?: GPUAddressMode;
  addressModeV?: GPUAddressMode;
  addressModeW?: GPUAddressMode;
  magFilter?: GPUFilterMode;
  minFilter?: GPUFilterMode;
  mipmapFilter?: GPUMipmapFilterMode;
  lodMinClamp?: number;
  lodMaxClamp?: number;
  compare?: GPUCompareFunction;
  maxAnisotropy?: number;
}

interface GPUSampler {}

type GPUAddressMode = 'clamp-to-edge' | 'repeat' | 'mirror-repeat';
type GPUFilterMode = 'nearest' | 'linear';
type GPUMipmapFilterMode = 'nearest' | 'linear';
type GPUCompareFunction = 'never' | 'less' | 'equal' | 'less-equal' | 'greater' | 'not-equal' | 'greater-equal' | 'always';

// =============================================================================
// Bind Group Layout
// =============================================================================

interface GPUBindGroupLayoutDescriptor {
  label?: string;
  entries: Iterable<GPUBindGroupLayoutEntry>;
}

interface GPUBindGroupLayout {}

interface GPUBindGroupLayoutEntry {
  binding: number;
  visibility: GPUShaderStageFlags;
  buffer?: GPUBufferBindingLayout;
  sampler?: GPUSamplerBindingLayout;
  texture?: GPUTextureBindingLayout;
  storageTexture?: GPUStorageTextureBindingLayout;
  externalTexture?: GPUExternalTextureBindingLayout;
}

type GPUShaderStageFlags = number;

declare const GPUShaderStage: {
  readonly VERTEX: GPUShaderStageFlags;
  readonly FRAGMENT: GPUShaderStageFlags;
  readonly COMPUTE: GPUShaderStageFlags;
};

interface GPUBufferBindingLayout {
  type?: 'uniform' | 'storage' | 'read-only-storage';
  hasDynamicOffset?: boolean;
  minBindingSize?: number;
}

interface GPUSamplerBindingLayout {
  type?: 'filtering' | 'non-filtering' | 'comparison';
}

interface GPUTextureBindingLayout {
  sampleType?: 'float' | 'unfilterable-float' | 'depth' | 'sint' | 'uint';
  viewDimension?: GPUTextureViewDimension;
  multisampled?: boolean;
}

interface GPUStorageTextureBindingLayout {
  access?: 'write-only' | 'read-only' | 'read-write';
  format: GPUTextureFormat;
  viewDimension?: GPUTextureViewDimension;
}

interface GPUExternalTextureBindingLayout {}

// =============================================================================
// Pipeline Layout
// =============================================================================

interface GPUPipelineLayoutDescriptor {
  label?: string;
  bindGroupLayouts: Iterable<GPUBindGroupLayout>;
}

interface GPUPipelineLayout {}

// =============================================================================
// Bind Group
// =============================================================================

interface GPUBindGroupDescriptor {
  label?: string;
  layout: GPUBindGroupLayout;
  entries: Iterable<GPUBindGroupEntry>;
}

interface GPUBindGroup {}

interface GPUBindGroupEntry {
  binding: number;
  resource: GPUSampler | GPUTextureView | GPUBufferBinding | GPUExternalTexture;
}

interface GPUBufferBinding {
  buffer: GPUBuffer;
  offset?: number;
  size?: number;
}

interface GPUExternalTexture {}

interface GPUExternalTextureDescriptor {
  source: HTMLVideoElement | VideoFrame;
  colorSpace?: 'srgb' | 'display-p3';
}

// =============================================================================
// Shader Module
// =============================================================================

interface GPUShaderModuleDescriptor {
  label?: string;
  code: string;
  sourceMap?: object;
  hints?: Record<string, GPUShaderModuleCompilationHint>;
}

interface GPUShaderModule {}

interface GPUShaderModuleCompilationHint {
  layout?: GPUPipelineLayout | 'auto';
}

// =============================================================================
// Compute Pipeline
// =============================================================================

interface GPUComputePipelineDescriptor {
  label?: string;
  layout: GPUPipelineLayout | 'auto';
  compute: GPUProgrammableStage;
}

interface GPUComputePipeline {
  getBindGroupLayout(index: number): GPUBindGroupLayout;
}

interface GPUProgrammableStage {
  module: GPUShaderModule;
  entryPoint: string;
  constants?: Record<string, number>;
}

// =============================================================================
// Render Pipeline
// =============================================================================

interface GPURenderPipelineDescriptor {
  label?: string;
  layout: GPUPipelineLayout | 'auto';
  vertex: GPUVertexState;
  primitive?: GPUPrimitiveState;
  depthStencil?: GPUDepthStencilState;
  multisample?: GPUMultisampleState;
  fragment?: GPUFragmentState;
}

interface GPURenderPipeline {
  getBindGroupLayout(index: number): GPUBindGroupLayout;
}

interface GPUVertexState extends GPUProgrammableStage {
  buffers?: Iterable<GPUVertexBufferLayout | null>;
}

interface GPUVertexBufferLayout {
  arrayStride: number;
  stepMode?: 'vertex' | 'instance';
  attributes: Iterable<GPUVertexAttribute>;
}

interface GPUVertexAttribute {
  format: GPUVertexFormat;
  offset: number;
  shaderLocation: number;
}

type GPUVertexFormat = string;

interface GPUPrimitiveState {
  topology?: GPUPrimitiveTopology;
  stripIndexFormat?: GPUIndexFormat;
  frontFace?: GPUFrontFace;
  cullMode?: GPUCullMode;
  unclippedDepth?: boolean;
}

type GPUPrimitiveTopology = 'point-list' | 'line-list' | 'line-strip' | 'triangle-list' | 'triangle-strip';
type GPUIndexFormat = 'uint16' | 'uint32';
type GPUFrontFace = 'ccw' | 'cw';
type GPUCullMode = 'none' | 'front' | 'back';

interface GPUDepthStencilState {
  format: GPUTextureFormat;
  depthWriteEnabled: boolean;
  depthCompare: GPUCompareFunction;
  stencilFront?: GPUStencilFaceState;
  stencilBack?: GPUStencilFaceState;
  stencilReadMask?: number;
  stencilWriteMask?: number;
  depthBias?: number;
  depthBiasSlopeScale?: number;
  depthBiasClamp?: number;
}

interface GPUStencilFaceState {
  compare?: GPUCompareFunction;
  failOp?: GPUStencilOperation;
  depthFailOp?: GPUStencilOperation;
  passOp?: GPUStencilOperation;
}

type GPUStencilOperation = 'keep' | 'zero' | 'replace' | 'invert' | 'increment-clamp' | 'decrement-clamp' | 'increment-wrap' | 'decrement-wrap';

interface GPUMultisampleState {
  count?: number;
  mask?: number;
  alphaToCoverageEnabled?: boolean;
}

interface GPUFragmentState extends GPUProgrammableStage {
  targets: Iterable<GPUColorTargetState | null>;
}

interface GPUColorTargetState {
  format: GPUTextureFormat;
  blend?: GPUBlendState;
  writeMask?: GPUColorWriteFlags;
}

interface GPUBlendState {
  color: GPUBlendComponent;
  alpha: GPUBlendComponent;
}

interface GPUBlendComponent {
  operation?: GPUBlendOperation;
  srcFactor?: GPUBlendFactor;
  dstFactor?: GPUBlendFactor;
}

type GPUBlendOperation = 'add' | 'subtract' | 'reverse-subtract' | 'min' | 'max';
type GPUBlendFactor = string;
type GPUColorWriteFlags = number;

declare const GPUColorWrite: {
  readonly RED: GPUColorWriteFlags;
  readonly GREEN: GPUColorWriteFlags;
  readonly BLUE: GPUColorWriteFlags;
  readonly ALPHA: GPUColorWriteFlags;
  readonly ALL: GPUColorWriteFlags;
};

// =============================================================================
// Command Encoder
// =============================================================================

interface GPUCommandEncoderDescriptor {
  label?: string;
}

interface GPUCommandEncoder {
  beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder;
  beginComputePass(descriptor?: GPUComputePassDescriptor): GPUComputePassEncoder;
  copyBufferToBuffer(source: GPUBuffer, sourceOffset: number, destination: GPUBuffer, destinationOffset: number, size: number): void;
  copyBufferToTexture(source: GPUImageCopyBuffer, destination: GPUImageCopyTexture, copySize: GPUExtent3DStrict): void;
  copyTextureToBuffer(source: GPUImageCopyTexture, destination: GPUImageCopyBuffer, copySize: GPUExtent3DStrict): void;
  copyTextureToTexture(source: GPUImageCopyTexture, destination: GPUImageCopyTexture, copySize: GPUExtent3DStrict): void;
  clearBuffer(buffer: GPUBuffer, offset?: number, size?: number): void;
  resolveQuerySet(querySet: GPUQuerySet, firstQuery: number, queryCount: number, destination: GPUBuffer, destinationOffset: number): void;
  finish(descriptor?: GPUCommandBufferDescriptor): GPUCommandBuffer;
}

interface GPUCommandBuffer {}

interface GPUCommandBufferDescriptor {
  label?: string;
}

// =============================================================================
// Render Pass
// =============================================================================

interface GPURenderPassDescriptor {
  label?: string;
  colorAttachments: Iterable<GPURenderPassColorAttachment | null>;
  depthStencilAttachment?: GPURenderPassDepthStencilAttachment;
  occlusionQuerySet?: GPUQuerySet;
  timestampWrites?: GPURenderPassTimestampWrites;
  maxDrawCount?: number;
}

interface GPURenderPassColorAttachment {
  view: GPUTextureView;
  resolveTarget?: GPUTextureView;
  clearValue?: GPUColor;
  loadOp: GPULoadOp;
  storeOp: GPUStoreOp;
}

interface GPURenderPassDepthStencilAttachment {
  view: GPUTextureView;
  depthClearValue?: number;
  depthLoadOp?: GPULoadOp;
  depthStoreOp?: GPUStoreOp;
  depthReadOnly?: boolean;
  stencilClearValue?: number;
  stencilLoadOp?: GPULoadOp;
  stencilStoreOp?: GPUStoreOp;
  stencilReadOnly?: boolean;
}

interface GPURenderPassTimestampWrites {
  querySet: GPUQuerySet;
  beginningOfPassWriteIndex?: number;
  endOfPassWriteIndex?: number;
}

type GPULoadOp = 'load' | 'clear';
type GPUStoreOp = 'store' | 'discard';
type GPUColor = { r: number; g: number; b: number; a: number } | [number, number, number, number];

interface GPURenderPassEncoder {
  setPipeline(pipeline: GPURenderPipeline): void;
  setIndexBuffer(buffer: GPUBuffer, indexFormat: GPUIndexFormat, offset?: number, size?: number): void;
  setVertexBuffer(slot: number, buffer: GPUBuffer, offset?: number, size?: number): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup, dynamicOffsets?: Iterable<number>): void;
  setBlendConstant(color: GPUColor): void;
  setStencilReference(reference: number): void;
  setViewport(x: number, y: number, width: number, height: number, minDepth: number, maxDepth: number): void;
  setScissorRect(x: number, y: number, width: number, height: number): void;
  draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number): void;
  drawIndexed(indexCount: number, instanceCount?: number, firstIndex?: number, baseVertex?: number, firstInstance?: number): void;
  drawIndirect(indirectBuffer: GPUBuffer, indirectOffset: number): void;
  drawIndexedIndirect(indirectBuffer: GPUBuffer, indirectOffset: number): void;
  executeBundles(bundles: Iterable<GPURenderBundle>): void;
  end(): void;
}

interface GPURenderBundle {}

// =============================================================================
// Compute Pass
// =============================================================================

interface GPUComputePassDescriptor {
  label?: string;
  timestampWrites?: GPUComputePassTimestampWrites;
}

interface GPUComputePassTimestampWrites {
  querySet: GPUQuerySet;
  beginningOfPassWriteIndex?: number;
  endOfPassWriteIndex?: number;
}

interface GPUComputePassEncoder {
  setPipeline(pipeline: GPUComputePipeline): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup, dynamicOffsets?: Iterable<number>): void;
  dispatchWorkgroups(workgroupCountX: number, workgroupCountY?: number, workgroupCountZ?: number): void;
  dispatchWorkgroupsIndirect(indirectBuffer: GPUBuffer, indirectOffset: number): void;
  end(): void;
}

// =============================================================================
// Render Bundle Encoder
// =============================================================================

interface GPURenderBundleEncoderDescriptor {
  label?: string;
  colorFormats: Iterable<GPUTextureFormat | null>;
  depthStencilFormat?: GPUTextureFormat;
  sampleCount?: number;
  depthReadOnly?: boolean;
  stencilReadOnly?: boolean;
}

interface GPURenderBundleEncoder {
  setPipeline(pipeline: GPURenderPipeline): void;
  setIndexBuffer(buffer: GPUBuffer, indexFormat: GPUIndexFormat, offset?: number, size?: number): void;
  setVertexBuffer(slot: number, buffer: GPUBuffer, offset?: number, size?: number): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup, dynamicOffsets?: Iterable<number>): void;
  draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number): void;
  drawIndexed(indexCount: number, instanceCount?: number, firstIndex?: number, baseVertex?: number, firstInstance?: number): void;
  drawIndirect(indirectBuffer: GPUBuffer, indirectOffset: number): void;
  drawIndexedIndirect(indirectBuffer: GPUBuffer, indirectOffset: number): void;
  finish(descriptor?: GPURenderBundleDescriptor): GPURenderBundle;
}

interface GPURenderBundleDescriptor {
  label?: string;
}

// =============================================================================
// Query Set
// =============================================================================

interface GPUQuerySetDescriptor {
  label?: string;
  type: GPUQueryType;
  count: number;
}

interface GPUQuerySet {
  readonly type: GPUQueryType;
  readonly count: number;
  destroy(): void;
}

type GPUQueryType = 'occlusion' | 'timestamp';

// =============================================================================
// Canvas Context
// =============================================================================

interface GPUCanvasContext {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  configure(configuration: GPUCanvasConfiguration): void;
  unconfigure(): void;
  getCurrentTexture(): GPUTexture;
}

interface GPUCanvasConfiguration {
  device: GPUDevice;
  format: GPUTextureFormat;
  usage?: GPUTextureUsageFlags;
  viewFormats?: Iterable<GPUTextureFormat>;
  colorSpace?: 'srgb' | 'display-p3';
  alphaMode?: 'opaque' | 'premultiplied';
}

// =============================================================================
// Image Copy Types
// =============================================================================

interface GPUImageCopyBuffer {
  buffer: GPUBuffer;
  offset?: number;
  bytesPerRow?: number;
  rowsPerImage?: number;
}

interface GPUImageCopyTexture {
  texture: GPUTexture;
  mipLevel?: number;
  origin?: GPUOrigin3DStrict;
  aspect?: GPUTextureAspect;
}

interface GPUImageCopyTextureTagged extends GPUImageCopyTexture {
  colorSpace?: 'srgb' | 'display-p3';
  premultipliedAlpha?: boolean;
}

interface GPUImageCopyExternalImage {
  source: ImageBitmap | ImageData | HTMLImageElement | HTMLVideoElement | VideoFrame | HTMLCanvasElement | OffscreenCanvas;
  origin?: GPUOrigin2DStrict;
  flipY?: boolean;
}

interface GPUImageDataLayout {
  offset?: number;
  bytesPerRow?: number;
  rowsPerImage?: number;
}

// =============================================================================
// Extent & Origin Types
// =============================================================================

type GPUExtent3DStrict = { width: number; height?: number; depthOrArrayLayers?: number } | [number, number?, number?];
type GPUOrigin3DStrict = { x?: number; y?: number; z?: number } | [number, number?, number?];
type GPUOrigin2DStrict = { x?: number; y?: number } | [number, number?];
