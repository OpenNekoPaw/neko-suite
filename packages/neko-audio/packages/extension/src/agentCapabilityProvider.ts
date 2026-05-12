/**
 * NekoAudio Agent Capability Provider
 *
 * Provides audio editing and generation tools to neko-agent
 * via the AgentCapabilityProvider protocol.
 */

import type {
  AgentCapabilityProvider,
  AgentCapabilityContext,
  Tool,
  ToolGroup,
  ToolParameters,
  PromptFragment,
} from '@neko/shared';
import { ENGINE_AUDIO_EFFECT_TYPES, TOOL_NAMES_AUDIO } from '@neko/shared';
import type { AudioToolBridge, ToolResult } from './services/audioToolBridge';

const DOCUMENT_URI_PROPERTY = {
  type: 'string',
  description:
    'Target audio project document URI from GetAudioProjectInfo/ListAudioTracks. Uses the focused project if omitted.',
} as const;

const RENDERABLE_EFFECT_ENUM = [...ENGINE_AUDIO_EFFECT_TYPES];

export function createNekoAudioCapabilityProvider(
  bridge: AudioToolBridge,
): AgentCapabilityProvider {
  return new NekoAudioCapabilityProviderImpl(bridge);
}

function createAudioTool(
  bridge: AudioToolBridge,
  name: string,
  description: string,
  parameters: ToolParameters,
  options: Pick<Tool, 'isReadOnly' | 'isConcurrencySafe' | 'isDestructive'> = {},
): Tool {
  return {
    name,
    description,
    category: 'audio',
    parameters,
    ...options,
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      return bridge.executeAgentTool(name, args);
    },
  };
}

class NekoAudioCapabilityProviderImpl implements AgentCapabilityProvider {
  readonly id = 'neko-audio';
  readonly version = '1.0.0';

  constructor(private readonly _bridge: AudioToolBridge) {}

