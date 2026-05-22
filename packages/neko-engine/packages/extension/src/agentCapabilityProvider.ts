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
import {
  AUDIO_RENDER_SERVICE_PORT_ID,
  PUPPET_RENDER_SERVICE_PORT_ID,
  SCENE_RENDER_SERVICE_PORT_ID,
  TIMELINE_RENDER_SERVICE_PORT_ID,
  type AgentCapabilityProvider,
  type AgentCapabilityContext,
  type CreativeDomainMetadata,
  type NkpControlDriver,
  type NkpTransform2DEdit,
  type NkpTransformEditMode,
  type NkpVec2,
  type PuppetCommand,
  type PuppetCommandAck,
  type PuppetCommandEnvelope,
  type Tool,
  type ToolResult,
} from '@neko/shared';
import { TOOL_NAMES_EFFECTS, TOOL_NAMES_PUPPET, TOOL_NAMES_TRANSCRIBE } from '@neko/shared';

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

type NativePuppetToolArgs = Record<string, unknown>;

const MEDIA_DOMAIN: CreativeDomainMetadata = {
  id: 'timeline',
  source: 'engine-tool',
  servicePortId: TIMELINE_RENDER_SERVICE_PORT_ID,
};

const AUDIO_DOMAIN: CreativeDomainMetadata = {
  id: 'audio',
  source: 'engine-tool',
  servicePortId: AUDIO_RENDER_SERVICE_PORT_ID,
};

const SCENE_DOMAIN: CreativeDomainMetadata = {
  id: 'scene',
  source: 'engine-tool',
  servicePortId: SCENE_RENDER_SERVICE_PORT_ID,
};

const PUPPET_DOMAIN: CreativeDomainMetadata = {
  id: 'puppet',
  source: 'engine-tool',
  servicePortId: PUPPET_RENDER_SERVICE_PORT_ID,
};

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

async function getSceneSnapshot(): Promise<unknown> {
  return dispatchEngine('scenes', 'snapshot', {});
}

async function getPuppetSnapshot(): Promise<unknown> {
  return dispatchEngine('puppets', 'snapshot', {});
}

async function getNativePuppetCapabilities(): Promise<unknown> {
  return dispatchEngine('puppets', 'capabilities', {});
}

