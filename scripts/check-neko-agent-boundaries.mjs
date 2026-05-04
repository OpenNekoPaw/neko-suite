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
    id: 'agent-turn-bridge-host-adapter',
    file: 'packages/neko-agent/packages/extension/src/chat/message/agentTurnBridge.ts',
    reason:
      'P1 compatibility bridge: Extension creates VSCode/Webview host adapters while turn assembly migrates to runtime.',
    owner: 'neko-agent-runtime',
    tracking: 'openspec:harden-neko-agent-runtime-workflow-closure:2',
    introducedAt: '2026-05-04',
    expiresAt: '2026-06-04',
    sunsetMilestone: 'runtime-workflow-closure',
    replacement: 'AgentTurnHostAdapters + runAgentTurnForWebviewRuntime',
    severityAfterExpiry: 'failure',
  },
  {
    id: 'agent-runner-vscode-event-compat',
    file: 'packages/neko-agent/packages/extension/src/ai/agentRunner.ts',
    reason:
      'P1 compatibility adapter: current public interface still exposes VSCode EventEmitter shape until AgentRunnerPort migration completes.',
    owner: 'neko-agent-runtime',
    tracking: 'openspec:harden-neko-agent-runtime-workflow-closure:2',
    introducedAt: '2026-05-04',
    expiresAt: '2026-06-04',
    sunsetMilestone: 'runner-adapter-closure',
    replacement: 'AgentRunnerPort + onDidRunnerEvent bridge',
    severityAfterExpiry: 'failure',
  },
  {
    id: 'skill-file-service-watcher-adapter',
    file: 'packages/neko-agent/packages/extension/src/services/SkillFileService.ts',
    reason:
      'P2 watcher adapter: Extension owns VSCode filesystem watchers while skill file runtime owns scan/create/delete rules.',
    owner: 'neko-agent-platform',
    tracking: 'openspec:harden-neko-agent-runtime-workflow-closure:follow-up',
    introducedAt: '2026-05-04',
    expiresAt: '2026-07-04',
    sunsetMilestone: 'skill-watcher-runtime-plan',
    replacement: 'skill-file-runtime watch plan + Extension watcher executor',
    severityAfterExpiry: 'warning',
  },
  {
    id: 'agent-core-command-bridge',
    file: 'packages/neko-agent/packages/extension/src/commands/agentCoreCommands.ts',
    reason:
      'Command bridge: Extension owns VSCode command registration and input collection; runtime/platform own prompt, model, and media policy.',
    owner: 'neko-agent-extension',
    tracking: 'openspec:harden-neko-agent-runtime-workflow-closure:follow-up',
    introducedAt: '2026-05-04',
    expiresAt: '2026-07-04',
    sunsetMilestone: 'command-runtime-projection',
    replacement: 'runtime command registry projection + Extension command adapter',
    severityAfterExpiry: 'warning',
  },
  {
    id: 'quality-check-tool-bridge',
    file: 'packages/neko-agent/packages/extension/src/tools/qualityCheckTools.ts',
    reason:
      'Tool bridge: Extension supplies VSCode file access; @neko/agent validation owns quality business rules.',
    owner: 'neko-agent-tools',
    tracking: 'openspec:harden-neko-agent-runtime-workflow-closure:3',
    introducedAt: '2026-05-04',
    expiresAt: '2026-06-18',
    sunsetMilestone: 'multimodal-evidence-feedback',
    replacement: 'AgentMultimodalHostAdapter payload loader + runtime validation tools',
    severityAfterExpiry: 'warning',
  },
  {
    id: 'consistency-check-tool-bridge',
    file: 'packages/neko-agent/packages/extension/src/tools/consistencyCheckTools.ts',
    reason:
      'Tool bridge: Extension supplies logger/dependency adapters; @neko/agent validation owns consistency business rules.',
    owner: 'neko-agent-tools',
    tracking: 'openspec:harden-neko-agent-runtime-workflow-closure:3',
    introducedAt: '2026-05-04',
    expiresAt: '2026-06-18',
    sunsetMilestone: 'multimodal-evidence-feedback',
    replacement: 'AgentMultimodalHostAdapter payload loader + runtime validation tools',
    severityAfterExpiry: 'warning',
  },
  {
    id: 'puppet-face-tool-bridge',
    file: 'packages/neko-agent/packages/extension/src/tools/puppetFaceTools.ts',
    reason:
      'Tool bridge: Extension supplies VSCode command and cross-extension API access; @neko/agent tools own puppet-face rules.',
    owner: 'neko-agent-tools',
    tracking: 'openspec:harden-neko-agent-runtime-workflow-closure:3',
    introducedAt: '2026-05-04',
    expiresAt: '2026-07-04',
    sunsetMilestone: 'tool-host-adapter-projection',
    replacement: 'tool modality declaration + Extension host adapter',
    severityAfterExpiry: 'warning',
  },
];

