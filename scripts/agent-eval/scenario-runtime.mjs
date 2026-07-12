import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export const SUPPORTED_ASSERTION_KINDS = new Set([
  'runtime-errors-empty',
  'final-answer-non-empty',
  'final-answer-contains',
  'final-answer-not-contains',
  'no-user-internal-continuation',
  'task-created',
  'task-terminal',
  'continuation-facts-present',
  'conditional-regeneration-when-quality-issue',
  'content-access-used',
  'image-analysis-evidence',
  'canvas-handoff-attempted',
  'skill-triggered',
  'skill-active',
  'skill-activation-attempts-only',
  'tool-call-succeeded',
  'tool-call-failed',
  'timeline-order',
  'active-message-cancelled',
  'markdown-path-events',
]);

const SUPPORTED_MARKDOWN_PATH_EVENT_TYPES = new Set([
  'session-created',
  'source-updated',
  'document-projected',
  'layout-created',
  'session-finalized',
  'source-update-coalesced',
  'layout-discarded',
  'highlight-requested',
  'highlight-applied',
  'highlight-discarded',
]);

export const SUPPORTED_SETUP_KINDS = new Set(['remove-path', 'write-file']);
export const SUPPORTED_POST_CHECK_KINDS = new Set(['file-exists', 'file-absent', 'canvas-json']);

export function validateAndNormalizeScenarioRuntime(scenario, options = {}) {
  const id = scenario?.id ?? '(unknown)';
  const assertions = normalizeArray(scenario?.assertions, `scenario ${id} assertions`);
  const setup = normalizeArray(scenario?.setup, `scenario ${id} setup`);
  const postChecks = normalizeArray(scenario?.postChecks, `scenario ${id} postChecks`);
  const terminalResizes = normalizeArray(
    scenario?.terminalResizes,
    `scenario ${id} terminalResizes`,
  );

  assertions.forEach((assertion, index) => validateAssertion(assertion, id, index));
  setup.forEach((step, index) => validateSetupStep(step, id, index));
  postChecks.forEach((check, index) => validatePostCheck(check, id, index));
  terminalResizes.forEach((resize, index) => validateTerminalResize(resize, id, index));

  return {
    assertions,
    setup,
    postChecks: postChecks.map((check) => normalizePostCheck(check, options.env)),
    terminalResizes,
  };
}

export async function applyScenarioSetup(args) {
  const steps = args.setup ?? [];
  await fs.mkdir(args.cwd, { recursive: true });
  if (steps.length === 0) return [];

  const evidence = [];
  for (const step of steps) {
    const absolutePath = await resolveSafeWorkspacePath(args.cwd, step.path);
    if (step.kind === 'remove-path') {
      await fs.rm(absolutePath, { recursive: true, force: true });
      evidence.push({ kind: step.kind, path: step.path, ok: true });
      continue;
    }

    await fs.mkdir(dirname(absolutePath), { recursive: true });
    const content = step.encoding === 'base64' ? Buffer.from(step.content, 'base64') : step.content;
    await fs.writeFile(absolutePath, content);
    evidence.push({
      kind: step.kind,
      path: step.path,
      encoding: step.encoding ?? 'utf8',
      ok: true,
    });
  }
  return evidence;
}

export async function evaluateScenario(args, facts) {
  const assertions = evaluateScenarioAssertions(args.assertions ?? [], facts);
  const postChecks = await evaluateScenarioPostChecks(args, facts);
  return { assertions, postChecks };
}

export function evaluateScenarioAssertions(assertions, facts) {
  return assertions.map((assertion) => evaluateAssertion(assertion, facts));
}

export async function evaluateScenarioPostChecks(args, facts) {
  const evidence = [];
  for (const check of args.postChecks ?? []) {
    if (check.kind === 'file-exists') {
      evidence.push(await assertFileExists(args.cwd, check));
      continue;
    }
    if (check.kind === 'file-absent') {
      evidence.push(await assertFileAbsent(args.cwd, check));
      continue;
    }
    if (check.kind === 'canvas-json') {
      evidence.push(await assertCanvasJson(check, facts));
      continue;
    }
    throw new Error(`unsupported post-check kind reached evaluator: ${check.kind}`);
  }
  return evidence;
}