async function applyNativePuppetCommand(envelope: PuppetCommandEnvelope): Promise<PuppetCommandAck> {
  return dispatchEngine<PuppetCommandAck>('puppets', 'native_command', {
    ...envelope,
    command: envelope.command as unknown,
  });
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
      domain: MEDIA_DOMAIN,
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
      domain: MEDIA_DOMAIN,
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
      domain: MEDIA_DOMAIN,
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
      domain: AUDIO_DOMAIN,
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
      domain: AUDIO_DOMAIN,
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
      domain: MEDIA_DOMAIN,
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

function createSceneTools(): Tool[] {
  return [
    {
      name: 'InspectScene3D',
      description:
        'Inspect the current 3D scene graph and animation state from the engine scene service.',
      parameters: { type: 'object', properties: {} },
      category: 'analysis',
      domain: SCENE_DOMAIN,
      isReadOnly: true,
      isConcurrencySafe: true,
      async execute(): Promise<ToolResult> {
        const data = await getSceneSnapshot();
        return { success: true, data };
      },
    },
  ];
}

function createPuppetTools(): Tool[] {
  const nativeMutationPlanning = (required: readonly string[]) => ({
    safetyKind: 'non-destructive-mutation' as const,
    targetRequirements: {
      required,
      allowedFallbacks: ['selection' as const, 'explicit-user-input' as const],
    },
    queryBeforeMutate: {
      preferredQueryTools: [TOOL_NAMES_PUPPET.PUPPET_QUERY, 'InspectPuppet2D'],
      reason:
        'Resolve native puppet capability, current revision, and stable bone/BlendShape ids before mutating.',
    },
  });

  return [
    {
      name: 'InspectPuppet2D',
      description:
        'Inspect the current 2D puppet document, parameters, meshes, and animation state from the engine puppet service.',
      parameters: { type: 'object', properties: {} },
      category: 'analysis',
      domain: PUPPET_DOMAIN,
      isReadOnly: true,
      isConcurrencySafe: true,
      async execute(): Promise<ToolResult> {
        const data = await getPuppetSnapshot();
        return { success: true, data };
      },
    },
    {
      name: TOOL_NAMES_PUPPET.PUPPET_QUERY,
      description:
        'Query native 2D puppet capabilities, current command revision, available bones, BlendShapes, and legacy-only diagnostics.',
      parameters: { type: 'object', properties: {} },
      category: 'analysis',
      domain: PUPPET_DOMAIN,
      safetyKind: 'read-only-query',
      isReadOnly: true,
      isConcurrencySafe: true,
      async execute(): Promise<ToolResult> {
        const data = await getNativePuppetCapabilities();
        return { success: true, data };
      },
    },
    {
      name: TOOL_NAMES_PUPPET.PUPPET_CREATE_NATIVE,
      description:
        'Create a previewable native .nkp draft from PSD, PNG, or Live2D input and report diagnostics/confidence before committing authoring state.',
      parameters: {
        type: 'object',
        properties: {
          sourceKind: { type: 'string', enum: ['psd', 'png', 'live2d'] },
          sourcePath: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['sourceKind', 'sourcePath'],
      },
      category: 'generation',
      domain: PUPPET_DOMAIN,
      safetyKind: 'confirmation-gated',
      requiresConfirmation: true,
      targetRequirements: {
        required: ['sourceKind', 'sourcePath'],
        allowedFallbacks: ['explicit-user-input'],
        confirmationModes: ['commit'],
      },
      queryBeforeMutate: {
        preferredQueryTools: [TOOL_NAMES_PUPPET.PUPPET_QUERY],
        reason: 'Creation returns a draft artifact and diagnostics; committing generated state needs preview.',
      },
      traits: {
        cost: 'moderate',
        reversible: true,
        locality: 'hybrid',
        impactLevel: 'low',
      },
      async execute(args): Promise<ToolResult> {
        return previewRequired(TOOL_NAMES_PUPPET.PUPPET_CREATE_NATIVE, args, [
          'Native draft creation contracts are available in runtime-puppet.',
          'Persisting .nkp/.nkentity artifacts is handled by the export/packaging follow-up.',
        ]);
      },
    },
    {
      name: TOOL_NAMES_PUPPET.PUPPET_SET_EXPRESSION,
      description:
        'Apply a native puppet expression preset after querying native capabilities and current revision.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          seq: { type: 'integer' },
          baseRevision: { type: 'integer' },
          transactionId: { type: 'string' },
        },
        required: ['name', 'seq', 'baseRevision'],
      },
      category: 'media',
      domain: PUPPET_DOMAIN,
      ...nativeMutationPlanning(['name', 'seq', 'baseRevision']),
      async execute(args): Promise<ToolResult> {
        return applyNativeCommandTool(args, {
          type: 'setNativeExpression',
          name: requiredString(args, 'name'),
        });
      },
    },
    {
      name: TOOL_NAMES_PUPPET.PUPPET_SET_BLENDSHAPE,
      description:
        'Set a native puppet BlendShape weight with a revision-aware command envelope.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          weight: { type: 'number' },
          seq: { type: 'integer' },
          baseRevision: { type: 'integer' },
          transactionId: { type: 'string' },
        },
        required: ['name', 'weight', 'seq', 'baseRevision'],
      },
      category: 'media',
      domain: PUPPET_DOMAIN,
      ...nativeMutationPlanning(['name', 'weight', 'seq', 'baseRevision']),
      async execute(args): Promise<ToolResult> {
        return applyNativeCommandTool(args, {
          type: 'setNativeBlendShape',
          name: requiredString(args, 'name'),
          weight: requiredNumber(args, 'weight'),
        });
      },
    },
    {
      name: TOOL_NAMES_PUPPET.PUPPET_SET_BONE,
      description:
        'Set or offset a native Bone2D transform with a revision-aware command envelope.',
      parameters: {
        type: 'object',
        properties: {
          bone: { type: 'string' },
          transform: {
            type: 'object',
            properties: {
              position: { type: 'array', items: { type: 'number' } },
              rotation: { type: 'number' },
              scale: { type: 'array', items: { type: 'number' } },
            },
          },
          mode: { type: 'string', enum: ['set', 'offset'] },
          seq: { type: 'integer' },
          baseRevision: { type: 'integer' },
          transactionId: { type: 'string' },
        },
        required: ['bone', 'transform', 'seq', 'baseRevision'],
      },
      category: 'media',
      domain: PUPPET_DOMAIN,
      ...nativeMutationPlanning(['bone', 'transform', 'seq', 'baseRevision']),
      async execute(args): Promise<ToolResult> {
        return applyNativeCommandTool(args, {
          type: 'setNativeBoneTransform',
          bone: requiredString(args, 'bone'),
          transform: requiredTransform(args, 'transform'),
          mode: optionalTransformMode(args['mode']),
        });
      },
    },
    {
      name: TOOL_NAMES_PUPPET.PUPPET_SET_CONTROL_DRIVER,
      description:
        'Insert or replace a native puppet ControlDriver after querying native capability and target ids.',
      parameters: {
        type: 'object',
        properties: {
          driver: { type: 'object', properties: {} },
          seq: { type: 'integer' },
          baseRevision: { type: 'integer' },
          transactionId: { type: 'string' },
        },
        required: ['driver', 'seq', 'baseRevision'],
      },
      category: 'media',
      domain: PUPPET_DOMAIN,
      ...nativeMutationPlanning(['driver', 'seq', 'baseRevision']),
      async execute(args): Promise<ToolResult> {
        return applyNativeCommandTool(args, {
          type: 'upsertNativeControlDriver',
          driver: requiredControlDriver(args, 'driver'),
        });
      },
    },
    {
      name: TOOL_NAMES_PUPPET.PUPPET_PLAY_ANIMATION,
      description:
        'Play a native Bone2D + BlendShape animation clip with a revision-aware command envelope.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          loopAnim: { type: 'boolean' },
          seq: { type: 'integer' },
          baseRevision: { type: 'integer' },
          transactionId: { type: 'string' },
        },
        required: ['name', 'seq', 'baseRevision'],
      },
      category: 'media',
      domain: PUPPET_DOMAIN,
      ...nativeMutationPlanning(['name', 'seq', 'baseRevision']),
      async execute(args): Promise<ToolResult> {
        return applyNativeCommandTool(args, {
          type: 'playNativeAnimation',
          name: requiredString(args, 'name'),
          loopAnim: optionalBoolean(args['loopAnim']) ?? true,
        });
      },
    },
    {
      name: TOOL_NAMES_PUPPET.PUPPET_AUTO_RIG,
      description:
        'Run native puppet auto-rig analysis and return diagnostics for user preview before committing generated bones, weights, BlendShapes, or drivers.',
      parameters: {
        type: 'object',
        properties: {
          puppetId: { type: 'string' },
          mode: { type: 'string', enum: ['preview', 'commit'] },
        },
        required: ['mode'],
      },
      category: 'generation',
      domain: PUPPET_DOMAIN,
      safetyKind: 'confirmation-gated',
      requiresConfirmation: true,
      targetRequirements: {
        required: ['mode'],
        allowedFallbacks: ['selection', 'explicit-user-input'],
        confirmationModes: ['commit'],
      },
      queryBeforeMutate: {
        preferredQueryTools: [TOOL_NAMES_PUPPET.PUPPET_QUERY],
        reason: 'Auto-rig can rewrite generated rig data and must report diagnostics first.',
      },
      traits: {
        cost: 'moderate',
        reversible: true,
        locality: 'hybrid',
        impactLevel: 'low',
      },
      async execute(args): Promise<ToolResult> {
        return previewRequired(TOOL_NAMES_PUPPET.PUPPET_AUTO_RIG, args, [
          'Use native puppet creation draft fixtures or future AI analyzers to produce preview data.',
          'Commit mode requires authoring-state export support.',
        ]);
      },
    },
    {
      name: TOOL_NAMES_PUPPET.PUPPET_GENERATE_ANIMATION,
      description:
        'Generate native BoneTrack and BlendShapeTrack animation data as a draft for timeline preview.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          durationMs: { type: 'number' },
          puppetId: { type: 'string' },
        },
        required: ['prompt', 'durationMs'],
      },
      category: 'generation',
      domain: PUPPET_DOMAIN,
      safetyKind: 'confirmation-gated',
      requiresConfirmation: true,
      targetRequirements: {
        required: ['prompt', 'durationMs'],
        allowedFallbacks: ['selection', 'explicit-user-input'],
        confirmationModes: ['commit'],
      },
      queryBeforeMutate: {
        preferredQueryTools: [TOOL_NAMES_PUPPET.PUPPET_QUERY],
        reason: 'Animation generation needs native rig capabilities and should preview tracks first.',
      },
      traits: {
        cost: 'moderate',
        reversible: true,
        locality: 'hybrid',
        impactLevel: 'low',
      },
      async execute(args): Promise<ToolResult> {
        return previewRequired(TOOL_NAMES_PUPPET.PUPPET_GENERATE_ANIMATION, args, [
          'Native AnimationClip2D contracts are available.',
          'Text-to-motion generation and timeline commit are follow-up implementation tasks.',
        ]);
      },
    },
  ];
}

