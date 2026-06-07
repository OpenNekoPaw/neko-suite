import type {
  ArtifactExecutionSummary,
  IToolRegistry,
  ShotImagePrepBatchRequest,
  ShotImagePrepCostEstimate,
  ShotImagePrepDiagnostic,
  ShotImagePrepPlan,
  StoryboardMediaRef,
  Tool,
  ToolExecuteOptions,
  ToolResult,
} from '@neko/shared';
import { transitionShotImagePrepStatus, validateShotImagePrepPlan } from '@neko/shared';

export interface ShotImagePrepRuntimeToolPort {
  readonly get?: IToolRegistry['get'];
  readonly has?: IToolRegistry['has'];
  readonly list?: IToolRegistry['list'];
  readonly execute?: IToolRegistry['execute'];
}

export interface ShotImagePrepToolCapability {
  readonly toolName: 'GenerateImage' | 'TransformImage';
  readonly supportsSourceImage: boolean;
  readonly supportsMasks: boolean;
  readonly supportsReferences: boolean;
  readonly providerId?: string;
}

export interface ShotImagePrepToolRequest {
  readonly toolName: 'GenerateImage' | 'TransformImage';
  readonly args: Record<string, unknown>;
}

export interface ShotImagePrepExecutionInput {
  readonly artifactId: string;
  readonly plan: ShotImagePrepPlan;
  readonly toolPort?: ShotImagePrepRuntimeToolPort;
  readonly availableTools?: readonly ShotImagePrepToolCapability[];
  readonly toolOptions?: ToolExecuteOptions;
  readonly providerId?: string;
}

export interface ShotImagePrepExecutionResult {
  readonly plan: ShotImagePrepPlan;
  readonly request?: ShotImagePrepToolRequest;
  readonly result?: ToolResult;
  readonly summary: ArtifactExecutionSummary;
  readonly diagnostics: readonly ShotImagePrepDiagnostic[];
}

export interface ShotImagePrepBackfillCompletion {
  readonly planId: string;
  readonly toolCallId: string;
  readonly success: boolean;
  readonly providerId?: string;
  readonly outputs?: readonly ShotImagePrepBackfillOutput[];
  readonly error?: string;
}

export interface ShotImagePrepBackfillOutput {
  readonly assetIndex: number;
  readonly role?: 'generated' | 'derived';
  readonly label?: string;
  readonly mimeType?: string;
}

export interface ShotImagePrepBatchGateInput {
  readonly plans: readonly ShotImagePrepPlan[];
  readonly request: ShotImagePrepBatchRequest;
  readonly estimates?: readonly ShotImagePrepCostEstimate[];
  readonly availableTools?: readonly ShotImagePrepToolCapability[];
}

export interface ShotImagePrepBatchGateResult {
  readonly runnablePlans: readonly ShotImagePrepPlan[];
  readonly skippedPlans: readonly ShotImagePrepPlan[];
  readonly diagnostics: readonly ShotImagePrepDiagnostic[];
  readonly summary: ArtifactExecutionSummary;
}

export interface ExecuteShotImagePrepBatchInput extends ShotImagePrepBatchGateInput {
  readonly artifactId: string;
  readonly toolPort?: ShotImagePrepRuntimeToolPort;
  readonly toolOptions?: ToolExecuteOptions;
  readonly signal?: AbortSignal;
}

export interface ShotImagePrepBatchExecutionResult {
  readonly plans: readonly ShotImagePrepPlan[];
  readonly executions: readonly ShotImagePrepExecutionResult[];
  readonly diagnostics: readonly ShotImagePrepDiagnostic[];
  readonly summary: ArtifactExecutionSummary;
}

const SHOT_IMAGE_PREP_TOOL_NAMES = ['GenerateImage', 'TransformImage'] as const;

