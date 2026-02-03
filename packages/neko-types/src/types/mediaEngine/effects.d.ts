/**
 * Effect Processor Interface
 *
 * Defines the unified GPU effect processing interface for both modes.
 */
/**
 * GPU effect type identifiers
 */
export type GpuEffectType = 'colorCorrection' | 'blur' | 'sharpen' | 'brightness' | 'contrast' | 'saturation' | 'hue' | 'opacity' | 'chromaKey' | 'lut' | 'vignette' | 'custom';
/**
 * Color correction parameters
 */
export interface ColorCorrectionParams {
    type: 'colorCorrection';
    brightness?: number;
    contrast?: number;
    saturation?: number;
    hue?: number;
    gamma?: number;
    exposure?: number;
}
/**
 * Blur effect parameters
 */
export interface BlurParams {
    type: 'blur';
    radius: number;
    quality?: 'low' | 'medium' | 'high';
}
/**
 * Sharpen effect parameters
 */
export interface SharpenParams {
    type: 'sharpen';
    amount: number;
    radius?: number;
}
/**
 * Chroma key (green screen) parameters
 */
export interface ChromaKeyParams {
    type: 'chromaKey';
    keyColor: {
        r: number;
        g: number;
        b: number;
    };
    similarity: number;
    smoothness: number;
    spillSuppression?: number;
}
/**
 * LUT (Look-Up Table) parameters
 */
export interface LutParams {
    type: 'lut';
    lutData: Uint8Array | string;
    intensity?: number;
}
/**
 * Custom shader effect parameters
 */
export interface CustomEffectParams {
    type: 'custom';
    shaderId: string;
    uniforms?: Record<string, number | number[] | boolean>;
}
/**
 * Vignette effect parameters
 */
export interface VignetteEffectParams {
    type: 'vignette';
    intensity: number;
    radius?: number;
    softness?: number;
}
/**
 * Union of all GPU effect parameters
 */
export type GpuEffectParams = ColorCorrectionParams | BlurParams | SharpenParams | ChromaKeyParams | LutParams | CustomEffectParams | VignetteEffectParams;
/**
 * Single effect in a pipeline
 */
export interface PipelineEffect {
    /** Effect identifier */
    id: string;
    /** Effect parameters */
    params: GpuEffectParams;
    /** Whether the effect is enabled */
    enabled: boolean;
    /** Effect order (lower = earlier in pipeline) */
    order: number;
}
/**
 * Effect pipeline configuration
 */
export interface EffectPipeline {
    /** Pipeline identifier */
    id: string;
    /** Effects in the pipeline */
    effects: PipelineEffect[];
    /** Output format */
    outputFormat?: 'rgba' | 'bgra';
}
/**
 * GPU info for effect processor
 */
export interface EffectProcessorGpuInfo {
    /** GPU device name */
    deviceName: string;
    /** GPU vendor */
    vendor: string;
    /** GPU backend (webgpu, webgl, wgpu) */
    backend: string;
    /** Whether the GPU is discrete */
    isDiscrete: boolean;
    /** Maximum texture size */
    maxTextureSize: number;
}
/**
 * Effect processor state
 */
export type EffectProcessorState = 'uninitialized' | 'ready' | 'processing' | 'error' | 'disposed';
/**
 * Unified effect processor interface
 *
 * Provides GPU-accelerated effect processing for video frames.
 */
export interface IEffectProcessor {
    /** Current state */
    readonly state: EffectProcessorState;
    /** GPU information */
    readonly gpuInfo: EffectProcessorGpuInfo | null;
    /** Whether the processor is ready */
    readonly isReady: boolean;
    /**
     * Initialize the effect processor
     */
    initialize(): Promise<void>;
    /**
     * Apply effects to a single frame
     * @param frame Input frame data
     * @param width Frame width
     * @param height Frame height
     * @param effects Effects to apply
     * @returns Processed frame data
     */
    processFrame(frame: Uint8Array | VideoFrame, width: number, height: number, effects: GpuEffectParams[]): Promise<Uint8Array>;
    /**
     * Apply an effect pipeline to a frame
     * @param frame Input frame data
     * @param width Frame width
     * @param height Frame height
     * @param pipeline Effect pipeline
     * @returns Processed frame data
     */
    processPipeline(frame: Uint8Array | VideoFrame, width: number, height: number, pipeline: EffectPipeline): Promise<Uint8Array>;
    /**
     * Register a custom shader
     * @param id Shader identifier
     * @param shaderCode Shader source code (WGSL or GLSL)
     */
    registerCustomShader?(id: string, shaderCode: string): Promise<void>;
    /**
     * Dispose the effect processor and release GPU resources
     */
    dispose(): Promise<void>;
}
/**
 * Batch effect processor for processing multiple frames efficiently
 */
export interface IBatchEffectProcessor extends IEffectProcessor {
    /**
     * Process multiple frames in batch
     * @param frames Array of frame data with dimensions
     * @param effects Effects to apply to all frames
     * @returns Array of processed frame data
     */
    processFrameBatch(frames: Array<{
        data: Uint8Array;
        width: number;
        height: number;
    }>, effects: GpuEffectParams[]): Promise<Uint8Array[]>;
    /**
     * Maximum batch size supported
     */
    readonly maxBatchSize: number;
}
/**
 * Check if an effect processor supports batch processing
 */
export declare function isBatchEffectProcessor(processor: IEffectProcessor): processor is IBatchEffectProcessor;
/**
 * Create default color correction params
 */
export declare function createColorCorrection(overrides?: Partial<Omit<ColorCorrectionParams, 'type'>>): ColorCorrectionParams;
/**
 * Create default blur params
 */
export declare function createBlur(radius: number, quality?: 'low' | 'medium' | 'high'): BlurParams;
/**
 * Create default chroma key params for green screen
 */
export declare function createGreenScreenKey(overrides?: Partial<Omit<ChromaKeyParams, 'type' | 'keyColor'>>): ChromaKeyParams;
//# sourceMappingURL=effects.d.ts.map