async function applyNativeCommandTool(
  args: NativePuppetToolArgs,
  command: PuppetCommand,
): Promise<ToolResult> {
  try {
    const capabilities = await getNativePuppetCapabilities();
    if (isLegacyOnlyPuppetCapability(capabilities)) {
      return legacyOnlyPuppetResult(capabilities);
    }
    const ack = await applyNativePuppetCommand({
      seq: requiredInteger(args, 'seq'),
      baseRevision: requiredInteger(args, 'baseRevision'),
      ...(typeof args['transactionId'] === 'string'
        ? { transactionId: args['transactionId'] }
        : {}),
      command,
    });

    if (ack.status === 'rejected') {
      return {
        success: false,
        error: ack.error?.message ?? 'Native puppet command rejected.',
        data: {
          code: ack.error?.code ?? 'applyFailed',
          ack,
        },
      };
    }

    return { success: true, data: ack };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function previewRequired(
  toolName: string,
  args: NativePuppetToolArgs,
  notes: readonly string[],
): ToolResult {
  return {
    success: true,
    data: {
      status: 'preview-required',
      toolName,
      request: args,
      diagnostics: [
        {
          code: 'native-puppet-preview-required',
          severity: 'info',
          message:
            'Native puppet generation returns draft data and diagnostics before committing authoring state.',
        },
        ...notes.map((message) => ({
          code: 'implementation-follow-up',
          severity: 'info',
          message,
        })),
      ],
    },
  };
}

function legacyOnlyPuppetResult(capabilities: unknown): ToolResult {
  return {
    success: false,
    error: 'Native puppet command requires a .nkp v2 bone-blendshape project.',
    data: {
      code: 'legacy-only-puppet',
      capabilities,
    },
  };
}

function isLegacyOnlyPuppetCapability(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return value['native'] === false || value['format'] === 'legacy';
}

function requiredString(args: NativePuppetToolArgs, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value;
}

function requiredNumber(args: NativePuppetToolArgs, key: string): number {
  const value = args[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${key} must be a finite number`);
  }
  return value;
}

function requiredInteger(args: NativePuppetToolArgs, key: string): number {
  const value = args[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${key} must be a non-negative integer`);
  }
  return value;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw new Error('loopAnim must be a boolean when provided');
  }
  return value;
}

