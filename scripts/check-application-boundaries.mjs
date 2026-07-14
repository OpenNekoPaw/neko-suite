#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = process.cwd();
const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);

export function findApplicationBoundaryViolations(file, content) {
  const normalizedFile = normalizePath(file);
  const findings = [];
  const imports = collectStaticModuleSpecifiers(content);

  for (const specifier of imports) {
    if (normalizedFile.startsWith('packages/') && reachesApplication(specifier)) {
      findings.push({
        ruleId: 'packages-must-not-depend-on-applications',
        file: normalizedFile,
        specifier,
        message: 'Reusable packages must not import application composition roots.',
      });
    }

    if (!normalizedFile.startsWith('apps/')) continue;
    if (reachesPackageByRelativePath(specifier)) {
      findings.push({
        ruleId: 'applications-use-public-package-entries',
        file: normalizedFile,
        specifier,
        message: 'Applications must use package exports instead of relative imports into packages/.',
      });
    }
    if (isInternalPackageSpecifier(specifier)) {
      findings.push({
        ruleId: 'applications-must-not-import-feature-internals',
        file: normalizedFile,
        specifier,
        message: 'Applications must consume documented public package entries, not src/internal paths.',
      });
    }
    if (reachesAnotherApplication(normalizedFile, specifier)) {
      findings.push({
        ruleId: 'applications-must-not-import-other-applications',
        file: normalizedFile,
        specifier,
        message: 'Application composition roots must communicate through shared contracts, not imports.',
      });
    }
  }

  return findings;
}

export function runApplicationBoundaryCheck(root = repoRoot) {
  const findings = [];
  let checkedFiles = 0;
  for (const sourceRoot of ['apps', 'packages']) {
    const absoluteRoot = resolve(root, sourceRoot);
    if (!existsSync(absoluteRoot)) continue;
    for (const file of walk(absoluteRoot)) {
      checkedFiles += 1;
      const relativeFile = normalizePath(relative(root, file));
      findings.push(
        ...findApplicationBoundaryViolations(relativeFile, readFileSync(file, 'utf8')),
      );
    }
  }
  findings.push(...findRetiredProductSurfaceViolations(discoverProductSurfaces(root)));
  return { status: findings.length === 0 ? 'passed' : 'failed', checkedFiles, findings };
}

export function findRetiredProductSurfaceViolations(snapshot) {
  const findings = [];
  if (snapshot.directories.includes('packages/neko-desktop')) {
    findings.push({
      ruleId: 'retired-desktop-package-must-not-exist',
      file: 'packages/neko-desktop',
      message: 'The retired Desktop product package must not be restored.',
    });
  }
  if (snapshot.directories.includes('apps/neko-studio')) {
    findings.push({
      ruleId: 'studio-must-not-be-productized',
      file: 'apps/neko-studio',
      message: 'A Studio product requires a separate accepted OpenSpec change.',
    });
  }
  for (const script of snapshot.rootScripts) {
    if (/(?:^|:)desktop(?::|$)/u.test(script)) {
      findings.push({
        ruleId: 'retired-desktop-script-must-not-exist',
        file: 'package.json',
        specifier: script,
        message: 'Root scripts must not expose the retired Desktop product.',
      });
    }
  }
  for (const scenario of snapshot.functionalScenarios) {
    if (scenario.startsWith('desktop/')) {
      findings.push({
        ruleId: 'retired-desktop-scenario-must-not-exist',
        file: `scripts/webview-functional/scenarios/${scenario}`,
        message: 'Functional scenarios must not retain the retired Desktop product owner.',
      });
    }
  }
  return findings;
}

function discoverProductSurfaces(root) {
  const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const scenarioRoot = resolve(root, 'scripts/webview-functional/scenarios');
  return {
    directories: ['packages/neko-desktop', 'apps/neko-studio'].filter((path) =>
      existsSync(resolve(root, path)),
    ),
    rootScripts: Object.keys(packageJson.scripts ?? {}),
    functionalScenarios: existsSync(scenarioRoot)
      ? [...walkScenarioFiles(scenarioRoot)].map((path) =>
          normalizePath(relative(scenarioRoot, path)),
        )
      : [],
  };
}

function* walkScenarioFiles(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walkScenarioFiles(path);
    } else if (entry.isFile() && entry.name.endsWith('.scenario.json')) {
      yield path;
    }
  }
}

