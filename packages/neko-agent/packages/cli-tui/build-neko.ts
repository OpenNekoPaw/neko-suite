/**
 * Bun build script for neko standalone binary
 *
 * Uses a plugin to stub react-devtools-core (ink's optional devtools dependency).
 * Ink only loads devtools.js via dynamic import(), so stubbing is safe.
 *
 * Output: packages/neko-agent/neko
 */
import { existsSync, readFileSync, renameSync, readdirSync, statSync } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';

const outdir = resolve(import.meta.dir, '../../');
const stubPath = resolve(import.meta.dir, 'src/stubs/react-devtools-core.ts');
const signalExitStubPath = resolve(import.meta.dir, 'src/stubs/signal-exit.ts');
const repoRoot = resolve(import.meta.dir, '../../../..');

const workspacePackages = new Map<string, string>([
  ['@neko/skills', resolve(repoRoot, 'packages/neko-skills')],
  ['@neko-agent/types', resolve(repoRoot, 'packages/neko-agent/packages/agent-types')],
  ['@neko/agent', resolve(repoRoot, 'packages/neko-agent/packages/agent')],
  ['@neko/ai-sdk', resolve(repoRoot, 'packages/neko-agent/packages/ai-sdk')],
  ['@neko/asset', resolve(repoRoot, 'packages/neko-assets/packages/asset')],
  ['@neko/content', resolve(repoRoot, 'packages/neko-content')],
  ['@neko/entity', resolve(repoRoot, 'packages/neko-entity')],
  ['@neko/host', resolve(repoRoot, 'packages/neko-host')],
  ['@neko/market-core', resolve(repoRoot, 'packages/neko-market/packages/core')],
  ['@neko/platform', resolve(repoRoot, 'packages/neko-agent/packages/platform')],
  ['@neko/search', resolve(repoRoot, 'packages/neko-search')],
  ['@neko/shared', resolve(repoRoot, 'packages/neko-types')],
  ['neko-assets', resolve(repoRoot, 'packages/neko-assets')],
]);

const rootPnpmStore = resolve(repoRoot, 'node_modules/.pnpm');

const result = await Bun.build({
  entrypoints: ['./src/cli.tsx'],
  outdir,
  target: 'bun',
  compile: true,
  minify: true,
  plugins: [
    {
      name: 'stub-react-devtools-core',
      setup(build) {
        // Stub ink's optional devtools integration (only used in React DevTools workflow)
        build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
          path: stubPath,
          namespace: 'file',
        }));
      },
    },
    {
      name: 'stub-signal-exit',
      setup(build) {
        // Bun compile currently wraps signal-exit@3's CommonJS export as an object,
        // while Ink imports it as a default callable. Keep this shim scoped to the
        // standalone binary build so the normal Node package keeps the real module.
        build.onResolve({ filter: /^signal-exit$/ }, () => ({
          path: signalExitStubPath,
          namespace: 'file',
        }));
      },
    },
    {
      name: 'workspace-and-pnpm-resolution',
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
          const packageImportPath = resolvePackageImport(args.path, args.importer);
          if (packageImportPath) {
            return { path: packageImportPath, namespace: 'file' };
          }

          const workspacePath = resolveWorkspacePackage(args.path);
          if (workspacePath) {
            return { path: workspacePath, namespace: 'file' };
          }

          const packagePath = resolveRootPnpmPackage(args.path);
          if (packagePath) {
            return { path: packagePath, namespace: 'file' };
          }

          return undefined;
        });
      },
    },
    {
      name: 'raw-markdown-imports',
      setup(build) {
        build.onResolve({ filter: /\.md\?raw$/ }, (args) => {
          const markdownPath = args.path.replace(/\?raw$/, '');
          return {
            path: isAbsolute(markdownPath) ? markdownPath : resolve(args.resolveDir, markdownPath),
            namespace: 'raw-markdown',
          };
        });

        build.onLoad({ filter: /\.md$/, namespace: 'raw-markdown' }, (args) => ({
          contents: `export default ${JSON.stringify(readFileSync(args.path, 'utf8'))};`,
          loader: 'js',
        }));
      },
    },
  ],
});

if (!result.success) {
  for (const message of result.logs) {
    console.error(message);
  }
  process.exit(1);
}

// Bun names the output after the entrypoint file (cli.tsx -> cli); rename it to neko.
const outputPath = result.outputs[0]?.path;
if (outputPath) {
  const finalPath = join(outdir, 'neko');
  renameSync(outputPath, finalPath);
  console.log(`Built: ${finalPath}`);
}

function resolvePackageImport(specifier: string, importer: string): string | undefined {
  if (!specifier.startsWith('#') || !importer) return undefined;
  const packageRoot = findOwningPackageRoot(dirname(importer));
  if (!packageRoot) return undefined;
  const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
    readonly imports?: unknown;
  };
  if (!isRecord(packageJson.imports)) return undefined;
  const target = readConditionalPackageImport(packageJson.imports[specifier]);
  if (!target || !target.startsWith('./')) return undefined;
  return resolveFileCandidate(resolve(packageRoot, target));
}

