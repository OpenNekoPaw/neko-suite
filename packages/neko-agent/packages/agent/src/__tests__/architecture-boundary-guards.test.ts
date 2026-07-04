import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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

  it('keeps Webview projection code from generating durable entity memory contributions', () => {
    const sourceFiles = listFiles(webviewSrc)
      .filter(
        (file) =>
          (file.endsWith('.ts') || file.endsWith('.tsx')) &&
          !isTestFile(file) &&
          !relative(webviewSrc, file).includes('__tests__/'),
      )
      .map((file) => ({
        file,
        source: readFileSync(file, 'utf-8'),
      }));

    const violations = sourceFiles.flatMap(({ file, source }) => {
      const relativePath = relative(repoRoot, file);
      const patterns = [
        /inferEntityMemoryContribution/i,
        /\bconst\s+DEFAULT_CONFIDENCE\s*=/,
        /character-analysis-row-not-entity/,
        /\bsourcePackage\s*:\s*['"][^'"]+['"]/,
        /\breviewPolicy\s*:\s*['"][^'"]+['"]/,
        /\bEntityMemoryContribution\s*=\s*\{/,
      ];
      return patterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`);
    });

    expect(violations).toEqual([]);
  });

  it('keeps runtime collaborators independent from VSCode, React, Webview, and Extension modules', () => {
    const collaboratorFiles = [
      join(agentSrc, 'session/session-artifact-facade.ts'),
      join(agentSrc, 'session/feedback-runtime-bridge.ts'),
      join(agentSrc, 'session/prompt-runtime-facade.ts'),
      join(agentSrc, 'runtime/character-dialogue-runtime.ts'),
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
      /class\s+(SessionPersistence|SessionArtifactFacade|FeedbackRuntimeBridge|PromptRuntimeFacade)\b/,
    );
    expect(source).not.toMatch(
      /from\s+['"][^'"]*session\/(?:session-persistence|session-artifact-facade|feedback-runtime-bridge|prompt-runtime-facade)['"]/,
    );
  });

  it('keeps builtin Skill catalog localization out of the Extension host adapter', () => {
    const source = stripTypeScriptComments(readFileSync(join(extensionSrc, 'index.ts'), 'utf-8'));

    expect(source).not.toMatch(/\bBUILTIN_SKILL_LOCALES\b/);
    expect(source).not.toMatch(/\bconst\s+\w*SkillLocales\b/i);
  });

  it('keeps creative execution runtimes out of Agent runtime ownership', () => {
    const forbiddenRuntimeFiles = [
      join(agentSrc, 'runtime/storyboard-image-runtime.ts'),
      join(agentSrc, 'runtime/shot-image-prep-runtime.ts'),
      join(agentSrc, 'runtime/comic-animation-indexing-runtime.ts'),
    ];

    const existingFiles = forbiddenRuntimeFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file));

    expect(existingFiles).toEqual([]);
  });

  it('keeps Canvas generation runtime out of Agent runtime ownership', () => {
    const forbiddenRuntimeFiles = [join(agentSrc, 'runtime/canvas-generation-runtime.ts')];
    const existingFiles = forbiddenRuntimeFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));

    expect(existingFiles).toEqual([]);
  });

  it('keeps Puppet face domain tools out of Agent core', () => {
    const forbiddenToolFiles = [
      join(agentSrc, 'tools/puppet-face-runtime.ts'),
      join(agentSrc, 'tools/puppet-face-tools.ts'),
    ];
    const existingFiles = forbiddenToolFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));

    expect(existingFiles).toEqual([]);
  });

  it('keeps Story scene search runtime out of Agent core', () => {
    const forbiddenToolFiles = [join(agentSrc, 'tools/script-scene-search-runtime.ts')];
    const existingFiles = forbiddenToolFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));

    expect(existingFiles).toEqual([]);
  });

  it('keeps concrete operation tool adapters out of Agent runtime ownership', () => {
    const forbiddenRuntimeFiles = [
      join(agentSrc, 'runtime/operation-adapters/canvas-node-update-adapter.ts'),
      join(agentSrc, 'runtime/operation-adapters/model-element-update-adapter.ts'),
      join(agentSrc, 'runtime/operation-adapters/timeline-element-update-adapter.ts'),
    ];
    const existingFiles = forbiddenRuntimeFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));

    expect(existingFiles).toEqual([]);

    const runtimeSourceFiles = listFiles(join(agentSrc, 'runtime'))
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }))
      .filter(({ relativePath }) => !relativePath.endsWith('architecture-boundary-guards.test.ts'));

    const forbiddenAdapterTerms = [
      /\bcreateDefaultOperationToolAdapterRegistry\b/,
      /\bcreateCanvasNodeUpdateAdapter\b/,
      /\bcreateModelElementUpdateAdapter\b/,
      /\bcreateTimelineElementUpdateAdapter\b/,
      /canvas-node-update/,
      /model-element-update/,
      /timeline-element-update/,
    ];
    const violations = runtimeSourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenAdapterTerms
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps domain plugin transfer command plans out of Agent runtime ownership', () => {
    const runtimeSourceFiles = listFiles(join(agentSrc, 'runtime'))
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }))
      .filter(({ relativePath }) => !relativePath.endsWith('architecture-boundary-guards.test.ts'));

    const forbiddenCommandTerms = [
      /['"`]neko\.canvas\.importAsset['"`]/,
      /['"`]neko\.cut\.importStoryboard['"`]/,
      /['"`]neko\.cut\.importGeneratedClip['"`]/,
      /['"`]neko\.sketch\.importAsset['"`]/,
      /['"`]neko\.model\.importAsset['"`]/,
    ];
    const violations = runtimeSourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenCommandTerms
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps Canvas and Cut tool localization metadata out of Agent core', () => {
    const toolRegistrySource = stripTypeScriptComments(
      readFileSync(join(agentSrc, 'tools/tool-registry.ts'), 'utf-8'),
    );
    const forbiddenToolMetadataKeys = [
      'CreateCanvas',
      'AddCanvasShape',
      'canvas_list_nodes',
      'canvas_get_node',
      'canvas_update_node',
      'canvas_create_node',
      'canvas_derive_node',
      'canvas_create_composite',
      'canvas_update_block',
      'canvas_extract_structured_content',
      'canvas_get_active_context',
      'canvas_narrative_traverse',
      'canvas_apply_agent_content',
      'canvas_get_storyboard_execution_summary',
      'canvas_generate_image',
      'canvas_generate_batch',
      'set_project_generation_config',
      'export_storyboard',
      'canvas_apply_style_transfer',
      'import_script_to_canvas',
      'canvas_generate_video_with_keyframes',
      'canvas.ingestMarkdown',
      'canvas.validateMarkdownStoryboard',
    ];
    const violations = forbiddenToolMetadataKeys
      .filter((toolName) => createObjectKeyPattern(toolName).test(toolRegistrySource))
      .map((toolName) => `tools/tool-registry.ts contains localization key ${toolName}`);

    expect(violations).toEqual([]);
  });

  it('keeps domain tool permission defaults out of Agent core', () => {
    const permissionSource = [
      'permission/tool-traits-registry.ts',
      'permission/types.ts',
      'hooks/executor-hooks-factory.ts',
    ]
      .map((relativePath) => stripTypeScriptComments(readFileSync(join(agentSrc, relativePath), 'utf-8')))
      .join('\n');
    const forbiddenPermissionToolNames = [
      'GetTimelineInfo',
      'ListTimelineElements',
      'AddTimelineElement',
      'UpdateTimelineElement',
      'DeleteTimelineElement',
      'canvas_list_nodes',
      'canvas_get_node',
      'canvas_update_node',
      'canvas_create_node',
      'canvas_generate_image',
      'canvas_generate_video_with_keyframes',
      'GenerateVideoForClip',
      'ListVideoEffects',
      'GetVideoEffectInfo',
      'ListAssets',
      'GetAsset',
    ];
    const violations = forbiddenPermissionToolNames
      .filter((toolName) => new RegExp(`['"\`]${escapeRegExp(toolName)}['"\`]`).test(permissionSource))
      .map((toolName) => `Agent permission defaults contain domain tool ${toolName}`);

    expect(violations).toEqual([]);
  });

  it('keeps media quality domain validation out of Agent core', () => {
    const forbiddenValidationFiles = [
      join(agentSrc, 'validation/qa-types.ts'),
      join(agentSrc, 'validation/quality-evidence-normalizer.ts'),
      join(agentSrc, 'validation/video-content-index.ts'),
      join(agentSrc, 'validation/remediation-planner.ts'),
      join(agentSrc, 'validation/consistency-evaluator.ts'),
      join(agentSrc, 'validation/media-quality-runtime.ts'),
      join(agentSrc, 'validation/quality-check-tools.ts'),
    ];
    const existingFiles = forbiddenValidationFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));

    expect(existingFiles).toEqual([]);
  });

  it('keeps media quality feedback adapters out of Agent core', () => {
    const forbiddenFeedbackFiles = [join(agentSrc, 'feedback/quality-review-evidence.ts')];
    const existingFiles = forbiddenFeedbackFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));
    const productionSource = listFiles(agentSrc)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));
    const qualityFeedbackTerms = [
      /\bQualityCheck\b/,
      /\bQualityRepairCheck\b/,
      /\bQualityCheckConsistency\b/,
      /quality-review/,
      /quality-check/,
    ];
    const sourceViolations = productionSource.flatMap(({ relativePath, source }) =>
      qualityFeedbackTerms
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect([...existingFiles, ...sourceViolations]).toEqual([]);
  });

  it('keeps concrete validation, creative-process recovery, and memory policies out of Agent core', () => {
    const forbiddenFiles = [
      join(agentSrc, 'artifact/artifact-observation-hooks.ts'),
      join(agentSrc, 'control-plane/artifact-registry.ts'),
      join(agentSrc, 'control-plane/control-plane.ts'),
      join(agentSrc, 'control-plane/stage-registry.ts'),
      join(agentSrc, 'creative-process/creative-process-artifacts.ts'),
      join(agentSrc, 'creative-process/creative-process-recovery-policy.ts'),
      join(agentSrc, 'creative-process/creative-process-stages.ts'),
      join(agentSrc, 'evaluation/self-evaluation-hooks.ts'),
      join(agentSrc, 'feedback/feedback-coordinator.ts'),
      join(agentSrc, 'validation/artifact-validation-observation-hooks.ts'),
      join(agentSrc, 'validation/validation-coordinator.ts'),
      join(agentSrc, 'memory/keyfact-extractor.ts'),
      join(agentSrc, 'memory/project-memory-router.ts'),
      join(agentSrc, 'memory/provider-card-project-router.ts'),
    ];
    const existingFiles = forbiddenFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));
    const productionSource = listFiles(agentSrc)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));
    const forbiddenTerms = [
      /\bcreateFeedbackCoordinator\b/,
      /\bcreateValidationCoordinator\b/,
      /\bcreateDefaultControlPlane\b/,
      /\bcreateDefaultCreativeProcessRecoveryPolicy\b/,
      /\bFeedbackStageController\b/,
      /\bCreativeProcessValidationStageController\b/,
      /\bSelfEvaluationHooks\b/,
      /\bcreateArtifactObservationHooks\b/,
      /\bKeyFactExtractor\b/,
      /\bProjectMemoryRouter\b/,
      /\bProviderCardProjectRouter\b/,
    ];
    const sourceViolations = productionSource.flatMap(({ relativePath, source }) =>
      forbiddenTerms
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect([...existingFiles, ...sourceViolations]).toEqual([]);
  });

  it('keeps optional Autoheal strategy packs and chain implementation out of Agent core', () => {
    const forbiddenFiles = [
      join(agentSrc, 'autoheal/autoheal-chain.ts'),
      join(agentSrc, 'autoheal/autoheal-types.ts'),
      join(agentSrc, 'autoheal/example-handlers.ts'),
    ];
    const existingFiles = forbiddenFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));
    const productionSource = listFiles(agentSrc)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));
    const forbiddenTerms = [
      /\bclass\s+AutohealChain\b/,
      /\bcreateAutohealChain\b/,
      /\bDEFAULT_AUTOHEAL_POLICY\b/,
      /\bcreateResolutionDegradeHandler\b/,
      /\bcreateSubstituteHandler\b/,
      /\bcreateUserEscalationHandler\b/,
      /image\.dalle/,
      /image\.sdxl/,
      /video\.sora/,
      /video\.kling/,
    ];
    const sourceViolations = productionSource.flatMap(({ relativePath, source }) =>
      forbiddenTerms
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect([...existingFiles, ...sourceViolations]).toEqual([]);
  });

  it('keeps character memory artifact projection out of Agent core', () => {
    const forbiddenFiles = [
      join(agentSrc, 'artifact/character-memory-artifact.ts'),
      join(agentSrc, 'artifact/entity-memory-contribution-inference.ts'),
    ];
    const existingFiles = forbiddenFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));
    const productionSource = listFiles(agentSrc)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));
    const forbiddenTerms = [
      /\bbuildCharacterMemoryReviewArtifact\b/,
      /\bbuildEntityMemoryContributionReviewArtifact\b/,
      /\binferEntityMemoryContributionFromCharacterAnalysis\b/,
      /\bmaybeAttachInferredEntityMemoryContribution\b/,
      /character-memory-artifact-review/,
      /entity-memory-contribution-review/,
    ];
    const sourceViolations = productionSource.flatMap(({ relativePath, source }) =>
      forbiddenTerms
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect([...existingFiles, ...sourceViolations]).toEqual([]);
  });

  it('keeps Agent package independent from concrete skill packages', () => {
    const packageManifest = stripTypeScriptComments(
      readFileSync(join(repoRoot, 'packages/agent/package.json'), 'utf-8'),
    );
    const tsconfig = stripTypeScriptComments(
      readFileSync(join(repoRoot, 'packages/agent/tsconfig.json'), 'utf-8'),
    );
    const sourceFiles = listFiles(agentSrc)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }))
      .filter(({ relativePath }) => !relativePath.endsWith('architecture-boundary-guards.test.ts'));

    const forbiddenPackageSpecifiers = [
      /"@neko-agent\/skills"/,
      /"@neko-agent\/skills\//,
      /"@neko\/skills"/,
      /"@neko\/skills\//,
    ];
    const manifestViolations = forbiddenPackageSpecifiers
      .filter((pattern) => pattern.test(packageManifest) || pattern.test(tsconfig))
      .map((pattern) => `packages/agent package config matches ${pattern}`);
    const sourceViolations = sourceFiles.flatMap(({ relativePath, source }) =>
      [
        /from\s+['"]@neko-agent\/skills(?:\/[^'"]*)?['"]/,
        /from\s+['"]@neko\/skills(?:\/[^'"]*)?['"]/,
        /import\(['"]@neko-agent\/skills(?:\/[^'"]*)?['"]\)/,
        /import\(['"]@neko\/skills(?:\/[^'"]*)?['"]\)/,
      ]
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect([...manifestViolations, ...sourceViolations]).toEqual([]);
  });

  it('keeps concrete media workflow skill strategy out of Agent core', () => {
    const forbiddenFiles = [join(agentSrc, 'artifact/shot-image-prep-artifact.ts')];
    const existingForbiddenFiles = forbiddenFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));

    expect(existingForbiddenFiles).toEqual([]);

    const skillRuntimeSourceFiles = listFiles(join(agentSrc, 'skill'))
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }))
      .filter(({ relativePath }) => !relativePath.endsWith('architecture-boundary-guards.test.ts'));

    const forbiddenSkillNames = [
      /['"`]comic-to-storyboard['"`]/,
      /['"`]comic-to-animation['"`]/,
      /['"`]media-to-video['"`]/,
      /['"`]storyboard-to-animation-plan['"`]/,
      /['"`]animation-plan-to-cut['"`]/,
      /['"`]generated-shot-assembly['"`]/,
      /['"`]export-video-package['"`]/,
    ];
    const violations = skillRuntimeSourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenSkillNames
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps domain SubAgent presets out of Agent core', () => {
    const forbiddenFiles = [join(agentSrc, 'subagent/creative-presets.ts')];
    const existingForbiddenFiles = forbiddenFiles
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).replace(/\\/g, '/'));

    expect(existingForbiddenFiles).toEqual([]);

    const subagentRuntimeSourceFiles = listFiles(join(agentSrc, 'subagent'))
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }))
      .filter(({ relativePath }) => !relativePath.endsWith('architecture-boundary-guards.test.ts'));

    const forbiddenDomainPresetTerms = [
      /['"`]creative-director['"`]/,
      /['"`]cinematographer['"`]/,
      /['"`]composer['"`]/,
      /['"`]vfx-artist['"`]/,
      /['"`]quality-checker['"`]/,
      /\bquality_tier\b/,
      /\bQualityTier\b/,
      /\bCreativeAgentType\b/,
    ];
    const violations = subagentRuntimeSourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenDomainPresetTerms
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps host-specific projection names quarantined away from runtime production callers', () => {
    const sourceFiles = listFiles(packageRoot)
      .filter(
        (file) =>
          (file.endsWith('.ts') || file.endsWith('.tsx')) &&
          !isTestFile(file) &&
          !relative(repoRoot, file).includes('__tests__/'),
      )
      .map((file) => ({
        file,
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));

    const allowedShimFiles = new Set([
      'packages/agent/src/runtime/agent-stream-state.ts',
      'packages/agent/src/runtime/backfill-coordinator.ts',
      'packages/agent/src/runtime/context-webview-presenter.ts',
      'packages/agent/src/runtime/index.ts',
      'packages/neko-agent/packages/agent/src/runtime/agent-stream-state.ts',
      'packages/neko-agent/packages/agent/src/runtime/backfill-coordinator.ts',
      'packages/neko-agent/packages/agent/src/runtime/context-webview-presenter.ts',
      'packages/neko-agent/packages/agent/src/runtime/index.ts',
    ]);
    const allowedAdapterFiles = new Set([
      'packages/extension/src/chat/message/agentTurnBridge.ts',
      'packages/extension/src/services/mediaTurnBridge.ts',
      'packages/neko-agent/packages/extension/src/chat/message/agentTurnBridge.ts',
      'packages/neko-agent/packages/extension/src/services/mediaTurnBridge.ts',
    ]);
    const forbiddenPatterns = [
      /\brunAgentTurnForWebviewRuntime\b/,
      /\bbuildAgentTurnForWebviewRuntimeInput\b/,
      /\brunAgentMediaTurnForWebview\b/,
      /\bprojectAgentStreamEventToWebviewMessages\b/,
      /\bAgentStreamWebviewMessage\b/,
      /\bAgentTurnForWebviewRuntimeMessage\b/,
      /\bRunAgentTurnForWebviewRuntime(?:Input|Result)\b/,
      /\bRunAgentMediaTurnForWebview(?:Input|Result)\b/,
      /\bBackfillCoordinatorWebviewPort\b/,
      /\bContextWebviewMessage\b/,
    ];

    const violations = sourceFiles.flatMap(({ relativePath, source }) => {
      if (allowedShimFiles.has(relativePath) || allowedAdapterFiles.has(relativePath)) {
        return [];
      }
      return forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`);
    });

    expect(violations).toEqual([]);
  });

  it('keeps Webview-generated asset DTOs and render handles out of host-neutral contracts', () => {
    const hostNeutralRoots = [
      join(packageRoot, 'agent-types/src'),
      join(packageRoot, 'agent/src'),
      join(packageRoot, 'platform/src'),
    ];
    const allowedSanitizers = new Set([
      'packages/agent/src/runtime/message-resource-projector.ts',
      'packages/agent/src/session/working-memory.ts',
      'packages/neko-agent/packages/agent/src/runtime/message-resource-projector.ts',
      'packages/neko-agent/packages/agent/src/session/working-memory.ts',
    ]);
    const violations = hostNeutralRoots.flatMap((root) =>
      listFiles(root)
        .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
        .filter((file) => !isTestFile(file) && !relative(repoRoot, file).includes('__tests__/'))
        .flatMap((file) => {
          const relativePath = relative(repoRoot, file).replace(/\\/g, '/');
          if (allowedSanitizers.has(relativePath)) {
            return [];
          }
          const source = stripTypeScriptComments(readFileSync(file, 'utf-8'));
          return [/\bWebviewGeneratedAsset\b/, /\bwebviewUri\b/, /\bimagePathWebviewUris\b/]
            .filter((pattern) => pattern.test(source))
            .map((pattern) => `${relativePath} matches ${pattern}`);
        }),
    );

    expect(violations).toEqual([]);
  });

  it('keeps Agent Extension from re-owning project search aggregation policy', () => {
    const sourceFiles = listFiles(extensionSrc)
      .filter((file) => (file.endsWith('.ts') || file.endsWith('.tsx')) && !isTestFile(file))
      .map((file) => ({
        file,
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));

    const shimImportViolations = sourceFiles.flatMap(({ file, source }) =>
      [...source.matchAll(/from\s+['"]([^'"]*services\/projectSearch[^'"]*)['"]/g)].map(
        (match) => `${relative(repoRoot, file)} -> ${match[1]}`,
      ),
    );
    expect(shimImportViolations).toEqual([]);

    const adapterPath = join(extensionSrc, 'services/agentProjectSearchAdapters.ts');
    const adapterSource = stripTypeScriptComments(readFileSync(adapterPath, 'utf-8'));
    const forbiddenLocalPolicyHelpers = [
      /\bfunction\s+dedupeCreativeEntityItems\b/,
      /\bfunction\s+dedupeKeyForProjectSearchItem\b/,
      /\bfunction\s+shouldPreferProjectSearchItem\b/,
      /\bfunction\s+aggregateCreativeEntityStatus\b/,
      /\bfunction\s+aggregateItemFreshness\b/,
      /\bfunction\s+aggregateStateFreshness\b/,
      /\bfunction\s+dashboardRowToSearchItem\b/,
      /\bfunction\s+extractLineBasedScriptCharacters\b/,
      /\bfunction\s+scriptCandidateToSearchItem\b/,
    ];
    const policyViolations = forbiddenLocalPolicyHelpers
      .filter((pattern) => pattern.test(adapterSource))
      .map((pattern) => `${relative(repoRoot, adapterPath)} matches ${pattern}`);

    expect(policyViolations).toEqual([]);
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

  it('keeps removed IDC run control APIs out of Agent source and tests', () => {
    const sourceFiles = listFiles(agentSrc)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }))
      .filter(({ relativePath }) => !relativePath.endsWith('architecture-boundary-guards.test.ts'));
    const forbiddenPatterns = [
      /\bstartIdcRunWithIntent\b/,
      /\bstopIdcRunWithIntent\b/,
      /\bstartIdcRun\s*\(/,
      /\bgetActiveIdcRun\b/,
      /\bgetIdcRun\s*\(/,
      /\blistIdcRuns\b/,
      /\bcreateIdcRunStore\b/,
      /\bIIdcRunStore\b/,
      /\bIdcRunLifecycle\b/,
      /\b_runStore\b/,
      /\b_idcRunLifecycle\b/,
      /\bworkflowRuntime\b/,
      /\bIWorkflowRuntime\b/,
    ];
    const violations = sourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps legacy IDC workflow control targets out of production activation paths', () => {
    const sourceFiles = [
      ...listFiles(agentSrc),
      ...listFiles(extensionSrc),
      ...listFiles(webviewSrc),
    ]
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));

    const violations = sourceFiles.flatMap(({ relativePath, source }) =>
      [/'idc-workflow'/, /"idc-workflow"/, /\bStartIDCWorkflow\b/, /['"`]\/idc(?:\s|['"`])/]
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps legacy idc metadata out of Agent creation guidance parsing', () => {
    const sourceFiles = [
      join(agentSrc, 'session/creation-turn-planning.ts'),
      join(agentSrc, 'session/creation-execution-metadata.ts'),
    ].map((file) => ({
      relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
      source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
    }));

    const violations = sourceFiles.flatMap(({ relativePath, source }) =>
      [/metadata\[['"]idc['"]\]/, /\bagentCreation\s*\?\?\s*metadata\[['"]idc['"]\]/]
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps workspace snapshot APIs named as staged creation compatibility, not IDC runtime', () => {
    const workspaceSrc = join(agentSrc, 'workspace');
    const sourceFiles = listFiles(workspaceSrc)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }));
    const forbiddenPatterns = [
      /\bidc-runtime-state-(?:store|reader)\b/,
      /\bcreateIdcRuntimeStateStore\b/,
      /\breadIdcRuntimeState\b/,
      /\bparseIdcRuntimeState\b/,
      /\bIIdcRuntimeStateStore\b/,
      /\bIdcRuntimeState(?:Input|Snapshot|FsOps|StoreConfig|ReadFsOps)?\b/,
      /\bReadIdcRuntimeStateConfig\b/,
      /\bIdcRuntimeRestoreState\b/,
    ];
    const violations = sourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps prompt-chain observation ports from being named as creation runtimes', () => {
    const sourceFiles = [...listFiles(agentSrc), ...listFiles(join(packageRoot, 'agent-types/src'))]
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }))
      .filter(({ relativePath }) => !relativePath.endsWith('architecture-boundary-guards.test.ts'));

    const forbiddenPatterns = [
      /\bConversationSkillCreationRuntimePort\b/,
      /\bcreationRuntime\??:/,
      /\b_deps\.creationRuntime\b/,
      /\bcreation runtime is configured\b/i,
    ];
    const violations = sourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps Agent-native creation as prompt/profile guidance, not a parallel runtime or state store', () => {
    const forbiddenFiles = [
      'packages/neko-agent/packages/agent/src/runtime/agent-native-creation-runtime.ts',
      'packages/neko-agent/packages/agent/src/workspace/staged-creation-snapshot-reader.ts',
      'packages/neko-agent/packages/agent/src/workspace/staged-creation-snapshot-store.ts',
      'packages/neko-agent/packages/agent-types/src/creation-activity.ts',
    ];
    const existingForbiddenFiles = forbiddenFiles.filter((file) =>
      existsSync(join(repoRoot, file)),
    );

    expect(existingForbiddenFiles).toEqual([]);

    const sourceFiles = [
      ...listFiles(agentSrc),
      ...listFiles(join(packageRoot, 'agent-types/src')),
      ...listFiles(extensionSrc),
      ...listFiles(webviewSrc),
    ]
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }))
      .filter(({ relativePath }) => !relativePath.endsWith('architecture-boundary-guards.test.ts'));

    const forbiddenPatterns = [
      /agent-native-creation-runtime/,
      /staged-creation-snapshot-(?:reader|store)/,
      /from ['"][^'"]*creation-activity['"]/,
      /\bAgentNativeCreationRuntime\b/,
      /\bcreateAgentNativeCreationRuntime\b/,
      /\bStagedCreationSnapshot\b/,
      /\bAgentCreationActivity\b/,
    ];
    const violations = sourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps new production code from importing legacy workflow trace DTOs as creation identity', () => {
    const allowedLegacyFiles = new Set([
      'packages/neko-agent/packages/agent-types/src/index.ts',
      'packages/neko-agent/packages/agent-types/src/webview-protocol.ts',
    ]);
    const sourceFiles = [
      ...listFiles(join(packageRoot, 'agent-types/src')),
      ...listFiles(agentSrc),
      ...listFiles(extensionSrc),
      ...listFiles(webviewSrc),
    ]
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }))
      .filter(({ relativePath }) => !allowedLegacyFiles.has(relativePath));

    const violations = sourceFiles.flatMap(({ relativePath, source }) =>
      [/from ['"]\.\/workflow['"]/, /from ['"]@neko-agent\/types['"][^;]*AgentWorkflow/]
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
    expect(
      existsSync(join(repoRoot, 'packages/neko-agent/packages/agent-types/src/workflow.ts')),
    ).toBe(false);
  });

  it('keeps production task projection names creation-native outside explicit legacy trace files', () => {
    const allowedLegacyFiles = new Set(['packages/agent/src/task/creation-projected-task.ts']);
    const sourceFiles = [...listFiles(join(packageRoot, 'agent-types/src')), ...listFiles(agentSrc)]
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }))
      .filter(({ relativePath }) => !allowedLegacyFiles.has(relativePath));

    const violations = sourceFiles.flatMap(({ relativePath, source }) => {
      const patterns = [
        /\bIIdcTaskProjection\b/,
        /\bIdcProjectedTask\b/,
        /\bcreateTaskManagerIdcTaskProjection\b/,
        /['"`]idc:\$\{/,
        /source:\s*['"]idc['"]/,
      ].filter((pattern) => {
        if (
          relativePath === 'packages/agent/src/task/task-manager.ts' &&
          String(pattern) === String(/['"`]idc:\$\{/)
        ) {
          return false;
        }
        return pattern.test(source);
      });
      return patterns.map((pattern) => `${relativePath} matches ${pattern}`);
    });

    expect(violations).toEqual([]);
  });

  it('keeps the superseded creation-iteration change frozen', () => {
    const changeDir = join(
      repoRoot,
      '../..',
      'openspec/changes/introduce-agent-creation-iteration-contracts',
    );
    const files = [
      'proposal.md',
      'design.md',
      'tasks.md',
      'specs/agent-creation-iteration-contracts/spec.md',
    ];

    for (const file of files) {
      const source = readFileSync(join(changeDir, file), 'utf-8');
      expect(source).toContain('Superseded by `normalize-agent-native-creation-boundary`');
    }

    const tasks = readFileSync(join(changeDir, 'tasks.md'), 'utf-8');
    expect(tasks).not.toMatch(/^- \[ \] \d/m);
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
  '_activeTurnRunId',
  '_reactRunnerState',
  '_reactLoopBaseHooks',
  '_runnerHooks',
  '_eventBus',
  '_nekoPaths',
  '_eventSink',
  '_auditsSink',
  '_stepsSink',
  '_artifactWatcher',
  '_artifactFacade',
  '_feedbackRuntime',
  '_promptRuntime',
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
  '_artifactFacade',
  '_feedbackRuntime',
  '_promptRuntime',
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
  'timer' | 'sink' | 'queue' | 'guidance-state' | 'transition-buffer' | 'prompt-module-instance';

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

function stripTypeScriptComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function createObjectKeyPattern(key: string): RegExp {
  const escaped = escapeRegExp(key);
  const bareKey = /^[A-Za-z_$][\w$]*$/.test(key) ? escaped : '(?!)';
  return new RegExp(`(?:^|[,{]\\s*)(?:['"\`]${escaped}['"\`]|${bareKey})\\s*:`, 'm');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function listFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    if (excludedScanDirectories.has(entry)) {
      continue;
    }
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

const excludedScanDirectories = new Set(['node_modules', 'dist', '.turbo', 'coverage']);

function isTestFile(file: string): boolean {
  const name = basename(file);
  return (
    name.endsWith('.test.ts') ||
    name.endsWith('.test.tsx') ||
    name.endsWith('.spec.ts') ||
    name.endsWith('.spec.tsx')
  );
}
