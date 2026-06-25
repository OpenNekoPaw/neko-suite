import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IService, IToolRegistry, Tool, ToolCategory, ToolResult } from '@neko/shared';
import { createAgentRuntimeSession, updateAgentRuntimeSession } from '../agent-session-factory';

class MemoryToolRegistry implements IToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  listByCategory(category: ToolCategory): Tool[] {
    return this.list().filter((tool) => tool.category === category);
  }

  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.get(name);
    if (!tool) {
      return { success: false, error: `Tool not found: ${name}` };
    }
    return tool.execute(args);
  }

  toToolDefinitions(): ReturnType<IToolRegistry['toToolDefinitions']> {
    return [];
  }
}

describe('Agent runtime shell policy', () => {
  const fixtureRoot = path.resolve(
    process.cwd(),
    '.test-workspaces',
    `agent-runtime-policy-${process.pid}`,
  );
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const mediaRoot = path.join(fixtureRoot, 'media');

  beforeEach(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.mkdir(mediaRoot, { recursive: true });
    await fs.writeFile(path.join(mediaRoot, 'panel.txt'), 'media panel\n', 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  it('does not register Bash in ordinary creative runtime sessions by default', async () => {
    const toolRegistry = new MemoryToolRegistry();
    await createAgentRuntimeSession({
      service: createService(),
      createService,
      toolRegistry,
      systemPrompt: 'system',
    });

    expect(toolRegistry.has('Bash')).toBe(false);
    expect(toolRegistry.list().map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['Read', 'Write', 'ListDirectory', 'Grep']),
    );
  });

  it('refreshes core file tools when authorized read roots change', async () => {
    const toolRegistry = new MemoryToolRegistry();
    const handle = await createAgentRuntimeSession({
      service: createService(),
      createService,
      toolRegistry,
      systemPrompt: 'system',
      workspaceRoot,
    });
    const mediaFile = path.join(mediaRoot, 'panel.txt');

    await expect(toolRegistry.execute('Read', { file_path: mediaFile })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('outside authorized read roots'),
    });

    updateAgentRuntimeSession(handle, {
      createService,
      toolRegistry,
      systemPrompt: 'system',
      workspaceRoot,
      authorizedReadRoots: [mediaRoot],
    });

    await expect(toolRegistry.execute('Read', { file_path: mediaFile })).resolves.toMatchObject({
      success: true,
      data: expect.objectContaining({
        content: expect.stringContaining('media panel'),
      }),
    });
    await expect(
      toolRegistry.execute('Write', { file_path: mediaFile, content: 'nope' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('outside authorized write roots'),
    });
  });
});

function createService(): IService {
  return {
    chat: vi.fn(),
    chatStream: vi.fn(),
    embed: vi.fn(),
  } as unknown as IService;
}
