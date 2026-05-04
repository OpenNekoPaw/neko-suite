#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const repoRoot = process.cwd();

const packageRoots = {
  webview: 'packages/neko-agent/packages/webview/src',
  extension: 'packages/neko-agent/packages/extension/src',
  agent: 'packages/neko-agent/packages/agent/src',
  platform: 'packages/neko-agent/packages/platform/src',
  'ai-sdk': 'packages/neko-agent/packages/ai-sdk/src',
  'agent-types': 'packages/neko-agent/packages/agent-types/src',
};

const packageDirs = {
  webview: 'packages/neko-agent/packages/webview',
  extension: 'packages/neko-agent/packages/extension',
};

const hostAgnosticScopes = new Set(['agent', 'platform', 'ai-sdk', 'agent-types']);

const compatibilityExceptions = [
  {
    file: 'packages/neko-agent/packages/extension/src/chat/message/agentTurnBridge.ts',
    reason:
      'P1 compatibility bridge: Extension creates VSCode/Webview host adapters while turn assembly migrates to runtime.',
  },
  {
    file: 'packages/neko-agent/packages/extension/src/ai/agentRunner.ts',
    reason:
      'P1 compatibility adapter: current public interface still exposes VSCode EventEmitter shape until AgentRunnerPort migration completes.',
  },
  {
    file: 'packages/neko-agent/packages/extension/src/services/SkillFileService.ts',
    reason:
      'P2 watcher adapter: Extension owns VSCode filesystem watchers while skill file runtime owns scan/create/delete rules.',
  },
  {
    file: 'packages/neko-agent/packages/extension/src/commands/agentCoreCommands.ts',
    reason:
      'Command bridge: Extension owns VSCode command registration and input collection; runtime/platform own prompt, model, and media policy.',
  },
  {
    file: 'packages/neko-agent/packages/extension/src/tools/qualityCheckTools.ts',
    reason:
      'Tool bridge: Extension supplies VSCode file access; @neko/agent validation owns quality business rules.',
  },
  {
    file: 'packages/neko-agent/packages/extension/src/tools/consistencyCheckTools.ts',
    reason:
      'Tool bridge: Extension supplies logger/dependency adapters; @neko/agent validation owns consistency business rules.',
  },
  {
    file: 'packages/neko-agent/packages/extension/src/tools/puppetFaceTools.ts',
    reason:
      'Tool bridge: Extension supplies VSCode command and cross-extension API access; @neko/agent tools own puppet-face rules.',
  },
];

const rules = [
  {
    id: 'webview-no-direct-vscode',
    scopes: ['webview'],
    reason: 'Webview must use the shared VSCode webview wrapper, not the VSCode extension API package.',
    match: ({ specifier }) => isPackage(specifier, 'vscode'),
  },
  {
    id: 'webview-no-core-agent-runtime',
    scopes: ['webview'],
    reason: 'Webview must render/project state and must not import core agent runtime/business logic.',
    match: ({ specifier }) =>
      isPackage(specifier, '@neko/agent') ||
      isPackage(specifier, '@neko/platform') ||
      isPackage(specifier, '@neko/ai-sdk'),
  },
  {
    id: 'webview-no-extension-api',
    scopes: ['webview'],
    reason: 'Webview must not import Extension package APIs.',
    match: ({ specifier, file }) =>
      isPackage(specifier, '@neko-agent/extension') || pointsIntoPackage(file, specifier, 'extension'),
  },
  {
    id: 'extension-no-react',
    scopes: ['extension'],
    reason: 'Extension host must not import React runtime or React DOM.',
    match: ({ specifier }) => isReactRuntime(specifier),
  },
  {
    id: 'extension-no-webview-api',
    scopes: ['extension'],
    reason: 'Extension must communicate through protocol/host adapters, not import Webview implementation.',
    match: ({ specifier, file }) =>
      isPackage(specifier, '@neko-agent/webview') || pointsIntoPackage(file, specifier, 'webview'),
  },
  {
    id: 'host-agnostic-no-vscode',
    scopes: [...hostAgnosticScopes],
    reason: 'Agent, Platform, AI SDK, and shared agent types must remain host-agnostic.',
    match: ({ specifier }) => isPackage(specifier, 'vscode') || isPackage(specifier, '@neko/shared/vscode'),
  },
  {
    id: 'host-agnostic-no-react',
    scopes: [...hostAgnosticScopes],
    reason: 'Host-agnostic packages must not depend on React or React DOM.',
    match: ({ specifier }) => isReactRuntime(specifier),
  },
  {
    id: 'host-agnostic-no-webview-api',
    scopes: [...hostAgnosticScopes],
    reason: 'Host-agnostic packages must not import Webview implementation APIs.',
    match: ({ specifier, file }) =>
      isPackage(specifier, '@neko-agent/webview') || pointsIntoPackage(file, specifier, 'webview'),
  },
  {
    id: 'host-agnostic-no-extension-api',
    scopes: [...hostAgnosticScopes],
    reason: 'Host-agnostic packages must not import Extension implementation APIs.',
    match: ({ specifier, file }) =>
      isPackage(specifier, '@neko-agent/extension') || pointsIntoPackage(file, specifier, 'extension'),
  },
];

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  runBoundaryCheck();
}