export function createShotImagePrepToolCapabilities(
  toolPort: ShotImagePrepRuntimeToolPort | undefined,
): readonly ShotImagePrepToolCapability[] {
  if (!toolPort) return [];
  const listedTools = toolPort.list?.() ?? [];
  return SHOT_IMAGE_PREP_TOOL_NAMES.flatMap((toolName) => {
    const tool = resolveRuntimeTool(toolPort, listedTools, toolName);
    const exists = tool !== undefined || toolPort.has?.(toolName) === true;
    if (!exists) return [];
    return [
      {
        toolName,
        supportsSourceImage: toolName === 'TransformImage' || toolHasInput(tool, sourceInputNames),
        supportsMasks: toolName === 'TransformImage' || toolHasInput(tool, maskInputNames),
        supportsReferences:
          toolName === 'TransformImage' || toolHasInput(tool, referenceInputNames),
      },
    ];
  });
}

export function createShotImagePrepToolRequest(
  plan: ShotImagePrepPlan,
): ShotImagePrepToolRequest | undefined {
  if (plan.imageStrategy === 'transform-original') {
    const source =
      plan.sourceMediaRefs.find((ref) => ref.role !== 'mask') ?? plan.sourceMediaRefs[0];
    if (!source) return undefined;
    return {
      toolName: 'TransformImage',
      args: {
        planId: plan.planId,
        sceneId: plan.sceneId,
        shotId: plan.shotId,
        imageStrategy: plan.imageStrategy,
        sourceMediaRefs: plan.sourceMediaRefs,
        sourceImageRef: source,
        ...(plan.maskRefs && plan.maskRefs.length > 0 ? { maskRefs: plan.maskRefs } : {}),
        ...(plan.referenceBundle ? { referenceBundle: plan.referenceBundle } : {}),
        ...(plan.editInstruction ? { editInstruction: plan.editInstruction } : {}),
        ...(plan.targetAspectRatio ? { targetAspectRatio: plan.targetAspectRatio } : {}),
        ...(plan.targetStyle ? { targetStyle: plan.targetStyle } : {}),
        operationPlan: plan.operationPlan,
      },
    };
  }

  if (plan.imageStrategy === 'generate-new' || plan.imageStrategy === 'use-as-reference') {
    return {
      toolName: 'GenerateImage',
      args: {
        planId: plan.planId,
        sceneId: plan.sceneId,
        shotId: plan.shotId,
        imageStrategy: plan.imageStrategy,
        prompt: plan.generationPrompt ?? plan.editInstruction ?? '',
        ...(plan.negativePrompt ? { negativePrompt: plan.negativePrompt } : {}),
        ...(plan.sourceMediaRefs.length > 0 ? { sourceMediaRefs: plan.sourceMediaRefs } : {}),
        ...(plan.referenceBundle ? { referenceBundle: plan.referenceBundle } : {}),
        ...(plan.targetAspectRatio ? { targetAspectRatio: plan.targetAspectRatio } : {}),
        ...(plan.targetStyle ? { targetStyle: plan.targetStyle } : {}),
        operationPlan: plan.operationPlan,
      },
    };
  }

  return undefined;
}

export function estimateShotImagePrepCost(
  plan: ShotImagePrepPlan,
  providerId?: string,
): ShotImagePrepCostEstimate {
  return {
    planId: plan.planId,
    ...(providerId ? { providerId } : {}),
    operationPlan: plan.operationPlan,
    estimateState: 'unknown',
    diagnostics: [
      diagnostic(
        'warning',
        'missing-cost-estimate',
        ['costEstimate', plan.planId],
        'Provider cost estimate is unavailable for this shot image prep plan.',
      ),
    ],
  };
}

