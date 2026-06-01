import type {
  IToolRegistry,
  StoryboardImageStrategyActionV1,
  StoryboardImageStrategyBlockedActionV1,
  StoryboardImageStrategyInterpreterInputV1,
  StoryboardImageStrategyInterpreterResultV1,
  StoryboardImageStrategyOverrideV1,
  StoryboardImageToolCapabilityV1,
  StoryboardMediaRefV1,
  StoryboardShotRowV1,
  StoryboardTableV1,
  StoryboardValidationDiagnosticV1,
  Tool,
  ToolExecuteOptions,
  ToolResult,
} from '@neko/shared';
import {
  interpretStoryboardImageStrategiesV1,
  hasBlockingStoryboardDiagnostics,
} from '@neko/shared';

export interface StoryboardImageRuntimeToolPort {
  readonly get?: IToolRegistry['get'];
  readonly has?: IToolRegistry['has'];
  readonly list?: IToolRegistry['list'];
  readonly execute?: IToolRegistry['execute'];
}

export interface StoryboardImageRuntimePlanInput {
  readonly table: StoryboardTableV1;
  readonly userOverride?: StoryboardImageStrategyOverrideV1;
  readonly availableTools?: readonly StoryboardImageToolCapabilityV1[];
  readonly toolPort?: StoryboardImageRuntimeToolPort;
}

export interface StoryboardImageRuntimePlan {
  readonly table: StoryboardTableV1;
  readonly interpretation: StoryboardImageStrategyInterpreterResultV1;
  readonly executableActions: readonly StoryboardImageStrategyActionV1[];
  readonly reuseActions: readonly StoryboardImageStrategyActionV1[];
  readonly blockedActions: readonly StoryboardImageStrategyBlockedActionV1[];
  readonly diagnostics: readonly StoryboardValidationDiagnosticV1[];
}

export interface ExecuteStoryboardImageRuntimeInput extends StoryboardImageRuntimePlanInput {
  readonly toolOptions?: ToolExecuteOptions;
}

export interface StoryboardImageRuntimeExecution {
  readonly action: StoryboardImageStrategyActionV1;
  readonly result: ToolResult;
}

export interface ExecuteStoryboardImageRuntimeResult {
  readonly plan: StoryboardImageRuntimePlan;
  readonly executions: readonly StoryboardImageRuntimeExecution[];
  readonly diagnostics: readonly StoryboardValidationDiagnosticV1[];
}

export interface StoryboardGeneratedMediaBackfillOutput {
  readonly assetIndex: number;
  readonly role?: 'generated' | 'derived';
  readonly label?: string;
  readonly mimeType?: string;
}

export interface StoryboardGeneratedMediaBackfillCompletion {
  readonly sceneId: string;
  readonly shotId?: string;
  readonly shotNumber?: number;
  readonly toolCallId: string;
  readonly success: boolean;
  readonly outputs?: readonly StoryboardGeneratedMediaBackfillOutput[];
  readonly error?: string;
}

export interface BackfillStoryboardGeneratedMediaRefsInput {
  readonly table: StoryboardTableV1;
  readonly completions: readonly StoryboardGeneratedMediaBackfillCompletion[];
}

export interface BackfillStoryboardGeneratedMediaRefsResult {
  readonly table: StoryboardTableV1;
  readonly diagnostics: readonly StoryboardValidationDiagnosticV1[];
}

const STORYBOARD_IMAGE_TOOL_NAMES = ['GenerateImage', 'TransformImage', 'ResolveMediaRef'] as const;

export function createStoryboardImageToolCapabilities(
  toolPort: StoryboardImageRuntimeToolPort | undefined,
): readonly StoryboardImageToolCapabilityV1[] {
  if (!toolPort) return [];

  const listedTools = toolPort.list?.() ?? [];
  return STORYBOARD_IMAGE_TOOL_NAMES.flatMap((toolName) => {
    const tool = resolveStoryboardRuntimeTool(toolPort, listedTools, toolName);
    const exists = tool !== undefined || toolPort.has?.(toolName) === true;
    if (!exists) return [];
    return [
      {
        toolName,
        supportsReferences: inferStoryboardToolReferenceSupport(toolName, tool),
        supportsMasks: toolName === 'TransformImage' || inferStoryboardToolMaskSupport(tool),
      },
    ];
  });
}

function resolveStoryboardRuntimeTool(
  toolPort: StoryboardImageRuntimeToolPort,
  listedTools: readonly Tool[],
  toolName: (typeof STORYBOARD_IMAGE_TOOL_NAMES)[number],
): Tool | undefined {
  return toolPort.get?.(toolName) ?? listedTools.find((tool) => tool.name === toolName);
}

