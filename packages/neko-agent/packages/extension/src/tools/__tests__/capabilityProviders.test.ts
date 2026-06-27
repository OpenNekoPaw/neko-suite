import { describe, expect, it, vi } from 'vitest';
import { TOOL_NAMES_SYSTEM } from '@neko/shared';
import { createDocumentReadCapabilityProvider } from '../documentCapabilityProvider';
import { createMediaReadCapabilityProvider } from '../mediaCapabilityProvider';
import { createSemanticCoverageCapabilityProvider } from '../searchCapabilityProvider';

const mocks = vi.hoisted(() => ({
  png1x1: new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  ]),
  getEngineClientProvider: vi.fn(() => ({})),
  contentAccessRuntime: {
    resolve: vi.fn(),
    resolveImageMetadata: vi.fn(async (input: { source: unknown }) => ({
      status: 'ready' as const,
      source: input.source,
      diagnostics: [],
      mimeType: 'image/png',
      width: 1,
      height: 1,
      sizeBytes: 25,
    })),
    resolveDocumentContent: vi.fn(),
    resolveDocumentImages: vi.fn(),
    loadProviderAsset: vi.fn(async (input: { source: unknown }) => ({
      status: 'ready' as const,
      source: input.source,
      diagnostics: [],
      bytes: mocks.png1x1,
      mimeType: 'image/png',
      sizeBytes: mocks.png1x1.byteLength,
    })),
    projectResource: vi.fn(),
  },
}));

vi.mock('../../services/engineClientProvider', () => ({
  getEngineClientProvider: mocks.getEngineClientProvider,
}));

vi.mock('../../bootstrap/capabilityBootstrap', () => ({
  getCapabilityRuntimeBindings: vi.fn(() => ({
    contentAccessRuntime: mocks.contentAccessRuntime,
  })),
}));

describe('extension tool capability providers', () => {
  it('exposes document read tools through the document-owned provider', () => {
    const provider = createDocumentReadCapabilityProvider();
    const tools = provider.getTools({ extensionContext: {} }).map((tool) => tool.name);

    expect(provider.id).toBe('neko-agent-platform-document');
    expect(tools).toEqual([TOOL_NAMES_SYSTEM.READ_DOCUMENT, TOOL_NAMES_SYSTEM.READ_DOCUMENT_IMAGE]);
    expect(provider.getToolGroups?.()).toEqual([
      expect.objectContaining({
        name: 'document-reading',
        tools: [TOOL_NAMES_SYSTEM.READ_DOCUMENT, TOOL_NAMES_SYSTEM.READ_DOCUMENT_IMAGE],
        loadingTier: 'resident',
      }),
    ]);
  });

  it('exposes image read through the media-owned provider', () => {
    const provider = createMediaReadCapabilityProvider();
    const tools = provider.getTools({ extensionContext: {} }).map((tool) => tool.name);

    expect(provider.id).toBe('neko-agent-platform-media');
    expect(tools).toEqual([TOOL_NAMES_SYSTEM.READ_IMAGE]);
    expect(provider.getToolGroups?.()).toEqual([
      expect.objectContaining({
        name: 'image-reading',
        tools: [TOOL_NAMES_SYSTEM.READ_IMAGE],
        loadingTier: 'resident',
      }),
    ]);
  });

  it('exposes semantic coverage through the search-owned provider', () => {
    const provider = createSemanticCoverageCapabilityProvider();
    const tools = provider.getTools({ extensionContext: {} }).map((tool) => tool.name);

    expect(provider.id).toBe('neko-search-semantic-coverage');
    expect(tools).toEqual([TOOL_NAMES_SYSTEM.QUERY_SEMANTIC_COVERAGE]);
    expect(provider.getToolGroups?.()).toEqual([
      expect.objectContaining({
        name: 'semantic-coverage',
        tools: [TOOL_NAMES_SYSTEM.QUERY_SEMANTIC_COVERAGE],
        loadingTier: 'resident',
      }),
    ]);
  });
});