function findOwningPackageRoot(startDirectory: string): string | undefined {
  let current = startDirectory;
  while (true) {
    if (existsSync(resolve(current, 'package.json'))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function readConditionalPackageImport(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!isRecord(value)) return undefined;
  for (const key of ['bun', 'node', 'import', 'default']) {
    const candidate = readConditionalPackageImport(value[key]);
    if (candidate) return candidate;
  }
  return undefined;
}

function resolveWorkspacePackage(specifier: string): string | undefined {
  const packageName = readPackageName(specifier);
  if (!packageName) return undefined;
  const packageRoot = workspacePackages.get(packageName);
  if (!packageRoot) return undefined;
  const subpath = specifier.slice(packageName.length).replace(/^\//, '');
  return resolvePackageExport(packageRoot, subpath);
}

function resolveRootPnpmPackage(specifier: string): string | undefined {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) {
    return undefined;
  }
  const packageName = readPackageName(specifier);
  if (!packageName) return undefined;
  const packageRoot = findRootPnpmPackageRoot(packageName);
  if (!packageRoot) return undefined;
  const subpath = specifier.slice(packageName.length).replace(/^\//, '');
  return resolvePackageExport(packageRoot, subpath);
}

function resolvePackageExport(packageRoot: string, subpath: string): string | undefined {
  const packageJsonPath = resolve(packageRoot, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    readonly exports?: unknown;
    readonly module?: string;
    readonly main?: string;
  };
  const exportPath = readPackageExport(packageJson, subpath);
  if (exportPath) {
    const resolvedExport = resolvePackageTarget(packageRoot, exportPath, subpath);
    if (resolvedExport) return resolvedExport;
  }
  if (subpath) {
    const resolvedSubpath = resolveFileCandidate(resolve(packageRoot, subpath));
    if (resolvedSubpath) return resolvedSubpath;
  }
  const entry = readPackageEntry(packageJson) ?? 'index.js';
  return resolveFileCandidate(resolve(packageRoot, entry));
}

function findRootPnpmPackageRoot(packageName: string): string | undefined {
  if (!existsSync(rootPnpmStore)) return undefined;
  const escapedName = packageName.replace('/', '+');
  const matches = readdirSync(rootPnpmStore)
    .filter((entry) => entry === packageName || entry.startsWith(`${escapedName}@`))
    .sort()
    .reverse();
  for (const match of matches) {
    const root = resolve(rootPnpmStore, match, 'node_modules', packageName);
    if (existsSync(resolve(root, 'package.json'))) return root;
  }
  return undefined;
}

function readPackageName(specifier: string): string | undefined {
  const parts = specifier.split('/');
  if (specifier.startsWith('@')) {
    const [scope, name] = parts;
    return scope && name ? `${scope}/${name}` : undefined;
  }
  return parts[0];
}

function readPackageExport(
  packageJson: {
    readonly exports?: unknown;
  },
  subpath: string,
): string | undefined {
  const exports = packageJson.exports;
  if (!subpath) {
    if (typeof exports === 'string') return exports;
    if (isRecord(exports))
      return readConditionalExport(exports['.']) ?? readConditionalExport(exports);
    return undefined;
  }
  if (!isRecord(exports)) return undefined;
  const key = `./${subpath.replace(/\.ts$/, '')}`;
  const direct = readConditionalExport(exports[key]);
  if (direct) return direct;
  for (const [exportKey, exportValue] of Object.entries(exports)) {
    if (!exportKey.includes('*')) continue;
    const prefix = exportKey.slice(0, exportKey.indexOf('*'));
    const suffix = exportKey.slice(exportKey.indexOf('*') + 1);
    const lookup = `./${subpath}`;
    if (!lookup.startsWith(prefix) || !lookup.endsWith(suffix)) continue;
    const wildcard = lookup.slice(prefix.length, lookup.length - suffix.length);
    const conditional = readConditionalExport(exportValue);
    if (conditional) return conditional.replace('*', wildcard);
  }
  return undefined;
}

function readPackageEntry(packageJson: {
  readonly exports?: unknown;
  readonly module?: string;
  readonly main?: string;
}): string | undefined {
  if (typeof packageJson.exports === 'string') return packageJson.exports;
  if (isRecord(packageJson.exports)) {
    const rootExport = packageJson.exports['.'];
    if (typeof rootExport === 'string') return rootExport;
    if (isRecord(rootExport)) {
      for (const key of ['bun', 'require', 'default', 'import', 'module']) {
        const value = rootExport[key];
        if (typeof value === 'string') return value;
      }
    }
    const topLevelExport = readConditionalExport(packageJson.exports);
    if (topLevelExport) return topLevelExport;
  }
  return packageJson.module ?? packageJson.main;
}

function readConditionalExport(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!isRecord(value)) return undefined;
  for (const key of ['bun', 'require', 'default', 'import', 'module']) {
    const candidate = value[key];
    if (typeof candidate === 'string') return candidate;
    const nested = readConditionalExport(candidate);
    if (nested) return nested;
  }
  return undefined;
}

function resolvePackageTarget(
  packageRoot: string,
  exportPath: string,
  subpath: string,
): string | undefined {
  const candidates = [exportPath];
  if (subpath.endsWith('.ts') && !exportPath.endsWith('.ts')) {
    candidates.push(exportPath.replace(/\.js$/, '.ts'));
  }
  for (const candidate of candidates) {
    const resolved = resolveFileCandidate(resolve(packageRoot, candidate));
    if (resolved) return resolved;
  }
  return undefined;
}

function resolveFileCandidate(basePath: string): string | undefined {
  for (const candidate of candidateSourceFiles(basePath)) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}

function candidateSourceFiles(basePath: string): readonly string[] {
  return [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}.mjs`,
    resolve(basePath, 'index.ts'),
    resolve(basePath, 'index.tsx'),
    resolve(basePath, 'index.js'),
    resolve(basePath, 'index.jsx'),
    resolve(basePath, 'index.mjs'),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