  getTools(context: AgentCapabilityContext): Tool[] {
    const bridge = this._bridge;
    const media = context.mediaService;

    const tools: Tool[] = [
      createAudioTool(
        bridge,
        TOOL_NAMES_AUDIO.GET_AUDIO_PROJECT_INFO,
        'Get information about the current audio project (tracks, BPM, sample rate, effects)',
        { type: 'object', properties: { documentUri: DOCUMENT_URI_PROPERTY } },
        { isReadOnly: true, isConcurrencySafe: true },
      ),

      createAudioTool(
        bridge,
        TOOL_NAMES_AUDIO.LIST_AUDIO_TRACKS,
        'List all tracks in the audio project with their properties',
        { type: 'object', properties: { documentUri: DOCUMENT_URI_PROPERTY } },
        { isReadOnly: true, isConcurrencySafe: true },
      ),

      createAudioTool(
        bridge,
        TOOL_NAMES_AUDIO.ADD_AUDIO_TRACK,
        'Add a new track to the audio project',
        {
          type: 'object',
          properties: {
            documentUri: DOCUMENT_URI_PROPERTY,
            trackId: { type: 'string', description: 'Optional ID for the new track' },
            name: { type: 'string', description: 'Track name' },
            trackType: { type: 'string', enum: ['audio'], description: 'Track type' },
          },
        },
      ),

      createAudioTool(
        bridge,
        TOOL_NAMES_AUDIO.REMOVE_AUDIO_TRACK,
        'Remove a track from the audio project',
        {
          type: 'object',
          properties: {
            documentUri: DOCUMENT_URI_PROPERTY,
            trackId: { type: 'string', description: 'ID of the track to remove' },
          },
          required: ['trackId'],
        },
        { isDestructive: true },
      ),

      createAudioTool(bridge, TOOL_NAMES_AUDIO.IMPORT_AUDIO, 'Import an audio file into a track', {
        type: 'object',
        properties: {
          documentUri: DOCUMENT_URI_PROPERTY,
          filePath: { type: 'string', description: 'Path to the audio file' },
          trackId: {
            type: 'string',
            description: 'Target track ID (optional, creates new track if omitted)',
          },
          name: { type: 'string', description: 'Name for the created track if trackId is omitted' },
        },
        required: ['filePath'],
      }),

      createAudioTool(
        bridge,
        TOOL_NAMES_AUDIO.SET_TRACK_VOLUME,
        'Set volume level for a track (0.0 to 2.0, where 1.0 is unity)',
        {
          type: 'object',
          properties: {
            documentUri: DOCUMENT_URI_PROPERTY,
            trackId: { type: 'string', description: 'Track ID' },
            volume: { type: 'number', description: 'Volume (0.0–2.0)' },
          },
          required: ['trackId', 'volume'],
        },
      ),

      createAudioTool(
        bridge,
        TOOL_NAMES_AUDIO.SET_TRACK_PAN,
        'Set pan position for a track (-1.0 left to 1.0 right, 0.0 center)',
        {
          type: 'object',
          properties: {
            documentUri: DOCUMENT_URI_PROPERTY,
            trackId: { type: 'string', description: 'Track ID' },
            pan: { type: 'number', description: 'Pan (-1.0 to 1.0)' },
          },
          required: ['trackId', 'pan'],
        },
      ),

      createAudioTool(
        bridge,
        TOOL_NAMES_AUDIO.SET_TRACK_PROPERTIES,
        'Update audio track metadata such as name, mute, lock, hidden, or main-track flag',
        {
          type: 'object',
          properties: {
            documentUri: DOCUMENT_URI_PROPERTY,
            trackId: { type: 'string', description: 'Track ID' },
            name: { type: 'string', description: 'Track name' },
            muted: { type: 'boolean', description: 'Whether the track is muted' },
            locked: { type: 'boolean', description: 'Whether the track is locked' },
            hidden: { type: 'boolean', description: 'Whether the track is hidden' },
            isMain: { type: 'boolean', description: 'Whether this is the main track' },
          },
          required: ['trackId'],
        },
      ),

      createAudioTool(
        bridge,
        TOOL_NAMES_AUDIO.APPLY_TRACK_EFFECT,
        'Apply an audio effect to a track (EQ, compressor, reverb, delay, etc.)',
        {
          type: 'object',
          properties: {
            documentUri: DOCUMENT_URI_PROPERTY,
            trackId: { type: 'string', description: 'Track ID' },
            effectType: {
              type: 'string',
              enum: RENDERABLE_EFFECT_ENUM,
              description: 'Effect type',
            },
            params: { type: 'object', description: 'Effect parameters' },
            enabled: { type: 'boolean', description: 'Whether the effect is enabled' },
          },
          required: ['trackId', 'effectType'],
        },
      ),

      createAudioTool(
        bridge,
        TOOL_NAMES_AUDIO.REMOVE_TRACK_EFFECT,
        'Remove an effect from a track',
        {
          type: 'object',
          properties: {
            documentUri: DOCUMENT_URI_PROPERTY,
            trackId: { type: 'string', description: 'Track ID' },
            effectId: { type: 'string', description: 'Effect ID to remove' },
          },
          required: ['trackId', 'effectId'],
        },
      ),

      createAudioTool(
        bridge,
        TOOL_NAMES_AUDIO.APPLY_MASTER_EFFECT,
        'Apply an effect to the master bus',
        {
          type: 'object',
          properties: {
            documentUri: DOCUMENT_URI_PROPERTY,
            effectType: {
              type: 'string',
              enum: RENDERABLE_EFFECT_ENUM,
              description: 'Effect type',
            },
            name: { type: 'string', description: 'Effect display name' },
            params: { type: 'object', description: 'Effect parameters' },
            enabled: { type: 'boolean', description: 'Whether the effect is enabled' },
          },
          required: ['effectType'],
        },
      ),

      createAudioTool(
        bridge,
        TOOL_NAMES_AUDIO.MIX_EXPORT,
        'Export the mixed audio project to a file',
        {
          type: 'object',
          properties: {
            documentUri: DOCUMENT_URI_PROPERTY,
            outputPath: { type: 'string', description: 'Output file path' },
            format: {
              type: 'string',
              enum: ['wav', 'mp3', 'flac', 'aac', 'ogg'],
              description: 'Output format',
            },
          },
          required: ['outputPath'],
        },
      ),

      createAudioTool(
        bridge,
        TOOL_NAMES_AUDIO.ANALYZE_AUDIO_LOUDNESS,
        'Analyze loudness of an audio file (integrated LUFS, true peak, loudness range)',
        {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Path to audio file' },
          },
          required: ['filePath'],
        },
        { isReadOnly: true },
      ),

      createAudioTool(
        bridge,
        TOOL_NAMES_AUDIO.AUDIO_DENOISE,
        'Apply available threshold-based cleanup to an audio file. Provide inputPath or filePath.',
        {
          type: 'object',
          properties: {
            inputPath: { type: 'string', description: 'Input audio file path. Preferred.' },
            filePath: { type: 'string', description: 'Alias for inputPath' },
            outputPath: { type: 'string', description: 'Output file path' },
          },
          anyOf: [{ required: ['inputPath'] }, { required: ['filePath'] }],
          required: ['outputPath'],
        },
      ),

      createAudioTool(
        bridge,
        TOOL_NAMES_AUDIO.STEM_SEPARATION,
        'Separate audio stems when a supported engine model is available',
        {
          type: 'object',
          properties: {
            inputPath: { type: 'string', description: 'Input audio file path' },
            outputDir: { type: 'string', description: 'Directory for separated stems' },
          },
          required: ['inputPath', 'outputDir'],
        },
        { isReadOnly: true },
      ),
    ];