export function deepPartialMatch(actual, expected) {
  if (expected === null || typeof expected !== 'object') {
    return Object.is(actual, expected);
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length < expected.length) return false;
    return expected.every((item, index) => deepPartialMatch(actual[index], item));
  }
  if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) return false;
  return Object.entries(expected).every(([key, value]) => deepPartialMatch(actual[key], value));
}

function evaluateAssertion(assertion, facts) {
  switch (assertion.kind) {
    case 'runtime-errors-empty':
      return assertRuntimeErrorsEmpty(facts);
    case 'final-answer-non-empty':
      return assertFinalAnswerNonEmpty(facts);
    case 'final-answer-contains':
      return assertFinalAnswerContains(assertion, facts);
    case 'final-answer-not-contains':
      return assertFinalAnswerNotContains(assertion, facts);
    case 'no-user-internal-continuation':
      return assertNoUserInternalContinuation(facts);
    case 'task-created':
      return assertTaskCreated(assertion, facts);
    case 'task-terminal':
      return assertTaskTerminal(assertion, facts);
    case 'continuation-facts-present':
      return assertContinuationFactsPresent(assertion, facts);
    case 'conditional-regeneration-when-quality-issue':
      return assertConditionalRegeneration(assertion, facts);
    case 'content-access-used':
      return assertContentAccessUsed(assertion, facts);
    case 'image-analysis-evidence':
      return assertImageAnalysisEvidence(assertion, facts);
    case 'canvas-handoff-attempted':
      return assertCanvasHandoffAttempted(facts);
    case 'skill-triggered':
    case 'skill-active':
      return assertSkillActivation(assertion, facts);
    case 'skill-activation-attempts-only':
      return assertSkillActivationAttemptsOnly(assertion, facts);
    case 'tool-call-succeeded':
      return assertToolCall(assertion, facts, 'success');
    case 'tool-call-failed':
      return assertToolCall(assertion, facts, 'error');
    case 'timeline-order':
      return assertTimelineOrder(assertion, facts);
    case 'active-message-cancelled':
      return assertActiveMessageCancelled(facts);
    case 'markdown-path-events':
      return assertMarkdownPathEvents(assertion, facts);
    default:
      throw new Error(`unsupported assertion kind reached evaluator: ${assertion.kind}`);
  }
}

function assertTimelineOrder(assertion, facts) {
  const assistantTurns = arrayOrEmpty(facts?.turns).filter((turn) => turn?.role === 'assistant');
  const matching = assistantTurns.find((turn) => {
    const timeline = arrayOrEmpty(turn?.timeline)
      .slice()
      .sort((left, right) => left.sequence - right.sequence);
    let cursor = 0;
    for (const expected of assertion.sequence) {
      const index = timeline.findIndex(
        (row, rowIndex) => rowIndex >= cursor && timelineRowMatches(row, expected),
      );
      if (index < 0) return false;
      cursor = index + 1;
    }
    return true;
  });
  assertCase(
    Boolean(matching),
    `no assistant Timeline observed required order: ${assertion.sequence.map((item) => item.kind).join(' -> ')}`,
  );
  return { kind: assertion.kind, ok: true, turnId: matching.id, sequence: assertion.sequence };
}

function timelineRowMatches(row, expected) {
  if (row?.kind !== expected.kind) return false;
  if (expected.status !== undefined && row?.status !== expected.status) return false;
  if (expected.toolName !== undefined && row?.toolName !== expected.toolName) return false;
  if (
    expected.contentContains !== undefined &&
    !String(row?.content ?? '').includes(expected.contentContains)
  )
    return false;
  return true;
}

function assertActiveMessageCancelled(facts) {
  const cancellation = facts?.automation?.messageCancellation;
  assertCase(
    cancellation?.accepted === true,
    'active message cancellation was not accepted while a turn was running',
  );
  assertCase(
    facts?.idle?.fullyIdle === true,
    'session did not return to fully idle after cancellation',
  );
  return { kind: 'active-message-cancelled', ok: true, accepted: true };
}