export async function executeShotImagePrepPlan(
  input: ShotImagePrepExecutionInput,
): Promise<ShotImagePrepExecutionResult> {
  const diagnostics: ShotImagePrepDiagnostic[] = [];
  const validation = validateShotImagePrepPlan(input.plan);
  diagnostics.push(...validation.diagnostics);
  if (!validation.ok) {
    return executionResult({
      input,
      diagnostics,
      status: 'failed',
      message: 'Shot image prep validation failed.',
    });
  }

  if (input.plan.status !== 'approved' && input.plan.status !== 'queued') {
    diagnostics.push(
      diagnostic(
        'warning',
        'invalid-status',
        ['status'],
        'Shot image prep execution requires approved or queued status.',
      ),
    );
    return executionResult({
      input,
      diagnostics,
      status: 'failed',
      message: 'Shot image prep is not approved for execution.',
    });
  }

  const request = createShotImagePrepToolRequest(input.plan);
  if (!request) {
    diagnostics.push(
      diagnostic(
        'warning',
        'missing-capability',
        ['imageStrategy'],
        `${input.plan.imageStrategy} does not require a generation or transform tool.`,
      ),
    );
    return executionResult({
      input,
      diagnostics,
      status: 'unavailable',
      message: 'No executable image prep request was created.',
    });
  }

  const availableTools =
    input.availableTools ?? createShotImagePrepToolCapabilities(input.toolPort);
  const capability = availableTools.find((tool) => tool.toolName === request.toolName);
  if (!capability) {
    diagnostics.push(
      diagnostic(
        'warning',
        'provider-unavailable',
        ['availableTools', request.toolName],
        `${request.toolName} provider is unavailable.`,
      ),
    );
    return executionResult({
      input,
      request,
      diagnostics,
      status: 'unavailable',
      message: `${request.toolName} provider is unavailable.`,
    });
  }

  if (!input.toolPort?.execute) {
    diagnostics.push(
      diagnostic(
        'warning',
        'missing-capability',
        ['toolPort', 'execute'],
        'Shot image prep cannot execute because no tool execution port is available.',
      ),
    );
    return executionResult({
      input,
      request,
      diagnostics,
      status: 'unavailable',
      message: 'No tool execution port is available.',
    });
  }

  const result = await input.toolPort.execute(
    request.toolName,
    withProviderId(request.args, input.providerId),
    input.toolOptions,
  );
  if (!result.success) {
    diagnostics.push(
      diagnostic(
        'warning',
        'provider-unavailable',
        ['result'],
        result.error ?? `${request.toolName} execution failed before stable output refs.`,
      ),
    );
  }

  return executionResult({
    input,
    request,
    result,
    diagnostics,
    status: result.success ? 'succeeded' : 'failed',
    message: result.success
      ? 'Shot image prep completed.'
      : (result.error ?? 'Shot image prep failed.'),
  });
}

export function backfillShotImagePrepOutputRefs(
  plan: ShotImagePrepPlan,
  completion: ShotImagePrepBackfillCompletion,
): ShotImagePrepPlan {
  if (!completion.success || completion.outputs === undefined || completion.outputs.length === 0) {
    return {
      ...plan,
      status: 'failed',
      diagnostics: [
        ...(plan.diagnostics ?? []),
        diagnostic(
          'warning',
          completion.success ? 'invalid-source-ref' : 'provider-unavailable',
          ['outputMediaRefs'],
          completion.error ?? 'Shot image prep completed without stable output refs.',
        ),
      ],
    };
  }

  const outputRefs = completion.outputs.map(
    (output): StoryboardMediaRef => ({
      refId: `tool-result:${completion.toolCallId}:${output.assetIndex}`,
      role: output.role ?? (plan.imageStrategy === 'transform-original' ? 'derived' : 'generated'),
      locator: {
        type: 'tool-result',
        toolCallId: completion.toolCallId,
        assetIndex: output.assetIndex,
      },
      ...(output.label ? { label: output.label } : {}),
      ...(output.mimeType ? { mimeType: output.mimeType } : {}),
      metadata: {
        prepPlanId: plan.planId,
        imageStrategy: plan.imageStrategy,
        operationPlan: [...plan.operationPlan],
        ...(completion.providerId ? { providerId: completion.providerId } : {}),
      },
    }),
  );

  return {
    ...plan,
    status: 'succeeded',
    outputMediaRefs: dedupeMediaRefs([...(plan.outputMediaRefs ?? []), ...outputRefs]),
  };
}

