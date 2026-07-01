import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createTool, ToolRegistry } from '@neko/agent';
import type { Tool } from '@neko/shared';

export const SAFE_ECHO_TOOL_NAME = 'NekoHarnessEcho';
export const SAFE_WRITE_TOOL_NAME = 'NekoHarnessWriteFile';
export const FAILING_TOOL_NAME = 'NekoHarnessFail';
export const VALIDATOR_TOOL_NAME = 'NekoHarnessValidateArtifact';

export interface SafeHarnessToolOptions {
  readonly workDir: string;
}

export function createSafeHarnessToolRegistry(options: SafeHarnessToolOptions): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerMany?.(createSafeHarnessTools(options));
  return registry;
}

export function createSafeHarnessTools(options: SafeHarnessToolOptions): Tool[] {
  return [
    createTool({
      name: SAFE_ECHO_TOOL_NAME,
      description: 'Return the provided message. Use this in harness tests when asked to call it.',
      category: 'system',
      isReadOnly: true,
      isConcurrencySafe: true,
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string' },
        },
        required: ['message'],
      },
      execute: async (args) => ({ success: true, data: { message: String(args.message ?? '') } }),
    }),
    createTool({
      name: SAFE_WRITE_TOOL_NAME,
      description: 'Write a UTF-8 text file inside the harness workspace only.',
      category: 'file',
      isConcurrencySafe: false,
      parameters: {
        type: 'object',
        properties: {
          relativePath: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['relativePath', 'content'],
      },
      execute: async (args) => {
        const relativePath = String(args.relativePath ?? '');
        const targetPath = resolveHarnessPath(options.workDir, relativePath);
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, String(args.content ?? ''), 'utf-8');
        return { success: true, data: { path: targetPath } };
      },
    }),
    createTool({
      name: FAILING_TOOL_NAME,
      description: 'Always fail with the provided reason. Use this to test recovery behavior.',
      category: 'system',
      isReadOnly: true,
      isConcurrencySafe: true,
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
        },
      },
      execute: async (args) => ({
        success: false,
        error: String(args.reason ?? 'Intentional harness failure'),
      }),
    }),
    createTool({
      name: VALIDATOR_TOOL_NAME,
      description: 'Validate that content contains the required marker.',
      category: 'analysis',
      isReadOnly: true,
      isConcurrencySafe: true,
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          requiredMarker: { type: 'string' },
        },
        required: ['content', 'requiredMarker'],
      },
      execute: async (args) => {
        const content = String(args.content ?? '');
        const requiredMarker = String(args.requiredMarker ?? '');
        if (!content.includes(requiredMarker)) {
          return {
            success: false,
            error: `validator-missing-marker:${requiredMarker}`,
            data: { requiredMarker },
          };
        }
        return { success: true, data: { requiredMarker } };
      },
    }),
  ];
}

function resolveHarnessPath(workDir: string, relativePath: string): string {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error('Harness write path must be a non-empty relative path');
  }
  const root = path.resolve(workDir);
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Harness write path escapes work directory: ${relativePath}`);
  }
  return target;
}