function runBoundaryCheck() {
  const findings = [];
  let checkedFiles = 0;

  for (const [scope, root] of Object.entries(packageRoots)) {
    const absoluteRoot = resolve(repoRoot, root);
    for (const file of walk(absoluteRoot)) {
      checkedFiles += 1;
      const content = readFileSync(file, 'utf8');
      findings.push(...findImportViolations(scope, file, content));
    }
  }

  const result = {
    status: findings.length > 0 ? 'failed' : 'passed',
    checkedFiles,
    scopes: Object.keys(packageRoots),
    compatibilityExceptions,
    findings,
  };

  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (findings.length > 0) {
    process.stderr.write(output);
    process.exit(1);
  }

  process.stdout.write(output);
}

function runSelfTest() {
  const cases = [
    {
      name: 'webview importing core runtime fails',
      scope: 'webview',
      file: fakeFile('webview', 'src/App.tsx'),
      content: "import { createAgentSessionWithRuntime } from '@neko/agent/runtime';\n",
      expectedRuleIds: ['webview-no-core-agent-runtime'],
    },
    {
      name: 'agent runtime importing vscode fails',
      scope: 'agent',
      file: fakeFile('agent', 'src/runtime/example.ts'),
      content: "import * as vscode from 'vscode';\n",
      expectedRuleIds: ['host-agnostic-no-vscode'],
    },
    {
      name: 'extension importing react fails',
      scope: 'extension',
      file: fakeFile('extension', 'src/index.ts'),
      content: "import React from 'react';\n",
      expectedRuleIds: ['extension-no-react'],
    },
    {
      name: 'host agnostic importing webview API fails',
      scope: 'platform',
      file: fakeFile('platform', 'src/index.ts'),
      content: "import { App } from '@neko-agent/webview';\n",
      expectedRuleIds: ['host-agnostic-no-webview-api'],
    },
    {
      name: 'webview protocol and shared wrapper imports pass',
      scope: 'webview',
      file: fakeFile('webview', 'src/messages/index.ts'),
      content:
        "import { getVSCodeAPI } from '@neko/shared/vscode';\nimport type { WebviewToExtensionMessage } from '@neko-agent/types';\n",
      expectedRuleIds: [],
    },
  ];

  const failures = [];
  for (const testCase of cases) {
    const violations = findImportViolations(testCase.scope, testCase.file, testCase.content);
    const actualIds = [...new Set(violations.map((violation) => violation.ruleId))].sort();
    const expectedIds = [...testCase.expectedRuleIds].sort();
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
      failures.push({
        name: testCase.name,
        expectedRuleIds: expectedIds,
        actualRuleIds: actualIds,
        violations,
      });
    }
  }

  const result = {
    status: failures.length > 0 ? 'failed' : 'passed',
    cases: cases.length,
    failures,
  };

  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (failures.length > 0) {
    process.stderr.write(output);
    process.exit(1);
  }
  process.stdout.write(output);
}

function findImportViolations(scope, file, content) {
  const imports = extractImportSpecifiers(content);
  const activeRules = rules.filter((rule) => rule.scopes.includes(scope));
  const violations = [];

  for (const specifier of imports) {
    for (const rule of activeRules) {
      if (rule.match({ specifier, file })) {
        violations.push({
          ruleId: rule.id,
          file: relative(repoRoot, file),
          specifier,
          reason: rule.reason,
        });
      }
    }
  }

  return violations;
}

function extractImportSpecifiers(content) {
  const specifiers = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?[^'"]*?\s+from\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}

function* walk(path) {
  const stats = statSync(path);
  if (stats.isFile()) {
    if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(path)) {
      yield path;
    }
    return;
  }

  for (const entry of readdirSync(path)) {
    if (
      entry === 'node_modules' ||
      entry === 'dist' ||
      entry === 'build' ||
      entry === 'coverage' ||
      entry === '.turbo'
    ) {
      continue;
    }
    yield* walk(join(path, entry));
  }
}

function isPackage(specifier, packageName) {
  return specifier === packageName || specifier.startsWith(`${packageName}/`);
}

function isReactRuntime(specifier) {
  return isPackage(specifier, 'react') || isPackage(specifier, 'react-dom');
}

function pointsIntoPackage(file, specifier, packageKey) {
  if (!specifier.startsWith('.')) {
    return false;
  }

  const target = resolve(dirname(file), specifier);
  const packageDir = resolve(repoRoot, packageDirs[packageKey]);
  return target === packageDir || target.startsWith(`${packageDir}/`);
}

function fakeFile(scope, path) {
  const root = packageRoots[scope] ?? 'packages/neko-agent/packages/agent/src';
  return resolve(repoRoot, root, path.replace(/^src\//, ''));
}