function collectStaticModuleSpecifiers(content) {
  const specifiers = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?["']([^"']+)["']/gu,
    /\bexport\s+(?:type\s+)?[^'";]+?\s+from\s+["']([^"']+)["']/gu,
    /\bimport\(\s*["']([^"']+)["']\s*\)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier) specifiers.push(specifier);
    }
  }
  return specifiers;
}

function reachesApplication(specifier) {
  return /(?:^|\/)apps\/(?:neko-[^/]+)(?:\/|$)/u.test(specifier);
}

function reachesPackageByRelativePath(specifier) {
  return specifier.startsWith('.') && /(?:^|\/)packages\//u.test(specifier);
}

function isInternalPackageSpecifier(specifier) {
  if (!specifier.startsWith('@neko') && !specifier.startsWith('neko-')) return false;
  return /(?:^|\/)src(?:\/|$)|(?:^|\/)internal(?:\/|$)|\/packages\/[^/]+\/(?:src|internal)(?:\/|$)/u.test(
    specifier,
  );
}

function reachesAnotherApplication(file, specifier) {
  if (!specifier.startsWith('.')) return false;
  const [, currentApp] = file.split('/');
  const match = specifier.match(/(?:^|\/)apps\/(neko-[^/]+)(?:\/|$)/u);
  return Boolean(match?.[1] && match[1] !== currentApp);
}

function* walk(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
      continue;
    }
    if (sourceExtensions.has(extensionOf(entry.name))) yield path;
  }
}

function extensionOf(file) {
  const index = file.lastIndexOf('.');
  return index < 0 ? '' : file.slice(index);
}

function normalizePath(path) {
  return path.replaceAll('\\', '/');
}

function runSelfTest() {
  const cases = [
    {
      name: 'application public package import passes',
      file: 'apps/neko-home/src/main.ts',
      content: "import { createHost } from '@neko/host';\n",
      expected: [],
    },
    {
      name: 'application relative package import fails',
      file: 'apps/neko-home/src/main.ts',
      content: "import { x } from '../../../packages/neko-agent/src/x';\n",
      expected: ['applications-use-public-package-entries'],
    },
    {
      name: 'application internal package import fails',
      file: 'apps/neko-home/src/main.ts',
      content: "import { x } from '@neko-agent/webview/src/internal';\n",
      expected: ['applications-must-not-import-feature-internals'],
    },
    {
      name: 'package application import fails',
      file: 'packages/neko-host/src/index.ts',
      content: "export { start } from '../../../apps/neko-home/src/main';\n",
      expected: ['packages-must-not-depend-on-applications'],
    },
    {
      name: 'application cross import fails',
      file: 'apps/neko-home/src/main.ts',
      content: "import { start } from '../../apps/neko-tui/src/main';\n",
      expected: ['applications-must-not-import-other-applications'],
    },
  ];
  const failures = [];
  for (const testCase of cases) {
    const actual = findApplicationBoundaryViolations(testCase.file, testCase.content).map(
      (finding) => finding.ruleId,
    );
    if (JSON.stringify(actual) !== JSON.stringify(testCase.expected)) {
      failures.push({ name: testCase.name, expected: testCase.expected, actual });
    }
  }
  const retiredProductFindings = findRetiredProductSurfaceViolations({
    directories: ['packages/neko-desktop', 'apps/neko-studio'],
    rootScripts: ['build:desktop', 'test'],
    functionalScenarios: ['desktop/startup.p0.scenario.json', 'home/startup.p0.scenario.json'],
  }).map((finding) => finding.ruleId);
  const expectedRetiredProductFindings = [
    'retired-desktop-package-must-not-exist',
    'studio-must-not-be-productized',
    'retired-desktop-script-must-not-exist',
    'retired-desktop-scenario-must-not-exist',
  ];
  if (JSON.stringify(retiredProductFindings) !== JSON.stringify(expectedRetiredProductFindings)) {
    failures.push({
      name: 'retired product surfaces fail',
      expected: expectedRetiredProductFindings,
      actual: retiredProductFindings,
    });
  }
  return { status: failures.length === 0 ? 'passed' : 'failed', cases: cases.length + 1, failures };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = process.argv.includes('--self-test') ? runSelfTest() : runApplicationBoundaryCheck();
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (result.status === 'failed') {
    process.stderr.write(output);
    process.exitCode = 1;
  } else {
    process.stdout.write(output);
  }
}
