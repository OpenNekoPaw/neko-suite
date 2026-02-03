/**
 * WebGPUTextureImporter - VideoFrame 到 WebGPU 纹理的零拷贝导入
 *
 * 职责：
 * - 将 VideoFrame 导入为 GPUExternalTexture（零拷贝）
 * - 管理纹理生命周期
 * - 提供渲染管线集成
 *
 * 零拷贝原理：
 * ```
 * VideoFrame (GPU 内存) → GPUExternalTexture (直接引用，无拷贝)
 *                              ↓
 *                      WebGPU 渲染管线
 *                              ↓
 *                      Canvas 显示
 * ```
 *
 * 注意事项：
 * - GPUExternalTexture 只在当前帧有效，下一帧需要重新导入
 * - VideoFrame 必须在 GPUExternalTexture 使用完毕后才能 close()
 */

/**
 * External texture with source frame reference
 */
export interface ImportedTexture {
	/** WebGPU external texture */
	texture: GPUExternalTexture;
	/** Source VideoFrame (must be kept alive while texture is in use) */
	sourceFrame: VideoFrame;
	/** Texture width */
	width: number;
	/** Texture height */
	height: number;
	/** Timestamp in microseconds */
	timestamp: number;
}

/**
 * WebGPU texture importer configuration
 */
export interface WebGPUTextureImporterConfig {
	/** WebGPU device */
	device: GPUDevice;
}

/**
 * WebGPU texture importer for VideoFrame zero-copy import
 */
export class WebGPUTextureImporter {
	private device: GPUDevice;
	private disposed = false;

	// Current imported texture (only one at a time)
	private currentTexture: ImportedTexture | null = null;

	// Bind group layout for external texture sampling
	private bindGroupLayout: GPUBindGroupLayout | null = null;

	// Sampler for texture sampling
	private sampler: GPUSampler | null = null;

	constructor(config: WebGPUTextureImporterConfig) {
		this.device = config.device;
		this.initResources();
	}

	/**
	 * Initialize GPU resources
	 */
	private initResources(): void {
		// Create bind group layout for external texture
		this.bindGroupLayout = this.device.createBindGroupLayout({
			label: 'VideoFrame External Texture Layout',
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.FRAGMENT,
					externalTexture: {},
				},
				{
					binding: 1,
					visibility: GPUShaderStage.FRAGMENT,
					sampler: {},
				},
			],
		});

		// Create sampler
		this.sampler = this.device.createSampler({
			label: 'VideoFrame Sampler',
			magFilter: 'linear',
			minFilter: 'linear',
			addressModeU: 'clamp-to-edge',
			addressModeV: 'clamp-to-edge',
		});
	}

	/**
	 * Import VideoFrame as GPUExternalTexture (zero-copy)
	 *
	 * @param frame VideoFrame to import
	 * @returns Imported texture info
	 */
	importVideoFrame(frame: VideoFrame): ImportedTexture {
		if (this.disposed) {
			throw new Error('WebGPUTextureImporter is disposed');
		}

		// Release previous texture
		this.releaseCurrentTexture();

		// Import as external texture (zero-copy)
		const externalTexture = this.device.importExternalTexture({
			source: frame,
		});

		this.currentTexture = {
			texture: externalTexture,
			sourceFrame: frame,
			width: frame.displayWidth,
			height: frame.displayHeight,
			timestamp: frame.timestamp,
		};

		return this.currentTexture;
	}

	/**
	 * Create bind group for the current texture
	 *
	 * @returns GPUBindGroup for shader sampling
	 */
	createBindGroup(): GPUBindGroup | null {
		if (!this.currentTexture || !this.bindGroupLayout || !this.sampler) {
			return null;
		}

		return this.device.createBindGroup({
			label: 'VideoFrame Bind Group',
			layout: this.bindGroupLayout,
			entries: [
				{
					binding: 0,
					resource: this.currentTexture.texture,
				},
				{
					binding: 1,
					resource: this.sampler,
				},
			],
		});
	}

	/**
	 * Get bind group layout for pipeline creation
	 */
	getBindGroupLayout(): GPUBindGroupLayout | null {
		return this.bindGroupLayout;
	}

	/**
	 * Get current imported texture
	 */
	getCurrentTexture(): ImportedTexture | null {
		return this.currentTexture;
	}

	/**
	 * Release current texture and close source frame
	 */
	releaseCurrentTexture(): void {
		if (this.currentTexture) {
			// Close the source VideoFrame
			this.currentTexture.sourceFrame.close();
			this.currentTexture = null;
		}
	}

	/**
	 * Check if importer is available
	 */
	isAvailable(): boolean {
		return !this.disposed && this.device !== null;
	}

	/**
	 * Dispose the importer
	 */
	dispose(): void {
		if (this.disposed) {
			return;
		}

		this.disposed = true;
		this.releaseCurrentTexture();
		this.bindGroupLayout = null;
		this.sampler = null;
	}
}

/**
 * WGSL shader for rendering external texture to canvas
 */
export const EXTERNAL_TEXTURE_SHADER = /* wgsl */ `
struct VertexOutput {
	@builtin(position) position: vec4f,
	@location(0) texCoord: vec2f,
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
	// Full-screen triangle
	var positions = array<vec2f, 3>(
		vec2f(-1.0, -1.0),
		vec2f(3.0, -1.0),
		vec2f(-1.0, 3.0)
	);

	var texCoords = array<vec2f, 3>(
		vec2f(0.0, 1.0),
		vec2f(2.0, 1.0),
		vec2f(0.0, -1.0)
	);

	var output: VertexOutput;
	output.position = vec4f(positions[vertexIndex], 0.0, 1.0);
	output.texCoord = texCoords[vertexIndex];
	return output;
}

@group(0) @binding(0) var videoTexture: texture_external;
@group(0) @binding(1) var videoSampler: sampler;

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
	return textureSampleBaseClampToEdge(videoTexture, videoSampler, input.texCoord);
}
`;

/**
 * Create a render pipeline for external texture rendering
 */
export function createExternalTextureRenderPipeline(
	device: GPUDevice,
	bindGroupLayout: GPUBindGroupLayout,
	format: GPUTextureFormat
): GPURenderPipeline {
	const shaderModule = device.createShaderModule({
		label: 'External Texture Shader',
		code: EXTERNAL_TEXTURE_SHADER,
	});

	return device.createRenderPipeline({
		label: 'External Texture Render Pipeline',
		layout: device.createPipelineLayout({
			bindGroupLayouts: [bindGroupLayout],
		}),
		vertex: {
			module: shaderModule,
			entryPoint: 'vertexMain',
		},
		fragment: {
			module: shaderModule,
			entryPoint: 'fragmentMain',
			targets: [{ format }],
		},
		primitive: {
			topology: 'triangle-list',
		},
	});
}

export default WebGPUTextureImporter;