function inferStoryboardToolReferenceSupport(
  toolName: (typeof STORYBOARD_IMAGE_TOOL_NAMES)[number],
  tool: Tool | undefined,
): boolean {
  if (toolName === 'TransformImage' || toolName === 'ResolveMediaRef') return true;
  if (toolName !== 'GenerateImage' || !tool) return false;
  return toolHasReferenceInput(tool);
}

function inferStoryboardToolMaskSupport(tool: Tool | undefined): boolean {
  if (!tool) return false;
  return Object.keys(flattenToolPropertyNames(tool)).some((propertyName) =>
    normalizeToolPropertyName(propertyName).includes('mask'),
  );
}

function toolHasReferenceInput(tool: Tool): boolean {
  return Object.keys(flattenToolPropertyNames(tool)).some(isStoryboardReferenceInputName);
}

function flattenToolPropertyNames(tool: Tool): Record<string, true> {
  const names: Record<string, true> = {};
  const visitProperties = (properties: Tool['parameters']['properties']): void => {
    for (const [propertyName, property] of Object.entries(properties)) {
      names[propertyName] = true;
      if (property.properties) {
        visitProperties(property.properties);
      }
    }
  };

  visitProperties(tool.parameters.properties);
  return names;
}

function isStoryboardReferenceInputName(propertyName: string): boolean {
  const normalized = normalizeToolPropertyName(propertyName);
  return (
    normalized.includes('referenceimage') ||
    normalized.includes('sourceimage') ||
    normalized.includes('inputimage') ||
    normalized.includes('sourcemediaref') ||
    normalized.includes('mediaref') ||
    normalized.includes('assetref') ||
    normalized === 'images' ||
    normalized === 'imageurls' ||
    normalized === 'imageuris' ||
    normalized === 'imagepaths'
  );
}

