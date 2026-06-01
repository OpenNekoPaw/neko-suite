import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const agentSrc = join(repoRoot, 'packages/agent/src');
const packageRoot = join(repoRoot, 'packages');
const webviewSrc = join(packageRoot, 'webview/src');
const extensionSrc = join(packageRoot, 'extension/src');

describe('agent architecture boundary guards', () => {
  it('keeps Webview from importing runtime, platform, ai-sdk, or vscode modules', () => {
    const source = readSourceFiles(webviewSrc, (file) => !isTestFile(file));

    expect(source).not.toMatch(/from\s+['"](?:@neko\/agent|@neko-agent\/agent)(?:\/[^'"]*)?['"]/);
    expect(source).not.toMatch(
      /from\s+['"](?:@neko\/platform|@neko-agent\/platform)(?:\/[^'"]*)?['"]/,
    );
    expect(source).not.toMatch(/from\s+['"]@neko\/ai-sdk(?:\/[^'"]*)?['"]/);
    expect(source).not.toMatch(/from\s+['"]vscode['"]/);
    expect(source).not.toMatch(/require\(['"]vscode['"]\)/);
  });

  it('keeps runtime collaborators independent from VSCode, React, Webview, and Extension modules', () => {
    const collaboratorFiles = [
      join(agentSrc, 'session/session-persistence.ts'),
      join(agentSrc, 'session/idc-run-lifecycle.ts'),
      join(agentSrc, 'session/session-artifact-facade.ts'),
      join(agentSrc, 'session/feedback-runtime-bridge.ts'),
      join(agentSrc, 'session/prompt-runtime-facade.ts'),
    ];
    const source = collaboratorFiles.map((file) => readFileSync(file, 'utf-8')).join('\n');

    expect(source).not.toMatch(/from\s+['"]vscode['"]/);
    expect(source).not.toMatch(/require\(['"]vscode['"]\)/);
    expect(source).not.toMatch(/from\s+['"]react['"]/);
    expect(source).not.toMatch(/from\s+['"][^'"]*webview[^'"]*['"]/i);
    expect(source).not.toMatch(/from\s+['"][^'"]*extension[^'"]*['"]/i);
  });

  it('keeps NPC runtime modules host-agnostic and projection-only', () => {
    const npcRuntimeFiles = listFiles(agentSrc)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .filter((file) => /(?:^|[/-])npc/i.test(relative(agentSrc, file)));

    const violations = npcRuntimeFiles.flatMap((file) => {
      const source = readFileSync(file, 'utf-8');
      const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
        (match) => match[1] ?? '',
      );
      const forbiddenImports = imports.filter((specifier) =>
        /^(vscode|react|@neko\/platform|@neko-agent\/platform|@neko-dashboard|neko-dashboard|@neko-story|neko-story|@neko\/entity(?:\/(?!types\b|contracts\b)[^'"]*)?)$/.test(
          specifier,
        ),
      );
      const requiresVscode = /require\(['"]vscode['"]\)/.test(source);

      return [
        ...forbiddenImports.map((specifier) => `${relative(repoRoot, file)} -> ${specifier}`),
        ...(requiresVscode ? [`${relative(repoRoot, file)} -> require(vscode)`] : []),
      ];
    });

    expect(violations).toEqual([]);
  });

  it('keeps Extension as host adapter rather than runtime collaborator implementation', () => {
    const source = readSourceFiles(extensionSrc, (file) => !isTestFile(file));

    expect(source).not.toMatch(
      /class\s+(SessionPersistence|IdcRunLifecycle|SessionArtifactFacade|FeedbackRuntimeBridge|PromptRuntimeFacade)\b/,
    );
    expect(source).not.toMatch(
      /from\s+['"][^'"]*session\/(?:session-persistence|idc-run-lifecycle|session-artifact-facade|feedback-runtime-bridge|prompt-runtime-facade)['"]/,
    );
  });

  it('reports new AgentSession fields that directly own runtime subdomain state', () => {
    const source = readFileSync(join(agentSrc, 'session/agent-session.ts'), 'utf-8');
    const fieldNames = parseAgentSessionFields(source)
      .map((match) => match[1]!)
      .filter((field) => !allowedAgentSessionFieldNames.has(field));

    expect(fieldNames).toEqual([]);
  });

  it('keeps the AgentSession field allowlist free of removed fields', () => {
    const source = readFileSync(join(agentSrc, 'session/agent-session.ts'), 'utf-8');
    const fieldNames = new Set(parseAgentSessionFields(source).map((match) => match[1]!));
    const staleAllowlistEntries = Array.from(allowedAgentSessionFieldNames).filter(
      (field) => !fieldNames.has(field),
    );

    expect(staleAllowlistEntries).toEqual([]);
  });

  it('reports new AgentSession fields by high-risk runtime ownership category', () => {
    const source = readFileSync(join(agentSrc, 'session/agent-session.ts'), 'utf-8');
    const violations = parseAgentSessionFields(source)
      .map((match) => {
        const name = match[1]!;
        const declaration = match[0];
        return { name, category: classifyAgentSessionField(name, declaration) };
      })
      .filter(
        (field): field is { name: string; category: AgentSessionFieldCategory } =>
          field.category !== null,
      )
      .filter((field) => !legacyAgentSessionFieldDebt.has(field.name))
      .filter((field) => !approvedAgentSessionCollaboratorFields.has(field.name));

    expect(violations).toEqual([]);
  });
});

const allowedAgentSessionFieldNames = new Set([
  '_config',
  '_executionMode',
  '_executor',
  '_compressor',
  '_permissionHooks',
  '_toolGroupRegistry',
  '_toolInjectionManager',
  '_promptComposer',
  '_memoryProjectModule',
  '_memoryRecallModule',
  '_creativeVersionLogModule',
  '_feedbackGuidanceModule',
  '_promptModuleOrchestrator',
  '_promptContextProvider',
  '_skillInjectionModule',
  '_agentsMdModule',
  '_artifactSchemaModule',
  '_subpackageFragmentsModule',
  '_skillCoordinator',
  '_stageTracker',
  '_stagePersonaBinding',
  '_stageGuardian',
  '_runStore',
  '_reactRunnerState',
  '_reactLoopBaseHooks',
  '_runnerHooks',
  '_eventBus',
  '_nekoPaths',
  '_eventSink',
  '_auditsSink',
  '_stepsSink',
  '_artifactWatcher',
  '_sessionPersistence',
  '_artifactFacade',
  '_feedbackRuntime',
  '_promptRuntime',
  '_idcRunLifecycle',
  '_feedbackCoordinator',
  '_controlPlane',
  '_operationToolAdapterRegistry',
  '_preferencesReady',
  '_preferencesWarnings',
  '_autohealChain',
  '_approvalEngine',
  '_metaTools',
  '_history',
  '_historyEventIds',
  '_processedMemoryEventIds',
  '_isRunning',
  '_disposed',
  '_compactState',
  '_versionLog',
  '_journalWriter',
  '_journalSeq',
  '_streamState',
  '_currentTurnPlanningContext',
  '_memoryRecall',
  '_pendingConfirmations',
  '_ablationMarker',
]);

const approvedAgentSessionCollaboratorFields = new Set([
  '_sessionPersistence',
  '_artifactFacade',
  '_feedbackRuntime',
  '_promptRuntime',
  '_idcRunLifecycle',
]);

const legacyAgentSessionFieldDebt = new Set([
  '_memoryProjectModule',
  '_memoryRecallModule',
  '_creativeVersionLogModule',
  '_feedbackGuidanceModule',
  '_skillInjectionModule',
  '_agentsMdModule',
  '_artifactSchemaModule',
  '_subpackageFragmentsModule',
  '_eventSink',
  '_auditsSink',
  '_stepsSink',
  '_journalWriter',
  '_pendingConfirmations',
]);

type AgentSessionFieldCategory =
  | 'timer'
  | 'sink'
  | 'queue'
  | 'guidance-state'
  | 'transition-buffer'
  | 'prompt-module-instance';

function classifyAgentSessionField(
  name: string,
  declaration: string,
): AgentSessionFieldCategory | null {
  if (/(Timer|Timeout|Interval|Debounce)/i.test(name + declaration)) {
    return 'timer';
  }
  if (/(Sink|JournalWriter|NdjsonEventSink)/i.test(name + declaration)) {
    return 'sink';
  }
  if (/(Queue|Pending)/i.test(name + declaration)) {
    return 'queue';
  }
  if (/(GuidanceState|FeedbackGuidance)/i.test(name + declaration)) {
    return 'guidance-state';
  }
  if (/(TransitionBuffer|StageTransition|stageTransitions)/i.test(name + declaration)) {
    return 'transition-buffer';
  }
  if (
    /(?:MemoryProjectModule|MemoryRecallModule|CreativeVersionLogModule|FeedbackGuidanceModule|SkillInjectionModule|AgentsMdModule|ArtifactSchemaModule|SubpackageFragmentsModule|PromptModule\b)/.test(
      declaration,
    )
  ) {
    return 'prompt-module-instance';
  }
  return null;
}

function parseAgentSessionFields(source: string): RegExpMatchArray[] {
  const constructorIndex = source.indexOf('  constructor(config: AgentSessionConfig)');
  const fieldBlock = constructorIndex >= 0 ? source.slice(0, constructorIndex) : source;
  return Array.from(
    fieldBlock.matchAll(/^\s+private\s+(?:readonly\s+)?(_[A-Za-z0-9]+)[\s\S]*?;/gm),
  );
}

function readSourceFiles(dir: string, include: (file: string) => boolean): string {
  return listFiles(dir)
    .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
    .filter(include)
    .map((file) => readFileSync(file, 'utf-8'))
    .join('\n');
}

function listFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function isTestFile(file: string): boolean {
  const name = basename(file);
  return (
    name.endsWith('.test.ts') ||
    name.endsWith('.test.tsx') ||
    name.endsWith('.spec.ts') ||
    name.endsWith('.spec.tsx')
  );
}