const requiredCompatibilityExceptionFields = [
  'id',
  'file',
  'reason',
  'owner',
  'tracking',
  'introducedAt',
  'replacement',
  'severityAfterExpiry',
];

const compatibilityExceptionExpirySeverities = new Set(['failure', 'warning']);

const runnerIndividualEventProperties = [
  'onDidStart',
  'onDidStop',
  'onDidRequestConfirmation',
  'onDidSubAgentEvent',
];

const runnerIndividualEventAllowedFiles = new Set([
  'packages/neko-agent/packages/extension/src/ai/agentRunner.ts',
  'packages/neko-agent/packages/extension/src/ai/agentRunnerVscodeEventBridge.ts',
  'packages/neko-agent/packages/extension/src/ai/agentRunner.test.ts',
  'packages/neko-agent/packages/extension/src/ai/agentRunnerVscodeEventBridge.test.ts',
]);

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
      findings.push(...findRunnerIndividualEventUsageViolations(scope, file, content));
    }
  }

  const compatibility = evaluateCompatibilityExceptions(compatibilityExceptions, {
    validationDate: new Date(),
  });
  const blockingCompatibilityFindings = compatibility.findings.filter(
    (finding) => finding.severity === 'failure',
  );
  const result = {
    status: findings.length > 0 || blockingCompatibilityFindings.length > 0 ? 'failed' : 'passed',
    checkedFiles,
    scopes: Object.keys(packageRoots),
    compatibilityExceptions: compatibility.exceptions,
    compatibilityFindings: compatibility.findings,
    findings,
  };

  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (result.status === 'failed') {
    process.stderr.write(output);
    process.exit(1);
  }

  process.stdout.write(output);
}