function assertMarkdownPathEvents(assertion, facts) {
  const markdown = facts?.markdown;
  const events = arrayOrEmpty(markdown?.pathEvents);
  const dropped = Number.isInteger(markdown?.droppedPathEventCount)
    ? markdown.droppedPathEventCount
    : 0;
  assertCase(
    dropped === 0,
    `expected complete Markdown path facts, but ${dropped} event(s) were dropped`,
  );

  const forbidden = assertion.forbidden ?? [];
  const observedForbidden = events.filter((event) => forbidden.includes(event?.type));
  assertCase(
    observedForbidden.length === 0,
    `observed forbidden Markdown path event(s): ${[...new Set(observedForbidden.map((event) => event.type))].join(', ')}`,
  );

  const byKey = new Map();
  for (const event of events) {
    if (!event || typeof event.key !== 'string') continue;
    const group = byKey.get(event.key) ?? [];
    group.push(event);
    byKey.set(event.key, group);
  }
  const matching = [...byKey.entries()].filter(([, group]) => {
    if (!assertion.required.every((type) => group.some((event) => event.type === type))) {
      return false;
    }
    return (assertion.viewportWidths ?? []).every((width) =>
      group.some((event) => event.type === 'layout-created' && event.viewportWidth === width),
    );
  });
  assertCase(
    matching.length > 0,
    `no Markdown session key observed required path events: ${assertion.required.join(', ')}`,
  );

  if (assertion.sameRevisionForViewportWidths === true) {
    const widths = new Set(assertion.viewportWidths ?? []);
    const sameRevision = matching.some(([, group]) => {
      const revisions = new Set(
        group
          .filter((event) => event.type === 'layout-created' && widths.has(event.viewportWidth))
          .map((event) => event.revision),
      );
      return revisions.size === 1;
    });
    assertCase(sameRevision, 'expected requested viewport widths to reuse one Markdown revision');
  }

  return {
    kind: assertion.kind,
    ok: true,
    keys: matching.map(([key]) => key),
    required: assertion.required,
    viewportWidths: assertion.viewportWidths ?? [],
    observedEventCount: events.length,
  };
}

function assertRuntimeErrorsEmpty(facts) {
  const errors = arrayOrEmpty(facts?.runtimeErrors);
  assertCase(errors.length === 0, `expected runtimeErrors to be empty, got: ${errors.join('; ')}`);
  return { kind: 'runtime-errors-empty', ok: true, observedCount: 0 };
}

function assertFinalAnswerNonEmpty(facts) {
  const finalAssistant = readFinalAssistant(facts);
  assertCase(
    typeof finalAssistant?.content === 'string' && finalAssistant.content.trim().length > 0,
    'expected a non-empty final assistant answer',
  );
  return {
    kind: 'final-answer-non-empty',
    ok: true,
    turnId: finalAssistant.id,
    length: finalAssistant.content.length,
  };
}

function assertFinalAnswerContains(assertion, facts) {
  const finalAssistant = readFinalAssistant(facts);
  const content = typeof finalAssistant?.content === 'string' ? finalAssistant.content : '';
  const missing = assertion.text.filter((text) => !content.includes(text));
  assertCase(missing.length === 0, `final assistant answer is missing: ${missing.join(', ')}`);
  return { kind: assertion.kind, ok: true, matched: assertion.text };
}

function assertFinalAnswerNotContains(assertion, facts) {
  const finalAssistant = readFinalAssistant(facts);
  const content = typeof finalAssistant?.content === 'string' ? finalAssistant.content : '';
  const present = assertion.text.filter((text) => content.includes(text));
  assertCase(
    present.length === 0,
    `final assistant answer contains forbidden text: ${present.join(', ')}`,
  );
  return { kind: assertion.kind, ok: true, absent: assertion.text };
}

