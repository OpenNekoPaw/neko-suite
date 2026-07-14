import { readdirSync, readFileSync, type Dirent } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../..');
const extensionRoots = [
  'packages/neko-cut/packages/extension/src',
  'packages/neko-preview/packages/extension/src',
  'packages/neko-puppet/packages/extension/src',
  'packages/neko-live/packages/extension/src',
  'packages/neko-model/packages/extension/src',
];

const allowedBinaryReadFiles = new Map<string, string[]>([
  // `.nkm` is a VS Code CustomDocument JSON project file. Binary `.gltf/.glb/.vrm`
  // sources are registered through EngineClient file access instead.
  [
    'packages/neko-model/packages/extension/src/editor/ModelDocument.ts',
    ['vscode.workspace.fs.readFile'],
  ],
  // Reads `.nkm` project JSON while model source bytes use token/sourceRef loading.
  [
    'packages/neko-model/packages/extension/src/editor/ModelEditorProvider.ts',
    ['vscode.workspace.fs.readFile'],
  ],
  // Reads `.nkm` project JSON for model motion/config export. Runtime model
  // source bytes are still registered through EngineClient file access.
  ['packages/neko-model/packages/extension/src/extension.ts', ['vscode.workspace.fs.readFile']],
  // Reads `.nkp` project JSON for CustomDocument open/revert. `.inp/.moc3`
  // binary source loads are sent as `loadPuppetSource`.
  [
    'packages/neko-puppet/packages/extension/src/editor/puppetEditorProvider.ts',
    ['vscode.workspace.fs.readFile'],
  ],
  // Live2D ZIP bundle import is intentionally host-owned: the extension host
  // validates ZIP metadata and resolves archive entries to runtime bytes.
  [
    'packages/neko-puppet/packages/extension/src/commands/index.ts',
    ['vscode.workspace.fs.readFile'],
  ],
  // Reads `.nkm/.nkp` avatar project JSON for live session selection; puppet/model
  // source binaries are loaded through engine sourceRef helpers.
  [
    'packages/neko-live/packages/extension/src/LivePanelProvider.ts',
    ['vscode.workspace.fs.readFile'],
  ],
  // Agent vision tool intentionally embeds a user-selected reference image into
  // an LLM request. It is not a playback/preview/model source read.
  ['packages/neko-puppet/packages/extension/src/agentCapabilityProvider.ts', ['fsp.readFile']],
  // LUT import reads a small `.cube` text payload before upload. Timeline
  // media/subtitle source reads use EngineClient file access.
  [
    'packages/neko-cut/packages/extension/src/editor/video/videoEditorProvider.ts',
    ['vscode.workspace.fs.readFile'],
  ],
]);

const allowedTextReadFiles = new Set([
  'packages/neko-cut/packages/extension/src/project/JviProjectLoader.ts',
  'packages/neko-cut/packages/extension/src/services/AssetService.ts',
  'packages/neko-cut/packages/extension/src/services/MarketShaderService.ts',
  'packages/neko-cut/packages/extension/src/services/ProjectSessionService.ts',
  'packages/neko-cut/packages/extension/src/services/ProxyService.ts',
  'packages/neko-preview/packages/extension/src/providers/AudioPreviewProvider.ts',
  'packages/neko-preview/packages/extension/src/providers/document/workspacePathResolver.ts',
]);

function listSourceFiles(root: string): string[] {
  const absRoot = resolve(repoRoot, root);
  const entries = readdirSync(absRoot, { withFileTypes: true });
  return entries.flatMap((entry: Dirent) => {
    const fullPath = resolve(absRoot, entry.name);
    const relPath = relative(repoRoot, fullPath);
    if (entry.isDirectory()) {
      if (entry.name === 'dist' || entry.name === 'node_modules' || entry.name === '__tests__') {
        return [];
      }
      return listSourceFiles(relPath);
    }
    return /\.(test|spec)\.(ts|tsx)$/.test(entry.name) || !/\.(ts|tsx)$/.test(entry.name)
      ? []
      : [relPath];
  });
}

function readSource(relPath: string): string {
  return readFileSync(resolve(repoRoot, relPath), 'utf8');
}

describe('engine file access architecture boundary', () => {
  it('keeps source media/model/puppet/subtitle binary reads behind engine file access', () => {
    const violations: string[] = [];
    const binaryReadPatterns: Array<{ label: string; pattern: RegExp }> = [
      { label: 'vscode.workspace.fs.readFile', pattern: /vscode\.workspace\.fs\.readFile/g },
      { label: 'fs.promises.readFile', pattern: /\bfs\.promises\.readFile/g },
      { label: 'fsp.readFile', pattern: /\bfsp\.readFile/g },
      { label: 'fs.readFile(', pattern: /(?<!\.)\bfs\.readFile\(/g },
      { label: 'readFileSync', pattern: /\breadFileSync\b/g },
      { label: 'fs.open(', pattern: /\bfs\.open\(/g },
      { label: 'createReadStream', pattern: /\bcreateReadStream\b/g },
    ];

    for (const root of extensionRoots) {
      for (const file of listSourceFiles(root)) {
        const source = readSource(file);
        for (const { label, pattern } of binaryReadPatterns) {
          if (!pattern.test(source)) continue;
          pattern.lastIndex = 0;
          const allowedPatterns = allowedBinaryReadFiles.get(file);
          if (allowedPatterns?.includes(label) || allowedTextReadFiles.has(file)) {
            continue;
          }
          violations.push(`${file}: ${label}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps migrated package entry points on EngineClient file access/sourceRef helpers', () => {
    const cutMessageHandler = readSource(
      'packages/neko-cut/packages/extension/src/editor/video/messageHandler.ts',
    );
    expect(cutMessageHandler).toContain('this.engineClient.registerFile');
    expect(cutMessageHandler).toContain('this.engineClient.readFileRange');
    expect(cutMessageHandler).not.toContain('fs.open(');

    const puppetProvider = readSource(
      'packages/neko-puppet/packages/extension/src/editor/puppetEditorProvider.ts',
    );
    expect(puppetProvider).toContain("type: 'loadPuppetSource'");
    expect(puppetProvider).toContain('loadLive2dBundleFromProject');
    expect(puppetProvider).toContain("type: 'loadPuppet',");
    expect(puppetProvider).toContain('loaded.runtime.mocData');

    const liveProvider = readSource(
      'packages/neko-live/packages/extension/src/LivePanelProvider.ts',
    );
    expect(liveProvider).toContain('client.loadPuppetSource(filePath)');
    expect(liveProvider).not.toContain('fs.readFileSync(filePath)');

    const modelProvider = readSource(
      'packages/neko-model/packages/extension/src/editor/ModelEditorProvider.ts',
    );
    expect(modelProvider).toContain('this.resolveModelEngineSource(filePath');
    expect(modelProvider).toContain('client.registerFile({');
    expect(modelProvider).toContain("purpose: 'model'");
    expect(modelProvider).toContain('client.loadModel({ token: source.token })');
    expect(modelProvider).not.toContain("type: 'loadModel'");
  });
});