export function gateShotImagePrepBatch(
  input: ShotImagePrepBatchGateInput,
): ShotImagePrepBatchGateResult {
  const diagnostics: ShotImagePrepDiagnostic[] = [];
  const selected = input.plans.filter((plan) => input.request.planIds.includes(plan.planId));
  const estimatesByPlanId = new Map(
    (input.estimates ?? []).map((estimate) => [estimate.planId, estimate]),
  );
  const availableTools = input.availableTools ?? [];
  const runnablePlans: ShotImagePrepPlan[] = [];
  const skippedPlans: ShotImagePrepPlan[] = [];

  for (const plan of selected) {
    const planDiagnostics = [
      ...validateShotImagePrepPlan(plan).diagnostics,
      ...diagnosticsForMissingEstimate(plan, estimatesByPlanId.get(plan.planId)),
      ...diagnosticsForUnavailableTool(plan, availableTools),
      ...diagnosticsForBudget(plan, estimatesByPlanId.get(plan.planId), input.request),
    ];
    if (plan.status !== 'approved') {
      planDiagnostics.push(
        diagnostic(
          'warning',
          'invalid-status',
          ['plans', plan.planId, 'status'],
          'Only approved shot image prep plans can enter the batch queue.',
        ),
      );
    }
    diagnostics.push(...planDiagnostics);
    if (planDiagnostics.some(isBlockingBatchDiagnostic)) {
      skippedPlans.push(plan);
    } else {
      runnablePlans.push({
        ...plan,
        status: transitionShotImagePrepStatus(plan.status, 'run-approved-shot-prep-batch'),
      });
    }
  }

  return {
    runnablePlans,
    skippedPlans,
    diagnostics,
    summary: {
      summaryId: `${input.request.batchId}-summary`,
      artifactId: input.request.batchId,
      actionId: 'run-approved-shot-prep-batch',
      status: runnablePlans.length > 0 && skippedPlans.length === 0 ? 'succeeded' : 'partial',
      diagnostics: diagnostics.map(projectDiagnostic),
      metadata: {
        batchId: input.request.batchId,
        requested: selected.length,
        queued: runnablePlans.length,
        skipped: skippedPlans.length,
        maxConcurrency: input.request.maxConcurrency,
      },
    },
  };
}

export async function executeShotImagePrepBatch(
  input: ExecuteShotImagePrepBatchInput,
): Promise<ShotImagePrepBatchExecutionResult> {
  const gate = gateShotImagePrepBatch(input);
  const executions: ShotImagePrepExecutionResult[] = [];
  const plansById = new Map(input.plans.map((plan) => [plan.planId, plan]));
  const queue = [...gate.runnablePlans];
  let cursor = 0;
  let cancelled = false;

  const workerCount = Math.max(1, Math.min(input.request.maxConcurrency, queue.length || 1));
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < queue.length) {
      if (input.signal?.aborted) {
        cancelled = true;
        return;
      }
      const plan = queue[cursor];
      cursor += 1;
      if (!plan) return;
      const execution = await executePlanWithRetry(plan, input);
      executions.push(execution);
      const completedPlan = backfillPlanFromExecution(plan, execution);
      plansById.set(plan.planId, completedPlan);
      if (!execution.result?.success && input.request.failurePolicy === 'stop-on-first-failure') {
        cursor = queue.length;
      }
    }
  });

  await Promise.all(workers);

  const diagnostics = [
    ...gate.diagnostics,
    ...executions.flatMap((execution) => execution.diagnostics),
    ...(cancelled
      ? [
          diagnostic(
            'warning',
            'provider-unavailable',
            ['batch', input.request.batchId, 'cancelled'],
            'Shot image prep batch was cancelled.',
          ),
        ]
      : []),
  ];
  const succeeded = executions.filter(
    (execution) => execution.summary.status === 'succeeded',
  ).length;
  const failed = executions.filter((execution) => execution.summary.status === 'failed').length;
  const unavailable = executions.filter(
    (execution) => execution.summary.status === 'unavailable',
  ).length;
  const skipped = gate.skippedPlans.length + Math.max(0, queue.length - executions.length);
  const status = cancelled
    ? 'cancelled'
    : failed === 0 && unavailable === 0 && skipped === 0
      ? 'succeeded'
      : succeeded > 0
        ? 'partial'
        : unavailable > 0
          ? 'unavailable'
          : 'failed';

  return {
    plans: input.plans.map((plan) => plansById.get(plan.planId) ?? plan),
    executions,
    diagnostics,
    summary: {
      summaryId: `${input.request.batchId}-execution`,
      artifactId: input.artifactId,
      actionId: 'run-approved-shot-prep-batch',
      status,
      diagnostics: diagnostics.map(projectDiagnostic),
      metadata: {
        batchId: input.request.batchId,
        requested: input.request.planIds.length,
        succeeded,
        failed,
        skipped,
        cancelled,
        unavailable,
      },
    },
  };
}