function assertNoUserInternalContinuation(facts) {
  const invalidTurns = arrayOrEmpty(facts?.turns).filter(
    (turn) =>
      turn?.role === 'user' &&
      typeof turn.content === 'string' &&
      /Continue from the completed async task result\.|completed async task result|completed subagent result/i.test(
        turn.content,
      ),
  );
  assertCase(invalidTurns.length === 0, 'internal continuation was projected as a user turn');
  return { kind: 'no-user-internal-continuation', ok: true };
}

function assertTaskCreated(assertion, facts) {
  const tasks = arrayOrEmpty(facts?.tasks).filter((task) =>
    taskTypeMatches(task?.type, assertion.type),
  );
  assertCase(tasks.length > 0, `expected task type ${assertion.type} to be created`);
  return { kind: assertion.kind, ok: true, taskIds: tasks.map((task) => task.id) };
}

function assertTaskTerminal(assertion, facts) {
  const tasks = arrayOrEmpty(facts?.tasks).filter(
    (task) => taskTypeMatches(task?.type, assertion.type) && task?.status === assertion.status,
  );
  assertCase(
    tasks.length > 0,
    `expected task type ${assertion.type} with terminal status ${assertion.status}`,
  );
  return { kind: assertion.kind, ok: true, taskIds: tasks.map((task) => task.id) };
}

function assertContinuationFactsPresent(assertion, facts) {
  const continuations = arrayOrEmpty(facts?.continuations).filter(
    (continuation) => continuation?.source === assertion.source,
  );
  assertCase(
    continuations.length > 0,
    `expected continuation facts with source ${assertion.source}`,
  );
  return {
    kind: assertion.kind,
    ok: true,
    continuationIds: continuations.map((continuation) => continuation.id),
  };
}

function assertConditionalRegeneration(assertion, facts) {
  const finalContent = readFinalAssistant(facts)?.content ?? '';
  const triggered = assertion.qualityIssueSignals.some((signal) => finalContent.includes(signal));
  const matchingTasks = arrayOrEmpty(facts?.tasks).filter((task) =>
    taskTypeMatches(task?.type, assertion.taskType),
  );
  if (triggered) {
    const minimum = assertion.minAdditionalTasksWhenTriggered + 1;
    assertCase(
      matchingTasks.length >= minimum,
      `quality issue was reported but only ${matchingTasks.length} matching task(s) were observed; expected at least ${minimum}`,
    );
  }
  return {
    kind: assertion.kind,
    ok: true,
    triggered,
    observedTaskCount: matchingTasks.length,
  };
}

function assertContentAccessUsed(assertion, facts) {
  const match = readToolCalls(facts).find((toolCall) =>
    safeJson(toolCall).includes(assertion.pathContains),
  );
  assertCase(Boolean(match), `no tool-call evidence referenced ${assertion.pathContains}`);
  return { kind: assertion.kind, ok: true, toolCallId: match.id, toolName: match.name };
}

function assertImageAnalysisEvidence(assertion, facts) {
  const toolCalls = readToolCalls(facts).filter((toolCall) =>
    /image|vision|analy|document|epub|page/i.test(toolCall?.name ?? ''),
  );
  const observedPages = Math.max(0, toolCalls.length, ...toolCalls.map(inferPageEvidenceCount));
  assertCase(
    observedPages >= assertion.minPages,
    `expected image analysis evidence for at least ${assertion.minPages} page(s), observed ${observedPages}`,
  );
  return {
    kind: assertion.kind,
    ok: true,
    observedPages,
    toolCallIds: toolCalls.map((toolCall) => toolCall.id),
  };
}

function assertCanvasHandoffAttempted(facts) {
  const canvasCalls = [
    ...arrayOrEmpty(facts?.canvas?.toolCallSummaries),
    ...readToolCalls(facts).filter((toolCall) => /canvas/i.test(safeJson(toolCall))),
  ];
  assertCase(canvasCalls.length > 0, 'expected a Canvas handoff tool call');
  return {
    kind: 'canvas-handoff-attempted',
    ok: true,
    toolCallIds: [...new Set(canvasCalls.map((toolCall) => toolCall.id).filter(Boolean))],
  };
}

