/**
 * Tool classification constants and summary extraction
 */

import { extractFilePath } from './media-extractors';

// Tool category constants
export const IMAGE_GENERATION_TOOLS = ['generate_image', 'image_generation', 'create_image', 'text_to_image'];
export const VIDEO_GENERATION_TOOLS = ['generate_video', 'video_generation', 'create_video', 'text_to_video'];
export const AUDIO_GENERATION_TOOLS = ['generate_audio', 'audio_generation', 'create_audio', 'text_to_audio', 'text_to_speech'];
export const FILE_TOOLS = ['read_file', 'write_file', 'edit_file', 'create_file', 'delete_file'];

/**
 * Extract smart summary from tool arguments based on tool type
 * Returns a concise string representation of the most important parameter
 */
export function getToolSummary(toolName: string, args: Record<string, unknown>): string {
  // File operations - show file name
  if (FILE_TOOLS.includes(toolName)) {
    const filePath = extractFilePath(args);
    if (filePath) {
      return filePath.split('/').pop() || filePath;
    }
  }

  // Search/find operations - show pattern
  const pattern = args['pattern'] || args['query'] || args['search'];
  if (typeof pattern === 'string') {
    return pattern.length > 30 ? pattern.slice(0, 30) + '...' : pattern;
  }

  // Command execution - show command
  const command = args['command'] || args['cmd'];
  if (typeof command === 'string') {
    return command.length > 40 ? command.slice(0, 40) + '...' : command;
  }

  // URL operations - show URL
  const url = args['url'];
  if (typeof url === 'string') {
    try {
      const u = new URL(url);
      return u.hostname + u.pathname.slice(0, 20);
    } catch {
      return url.slice(0, 40);
    }
  }

  // Fallback: show first string argument (truncated)
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string' && value.length > 0 && key !== 'id') {
      return value.length > 40 ? value.slice(0, 40) + '...' : value;
    }
  }

  return '';
}
