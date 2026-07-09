import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const rendererRoot = join(packageRoot, 'src/renderer');
const mainRoot = join(packageRoot, 'src/main');
const preloadRoot = join(packageRoot, 'src/preload');

const forbiddenRendererImports = [
  {
    pattern: /(?:from\s+|import\s*\(\s*)['"]electron['"]/u,
    reason: 'renderer must use the preload bridge instead of Electron APIs',
  },
  {
    pattern: /(?:from\s+|import\s*\(\s*)['"]node:/u,
    reason: 'renderer must not import Node built-ins',
  },
  {
    pattern: /(?:from\s+|import\s*\(\s*)['"]vscode['"]/u,
    reason: 'desktop renderer is not a VSCode Webview',
  },
  {
    pattern: /window\.vscodeApi|acquireVsCodeApi/u,
    reason: 'renderer package roots must use injected host adapters, not VSCode globals',
  },
  {
    pattern: /sendAgentWebviewMessage/u,
    reason: 'migrated Agent roots must use the scoped sendAgentRuntimeMessage bridge',
  },
  {
    pattern: /(?:from\s+|import\s*\(\s*)['"][^'"]*\/main(?:\/|['"])/u,
    reason: 'renderer must not import Electron main internals',
  },
  {
    pattern: /(?:from\s+|import\s*\(\s*)['"][^'"]*\/preload(?:\/|['"])/u,
    reason: 'renderer must not import preload internals',
  },
  {
    pattern: /(?:from\s+|import\s*\(\s*)['"][^'"]*(?:neko-engine|@neko\/neko-client)[^'"]*['"]/u,
    reason: 'renderer must not own Engine process or media truth',
  },
];

describe('desktop renderer architecture boundary', () => {
  it('does not import Node, Electron, VSCode, main/preload, or Engine internals', async () => {
    const files = await listSourceFiles(rendererRoot);
    const violations: string[] = [];

    for (const file of files) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) {
        continue;
      }

      const source = await readFile(file, 'utf8');
      for (const forbidden of forbiddenRendererImports) {
        if (forbidden.pattern.test(source)) {
          violations.push(`${relative(packageRoot, file)}: ${forbidden.reason}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps Electron main and preload entries free of React imports', async () => {
    const files = [...(await listSourceFiles(mainRoot)), ...(await listSourceFiles(preloadRoot))];
    const violations: string[] = [];

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      if (/(?:from\s+|import\s*\(\s*)['"]react(?:\/|['"])/u.test(source)) {
        violations.push(relative(packageRoot, file));
      }
    }

    expect(violations).toEqual([]);
  });

  it('quarantines the legacy VSCode-shaped global shim to preload only', async () => {
    const files = [
      ...(await listSourceFiles(join(packageRoot, 'src/shared'))),
      ...(await listSourceFiles(mainRoot)),
      ...(await listSourceFiles(preloadRoot)),
      ...(await listSourceFiles(rendererRoot)),
    ];
    const violations: string[] = [];

    for (const file of files) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) {
        continue;
      }
      const source = await readFile(file, 'utf8');
      const relativePath = relative(packageRoot, file);
      const mentionsLegacyGlobal =
        source.includes('DESKTOP_LEGACY_VSCODE_API_GLOBAL') || source.includes('vscodeApi');
      if (!mentionsLegacyGlobal) {
        continue;
      }
      if (relativePath === 'src/shared/contracts.ts' || relativePath === 'src/preload/index.ts') {
        continue;
      }
      violations.push(`${relativePath}: legacy VSCode shim is allowed only in contracts/preload`);
    }

    const preloadSource = await readFile(join(preloadRoot, 'index.ts'), 'utf8');
    expect(preloadSource).toContain('Migration-only shim');
    expect(preloadSource).toContain('sendAgentRuntimeMessage');
    expect(violations).toEqual([]);
  });
});

async function listSourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = join(root, entry.name);
      if (entry.isDirectory()) {
        return listSourceFiles(absolutePath);
      }
      if (entry.isFile() && isSourceExtension(extname(entry.name))) {
        return [absolutePath];
      }
      return [];
    }),
  );
  return files.flat();
}

function isSourceExtension(extension: string): boolean {
  return extension === '.ts' || extension === '.tsx';
}