function optionalTransformMode(value: unknown): NkpTransformEditMode | undefined {
  if (value === undefined) return undefined;
  if (value !== 'set' && value !== 'offset') {
    throw new Error('mode must be set or offset');
  }
  return value;
}

function requiredTransform(args: NativePuppetToolArgs, key: string): NkpTransform2DEdit {
  const value = args[key];
  if (!isRecord(value)) {
    throw new Error(`${key} must be an object`);
  }

  return {
    ...(value['position'] !== undefined ? { position: requiredVec2(value['position']) } : {}),
    ...(value['rotation'] !== undefined ? { rotation: requiredFinite(value['rotation']) } : {}),
    ...(value['scale'] !== undefined ? { scale: requiredVec2(value['scale']) } : {}),
  };
}

function requiredControlDriver(args: NativePuppetToolArgs, key: string): NkpControlDriver {
  const value = args[key];
  if (!isRecord(value)) {
    throw new Error(`${key} must be an object`);
  }
  if (
    typeof value['id'] !== 'string' ||
    !isRecord(value['source']) ||
    !isRecord(value['target']) ||
    !isRecord(value['curve']) ||
    !isControlBlendMode(value['blendMode']) ||
    typeof value['priority'] !== 'number'
  ) {
    throw new Error(`${key} must include id, source, target, curve, blendMode, and priority`);
  }
  return value as unknown as NkpControlDriver;
}

function requiredVec2(value: unknown): NkpVec2 {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every((item) => typeof item === 'number' && Number.isFinite(item))
  ) {
    throw new Error('expected [number, number]');
  }
  return [value[0] as number, value[1] as number];
}

function requiredFinite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('expected finite number');
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isControlBlendMode(value: unknown): value is NkpControlDriver['blendMode'] {
  return value === 'add' || value === 'override' || value === 'max';
}

// =============================================================================
// Provider
// =============================================================================

class EngineCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-engine';
  readonly version = '1.0.0';

  getTools(_context: AgentCapabilityContext): Tool[] {
    return [
      ...createEffectsTools(),
      ...createTranscribeTools(),
      ...createAnalysisTools(),
      ...createSceneTools(),
      ...createPuppetTools(),
    ];
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