function executionResult(input: {
  readonly input: ShotImagePrepExecutionInput;
  readonly request?: ShotImagePrepToolRequest;
  readonly result?: ToolResult;
  readonly diagnostics: readonly ShotImagePrepDiagnostic[];
  readonly status: ArtifactExecutionSummary['status'];
  readonly message: string;
}): ShotImagePrepExecutionResult {
  return {
    plan: input.input.plan,
    ...(input.request ? { request: input.request } : {}),
    ...(input.result ? { result: input.result } : {}),
    diagnostics: input.diagnostics,
    summary: {
      summaryId: `${input.input.plan.planId}-execution`,
      artifactId: input.input.artifactId,
      actionId: 'run-shot-prep',
      ...(input.input.providerId ? { providerId: input.input.providerId } : {}),
      status: input.status,
      diagnostics: input.diagnostics.map(projectDiagnostic),
      metadata: {
        planId: input.input.plan.planId,
        sceneId: input.input.plan.sceneId,
        shotId: input.input.plan.shotId,
        imageStrategy: input.input.plan.imageStrategy,
        message: input.message,
      },
    },
  };
}

function withProviderId(
  args: Record<string, unknown>,
  providerId: string | undefined,
): Record<string, unknown> {
  return providerId && typeof args.providerId !== 'string' ? { ...args, providerId } : args;
}

function diagnosticsForMissingEstimate(
  plan: ShotImagePrepPlan,
  estimate: ShotImagePrepCostEstimate | undefined,
): readonly ShotImagePrepDiagnostic[] {
  if (
    !estimate ||
    estimate.estimateState === 'unknown' ||
    estimate.estimateState === 'unavailable'
  ) {
    return [
      diagnostic(
        'warning',
        'missing-cost-estimate',
        ['costEstimate', plan.planId],
        'Batch execution requires a current known cost estimate.',
      ),
    ];
  }
  return estimate.diagnostics ?? [];
}

function diagnosticsForBudget(
  plan: ShotImagePrepPlan,
  estimate: ShotImagePrepCostEstimate | undefined,
  request: ShotImagePrepBatchRequest,
): readonly ShotImagePrepDiagnostic[] {
  const maxEstimatedCost = request.budgetLimit?.maxEstimatedCost;
  if (
    maxEstimatedCost !== undefined &&
    estimate?.estimatedCost !== undefined &&
    estimate.estimatedCost > maxEstimatedCost
  ) {
    return [
      diagnostic(
        'warning',
        'budget-exceeded',
        ['budgetLimit', 'maxEstimatedCost'],
        `Plan ${plan.planId} exceeds the declared budget.`,
      ),
    ];
  }
  return [];
}

function diagnosticsForUnavailableTool(
  plan: ShotImagePrepPlan,
  availableTools: readonly ShotImagePrepToolCapability[],
): readonly ShotImagePrepDiagnostic[] {
  const request = createShotImagePrepToolRequest(plan);
  if (!request) return [];
  return availableTools.some((tool) => tool.toolName === request.toolName)
    ? []
    : [
        diagnostic(
          'warning',
          'provider-unavailable',
          ['availableTools', request.toolName],
          `${request.toolName} provider is unavailable.`,
        ),
      ];
}

