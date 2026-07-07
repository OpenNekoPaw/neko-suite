import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GetContextTool,
  ProviderCardRegistry,
  ToolCategoryRegistry,
  ToolGroupRegistry,
  ToolRegistry,
} from '@neko/agent';
import {
  TOOL_NAMES_ASSETS,
  TOOL_NAMES_ENTITY,
  TOOL_NAMES_SEARCH,
  TOOL_NAMES_SYSTEM,
} from '@neko/shared';
import { createTuiCapabilityLoader } from '../../core/tui-capability-loader';
import { withTuiDefaultCapabilityProviders } from '../tui-default-capabilities';

const createdPaths: string[] = [];

afterEach(() => {
  for (const target of createdPaths.splice(0).reverse()) {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

describe('withTuiDefaultCapabilityProviders', () => {
  it('registers content tools so GetContext(includeTools) can see ReadDocument and ReadImage', async () => {
    const workDir = createTempDir();
    const toolRegistry = new ToolRegistry();
    const toolGroupRegistry = new ToolGroupRegistry();
    const capabilityLoader = createTuiCapabilityLoader({
      toolRegistry,
      toolGroupRegistry,
      providerCardRegistry: new ProviderCardRegistry(),
    });

    const result = capabilityLoader.registerProviders(
      withTuiDefaultCapabilityProviders({ workDir }),
    );

    expect(result.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: 'neko-content-read',
          loaded: expect.arrayContaining([
            { kind: 'tool', name: TOOL_NAMES_SYSTEM.READ_DOCUMENT },
            { kind: 'tool', name: TOOL_NAMES_SYSTEM.READ_IMAGE },
            { kind: 'toolGroup', name: 'document-reading' },
            { kind: 'toolGroup', name: 'image-reading' },
          ]),
        }),
        expect.objectContaining({
          providerId: 'neko-assets',
          loaded: expect.arrayContaining([
            { kind: 'tool', name: TOOL_NAMES_ASSETS.LIST_ASSETS },
            { kind: 'tool', name: TOOL_NAMES_ASSETS.GET_ASSET },
            { kind: 'tool', name: TOOL_NAMES_ASSETS.IMPORT_ASSET },
          ]),
        }),
        expect.objectContaining({
          providerId: 'neko-entity',
          loaded: expect.arrayContaining([
            { kind: 'tool', name: TOOL_NAMES_ENTITY.LIST_CREATIVE_ENTITIES },
            { kind: 'tool', name: TOOL_NAMES_ENTITY.GET_CREATIVE_ENTITY },
          ]),
        }),
        expect.objectContaining({
          providerId: 'neko-search',
          loaded: expect.arrayContaining([
            { kind: 'tool', name: TOOL_NAMES_SEARCH.QUERY_PROJECT_SEARCH },
          ]),
        }),
      ]),
    );
    expect(toolRegistry.get(TOOL_NAMES_SYSTEM.READ_DOCUMENT)).toBeDefined();
    expect(toolRegistry.get(TOOL_NAMES_SYSTEM.READ_IMAGE)).toBeDefined();
    expect(toolRegistry.get(TOOL_NAMES_ASSETS.LIST_ASSETS)).toBeDefined();
    expect(toolRegistry.get(TOOL_NAMES_ENTITY.LIST_CREATIVE_ENTITIES)).toBeDefined();
    expect(toolRegistry.get(TOOL_NAMES_SEARCH.QUERY_PROJECT_SEARCH)).toBeDefined();

    const categoryRegistry = new ToolCategoryRegistry();
    for (const group of toolGroupRegistry.listEnabled()) {
      for (const toolName of group.tools) {
        categoryRegistry.categorizeTool(toolName, 'system', 'always');
      }
    }
    const context = await new GetContextTool(categoryRegistry, toolGroupRegistry).execute({
      includeTools: true,
    });

    expect(readContextToolNames(context.data)).toEqual(
      expect.arrayContaining([TOOL_NAMES_SYSTEM.READ_DOCUMENT, TOOL_NAMES_SYSTEM.READ_IMAGE]),
    );
  });

  it('loads asset summaries through the asset-owned runtime without exposing .neko files', async () => {
    const workDir = createTempDir();
    const assetLibraryPath = path.join(workDir, 'neko', 'assets', 'library.json');
    fs.mkdirSync(path.dirname(assetLibraryPath), { recursive: true });
    fs.writeFileSync(
      assetLibraryPath,
      JSON.stringify({
        version: 1,
        entities: [
          {
            id: 'asset-hero',
            name: 'Hero Concept',
            category: 'character',
            description: 'Main character key art',
            metadata: {},
            variants: [
              {
                id: 'asset-hero-variant',
                entityId: 'asset-hero',
                name: 'Default',
                attributes: {},
                files: [
                  {
                    id: 'asset-hero-file',
                    variantId: 'asset-hero-variant',
                    name: 'Hero Concept',
                    path: '${A}/assets/hero.png',
                    mediaType: 'image',
                    metadata: {},
                    createdAt: 1,
                  },
                ],
                createdAt: 1,
              },
            ],
            tags: ['lead'],
            usageCount: 0,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      }),
      'utf8',
    );
    const toolRegistry = new ToolRegistry();
    createTuiCapabilityLoader({
      toolRegistry,
      toolGroupRegistry: new ToolGroupRegistry(),
      providerCardRegistry: new ProviderCardRegistry(),
    }).registerProviders(withTuiDefaultCapabilityProviders({ workDir }));

    const result = await toolRegistry.execute(TOOL_NAMES_ASSETS.LIST_ASSETS, {
      query: 'Hero',
    });

    expect(result).toMatchObject({
      success: true,
      data: {
        assets: [
          expect.objectContaining({
            id: 'asset-hero',
            name: 'Hero Concept',
            category: 'character',
          }),
        ],
      },
    });
    expect(JSON.stringify(result.data)).not.toContain('neko/assets/library.json');
  });

  it('loads entity and search projections without exposing backing managed files', async () => {
    const workDir = createTempDir();
    fs.writeFileSync(
      path.join(workDir, 'characters.json'),
      JSON.stringify({
        version: 1,
        characters: [
          {
            id: 'char_xiaoju',
            canonicalName: '小橘',
            displayName: '小橘',
            aliases: ['Xiaoju'],
            status: 'confirmed',
          },
        ],
      }),
      'utf8',
    );
    fs.mkdirSync(path.join(workDir, '.neko', 'semantic-index'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, '.neko', 'semantic-index', 'index.json'),
      JSON.stringify({ internal: true }),
      'utf8',
    );

    const toolRegistry = new ToolRegistry();
    createTuiCapabilityLoader({
      toolRegistry,
      toolGroupRegistry: new ToolGroupRegistry(),
      providerCardRegistry: new ProviderCardRegistry(),
    }).registerProviders(withTuiDefaultCapabilityProviders({ workDir }));

    const entities = await toolRegistry.execute(TOOL_NAMES_ENTITY.LIST_CREATIVE_ENTITIES, {
      query: '小橘',
    });
    const search = await toolRegistry.execute(TOOL_NAMES_SEARCH.QUERY_PROJECT_SEARCH, {
      query: '小橘',
      partitions: ['creative-entities'],
    });

    expect(entities).toMatchObject({
      success: true,
      data: {
        entities: [
          expect.objectContaining({
            id: 'char_xiaoju',
            kind: 'character',
            label: '小橘',
          }),
        ],
      },
    });
    expect(search).toMatchObject({
      success: true,
      data: {
        items: [
          expect.objectContaining({
            id: 'creative-entity:char_xiaoju',
            kind: 'creative-entity',
            label: '小橘',
          }),
        ],
      },
    });
    expect(JSON.stringify(entities.data)).not.toContain('.neko');
    expect(JSON.stringify(search.data)).not.toContain('.neko');
    expect(JSON.stringify(search.data)).not.toContain('semantic-index');
  });
});

function readContextToolNames(data: unknown): string[] {
  if (!isRecord(data) || !Array.isArray(data['tools'])) {
    return [];
  }
  return data['tools'].flatMap((category) => {
    if (!isRecord(category) || !Array.isArray(category['tools'])) {
      return [];
    }
    return category['tools'].filter((toolName): toolName is string => typeof toolName === 'string');
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-tui-capabilities-'));
  createdPaths.push(dir);
  return dir;
}
