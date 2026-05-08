/**
 * Agent Capability Provider for neko-engine
 *
 * Provides GPU effects, transcription, loudness analysis, and frame extraction
 * tools to neko-agent via the AgentCapabilityProvider protocol.
 *
 * All tools communicate with the local engine extension command bridge.
 * This package must not import @neko/neko-client; neko-client is an upstream
 * consumer of engine APIs, not an engine dependency.
 */
import * as vscode from 'vscode';
import type {
  AgentCapabilityProvider,
  AgentCapabilityContext,
  Tool,
  ToolResult,
} from '@neko/shared';
import { TOOL_NAMES_EFFECTS, TOOL_NAMES_TRANSCRIBE } from '@neko/shared';

// =============================================================================
// Local Engine Dispatch Adapter
// =============================================================================

interface ActionResponse<T = unknown> {
  readonly status: 'ok' | 'error';
  readonly data?: T;
  readonly error?: {
    readonly message?: string;
  };
  readonly message?: string;
}

interface ShaderParamDef {
  readonly name: string;
  readonly default: number;
  readonly min: number;
  readonly max: number;
}

interface EffectPresetInfo {
  readonly id: string;
  readonly description: string;
  readonly params: ShaderParamDef[];
}

interface TranscribeSegment {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

interface TranscribeResponse {
  readonly text: string;
  readonly segments: readonly TranscribeSegment[];
  readonly language: string | null;
  readonly durationSecs: number | null;
}

interface FrameCaptureResponse {
  readonly data?: string;
  readonly base64?: string;
}

/**
 * Dispatch through this extension's command bridge.
 *
 * The bridge owns engine startup and native dispatch; this adapter only gives
 * the capability provider a typed local facade without depending on neko-client.
 */
async function dispatchEngine<T>(
  group: string,
  action: string,
  options?: Record<string, unknown>,
): Promise<T> {
  const resultJson = await vscode.commands.executeCommand<string | null>(
    'neko.engine.dispatch',
    group,
    action,
    options,
  );
  if (!resultJson) {
    throw new Error(`Engine dispatch returned no response for ${group}:${action}`);
  }

  const response = JSON.parse(resultJson) as ActionResponse<T>;
  if (response.status === 'error') {
    throw new Error(response.error?.message ?? response.message ?? `${group}:${action} failed`);
  }

  return response.data as T;
}

async function listEffects(): Promise<EffectPresetInfo[]> {
  return dispatchEngine<EffectPresetInfo[]>('effects', 'list', {});
}

async function getEffectInfo(shaderId: string): Promise<EffectPresetInfo> {
  return dispatchEngine<EffectPresetInfo>('effects', 'info', { shaderId });
}

async function registerShader(
  id: string,
  code: string,
  params?: readonly ShaderParamDef[],
): Promise<void> {
  await dispatchEngine('effects', 'register', { id, code, params: params ?? [] });
}

async function transcribe(model: string, audio: string): Promise<TranscribeResponse> {
  const data = await dispatchEngine<Partial<TranscribeResponse>>('models', 'transcribe', {
    model,
    audio,
  });
  return {
    text: data.text ?? '',
    segments: data.segments ?? [],
    language: data.language ?? null,
    durationSecs: data.durationSecs ?? null,
  };
}

async function analyzeLoudness(source: string, targetLufs: number): Promise<unknown> {
  return dispatchEngine('audios', 'analyze_loudness', { source, targetLufs });
}

async function extractFrameBase64(
  source: string,
  time: number,
  opts: { quality?: number; width?: number; height?: number },
): Promise<string | undefined> {
  const data = await dispatchEngine<FrameCaptureResponse>('videos', 'capture', {
    source,
    time,
    quality: opts.quality ?? 85,
    format: 'jpeg',
    ...(opts.width != null && { width: opts.width }),
    ...(opts.height != null && { height: opts.height }),
  });
  return data.data ?? data.base64;
}

// =============================================================================
// Tool Factories
// =============================================================================

function createEffectsTools(): Tool[] {
  return [
    {
      name: TOOL_NAMES_EFFECTS.LIST_VIDEO_EFFECTS,
      description:
        'List all available GPU video effects/shaders. Returns preset IDs, descriptions, and tunable parameters.',
      parameters: { type: 'object', properties: {} },
      category: 'media',
      isReadOnly: true,
      isConcurrencySafe: true,
      async execute(): Promise<ToolResult> {
        const data = await listEffects();
        return { success: true, data };
      },
    },
    {
      name: TOOL_NAMES_EFFECTS.GET_VIDEO_EFFECT_INFO,
      description:
        'Get detailed info about a specific GPU video effect, including its tunable parameters with min/max/default values.',
      parameters: {
        type: 'object',
        properties: {
          shaderId: {
            type: 'string',
            description:
              'ID of the shader/effect preset (e.g. "gaussian_blur", "noise", "pixelate")',
          },
        },
        required: ['shaderId'],
      },
      category: 'media',
      isReadOnly: true,
      isConcurrencySafe: true,
      async execute(args): Promise<ToolResult> {
        const data = await getEffectInfo(args['shaderId'] as string);
        return { success: true, data };
      },
    },
    {
      name: TOOL_NAMES_EFFECTS.REGISTER_CUSTOM_SHADER,
      description:
        'Register a custom WGSL compute shader with the GPU engine. The shader will be available as a video effect. ' +
        'The WGSL code must define an @compute @workgroup_size(16,16) entry point named "main". ' +
        'Standard uniforms (width, height, time) and input/output textures are auto-injected.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Unique ID for this shader (e.g. "my_custom_blur")',
          },
          code: {
            type: 'string',
            description: 'WGSL compute shader source code',
          },
          params: {
            type: 'array',
            description: 'Optional tunable parameter definitions',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                default: { type: 'number' },
                min: { type: 'number' },
                max: { type: 'number' },
              },
              required: ['name', 'default', 'min', 'max'],
            },
          },
        },
        required: ['id', 'code'],
      },
      category: 'media',
      isReadOnly: false,
      isConcurrencySafe: false,
      async execute(args): Promise<ToolResult> {
        await registerShader(
          args['id'] as string,
          args['code'] as string,
          args['params'] as
            | Array<{
                name: string;
                default: number;
                min: number;
                max: number;
              }>
            | undefined,
        );
        return { success: true, data: { shaderId: args['id'] as string } };
      },
    },
  ];
}