function isBlockingBatchDiagnostic(diagnostic: ShotImagePrepDiagnostic): boolean {
  return (
    diagnostic.severity === 'error' ||
    diagnostic.code === 'missing-cost-estimate' ||
    diagnostic.code === 'provider-unavailable' ||
    diagnostic.code === 'budget-exceeded' ||
    diagnostic.code === 'invalid-status'
  );
}

function projectDiagnostic(diagnostic: ShotImagePrepDiagnostic) {
  return {
    severity: diagnostic.severity,
    code:
      diagnostic.code === 'provider-unavailable'
        ? ('provider-unavailable' as const)
        : diagnostic.code === 'missing-capability'
          ? ('missing-capability' as const)
          : diagnostic.code === 'missing-cost-estimate'
            ? ('missing-required-field' as const)
            : diagnostic.code === 'budget-exceeded'
              ? ('invalid-required-field' as const)
              : diagnostic.code === 'invalid-source-ref'
                ? ('invalid-resource-ref' as const)
                : diagnostic.code === 'unsafe-runtime-handle'
                  ? ('unsafe-runtime-handle' as const)
                  : diagnostic.code === 'non-serializable-value' ||
                      diagnostic.code === 'oversized-payload'
                    ? ('non-serializable-value' as const)
                    : ('invalid-required-field' as const),
    path: diagnostic.path,
    message: diagnostic.message,
    ...(diagnostic.expected ? { expected: diagnostic.expected } : {}),
    ...(diagnostic.actual !== undefined ? { actual: diagnostic.actual } : {}),
    ...(diagnostic.details ? { details: diagnostic.details } : {}),
  };
}

async function executePlanWithRetry(
  plan: ShotImagePrepPlan,
  input: ExecuteShotImagePrepBatchInput,
): Promise<ShotImagePrepExecutionResult> {
  const maxAttempts = Math.max(1, input.request.retryPolicy.maxAttempts);
  let last: ShotImagePrepExecutionResult | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (input.signal?.aborted) {
      return {
        plan,
        diagnostics: [
          diagnostic(
            'warning',
            'provider-unavailable',
            ['plans', plan.planId, 'cancelled'],
            'Shot image prep execution was cancelled.',
          ),
        ],
        summary: {
          summaryId: `${plan.planId}-execution`,
          artifactId: input.artifactId,
          actionId: 'run-shot-prep',
          status: 'cancelled',
          metadata: { planId: plan.planId, attempt },
        },
      };
    }
    last = await executeShotImagePrepPlan({
      artifactId: input.artifactId,
      plan,
      toolPort: input.toolPort,
      availableTools: input.availableTools,
      toolOptions: input.toolOptions,
      providerId: input.request.providerId,
    });
    if (last.result?.success) return last;
    if (!shouldRetry(last, input.request.retryPolicy.retryOn)) return last;
  }
  return (
    last ??
    executeShotImagePrepPlan({
      artifactId: input.artifactId,
      plan,
      toolPort: input.toolPort,
      availableTools: input.availableTools,
      toolOptions: input.toolOptions,
      providerId: input.request.providerId,
    })
  );
}

function shouldRetry(execution: ShotImagePrepExecutionResult, retryOn: readonly string[]): boolean {
  // TODO(P2): switch to structured provider error codes once media providers expose them.
  const error = execution.result?.error?.toLowerCase() ?? '';
  if (retryOn.includes('provider-timeout') && error.includes('timeout')) return true;
  if (retryOn.includes('rate-limit') && (error.includes('rate limit') || error.includes('429'))) {
    return true;
  }
  if (retryOn.includes('transient-error') && error.includes('transient')) return true;
  return false;
}

