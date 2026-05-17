import { describe, expect, it, vi } from 'vitest';
import { TOOL_NAMES_SYSTEM } from '@neko/shared';
import { registerExtensionToolGroups, registerExtensionTools } from '../toolBootstrap';

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
  it('registers the agent-owned document reader tool', () => {
    const registered: string[] = [];
    const registry = {
      get: vi.fn(() => undefined),
      register: vi.fn((tool: { name: string }) => {
        registered.push(tool.name);
      }),
    };

    registerExtensionTools(registry, {} as never);

    expect(registered).toContain(TOOL_NAMES_SYSTEM.LIST_PLUGIN_SKILLS);
    expect(registered).toContain(TOOL_NAMES_SYSTEM.READ_DOCUMENT);
  });

  it('skips already registered extension tools on re-registration', () => {
    const registry = {
      get: vi.fn((name: string) => ({ name })),
      register: vi.fn(),
    };

    registerExtensionTools(registry, {} as never);

    expect(registry.register).not.toHaveBeenCalled();
  });

  it('registers ReadDocument as a resident document tool group', () => {
    const registry = {
      register: vi.fn(),
    };

    registerExtensionToolGroups(registry as never);

    expect(registry.register).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'document-reading',
        tools: [TOOL_NAMES_SYSTEM.READ_DOCUMENT],
        loadingTier: 'resident',
        alwaysActive: true,
        enabled: true,
      }),
    );
  });
});