function createTranscribeTools(): Tool[] {
  return [
    {
      name: TOOL_NAMES_TRANSCRIBE.TRANSCRIBE_AUDIO,
      description:
        'Transcribe an audio or video file to text with word-level timestamps using Whisper. ' +
        'Returns an array of timestamped segments. Use the segments with AddTimelineElement(type:"subtitle") ' +
        'to add subtitles to the timeline.',
      parameters: {
        type: 'object',
        properties: {
          audioSource: {
            type: 'string',
            description: 'Absolute path to the audio or video file to transcribe',
          },
          model: {
            type: 'string',
            description: 'Whisper model name registered in the engine (default: "whisper-base")',
          },
        },
        required: ['audioSource'],
      },
      category: 'media',
      isReadOnly: true,
      isConcurrencySafe: true,
      async execute(args): Promise<ToolResult> {
        const model = (args['model'] as string) || 'whisper-base';
        const audioSource = args['audioSource'] as string;
        const data = await transcribe(model, audioSource);
        return { success: true, data };
      },
    },
  ];
}

function createAnalysisTools(): Tool[] {
  return [
    {
      name: 'AnalyzeLoudness',
      description:
        'Analyze audio loudness per ITU-R BS.1770-4. Returns integrated LUFS, true peak dBTP, ' +
        'loudness range LU, and recommended gain to reach a target LUFS (default -14 LUFS for streaming).',
      parameters: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            description: 'Absolute path to the audio or video file to analyze',
          },
          targetLufs: {
            type: 'number',
            description: 'Target integrated loudness in LUFS (default: -14)',
          },
        },
        required: ['source'],
      },
      category: 'analysis',
      isReadOnly: true,
      isConcurrencySafe: true,
      async execute(args): Promise<ToolResult> {
        const source = args['source'] as string;
        const targetLufs = (args['targetLufs'] as number | undefined) ?? -14;
        const data = await analyzeLoudness(source, targetLufs);
        return { success: true, data };
      },
    },
    {
      name: 'ExtractVideoFrame',
      description:
        'Extract a single frame from a video file at a specified time. ' +
        'Returns the frame as a base64-encoded JPEG string. ' +
        'Useful for thumbnail generation, visual inspection, and storyboard creation.',
      parameters: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            description: 'Absolute path to the video file',
          },
          time: {
            type: 'number',
            description: 'Time offset in seconds to extract the frame from',
          },
          width: {
            type: 'number',
            description: 'Optional max width for the extracted frame',
          },
          height: {
            type: 'number',
            description: 'Optional max height for the extracted frame',
          },
          quality: {
            type: 'number',
            description: 'JPEG quality 1-100 (default: 85)',
          },
        },
        required: ['source', 'time'],
      },
      category: 'analysis',
      isReadOnly: true,
      isConcurrencySafe: true,
      async execute(args): Promise<ToolResult> {
        const source = args['source'] as string;
        const time = args['time'] as number;
        const opts: { quality?: number; width?: number; height?: number } = {};
        if (args['quality'] != null) opts.quality = args['quality'] as number;
        if (args['width'] != null) opts.width = args['width'] as number;
        if (args['height'] != null) opts.height = args['height'] as number;

        const base64 = await extractFrameBase64(source, time, opts);
        if (!base64) {
          return { success: false, error: `Failed to extract frame from ${source} at ${time}s` };
        }

        return {
          success: true,
          data: {
            base64,
            mimeType: 'image/jpeg',
            source,
            time,
          },
        };
      },
    },
  ];
}

// =============================================================================
// Provider
// =============================================================================

class EngineCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-engine';
  readonly version = '1.0.0';

  getTools(_context: AgentCapabilityContext): Tool[] {
    return [...createEffectsTools(), ...createTranscribeTools(), ...createAnalysisTools()];
  }

  dispose(): void {
    // No retained resources.
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create the neko-engine capability provider for registration with neko-agent.
 */
export function createEngineCapabilityProvider(): AgentCapabilityProvider {
  return new EngineCapabilityProvider();
}