    // Provider-direct media generation tools bypass project state because they do not edit .nka.
    if (media) {
      tools.push({
        name: TOOL_NAMES_AUDIO.GENERATE_MUSIC,
        description: 'Generate music using AI from a text prompt',
        category: 'audio',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'Music description/prompt' },
            duration: { type: 'number', description: 'Duration in seconds (default 30)' },
            style: { type: 'string', description: 'Music style/genre' },
          },
          required: ['prompt'],
        },
        async execute(args: Record<string, unknown>) {
          try {
            const result = await media.generateMusic?.({
              prompt: args.prompt as string,
              duration: args.duration as number,
              style: args.style as string,
            });
            return { success: true, data: result };
          } catch (e) {
            return { success: false, error: String(e) };
          }
        },
      });

      tools.push({
        name: TOOL_NAMES_AUDIO.GENERATE_SFX,
        description: 'Generate sound effects using AI from a text prompt',
        category: 'audio',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'Sound effect description' },
            duration: { type: 'number', description: 'Duration in seconds' },
          },
          required: ['prompt'],
        },
        async execute(args: Record<string, unknown>) {
          try {
            const result = await media.generateSFX?.({
              prompt: args.prompt as string,
              duration: args.duration as number,
            });
            return { success: true, data: result };
          } catch (e) {
            return { success: false, error: String(e) };
          }
        },
      });

      tools.push({
        name: TOOL_NAMES_AUDIO.GENERATE_VOICE,
        description: 'Generate voice/speech using AI from text',
        category: 'audio',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Text to speak' },
            voiceId: { type: 'string', description: 'Voice ID (optional)' },
          },
          required: ['text'],
        },
        async execute(args: Record<string, unknown>) {
          try {
            const result = await media.generateVoice?.({
              text: args.text as string,
              voiceId: args.voiceId as string,
            });
            return { success: true, data: result };
          } catch (e) {
            return { success: false, error: String(e) };
          }
        },
      });
    }

    return tools;
  }

  getToolGroups(): ToolGroup[] {
    return [
      {
        name: 'audio-editing',
        description: 'Multi-track audio editing and mixing tools',
        tools: Object.values(TOOL_NAMES_AUDIO),
        source: 'builtin',
        enabled: true,
      },
    ];
  }

  getPromptFragments(): PromptFragment[] {
    return [
      {
        id: 'neko-audio:conventions',
        priority: 60,
        content: [
          '## Audio Project Conventions',
          '- Audio projects use .nka format with multi-track timeline',
          '- Each track has volume (0–2), pan (-1 to 1), solo, mute, and effect chain',
          '- Master bus has its own effect chain and volume',
          `- Renderable effects use canonical hyphenated names: ${RENDERABLE_EFFECT_ENUM.join(', ')}`,
          '- Planned effects noise-reduction, pitch-shift, and time-stretch are UI-only and are not renderable yet',
          '- Call GetAudioProjectInfo first to obtain documentUri, then pass it to later project edit tools',
          '- Use ListAudioTracks to see track structure and current persisted mix values',
          '- Mix export renders all tracks with effects to a single file',
          '- GenerateMusic, GenerateSFX, and GenerateVoice are provider-direct media tools and do not mutate .nka project state',
        ].join('\n'),
      },
    ];
  }
}