function backfillPlanFromExecution(
  plan: ShotImagePrepPlan,
  execution: ShotImagePrepExecutionResult,
): ShotImagePrepPlan {
  if (!execution.result?.success) {
    return {
      ...plan,
      status: 'failed',
      ...(execution.diagnostics.length > 0 ? { diagnostics: execution.diagnostics } : {}),
    };
  }
  const outputs = readBackfillOutputs(execution.result);
  if (outputs.length === 0) {
    return {
      ...plan,
      status: 'failed',
      diagnostics: [
        ...(plan.diagnostics ?? []),
        diagnostic(
          'warning',
          'invalid-source-ref',
          ['outputMediaRefs'],
          'Shot image prep execution succeeded without stable output refs.',
        ),
      ],
    };
  }
  return backfillShotImagePrepOutputRefs(plan, {
    planId: plan.planId,
    toolCallId: readToolCallId(execution.result) ?? `${plan.planId}-tool-result`,
    success: true,
    outputs,
  });
}

function readBackfillOutputs(result: ToolResult): readonly ShotImagePrepBackfillOutput[] {
  const data = result.data;
  if (isRecord(data) && Array.isArray(data.outputs)) {
    return data.outputs.flatMap((output): readonly ShotImagePrepBackfillOutput[] =>
      isBackfillOutput(output) ? [output] : [],
    );
  }
  return (result.attachments ?? []).map((attachment, index) => ({
    assetIndex: index,
    mimeType: attachment.mimeType,
    label: attachment.path,
  }));
}

function readToolCallId(result: ToolResult): string | undefined {
  const data = result.data;
  if (isRecord(data) && typeof data.toolCallId === 'string') return data.toolCallId;
  if (isRecord(data) && typeof data.taskId === 'string') return data.taskId;
  return undefined;
}

function isBackfillOutput(value: unknown): value is ShotImagePrepBackfillOutput {
  return (
    isRecord(value) &&
    typeof value.assetIndex === 'number' &&
    Number.isInteger(value.assetIndex) &&
    (value.role === undefined || value.role === 'generated' || value.role === 'derived') &&
    (value.label === undefined || typeof value.label === 'string') &&
    (value.mimeType === undefined || typeof value.mimeType === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveRuntimeTool(
  toolPort: ShotImagePrepRuntimeToolPort,
  listedTools: readonly Tool[],
  toolName: (typeof SHOT_IMAGE_PREP_TOOL_NAMES)[number],
): Tool | undefined {
  return toolPort.get?.(toolName) ?? listedTools.find((tool) => tool.name === toolName);
}

function toolHasInput(tool: Tool | undefined, names: readonly string[]): boolean {
  if (!tool) return false;
  const propertyNames = new Set(flattenToolPropertyNames(tool).map(normalizePropertyName));
  return names.some((name) => propertyNames.has(normalizePropertyName(name)));
}

function flattenToolPropertyNames(tool: Tool): readonly string[] {
  const names: string[] = [];
  const visit = (properties: Tool['parameters']['properties']): void => {
    for (const [propertyName, property] of Object.entries(properties)) {
      names.push(propertyName);
      if (property.properties) visit(property.properties);
    }
  };
  visit(tool.parameters.properties);
  return names;
}

function normalizePropertyName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function dedupeMediaRefs(refs: readonly StoryboardMediaRef[]): readonly StoryboardMediaRef[] {
  const byId = new Map<string, StoryboardMediaRef>();
  for (const ref of refs) byId.set(ref.refId, ref);
  return Array.from(byId.values());
}

function diagnostic(
  severity: ShotImagePrepDiagnostic['severity'],
  code: ShotImagePrepDiagnostic['code'],
  path: ShotImagePrepDiagnostic['path'],
  message: string,
): ShotImagePrepDiagnostic {
  return { severity, code, path, message };
}

const sourceInputNames = [
  'sourceImageRef',
  'sourceMediaRefs',
  'inputImage',
  'inputImageRef',
  'image',
];

const maskInputNames = ['mask', 'maskRef', 'maskRefs', 'maskImage', 'maskImageRef'];

const referenceInputNames = [
  'referenceBundle',
  'referenceImage',
  'referenceImageRef',
  'referenceImageRefs',
  'sourceMediaRefs',
];