function runSelfTest() {
  const importCases = [
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
    {
      name: 'extension consumer using individual runner event fails',
      scope: 'extension',
      file: fakeFile('extension', 'src/chat/example.ts'),
      content: 'runner.onDidStop(() => undefined);\n',
      expectedRuleIds: ['extension-no-new-runner-individual-events'],
    },
    {
      name: 'runner vscode event bridge individual runner events pass',
      scope: 'extension',
      file: resolve(
        repoRoot,
        'packages/neko-agent/packages/extension/src/ai/agentRunnerVscodeEventBridge.ts',
      ),
      content: 'this.onDidStopEmitter.fire();\n',
      expectedRuleIds: [],
    },
  ];

  const failures = [];
  for (const testCase of importCases) {
    const violations = [
      ...findImportViolations(testCase.scope, testCase.file, testCase.content),
      ...findRunnerIndividualEventUsageViolations(testCase.scope, testCase.file, testCase.content),
    ];
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

  const compatibilityCases = [
    {
      name: 'exception without metadata fails',
      exceptions: [
        {
          id: 'missing-owner',
          file: 'packages/neko-agent/packages/extension/src/ai/example.ts',
          reason: 'Missing required lifecycle fields.',
          tracking: 'openspec:test',
          introducedAt: '2026-05-04',
          expiresAt: '2026-05-05',
          replacement: 'test replacement',
          severityAfterExpiry: 'failure',
        },
      ],
      validationDate: '2026-05-04',
      expectedCodes: ['missing-metadata'],
    },
    {
      name: 'unexpired exception is visible but allowed',
      exceptions: [
        createSelfTestCompatibilityException({
          id: 'unexpired-test',
          expiresAt: '2026-05-05',
          severityAfterExpiry: 'failure',
        }),
      ],
      validationDate: '2026-05-04',
      expectedCodes: [],
      expectedStatuses: ['active'],
    },
    {
      name: 'expired failure exception blocks guard',
      exceptions: [
        createSelfTestCompatibilityException({
          id: 'expired-test',
          expiresAt: '2026-05-03',
          severityAfterExpiry: 'failure',
        }),
      ],
      validationDate: '2026-05-04',
      expectedCodes: ['expired-exception'],
      expectedStatuses: ['expired'],
    },
    {
      name: 'renewed exception requires rationale',
      exceptions: [
        createSelfTestCompatibilityException({
          id: 'renewed-without-rationale',
          expiresAt: '2026-05-06',
          previousExpiresAt: '2026-05-03',
        }),
      ],
      validationDate: '2026-05-04',
      expectedCodes: ['missing-renewal-rationale'],
    },
    {
      name: 'renewed exception with rationale passes metadata validation',
      exceptions: [
        createSelfTestCompatibilityException({
          id: 'renewed-with-rationale',
          expiresAt: '2026-05-06',
          previousExpiresAt: '2026-05-03',
          renewalRationale: 'Bridge split needs one more focused migration window.',
        }),
      ],
      validationDate: '2026-05-04',
      expectedCodes: [],
      expectedStatuses: ['active'],
    },
  ];

  for (const testCase of compatibilityCases) {
    const evaluated = evaluateCompatibilityExceptions(testCase.exceptions, {
      validationDate: new Date(`${testCase.validationDate}T00:00:00.000Z`),
    });
    const actualCodes = [...new Set(evaluated.findings.map((finding) => finding.code))].sort();
    const expectedCodes = [...testCase.expectedCodes].sort();
    const actualStatuses = evaluated.exceptions.map((exception) => exception.expiryStatus).sort();
    const expectedStatuses = [...(testCase.expectedStatuses ?? actualStatuses)].sort();

    if (
      JSON.stringify(actualCodes) !== JSON.stringify(expectedCodes) ||
      JSON.stringify(actualStatuses) !== JSON.stringify(expectedStatuses)
    ) {
      failures.push({
        name: testCase.name,
        expectedCodes,
        actualCodes,
        expectedStatuses,
        actualStatuses,
        evaluated,
      });
    }
  }

  const result = {
    status: failures.length > 0 ? 'failed' : 'passed',
    cases: importCases.length + compatibilityCases.length,
    failures,
  };

  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (failures.length > 0) {
    process.stderr.write(output);
    process.exit(1);
  }
  process.stdout.write(output);
}

function evaluateCompatibilityExceptions(exceptions, options) {
  const validationDate = options.validationDate;
  const findings = [];
  const seenIds = new Set();
  const seenFiles = new Set();
  const evaluatedExceptions = exceptions.map((exception, index) => {
    const missingFields = requiredCompatibilityExceptionFields.filter(
      (field) => !hasNonEmptyString(exception[field]),
    );
    const hasExpiry = hasNonEmptyString(exception.expiresAt) || hasNonEmptyString(exception.sunsetMilestone);

    if (!hasExpiry) {
      missingFields.push('expiresAt/sunsetMilestone');
    }

    if (missingFields.length > 0) {
      findings.push({
        code: 'missing-metadata',
        severity: 'failure',
        id: exception.id ?? `compatibility-exception-${index + 1}`,
        file: exception.file,
        missingFields,
        reason: 'Compatibility exceptions must include lifecycle metadata.',
      });
    }

    if (hasNonEmptyString(exception.id)) {
      if (seenIds.has(exception.id)) {
        findings.push({
          code: 'duplicate-exception-id',
          severity: 'failure',
          id: exception.id,
          file: exception.file,
          reason: 'Compatibility exception ids must be unique.',
        });
      }
      seenIds.add(exception.id);
    }

    if (hasNonEmptyString(exception.file)) {
      if (seenFiles.has(exception.file)) {
        findings.push({
          code: 'duplicate-exception-file',
          severity: 'failure',
          id: exception.id,
          file: exception.file,
          reason: 'Each compatibility exception file should have one lifecycle record.',
        });
      }
      seenFiles.add(exception.file);
    }

    if (
      hasNonEmptyString(exception.severityAfterExpiry) &&
      !compatibilityExceptionExpirySeverities.has(exception.severityAfterExpiry)
    ) {
      findings.push({
        code: 'invalid-expiry-severity',
        severity: 'failure',
        id: exception.id,
        file: exception.file,
        severityAfterExpiry: exception.severityAfterExpiry,
        reason: 'severityAfterExpiry must be either failure or warning.',
      });
    }

    const expiryStatus = getCompatibilityExceptionExpiryStatus(exception, validationDate);
    if (expiryStatus === 'invalid-expiry') {
      findings.push({
        code: 'invalid-expiry-date',
        severity: 'failure',
        id: exception.id,
        file: exception.file,
        expiresAt: exception.expiresAt,
        reason: 'expiresAt must use YYYY-MM-DD.',
      });
    }

    if (expiryStatus === 'expired') {
      findings.push({
        code: 'expired-exception',
        severity: exception.severityAfterExpiry === 'warning' ? 'warning' : 'failure',
        id: exception.id,
        file: exception.file,
        expiresAt: exception.expiresAt,
        replacement: exception.replacement,
        reason: 'Compatibility exception has expired.',
      });
    }

    if (hasNonEmptyString(exception.previousExpiresAt) && !hasNonEmptyString(exception.renewalRationale)) {
      findings.push({
        code: 'missing-renewal-rationale',
        severity: 'failure',
        id: exception.id,
        file: exception.file,
        previousExpiresAt: exception.previousExpiresAt,
        expiresAt: exception.expiresAt,
        reason: 'Renewed compatibility exceptions must include renewalRationale.',
      });
    }

    return {
      ...exception,
      expiryStatus,
    };
  });

  return {
    exceptions: evaluatedExceptions,
    findings,
  };
}

function getCompatibilityExceptionExpiryStatus(exception, validationDate) {
  if (!hasNonEmptyString(exception.expiresAt)) {
    return hasNonEmptyString(exception.sunsetMilestone) ? 'milestone-only' : 'missing-expiry';
  }

  const expiresAt = parseDateOnly(exception.expiresAt);
  if (expiresAt === null) {
    return 'invalid-expiry';
  }

  return expiresAt.getTime() < startOfUtcDay(validationDate).getTime() ? 'expired' : 'active';
}

function parseDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function hasNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function createSelfTestCompatibilityException(overrides) {
  return {
    id: 'self-test-compatibility-exception',
    file: 'packages/neko-agent/packages/extension/src/ai/selfTest.ts',
    reason: 'Self-test compatibility exception.',
    owner: 'neko-agent-runtime',
    tracking: 'openspec:self-test',
    introducedAt: '2026-05-04',
    expiresAt: '2026-05-05',
    sunsetMilestone: 'self-test',
    replacement: 'self-test replacement',
    severityAfterExpiry: 'failure',
    ...overrides,
  };
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

function findRunnerIndividualEventUsageViolations(scope, file, content) {
  if (scope !== 'extension') {
    return [];
  }

  const relativeFile = relative(repoRoot, file);
  if (runnerIndividualEventAllowedFiles.has(relativeFile)) {
    return [];
  }

  const violations = [];
  for (const eventProperty of runnerIndividualEventProperties) {
    const pattern = new RegExp(`\\.${eventProperty}\\s*\\(`, 'g');
    if (!pattern.test(content)) {
      continue;
    }
    violations.push({
      ruleId: 'extension-no-new-runner-individual-events',
      file: relativeFile,
      specifier: eventProperty,
      reason:
        'New Extension consumers must subscribe to onDidRunnerEvent instead of individual VSCode runner events.',
    });
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
