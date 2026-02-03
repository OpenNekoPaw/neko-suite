/**
 * NekoCut Tools - Tools for interacting with NekoCut extension
 */
import * as vscode from 'vscode';
import type { Tool } from '../api';

// Import NekoCut API type (will be available if NekoCut is installed)
interface NekoCutAPI {
  timeline: {
    getInfo(): Promise<unknown>;
    addElement(config: unknown): Promise<string>;
    updateElement(id: string, updates: unknown): Promise<void>;
    deleteElement(id: string): Promise<void>;
    listElements(): Promise<unknown[]>;
  };
}

/**
 * Create tools for NekoCut integration
 * Returns empty array if NekoCut is not installed
 */
export function createNekoCutTools(): Tool[] {
  const nekocutExt = vscode.extensions.getExtension<NekoCutAPI>('neko.nekocut');

  if (!nekocutExt) {
    console.log('[NekoAgent] NekoCut extension not found, skipping NekoCut tools');
    return [];
  }

  const getAPI = async (): Promise<NekoCutAPI> => {
    if (nekocutExt.isActive) {
      return nekocutExt.exports;
    }
    return nekocutExt.activate();
  };

  return [
    {
      name: 'GetTimelineInfo',
      description: 'Get information about the current video timeline',
      parameters: {},
      execute: async () => {
        const api = await getAPI();
        return api.timeline.getInfo();
      },
    },
    {
      name: 'ListTimelineElements',
      description: 'List all elements in the current timeline',
      parameters: {},
      execute: async () => {
        const api = await getAPI();
        return api.timeline.listElements();
      },
    },
    {
      name: 'AddTimelineElement',
      description: 'Add a new element to the timeline',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['video', 'audio', 'image', 'text', 'shape'],
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
        },
        required: ['type', 'trackId', 'startTime', 'duration'],
      },
      execute: async (args) => {
        const api = await getAPI();
        return api.timeline.addElement(args);
      },
    },
    {
      name: 'UpdateTimelineElement',
      description: 'Update an existing timeline element',
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
      },
      execute: async (args) => {
        const api = await getAPI();
        await api.timeline.updateElement(args.id as string, args.updates);
        return { success: true };
      },
    },
    {
      name: 'DeleteTimelineElement',
      description: 'Delete an element from the timeline',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'ID of the element to delete',
          },
        },
        required: ['id'],
      },
      execute: async (args) => {
        const api = await getAPI();
        await api.timeline.deleteElement(args.id as string);
        return { success: true };
      },
    },
  ];
}