function normalizeToolPropertyName(propertyName: string): string {
  return propertyName.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function planStoryboardImageStrategyRuntime(
  input: StoryboardImageRuntimePlanInput,
): StoryboardImageRuntimePlan {
  const availableTools =
    input.availableTools ?? createStoryboardImageToolCapabilities(input.toolPort);
  const interpretation = interpretStoryboardImageStrategiesV1({
    table: input.table,
    ...(input.userOverride ? { userOverride: input.userOverride } : {}),
    availableTools,
  } satisfies StoryboardImageStrategyInterpreterInputV1);
  const executableActions = interpretation.actions.filter(
    (action) => action.kind !== 'reuse-original',
  );
  const reuseActions = interpretation.actions.filter((action) => action.kind === 'reuse-original');

  return {
    table: input.table,
    interpretation,
    executableActions,
    reuseActions,
    blockedActions: interpretation.blockedActions,
    diagnostics: interpretation.diagnostics,
  };
}

export async function executeStoryboardImageStrategyRuntime(
  input: ExecuteStoryboardImageRuntimeInput,
): Promise<ExecuteStoryboardImageRuntimeResult> {
  const plan = planStoryboardImageStrategyRuntime(input);
  const executions: StoryboardImageRuntimeExecution[] = [];
  const diagnostics: StoryboardValidationDiagnosticV1[] = [...plan.diagnostics];

  if (!input.toolPort?.execute) {
    return {
      plan,
      executions,
      diagnostics: [
        ...diagnostics,
        ...plan.executableActions.map((action) =>
          createStoryboardRuntimeDiagnostic(
            'warning',
            'missing-capability',
            ['availableTools', action.toolName ?? action.kind],
            `${action.kind} could not execute because no tool execution port is available.`,
          ),
        ),
      ],
    };
  }

  for (const action of plan.executableActions) {
    if (!action.toolName) {
      diagnostics.push(
        createStoryboardRuntimeDiagnostic(
          'warning',
          'missing-capability',
          ['availableTools'],
          `${action.kind} has no routed tool name.`,
        ),
      );
      continue;
    }

    const result = await input.toolPort.execute(
      action.toolName,
      createStoryboardToolArguments(action),
      input.toolOptions,
    );
    executions.push({ action, result });
    if (!result.success) {
      diagnostics.push(
        createStoryboardRuntimeDiagnostic(
          'warning',
          'generation-failed',
          ['actions', action.sceneId, action.shotId],
          result.error ?? `${action.kind} failed.`,
        ),
      );
    }
  }

  return { plan, executions, diagnostics };
}

export function backfillStoryboardGeneratedMediaRefs(
  input: BackfillStoryboardGeneratedMediaRefsInput,
): BackfillStoryboardGeneratedMediaRefsResult {
  const diagnostics: StoryboardValidationDiagnosticV1[] = [];
  const scenes = input.table.scenes.map((scene) => {
    const shots = scene.shots.map((shot) => {
      const completions = input.completions.filter((completion) =>
        completionMatchesShot(completion, scene.sceneId, shot),
      );
      if (completions.length === 0) return shot;

      const refs: StoryboardMediaRefV1[] = [...(shot.generatedMediaRefs ?? [])];
      for (const completion of completions) {
        if (!completion.success) {
          diagnostics.push(
            createStoryboardRuntimeDiagnostic(
              'warning',
              'generation-failed',
              ['scenes', scene.sceneId, 'shots', shot.shotId ?? shot.shotNumber],
              completion.error ?? 'Storyboard media generation failed.',
            ),
          );
          continue;
        }

        if (!completion.outputs || completion.outputs.length === 0) {
          diagnostics.push(
            createStoryboardRuntimeDiagnostic(
              'warning',
              'missing-backfill-output',
              ['scenes', scene.sceneId, 'shots', shot.shotId ?? shot.shotNumber],
              'Completed storyboard media task did not include stable outputs.',
            ),
          );
          continue;
        }

        for (const output of completion.outputs) {
          refs.push({
            refId: `tool-result:${completion.toolCallId}:${output.assetIndex}`,
            role: output.role ?? 'generated',
            locator: {
              type: 'tool-result',
              toolCallId: completion.toolCallId,
              assetIndex: output.assetIndex,
            },
            ...(output.label ? { label: output.label } : {}),
            ...(output.mimeType ? { mimeType: output.mimeType } : {}),
          });
        }
      }

      return refs.length === (shot.generatedMediaRefs ?? []).length
        ? shot
        : {
            ...shot,
            generatedMediaRefs: dedupeStoryboardRefs(refs),
            mediaRefs: dedupeStoryboardRefs([...(shot.mediaRefs ?? []), ...refs]),
          };
    });

    return { ...scene, shots };
  });

  for (const completion of input.completions) {
    const found = input.table.scenes.some((scene) =>
      scene.shots.some((shot) => completionMatchesShot(completion, scene.sceneId, shot)),
    );
    if (!found) {
      diagnostics.push(
        createStoryboardRuntimeDiagnostic(
          'warning',
          'backfill-target-not-found',
          ['completions', completion.toolCallId],
          'Storyboard generated media completion did not match any shot.',
        ),
      );
    }
  }

  return {
    table: { ...input.table, scenes },
    diagnostics,
  };
}

export function storyboardRuntimeCanExecute(plan: StoryboardImageRuntimePlan): boolean {
  return plan.executableActions.length > 0 && !hasBlockingStoryboardDiagnostics(plan.diagnostics);
}

function createStoryboardToolArguments(
  action: StoryboardImageStrategyActionV1,
): Record<string, unknown> {
  return {
    sceneId: action.sceneId,
    shotId: action.shotId,
    shotNumber: action.shotNumber,
    imageStrategy: action.imageStrategy,
    ...(action.generationPrompt ? { prompt: action.generationPrompt } : {}),
    ...(action.sourceMediaRefs ? { sourceMediaRefs: action.sourceMediaRefs } : {}),
  };
}

function completionMatchesShot(
  completion: StoryboardGeneratedMediaBackfillCompletion,
  sceneId: string,
  shot: StoryboardShotRowV1,
): boolean {
  return (
    completion.sceneId === sceneId &&
    ((completion.shotId !== undefined && completion.shotId === shot.shotId) ||
      (completion.shotNumber !== undefined && completion.shotNumber === shot.shotNumber))
  );
}

function dedupeStoryboardRefs(
  refs: readonly StoryboardMediaRefV1[],
): readonly StoryboardMediaRefV1[] {
  const seen = new Set<string>();
  const result: StoryboardMediaRefV1[] = [];
  for (const ref of refs) {
    if (seen.has(ref.refId)) continue;
    seen.add(ref.refId);
    result.push(ref);
  }
  return result;
}

function createStoryboardRuntimeDiagnostic(
  severity: StoryboardValidationDiagnosticV1['severity'],
  code: StoryboardValidationDiagnosticV1['code'],
  path: StoryboardValidationDiagnosticV1['path'],
  message: string,
): StoryboardValidationDiagnosticV1 {
  return { severity, code, path, message };
}
