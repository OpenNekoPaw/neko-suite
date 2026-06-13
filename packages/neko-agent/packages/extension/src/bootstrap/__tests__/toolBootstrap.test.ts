import { describe, expect, it, vi } from 'vitest';
import { TOOL_NAMES_SYSTEM } from '@neko/shared';
import {
  LEGACY_CENTRALIZED_TOOL_REGISTRATION_METADATA,
  registerExtensionToolGroups,
  registerExtensionTools,
} from '../toolBootstrap';

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
    expect(registered).toContain(TOOL_NAMES_SYSTEM.READ_IMAGE);
    expect(registered).toContain(TOOL_NAMES_SYSTEM.READ_DOCUMENT_IMAGE);
    expect(registered).toContain(TOOL_NAMES_SYSTEM.QUERY_SEMANTIC_COVERAGE);
    expect(new Set(registered)).toEqual(
      new Set(LEGACY_CENTRALIZED_TOOL_REGISTRATION_METADATA.map((entry) => entry.toolName)),
    );
  });

  it('skips already registered extension tools on re-registration', () => {
    const registry = {
      get: vi.fn((name: string) => ({ name })),
      register: vi.fn(),
    };

    registerExtensionTools(registry, {} as never);

    expect(registry.register).not.toHaveBeenCalled();
  });

  it('registers document and image readers as a resident document tool group', () => {
    const registry = {
      register: vi.fn(),
    };

    registerExtensionToolGroups(registry as never);

    expect(registry.register).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'document-reading',
        tools: [
          TOOL_NAMES_SYSTEM.READ_DOCUMENT,
          TOOL_NAMES_SYSTEM.READ_IMAGE,
          TOOL_NAMES_SYSTEM.READ_DOCUMENT_IMAGE,
          TOOL_NAMES_SYSTEM.QUERY_SEMANTIC_COVERAGE,
        ],
        loadingTier: 'resident',
        alwaysActive: true,
        enabled: true,
      }),
    );
  });

  it('documents every remaining centralized tool with LCD lifecycle metadata', () => {
    expect(LEGACY_CENTRALIZED_TOOL_REGISTRATION_METADATA).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolName: TOOL_NAMES_SYSTEM.LIST_PLUGIN_SKILLS,
          kind: 'agent-owned-meta-tool',
          lcdId: 'LCD-002',
        }),
        expect.objectContaining({
          toolName: TOOL_NAMES_SYSTEM.READ_DOCUMENT,
          kind: 'compatibility-bridge',
          lcdId: 'LCD-002',
        }),
      ]),
    );

    for (const entry of LEGACY_CENTRALIZED_TOOL_REGISTRATION_METADATA) {
      expect(entry.owner).toBeTruthy();
      expect(entry.replacement).toBeTruthy();
      expect(entry.removeAfter).toBeTruthy();
      expect(entry.tests.length).toBeGreaterThan(0);
    }
  });
});
