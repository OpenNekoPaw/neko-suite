import { describe, expect, it, vi } from 'vitest';
import { TOOL_NAMES_SYSTEM } from '@neko/shared';
import { registerExtensionTools } from '../toolBootstrap';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

const mocks = vi.hoisted(() => {
  const rootLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  rootLogger.child.mockReturnValue(rootLogger);
  return { rootLogger };
});

vi.mock('../../base', () => ({
  getRootLogger: () => mocks.rootLogger,
  getLogger: () => mocks.rootLogger,
}));

describe('toolBootstrap', () => {
  it('registers only agent-owned meta-tools', () => {
    const registered: string[] = [];
    const registry = {
      get: vi.fn(() => undefined),
      register: vi.fn((tool: { name: string }) => {
        registered.push(tool.name);
      }),
    };

    registerExtensionTools(registry, {} as never);

    expect(registered).toEqual([TOOL_NAMES_SYSTEM.LIST_PLUGIN_SKILLS]);
    expect(registered).not.toContain(TOOL_NAMES_SYSTEM.READ_DOCUMENT);
    expect(registered).not.toContain(TOOL_NAMES_SYSTEM.READ_IMAGE);
    expect(registered).not.toContain(TOOL_NAMES_SYSTEM.READ_DOCUMENT_IMAGE);
    expect(registered).not.toContain(TOOL_NAMES_SYSTEM.QUERY_SEMANTIC_COVERAGE);
  });

  it('skips already registered extension tools on re-registration', () => {
    const registry = {
      get: vi.fn((name: string) => ({ name })),
      register: vi.fn(),
    };

    registerExtensionTools(registry, {} as never);

    expect(registry.register).not.toHaveBeenCalled();
  });
});