function assertSkillActivation(assertion, facts) {
  const activation = arrayOrEmpty(facts?.skillActivations).find((record) =>
    safeJson(record).includes(assertion.name),
  );
  assertCase(Boolean(activation), `expected Skill activation evidence for ${assertion.name}`);
  return { kind: assertion.kind, ok: true, name: assertion.name, activation };
}

function assertSkillActivationAttemptsOnly(assertion, facts) {
  const attempts = readToolCalls(facts).filter((toolCall) => toolCall?.name === 'ActivateSkill');
  const observedNames = attempts.map((toolCall) => toolCall?.arguments?.skillName);
  const invalidNames = observedNames.filter(
    (name) => typeof name !== 'string' || !assertion.names.includes(name),
  );
  assertCase(attempts.length > 0, 'expected at least one ActivateSkill tool call');
  assertCase(
    invalidNames.length === 0,
    `observed forbidden Skill activation attempt(s): ${invalidNames.map(String).join(', ')}`,
  );
  return {
    kind: assertion.kind,
    ok: true,
    allowedNames: assertion.names,
    observedNames,
    toolCallIds: attempts.map((toolCall) => toolCall.id),
  };
}

function assertToolCall(assertion, facts, expectedStatus) {
  const match = readToolCalls(facts).find((toolCall) => {
    if (toolCall?.name !== assertion.name || toolCall.status !== expectedStatus) return false;
    if (assertion.arguments && !deepPartialMatch(toolCall.arguments, assertion.arguments))
      return false;
    if (assertion.result && !deepPartialMatch(toolCall.result, assertion.result)) return false;
    if (
      assertion.resultContains &&
      !assertion.resultContains.every((text) => safeJson(toolCall.result).includes(text))
    ) {
      return false;
    }
    if (
      assertion.errorContains &&
      !assertion.errorContains.every((text) => String(toolCall.error ?? '').includes(text))
    ) {
      return false;
    }
    return true;
  });

  assertCase(
    Boolean(match),
    `expected ${assertion.name} tool call with status ${expectedStatus} and configured evidence`,
  );
  return {
    kind: assertion.kind,
    ok: true,
    toolCallId: match.id,
    name: match.name,
    status: match.status,
    arguments: match.arguments,
    result: match.result,
    ...(match.error ? { error: match.error } : {}),
  };
}

async function assertFileExists(cwd, check) {
  const absolutePath = await resolveSafeWorkspacePath(cwd, check.path);
  let stat;
  try {
    stat = await fs.stat(absolutePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new ScenarioAssertionError(`expected file to exist: ${check.path}`);
    }
    throw error;
  }
  assertCase(stat.isFile(), `expected a regular file: ${check.path}`);
  const content = await fs.readFile(absolutePath, 'utf8');
  if (check.equals !== undefined) {
    assertCase(
      content === check.equals,
      `file content did not equal expected value: ${check.path}`,
    );
  }
  const missing = (check.contains ?? []).filter((text) => !content.includes(text));
  assertCase(missing.length === 0, `file ${check.path} is missing: ${missing.join(', ')}`);
  return {
    kind: check.kind,
    ok: true,
    path: check.path,
    bytes: Buffer.byteLength(content),
  };
}

async function assertFileAbsent(cwd, check) {
  const absolutePath = await resolveSafeWorkspacePath(cwd, check.path);
  try {
    await fs.lstat(absolutePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { kind: check.kind, ok: true, path: check.path };
    }
    throw error;
  }
  throw new ScenarioAssertionError(`expected path to be absent: ${check.path}`);
}

async function assertCanvasJson(check, facts) {
  const root = check.root;
  const suffix = readSupportedCanvasGlobSuffix(check.glob);
  const files = await collectFiles(root);
  const candidates = files.filter((file) => file.endsWith(suffix));
  const matches = [];
  for (const file of candidates) {
    const content = await fs.readFile(file, 'utf8');
    if ((check.expect ?? []).every((text) => content.includes(text))) {
      matches.push(file);
    }
  }
  assertCase(
    matches.length > 0,
    `no Canvas JSON under ${root} matched ${check.glob} and expected content`,
  );
  return {
    kind: check.kind,
    ok: true,
    files: matches,
    canvasFactCount: arrayOrEmpty(facts?.canvas?.toolCallSummaries).length,
  };
}

