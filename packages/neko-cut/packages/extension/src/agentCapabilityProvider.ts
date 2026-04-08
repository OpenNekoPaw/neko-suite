/**
 * NekoCut Agent Capability Provider
 *
 * Provides timeline editing tools to neko-agent via the AgentCapabilityProvider protocol.
 * This replaces the `createNekoCutTools()` factory function that was previously maintained
 * inside neko-agent's extension code.
 *
 * Benefits of this approach:
 * - Tool definitions live alongside the domain code they operate on
 * - neko-cut owns its own tool naming, parameters, and semantics
 * - neko-agent doesn't need to import or know about NekoCut internals
 * - Tool registration/unregistration is automatic via the discovery service
 */

import type {
  AgentCapabilityProvider,
  AgentCapabilityContext,
  Tool,
  ToolGroup,
  ToolParameters,
  NekoCutAPI,
} from '@neko/shared';
import { TOOL_NAMES_TIMELINE, TOOL_NAMES_MEDIA } from '@neko/shared';

/**
 * Create the NekoCut capability provider.
 *
 * @param api The NekoCutAPI exports from the extension activation
 */
export function createNekoCutCapabilityProvider(api: NekoCutAPI): AgentCapabilityProvider {
  return new NekoCutCapabilityProviderImpl(api);
}

class NekoCutCapabilityProviderImpl implements AgentCapabilityProvider {
  readonly id = 'neko-cut';
  readonly version = '1.0.0';

  constructor(private readonly _api: NekoCutAPI) {}

  getTools(context: AgentCapabilityContext): Tool[] {
    const api = this._api;
    const media = context.mediaService;

    return [
      {
        name: TOOL_NAMES_TIMELINE.GET_TIMELINE_INFO,
        description: 'Get information about the current video timeline',
        category: 'timeline',
        isReadOnly: true,
        isConcurrencySafe: true,
        parameters: { type: 'object', properties: {} } satisfies ToolParameters,
        async execute() {
          return { success: true, data: await api.timeline.getInfo() };
        },
      },
      {
        name: TOOL_NAMES_TIMELINE.LIST_TIMELINE_ELEMENTS,
        description: 'List all elements in the current timeline',
        category: 'timeline',
        isReadOnly: true,
        isConcurrencySafe: true,
        parameters: { type: 'object', properties: {} } satisfies ToolParameters,
        async execute() {
          return { success: true, data: await api.timeline.listElements() };
        },
      },
      {
        name: TOOL_NAMES_TIMELINE.ADD_TIMELINE_ELEMENT,
        description: 'Add a new element to the timeline',
        category: 'timeline',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['video', 'audio', 'image', 'text', 'shape', 'subtitle'],
              description: 'Type of element to add',
            },
            trackId: {
              type: 'string',
              description: 'ID of the track to add the element to',
            },
            startTime: {
              type: 'number',
              description: 'Start time in seconds',
            },
            duration: {
              type: 'number',
              description: 'Duration in seconds',
            },
            source: {
              type: 'string',
              description: 'Source file path (for video/audio/image)',
            },
            content: {
              type: 'string',
              description: 'Text content (for text/subtitle elements)',
            },
          },
          required: ['type', 'trackId', 'startTime', 'duration'],
        } satisfies ToolParameters,
        async execute(args) {
          const data = await api.timeline.addElement({
            type: args.type as 'video' | 'audio' | 'image' | 'text' | 'shape' | 'subtitle',
            trackId: args.trackId as string,
            startTime: args.startTime as number,
            duration: args.duration as number,
            source: args.source as string | undefined,
            content: args.content as string | undefined,
          });
          return { success: true, data };
        },
      },
      {
        name: TOOL_NAMES_TIMELINE.UPDATE_TIMELINE_ELEMENT,
        description: 'Update an existing timeline element',
        category: 'timeline',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID of the element to update',
            },
            updates: {
              type: 'object',
              description: 'Properties to update',
            },
          },
          required: ['id', 'updates'],
        } satisfies ToolParameters,
        async execute(args) {
          await api.timeline.updateElement(
            args.id as string,
            args.updates as Record<string, unknown>,
          );
          return { success: true };
        },
      },
      {
        name: TOOL_NAMES_TIMELINE.DELETE_TIMELINE_ELEMENT,
        description: 'Delete an element from the timeline',
        category: 'timeline',
        isDestructive: true,
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID of the element to delete',
            },
          },
          required: ['id'],
        } satisfies ToolParameters,
        async execute(args) {
          await api.timeline.deleteElement(args.id as string);
          return { success: true };
        },
      },
      // GenerateVideoForClip — requires mediaService from context
      ...(media
        ? [
            {
              name: TOOL_NAMES_MEDIA.GENERATE_VIDEO_FOR_CLIP,
              description:
                'Generate an AI video clip from a text prompt and automatically add it to the NekoCut ' +
                'timeline. Optionally accepts a reference image (base64 PNG/JPEG) for image-to-video ' +
                'generation. Returns the new timeline element ID.',
              category: 'generation' as const,
              parameters: {
                type: 'object' as const,
                properties: {
                  prompt: {
                    type: 'string' as const,
                    description: 'Text description of the video to generate',
                  },
                  trackId: {
                    type: 'string' as const,
                    description: 'Timeline track ID to insert into (default: first video track)',
                  },
                  startTime: {
                    type: 'number' as const,
                    description: 'Start time in seconds (default: end of selected track)',
                  },
                  referenceImageBase64: {
                    type: 'string' as const,
                    description: 'Base64-encoded PNG/JPEG for image-to-video generation (optional)',
                  },
                  durationHint: {
                    type: 'number' as const,
                    description: 'Requested duration in seconds (default: 5)',
                  },
                },
                required: ['prompt'],
              },
              async execute(args: Record<string, unknown>) {
                const prompt = args.prompt as string;
                const durationHint = (args.durationHint as number | undefined) ?? 5;

                let task;
                try {
                  task = await media.generateVideo({
                    prompt,
                    referenceImageBase64: args.referenceImageBase64 as string | undefined,
                    durationSeconds: durationHint,
                  });
                } catch (err) {
                  return { success: false, error: `Video generation failed: ${String(err)}` };
                }

                let completed;
                try {
                  completed = await media.waitForTask(task.id, 10 * 60 * 1000);
                } catch (err) {
                  return { success: false, error: `Video generation timed out: ${String(err)}` };
                }

                if (completed.status !== 'completed' || !completed.outputs?.length) {
                  return { success: false, error: `Video generation ${completed.status}` };
                }

                const videoUrl = completed.outputs[0]!.url;
                const resolvedTrackId = (args.trackId as string) ?? 'track-0';
                const resolvedStartTime = (args.startTime as number) ?? 0;

                const elementId = await api.timeline.addElement({
                  type: 'video',
                  trackId: resolvedTrackId,
                  startTime: resolvedStartTime,
                  duration: durationHint,
                  source: videoUrl,
                });

                return {
                  success: true,
                  data: {
                    elementId,
                    trackId: resolvedTrackId,
                    startTime: resolvedStartTime,
                    videoUrl,
                  },
                };
              },
            } satisfies Tool,
          ]
        : []),
    ];
  }

  getToolGroups(): ToolGroup[] {
    return [
      {
        name: 'timeline-editing',
        description:
          'Timeline editing tools for NekoCut video editor — timeline, video, edit, cut, clip, element, track',
        tools: Object.values(TOOL_NAMES_TIMELINE),
        alwaysActive: false,
        source: 'builtin',
        enabled: true,
        loadingTier: 'eager',
      },
    ];
  }
}
