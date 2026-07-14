import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const repositoryRoot = resolve(packageRoot, '../../../..');
const srcRoot = join(packageRoot, 'src');

describe('TUI Node adapter boundary', () => {
  it('does not depend on Agent Webview host runtime transport', () => {
    const forbiddenPatterns = [
      {
        pattern: /@neko-agent\/webview/u,
        replacement: 'TUI must call Platform/Agent runtime services directly.',
      },
      {
        pattern: /AgentHostRuntime|AgentHostMessages|VSCodeMessages/u,
        replacement: 'TUI must not use Agent Webview message transport.',
      },
      {
        pattern: /NEKO_AGENT_HOST_MESSAGE_EVENT|host-message-event/u,
        replacement: 'TUI has no Webview host message event channel.',
      },
      {
        pattern: /window\.vscodeApi|acquireVsCodeApi/u,
        replacement: 'VSCode globals belong only to graphical Webview transport adapters.',
      },
    ] as const;

    const violations = listProductionSources(srcRoot).flatMap((filePath) => {
      const source = readFileSync(filePath, 'utf8');
      return forbiddenPatterns
        .filter((forbidden) => forbidden.pattern.test(source))
        .map(
          (forbidden) =>
            `${relative(packageRoot, filePath)} uses ${forbidden.pattern}: ${forbidden.replacement}`,
        );
    });

    expect(violations).toEqual([]);
  });

  it('keeps config, tasks, skills, content access, and artifacts on Node/runtime services', () => {
    const platformBootstrap = readFileSync(join(srcRoot, 'core', 'platform-bootstrap.ts'), 'utf8');
    const runtimeBootstrap = readFileSync(join(srcRoot, 'core', 'runtime-bootstrap.ts'), 'utf8');
    const defaultCapabilities = readFileSync(
      join(srcRoot, 'host', 'tui-default-capabilities.ts'),
      'utf8',
    );
    const nodeHostAdapter = readFileSync(join(srcRoot, 'host', 'node-host-adapter.ts'), 'utf8');

    expect(platformBootstrap).toContain('FileUserConfigManager');
    expect(platformBootstrap).toContain('taskRecoveryStorage');
    expect(platformBootstrap).not.toContain('tasks.json');
    expect(platformBootstrap).toContain('createNodeWorkspaceContentHostAdapter');
    expect(platformBootstrap).toContain('createNodeContentAccessRuntime');
    expect(runtimeBootstrap).toContain('createNodeArtifactStore');
    expect(runtimeBootstrap).toContain('skillService');
    expect(defaultCapabilities).toContain('createNodeContentAccessRuntime');
    expect(defaultCapabilities).toContain('createNodeAssetsCapabilityProvider');
    expect(defaultCapabilities).toContain('createNodeEntitySearchCapabilityProviders');
    expect(nodeHostAdapter).toContain('createNodeHostAdapter');
  });

  it('loads the Assets headless subpath through the actual Node ESM loader', () => {
    const output = execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '--eval',
        [
          "import { createNekoAssetsHeadlessCapabilityProvider } from 'neko-assets/agent-headless';",
          "if (typeof createNekoAssetsHeadlessCapabilityProvider !== 'function') throw new Error('missing headless provider export');",
          "process.stdout.write('assets-headless-esm-ok');",
        ].join('\n'),
      ],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );

    expect(output).toBe('assets-headless-esm-ok');
  });

  it('bundles raw workspace TypeScript while preserving runtime-specific dynamic modules', () => {
    const buildConfig = readFileSync(join(packageRoot, 'tsup.config.ts'), 'utf8');
    const packageManifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      readonly scripts?: Readonly<Record<string, string>>;
    };

    expect(buildConfig).toContain("'@neko/markdown'");
    expect(buildConfig).toContain('splitting: true');
    expect(buildConfig).toContain('removeNodeProtocol: false');
    expect(buildConfig).toContain("'node:sqlite'");
    expect(buildConfig).toContain("createRequire } from 'node:module'");
    expect(buildConfig).toContain('createRequire(import.meta.url)');
    const bundleScript = packageManifest.scripts?.['build:bundle'];
    expect(bundleScript).toContain('--splitting');
    expect(bundleScript).toContain('--outdir=dist');
    expect(bundleScript).toContain('--entry-names=cli');
    expect(bundleScript).toContain('--external:bun:sqlite');
    expect(bundleScript).toContain('--external:node:sqlite');
    expect(bundleScript).toContain('createRequire(import.meta.url)');
  });
});

function listProductionSources(dirPath: string): readonly string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dirPath)) {
    const entryPath = join(dirPath, entry);
    const stat = statSync(entryPath);
    if (stat.isDirectory()) {
      if (entry === '__tests__') continue;
      result.push(...listProductionSources(entryPath));
      continue;
    }
    if (!isProductionSource(entryPath)) continue;
    result.push(entryPath);
  }
  return result;
}

function isProductionSource(filePath: string): boolean {
  if (!['.ts', '.tsx'].includes(extname(filePath))) return false;
  return !filePath.endsWith('.test.ts') && !filePath.endsWith('.test.tsx');
}