async function collectFiles(root) {
  const files = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

async function resolveSafeWorkspacePath(cwd, relativePath) {
  assertRelativePath(relativePath, 'workspace-relative path');
  const root = await fs.realpath(cwd);
  const target = resolve(root, relativePath);
  assertContained(root, target, relativePath);

  const segments = relative(root, target).split(sep).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = resolve(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) {
        throw new Error(`scenario path crosses a symlink: ${relativePath}`);
      }
    } catch (error) {
      if (error?.code === 'ENOENT') break;
      throw error;
    }
  }
  return target;
}

function validateAssertion(assertion, scenarioId, index) {
  assertObject(assertion, `scenario ${scenarioId} assertion[${index}]`);
  assertSupportedKind(assertion, SUPPORTED_ASSERTION_KINDS, scenarioId, 'assertion', index);
  switch (assertion.kind) {
    case 'final-answer-contains':
    case 'final-answer-not-contains':
      assertStringArray(assertion.text, `${assertion.kind}.text`);
      break;
    case 'task-created':
      assertNonEmptyString(assertion.type, `${assertion.kind}.type`);
      break;
    case 'task-terminal':
      assertNonEmptyString(assertion.type, `${assertion.kind}.type`);
      assertNonEmptyString(assertion.status, `${assertion.kind}.status`);
      break;
    case 'continuation-facts-present':
      assertNonEmptyString(assertion.source, `${assertion.kind}.source`);
      break;
    case 'conditional-regeneration-when-quality-issue':
      assertNonEmptyString(assertion.taskType, `${assertion.kind}.taskType`);
      assertStringArray(assertion.qualityIssueSignals, `${assertion.kind}.qualityIssueSignals`);
      assertPositiveInteger(
        assertion.minAdditionalTasksWhenTriggered,
        `${assertion.kind}.minAdditionalTasksWhenTriggered`,
        true,
      );
      break;
    case 'content-access-used':
      assertNonEmptyString(assertion.pathContains, `${assertion.kind}.pathContains`);
      break;
    case 'image-analysis-evidence':
      assertPositiveInteger(assertion.minPages, `${assertion.kind}.minPages`);
      break;
    case 'skill-triggered':
    case 'skill-active':
      assertNonEmptyString(assertion.name, `${assertion.kind}.name`);
      break;
    case 'skill-activation-attempts-only':
      assertStringArray(assertion.names, `${assertion.kind}.names`);
      break;
    case 'tool-call-succeeded':
    case 'tool-call-failed':
      assertNonEmptyString(assertion.name, `${assertion.kind}.name`);
      if (assertion.arguments !== undefined)
        assertObject(assertion.arguments, `${assertion.kind}.arguments`);
      if (assertion.result !== undefined)
        assertObject(assertion.result, `${assertion.kind}.result`);
      if (assertion.resultContains !== undefined) {
        assertStringArray(assertion.resultContains, `${assertion.kind}.resultContains`);
      }
      if (assertion.errorContains !== undefined) {
        assertStringArray(assertion.errorContains, `${assertion.kind}.errorContains`);
      }
      break;
    case 'timeline-order':
      if (!Array.isArray(assertion.sequence) || assertion.sequence.length < 2) {
        throw new Error(`${assertion.kind}.sequence must contain at least two entries`);
      }
      assertion.sequence.forEach((item, itemIndex) => {
        assertObject(item, `${assertion.kind}.sequence[${itemIndex}]`);
        assertNonEmptyString(item.kind, `${assertion.kind}.sequence[${itemIndex}].kind`);
        if (item.status !== undefined)
          assertNonEmptyString(item.status, `${assertion.kind}.sequence[${itemIndex}].status`);
        if (item.toolName !== undefined)
          assertNonEmptyString(item.toolName, `${assertion.kind}.sequence[${itemIndex}].toolName`);
        if (item.contentContains !== undefined)
          assertNonEmptyString(
            item.contentContains,
            `${assertion.kind}.sequence[${itemIndex}].contentContains`,
          );
      });
      break;
    case 'markdown-path-events':
      assertStringArray(assertion.required, `${assertion.kind}.required`);
      assertSupportedMarkdownPathEventTypes(assertion.required, `${assertion.kind}.required`);
      if (assertion.forbidden !== undefined) {
        assertStringArray(assertion.forbidden, `${assertion.kind}.forbidden`);
        assertSupportedMarkdownPathEventTypes(assertion.forbidden, `${assertion.kind}.forbidden`);
      }
      if (assertion.viewportWidths !== undefined) {
        assertPositiveIntegerArray(assertion.viewportWidths, `${assertion.kind}.viewportWidths`);
      }
      if (
        assertion.sameRevisionForViewportWidths !== undefined &&
        typeof assertion.sameRevisionForViewportWidths !== 'boolean'
      ) {
        throw new Error(`${assertion.kind}.sameRevisionForViewportWidths must be a boolean`);
      }
      if (
        assertion.sameRevisionForViewportWidths === true &&
        assertion.viewportWidths === undefined
      ) {
        throw new Error(`${assertion.kind}.sameRevisionForViewportWidths requires viewportWidths`);
      }
      break;
    default:
      break;
  }
}

function validateTerminalResize(resize, scenarioId, index) {
  assertObject(resize, `scenario ${scenarioId} terminalResizes[${index}]`);
  assertPositiveInteger(resize.columns, `terminalResizes[${index}].columns`);
  assertPositiveInteger(resize.rows, `terminalResizes[${index}].rows`);
  if (resize.columns > 1_000 || resize.rows > 1_000) {
    throw new Error(`scenario ${scenarioId} terminalResizes[${index}] dimensions must be <= 1000`);
  }
}

function validateSetupStep(step, scenarioId, index) {
  assertObject(step, `scenario ${scenarioId} setup[${index}]`);
  assertSupportedKind(step, SUPPORTED_SETUP_KINDS, scenarioId, 'setup', index);
  assertRelativePath(step.path, `${step.kind}.path`);
  if (step.kind === 'write-file') {
    assertNonEmptyString(step.content, `${step.kind}.content`, true);
    if (step.encoding !== undefined && step.encoding !== 'utf8' && step.encoding !== 'base64') {
      throw new Error(`${step.kind}.encoding must be utf8 or base64`);
    }
  }
}

function validatePostCheck(check, scenarioId, index) {
  assertObject(check, `scenario ${scenarioId} postChecks[${index}]`);
  assertSupportedKind(check, SUPPORTED_POST_CHECK_KINDS, scenarioId, 'post-check', index);
  if (check.kind === 'file-exists' || check.kind === 'file-absent') {
    assertRelativePath(check.path, `${check.kind}.path`);
  }
  if (check.kind === 'file-exists') {
    if (check.equals !== undefined)
      assertNonEmptyString(check.equals, `${check.kind}.equals`, true);
    if (check.contains !== undefined) assertStringArray(check.contains, `${check.kind}.contains`);
  }
  if (check.kind === 'canvas-json') {
    assertNonEmptyString(check.root, `${check.kind}.root`);
    assertNonEmptyString(check.glob, `${check.kind}.glob`);
    readSupportedCanvasGlobSuffix(check.glob);
    if (check.expect !== undefined) assertStringArray(check.expect, `${check.kind}.expect`);
  }
}

function normalizePostCheck(check, env = process.env) {
  if (check.kind !== 'canvas-json') return check;
  return {
    ...check,
    root: expandHome(interpolateEnv(check.root, env)),
  };
}

function readSupportedCanvasGlobSuffix(glob) {
  const prefix = '**/*';
  if (
    !glob.startsWith(prefix) ||
    glob.length <= prefix.length ||
    glob.includes('?', prefix.length)
  ) {
    throw new Error(
      `canvas-json.glob currently supports suffix globs such as **/*.canvas.json: ${glob}`,
    );
  }
  const suffix = glob.slice(prefix.length);
  if (suffix.includes('*') || suffix.includes('[') || suffix.includes('{')) {
    throw new Error(`canvas-json.glob contains unsupported pattern syntax: ${glob}`);
  }
  return suffix;
}

function inferPageEvidenceCount(toolCall) {
  let maximum = /image|vision|analy/i.test(toolCall?.name ?? '') ? 1 : 0;
  const visit = (value, key = '') => {
    if (typeof value === 'number' && /pageCount|pagesAnalyzed|minPages/i.test(key)) {
      maximum = Math.max(maximum, value);
      return;
    }
    if (Array.isArray(value)) {
      if (/pages|pageNumbers|images|frames/i.test(key)) maximum = Math.max(maximum, value.length);
      value.forEach((item) => visit(item, key));
      return;
    }
    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([childKey, child]) => visit(child, childKey));
    }
  };
  visit(toolCall?.arguments);
  visit(toolCall?.result);
  return maximum;
}

function readToolCalls(facts) {
  return arrayOrEmpty(facts?.turns).flatMap((turn) => arrayOrEmpty(turn?.toolCalls));
}

function readFinalAssistant(facts) {
  return arrayOrEmpty(facts?.turns)
    .filter((turn) => turn?.role === 'assistant')
    .at(-1);
}

function taskTypeMatches(actual, expected) {
  const normalize = (value) =>
    String(value ?? '')
      .toLowerCase()
      .replace(/[_-]?generation$/, '');
  return normalize(actual) === normalize(expected);
}

function assertSupportedKind(value, supported, scenarioId, label, index) {
  if (!supported.has(value.kind)) {
    throw new Error(
      `scenario ${scenarioId} ${label}[${index}] kind ${value.kind ?? '(missing)'} is not supported by protocol-smoke`,
    );
  }
}

function normalizeArray(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertStringArray(value, label) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    throw new Error(`${label} must be a non-empty string array`);
  }
}

function assertNonEmptyString(value, label, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    throw new Error(`${label} must be ${allowEmpty ? 'a string' : 'a non-empty string'}`);
  }
}

function assertPositiveInteger(value, label, allowZero = false) {
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new Error(`${label} must be ${allowZero ? 'a non-negative' : 'a positive'} integer`);
  }
}

function assertSupportedMarkdownPathEventTypes(value, label) {
  const unsupported = value.filter((item) => !SUPPORTED_MARKDOWN_PATH_EVENT_TYPES.has(item));
  if (unsupported.length > 0) {
    throw new Error(`${label} contains unsupported event type(s): ${unsupported.join(', ')}`);
  }
}

function assertPositiveIntegerArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty positive integer array`);
  }
  value.forEach((item, index) => assertPositiveInteger(item, `${label}[${index}]`));
}

function assertRelativePath(value, label) {
  assertNonEmptyString(value, label);
  if (value.includes('\0') || isAbsolute(value)) {
    throw new Error(`${label} must be a contained relative path`);
  }
  const normalized = resolve('/', value);
  if (normalized === '/' || !normalized.startsWith('/')) {
    throw new Error(`${label} must be a contained relative path`);
  }
  const lexical = relative('/', normalized);
  if (lexical === '..' || lexical.startsWith(`..${sep}`) || value.split(/[\\/]/).includes('..')) {
    throw new Error(`${label} must not contain traversal segments`);
  }
}

function assertContained(root, target, input) {
  const relativePath = relative(root, target);
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`scenario path escapes cwd: ${input}`);
  }
}

function expandHome(value) {
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return `${os.homedir()}${value.slice(1)}`;
  return value;
}

function interpolateEnv(value, env = process.env) {
  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_match, name) => {
    const replacement = env[name];
    if (!replacement)
      throw new Error(`environment variable ${name} is required by scenario manifest`);
    return replacement;
  });
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function assertCase(condition, message) {
  if (!condition) throw new ScenarioAssertionError(message);
}

export class ScenarioAssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ScenarioAssertionError';
  }
}
