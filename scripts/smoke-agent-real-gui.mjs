#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { get } from 'node:http';
import { homedir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { parse as parseToml } from 'smol-toml';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const DEFAULT_TARGET_MATCHES = [
  'neko.neko-agent',
  'neko-agent',
  'neko.aiAssistant',
  'neko-assistant',
  'Neko AI',
  'NekoAgent',
];
const DEFAULT_PROMPT =
  'Neko GUI real API smoke: reply with exactly one concise sentence mentioning "gui real api smoke".';

process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printUsage();
  process.exit(0);
}

const profile = resolveProfile(options);
const selectedModel = profile.absoluteConfigPath ? readSelectedModel(profile.absoluteConfigPath) : null;
assertExpectedModel(selectedModel, options);

const debugPort = readNumber(
  options.port ?? process.env.NEKO_VSCODE_DEBUG_PORT ?? '9222',
  'debug port',
);
const timeoutMs = readNumber(
  options.timeoutMs ?? process.env.NEKO_AGENT_GUI_TIMEOUT_MS ?? '120000',
  'timeout',
);
const settleMs = readNumber(
  options.settleMs ?? process.env.NEKO_AGENT_GUI_SETTLE_MS ?? '1000',
  'settle timeout',
);
const targetMatches =
  options.targetMatches.length > 0
    ? options.targetMatches
    : splitList(process.env.NEKO_AGENT_GUI_TARGET_MATCH).length > 0
      ? splitList(process.env.NEKO_AGENT_GUI_TARGET_MATCH)
      : DEFAULT_TARGET_MATCHES;
const expectedTexts = [
  ...options.expectTexts,
  ...splitList(process.env.NEKO_AGENT_GUI_EXPECT_TEXT),
];
const requirements = resolveRequirements(options);
const prompt = options.submit
  ? options.prompt ?? process.env.NEKO_AGENT_GUI_PROMPT ?? DEFAULT_PROMPT
  : null;

const startedAt = Date.now();
const skillEvidence = options.skills.map(resolveSkill);
const targets = await waitForTargets(debugPort, timeoutMs);
const projectedTargets = targets.map(projectTarget);
const pageTargets = projectedTargets.filter((target) => target.type === 'page');
const webviewTargets = projectedTargets.filter(isWebviewTarget);
assertion(
  pageTargets.length > 0,
  `observed ${pageTargets.length} VS Code page target(s)`,
  `VS Code debugger on port ${debugPort} exposed no page targets`,
);
assertion(
  webviewTargets.length > 0,
  `observed ${webviewTargets.length} VS Code webview target(s)`,
  'no VS Code webview iframe targets were visible; bring the Neko Agent view to the foreground and retry',
);

const target = selectAgentWebviewTarget({
  targets,
  projectedTargets,
  targetMatches,
  allowAnyWebview: options.allowAnyWebview,
});
const cdp = await createCdpSession(target.webSocketDebuggerUrl);
let setupSummary;
let submitSummary = null;
let projectionSummary;

try {
  await cdp.send('Runtime.enable');
  setupSummary = await evaluate(cdp, buildInstallObserverExpression());
  if (prompt) {
    submitSummary = await evaluate(cdp, buildSubmitPromptExpression(prompt));
  }
  projectionSummary = await waitForProjection({
    cdp,
    requirements,
    expectedTexts,
    timeoutMs,
    settleMs,
  });
} finally {
  cdp.close();
}

const assertions = [
  `connected to VS Code debugger port ${debugPort}`,
  `selected Agent webview target ${target.id}`,
  `selected profile ${profile.profile}`,
  ...(selectedModel
    ? [`selected provider/model ${selectedModel.providerId}/${selectedModel.modelId}`]
    : []),
  ...assertProjection({ projectionSummary, requirements, expectedTexts }),
];

console.log(
  JSON.stringify(
    {
      schemaVersion: 1,
      kind: 'neko.agent.realApiHarness.guiEvidence',
      status: 'passed',
      observedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      evaluatorPolicy: {
        internalAssertionsRequired: true,
        browserOnlyEvidenceAccepted: false,
        requiredRuntime: 'vscode-extension-debugger',
      },
      runtime: {
        mode: 'vscode-extension-debugger',
        debugPort,
        timeoutMs,
        targetMatches,
        skills: skillEvidence,
      },
      profile: projectProfileForEvidence(profile),
      providerModel: selectedModel,
      target: projectTarget(target),
      setup: setupSummary,
      submit: submitSummary,
      projection: projectionSummary,
      assertions,
    },
    null,
    2,
  ),
);

function parseArgs(args) {
  const parsed = {
    allowAnyWebview: false,
    configPath: undefined,
    expectModelId: undefined,
    expectProviderId: undefined,
    expectTexts: [],
    help: false,
    port: undefined,
    profile: undefined,
    prompt: undefined,
    requirements: new Set(),
    settleMs: undefined,
    skills: ['vscode-extension-debugger'],
    submit: true,
    targetMatches: [],
    timeoutMs: undefined,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--allow-any-webview':
        parsed.allowAnyWebview = true;
        break;
      case '--config':
        parsed.configPath = readValue(args, (index += 1), arg);
        break;
      case '--expect-model-id':
        parsed.expectModelId = readValue(args, (index += 1), arg);
        break;
      case '--expect-provider-id':
        parsed.expectProviderId = readValue(args, (index += 1), arg);
        break;
      case '--expect-text':
        parsed.expectTexts.push(readValue(args, (index += 1), arg));
        break;
      case '--help':
      case '-h':
        parsed.help = true;
        break;
      case '--no-submit':
        parsed.submit = false;
        break;
      case '--port':
        parsed.port = readValue(args, (index += 1), arg);
        break;
      case '--profile':
        parsed.profile = readValue(args, (index += 1), arg);
        break;
      case '--prompt':
        parsed.prompt = readValue(args, (index += 1), arg);
        break;
      case '--require-assistant-text':
        parsed.requirements.add('assistantText');
        break;
      case '--require-bridge':
        parsed.requirements.add('bridge');
        break;
      case '--require-cancellation':
        parsed.requirements.add('cancellation');
        break;
      case '--require-diagnostic':
        parsed.requirements.add('diagnostic');
        break;
      case '--require-media-card':
        parsed.requirements.add('mediaCard');
        break;
      case '--require-recovery':
        parsed.requirements.add('recovery');
        break;
      case '--require-task-card':
        parsed.requirements.add('taskCard');
        break;
      case '--require-tool-timeline':
        parsed.requirements.add('toolTimeline');
        break;
      case '--settle-ms':
        parsed.settleMs = readValue(args, (index += 1), arg);
        break;
      case '--skill':
        parsed.skills.push(readValue(args, (index += 1), arg));
        break;
      case '--target-match':
        parsed.targetMatches.push(readValue(args, (index += 1), arg));
        break;
      case '--timeout-ms':
        parsed.timeoutMs = readValue(args, (index += 1), arg);
        break;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown option: ${arg}`);
        }
        parsed.targetMatches.push(arg);
        break;
    }
  }

  parsed.skills = [...new Set(parsed.skills)];
  return parsed;
}

function printUsage() {
  console.log(`Usage:
  NEKO_AGENT_TEST_CONFIG="$HOME/.neko/config.toml" \\
    pnpm test:agent:real:gui

Options:
  --profile <mock|real>
  --config <path>                 Test config. Real runs require config.toml.
  --prompt <text>                 Prompt submitted through the visible Agent Webview.
  --no-submit                     Observe the current Webview without submitting a prompt.
  --port <port>                   VS Code remote debugging port. Defaults to 9222.
  --timeout-ms <ms>               Total wait for debugger/projection evidence.
  --settle-ms <ms>                Extra wait after required selectors appear.
  --target-match <text>           Require Agent webview target title/url match. Repeatable.
  --allow-any-webview             Accept the only visible VS Code webview when target matching fails.
  --expect-provider-id <id>       Assert selected config provider id.
  --expect-model-id <id>          Assert selected config model id.
  --expect-text <text>            Require visible Webview text. Repeatable.
  --require-bridge                Require extension -> webview message bridge activity.
  --require-assistant-text        Require visible assistant text.
  --require-tool-timeline         Require visible tool/timeline card evidence.
  --require-task-card             Require visible task card evidence.
  --require-media-card            Require visible media card evidence.
  --require-diagnostic            Require visible diagnostic/error evidence.
  --require-cancellation          Require visible cancellation evidence.
  --require-recovery              Require visible retry/repair/recovery evidence.
`);
}

function resolveProfile(parsed) {
  const rawProfile =
    parsed.profile ??
    process.env.NEKO_AGENT_TEST_PROFILE ??
    (isTruthy(process.env.NEKO_AGENT_REAL_API) ? 'real' : 'mock');
  const profile = parseProfile(rawProfile);
  const configPath = parsed.configPath ?? process.env.NEKO_AGENT_TEST_CONFIG;
  const realApi = profile !== 'mock' || isTruthy(process.env.NEKO_AGENT_REAL_API);

  if (isTruthy(process.env.NEKO_AGENT_REAL_API) && profile === 'mock') {
    throw new Error('NEKO_AGENT_REAL_API=1 requires NEKO_AGENT_TEST_PROFILE=real or no profile.');
  }
  if (profile !== 'mock' && !configPath) {
    throw new Error(
      `Profile "${profile}" requires NEKO_AGENT_TEST_CONFIG or --config to point at config.toml.`,
    );
  }
  if (configPath) {
    assertSupportedConfigFileName(profile, configPath);
  }
  if (configPath && !existsSync(configPath)) {
    throw new Error(`Agent GUI test config does not exist for profile "${profile}": ${configPath}`);
  }

  return {
    profile,
    realApi,
    ...(configPath ? { absoluteConfigPath: resolve(configPath) } : {}),
  };
}

function parseProfile(value) {
  switch (value) {
    case 'mock':
    case 'real':
      return value;
    default:
      throw new Error(
        `Unsupported NEKO_AGENT_TEST_PROFILE: ${value}. Expected mock or real.`,
      );
  }
}

function assertSupportedConfigFileName(profile, configPath) {
  const expectedFileName = profile === 'mock' ? 'mock.toml' : 'config.toml';
  const actualFileName = basename(configPath);
  if (actualFileName !== expectedFileName) {
    throw new Error(
      `Profile "${profile}" only supports ${expectedFileName}; received ${actualFileName}.`,
    );
  }
}

function projectProfileForEvidence(profile) {
  const { absoluteConfigPath, ...rest } = profile;
  return {
    ...rest,
    ...(absoluteConfigPath ? { configPath: redactPath(absoluteConfigPath) } : {}),
  };
}

function readSelectedModel(configPath) {
  let config;
  try {
    config = parseToml(readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Unable to parse Agent GUI test config ${redactPath(configPath)}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const defaultModels = isRecord(config.default_models) ? config.default_models : {};
  const llmDefault = isRecord(defaultModels.llm) ? defaultModels.llm : {};
  const providerId = readString(llmDefault.provider_id) ?? readString(config.default_provider);
  const modelId = readString(llmDefault.model_id) ?? readString(config.default_model);
  if (!providerId || !modelId) {
    throw new Error(
      `Agent GUI test config ${redactPath(configPath)} must define default_models.llm.provider_id/model_id or default_provider/default_model.`,
    );
  }

  const provider = readArray(config.providers).find((entry) => readString(entry.id) === providerId);
  const model = readArray(config.models).find((entry) => readString(entry.id) === modelId);
  if (!provider) {
    throw new Error(`Agent GUI test config selects missing provider: ${providerId}`);
  }
  if (!model) {
    throw new Error(`Agent GUI test config selects missing model: ${modelId}`);
  }
  if (provider.enabled === false) {
    throw new Error(`Agent GUI test config selects disabled provider: ${providerId}`);
  }
  if (model.enabled === false) {
    throw new Error(`Agent GUI test config selects disabled model: ${modelId}`);
  }
  if (readString(model.provider_id) !== providerId) {
    throw new Error(
      `Agent GUI test config model ${modelId} belongs to ${readString(model.provider_id)}, not ${providerId}.`,
    );
  }

  return {
    providerId,
    modelId,
    provider: {
      id: providerId,
      name: readString(provider.name),
      type: readString(provider.type),
      enabled: provider.enabled !== false,
      connectionKind: readString(provider.connection_kind),
      protocolProfile: readString(provider.protocol_profile),
      requiresApiKey: provider.requires_api_key === true,
    },
    model: {
      id: modelId,
      name: readString(model.name),
      type: readString(model.type),
      enabled: model.enabled !== false,
      capabilities: readArray(model.capabilities).filter((item) => typeof item === 'string'),
    },
  };
}

function assertExpectedModel(selectedModel, parsed) {
  if (!selectedModel) return;
  if (parsed.expectProviderId && selectedModel.providerId !== parsed.expectProviderId) {
    throw new Error(
      `Expected provider ${parsed.expectProviderId}, but config.toml selects ${selectedModel.providerId}.`,
    );
  }
  if (parsed.expectModelId && selectedModel.modelId !== parsed.expectModelId) {
    throw new Error(
      `Expected model ${parsed.expectModelId}, but config.toml selects ${selectedModel.modelId}.`,
    );
  }
}

function resolveRequirements(parsed) {
  const requirements = new Set(parsed.requirements);
  const envMap = {
    assistantText: 'NEKO_AGENT_GUI_REQUIRE_ASSISTANT_TEXT',
    bridge: 'NEKO_AGENT_GUI_REQUIRE_BRIDGE',
    cancellation: 'NEKO_AGENT_GUI_REQUIRE_CANCELLATION',
    diagnostic: 'NEKO_AGENT_GUI_REQUIRE_DIAGNOSTIC',
    mediaCard: 'NEKO_AGENT_GUI_REQUIRE_MEDIA_CARD',
    recovery: 'NEKO_AGENT_GUI_REQUIRE_RECOVERY',
    taskCard: 'NEKO_AGENT_GUI_REQUIRE_TASK_CARD',
    toolTimeline: 'NEKO_AGENT_GUI_REQUIRE_TOOL_TIMELINE',
  };
  for (const [requirement, envName] of Object.entries(envMap)) {
    if (isTruthy(process.env[envName])) {
      requirements.add(requirement);
    }
  }
  return requirements;
}

async function waitForTargets(port, timeout) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeout) {
    try {
      const debuggerTargets = await readTargets(port);
      if (Array.isArray(debuggerTargets) && debuggerTargets.length > 0) {
        return debuggerTargets;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }

  throw new Error(
    `Timed out waiting for VS Code debugger on port ${port}: ${lastError?.message ?? 'no targets'}`,
  );
}

function readTargets(port) {
  return new Promise((resolvePromise, reject) => {
    const request = get(`http://127.0.0.1:${port}/json`, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          resolvePromise(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.setTimeout(2000, () => {
      request.destroy(new Error('debugger target request timed out'));
    });
  });
}

function selectAgentWebviewTarget(input) {
  const webviewTargets = input.targets.filter((target) => isWebviewTarget(projectTarget(target)));
  const matchedTargets = webviewTargets.filter((target) =>
    input.targetMatches.some((expected) => includesIgnoreCase(target.title, expected) || includesIgnoreCase(target.url, expected)),
  );
  if (matchedTargets.length > 0) {
    return matchedTargets[0];
  }
  if (input.allowAnyWebview && webviewTargets.length === 1) {
    return webviewTargets[0];
  }
  throw new Error(
    `No visible Agent Webview target matched ${input.targetMatches.map((value) => `"${value}"`).join(', ')}. Targets: ${JSON.stringify(input.projectedTargets, null, 2)}`,
  );
}

async function createCdpSession(url) {
  if (!url) {
    throw new Error('Selected VS Code debugger target does not expose a websocket URL.');
  }
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;

  await new Promise((resolvePromise, reject) => {
    socket.addEventListener('open', resolvePromise, { once: true });
    socket.addEventListener(
      'error',
      () => reject(new Error('failed to open VS Code debugger websocket')),
      { once: true },
    );
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id) return;
    const deferred = pending.get(message.id);
    if (!deferred) return;
    pending.delete(message.id);
    if (message.error) {
      deferred.reject(new Error(`${message.error.message}: ${message.error.data ?? ''}`.trim()));
    } else {
      deferred.resolve(message.result);
    }
  });

  return {
    send(method, params = {}) {
      const id = nextId;
      nextId += 1;
      const payload = JSON.stringify({ id, method, params });
      return new Promise((resolvePromise, reject) => {
        pending.set(id, { resolve: resolvePromise, reject });
        socket.send(payload);
      });
    },
    close() {
      socket.close();
    },
  };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const description =
      result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'unknown';
    throw new Error(`VS Code Webview evaluation failed: ${description}`);
  }
  return result.result?.value;
}

async function waitForProjection(input) {
  const startedAt = Date.now();
  let lastSummary;
  while (Date.now() - startedAt < input.timeoutMs) {
    lastSummary = await evaluate(input.cdp, buildProjectionSummaryExpression(input.expectedTexts));
    if (projectionSatisfies(lastSummary, input.requirements, input.expectedTexts)) {
      await delay(input.settleMs);
      return await evaluate(input.cdp, buildProjectionSummaryExpression(input.expectedTexts));
    }
    await delay(750);
  }
  throw new Error(
    `Timed out waiting for Agent GUI projection evidence. Last summary: ${JSON.stringify(lastSummary, null, 2)}`,
  );
}

function projectionSatisfies(summary, requirements, expectedTexts) {
  if (!summary?.dom?.agentShellPresent) return false;
  for (const text of expectedTexts) {
    if (!summary.expectedTextMatches?.some((match) => match.text === text && match.present)) {
      return false;
    }
  }
  for (const requirement of requirements) {
    switch (requirement) {
      case 'assistantText':
        if (summary.dom.assistantTextCount < 1) return false;
        break;
      case 'bridge':
        if (summary.bridge.incomingCount < 1) return false;
        break;
      case 'cancellation':
        if (!summary.dom.cancellationPresent) return false;
        break;
      case 'diagnostic':
        if (!summary.dom.diagnosticPresent) return false;
        break;
      case 'mediaCard':
        if (summary.dom.mediaCardCount < 1) return false;
        break;
      case 'recovery':
        if (!summary.dom.recoveryPresent) return false;
        break;
      case 'taskCard':
        if (summary.dom.taskCardCount < 1) return false;
        break;
      case 'toolTimeline':
        if (summary.dom.toolTimelineRowCount < 1) return false;
        break;
      default:
        throw new Error(`Unsupported GUI projection requirement: ${requirement}`);
    }
  }
  return true;
}

function assertProjection(input) {
  const assertions = [];
  const summary = input.projectionSummary;
  assertion(summary.dom.agentShellPresent, 'Agent Webview shell is visible', 'Agent Webview shell was not visible');
  assertions.push('Agent Webview shell is visible');
  for (const requirement of input.requirements) {
    switch (requirement) {
      case 'assistantText':
        assertion(
          summary.dom.assistantTextCount > 0,
          'assistant text projection is visible',
          'assistant text projection was not visible',
        );
        assertions.push('assistant text projection is visible');
        break;
      case 'bridge':
        assertion(
          summary.bridge.incomingCount > 0,
          'extension to webview bridge activity was observed',
          'extension to webview bridge activity was not observed after harness observer install',
        );
        assertions.push('extension to webview bridge activity was observed');
        break;
      case 'cancellation':
        assertion(
          summary.dom.cancellationPresent,
          'cancellation projection is visible',
          'cancellation projection was not visible',
        );
        assertions.push('cancellation projection is visible');
        break;
      case 'diagnostic':
        assertion(
          summary.dom.diagnosticPresent,
          'diagnostic projection is visible',
          'diagnostic projection was not visible',
        );
        assertions.push('diagnostic projection is visible');
        break;
      case 'mediaCard':
        assertion(
          summary.dom.mediaCardCount > 0,
          'media card projection is visible',
          'media card projection was not visible',
        );
        assertions.push('media card projection is visible');
        break;
      case 'recovery':
        assertion(
          summary.dom.recoveryPresent,
          'recovery projection is visible',
          'recovery projection was not visible',
        );
        assertions.push('recovery projection is visible');
        break;
      case 'taskCard':
        assertion(
          summary.dom.taskCardCount > 0,
          'task card projection is visible',
          'task card projection was not visible',
        );
        assertions.push('task card projection is visible');
        break;
      case 'toolTimeline':
        assertion(
          summary.dom.toolTimelineRowCount > 0,
          'tool timeline projection is visible',
          'tool timeline projection was not visible',
        );
        assertions.push('tool timeline projection is visible');
        break;
    }
  }
  for (const match of summary.expectedTextMatches ?? []) {
    assertion(match.present, `expected text is visible: ${match.text}`, `expected text was not visible: ${match.text}`);
    assertions.push(`expected text is visible: ${match.text}`);
  }
  return assertions;
}

function buildInstallObserverExpression() {
  return `(() => {
    const key = '__nekoAgentGuiRealApiHarness';
    const projectMessage = (data) => {
      const record = data && typeof data === 'object' ? data : {};
      const config = record.config && typeof record.config === 'object' ? record.config : null;
      const events = Array.isArray(record.events) ? record.events : [];
      return {
        at: Date.now(),
        type: typeof record.type === 'string' ? record.type : typeof data,
        conversationId: typeof record.conversationId === 'string' ? record.conversationId : undefined,
        messageId: typeof record.messageId === 'string' ? record.messageId : undefined,
        selectedProviderId: config && typeof config.selectedProviderId === 'string' ? config.selectedProviderId : undefined,
        selectedModelId: config && typeof config.selectedModelId === 'string' ? config.selectedModelId : undefined,
        providerCount: config && Array.isArray(config.providers) ? config.providers.length : undefined,
        modelCount: config && Array.isArray(config.models) ? config.models.length : undefined,
        timelineKinds: events.map((event) => event && typeof event === 'object' ? event.kind : undefined).filter(Boolean),
      };
    };
    const state = globalThis[key] ?? {
      installedAt: Date.now(),
      incomingMessages: [],
      listenerInstalled: false,
    };
    if (!state.listenerInstalled) {
      window.addEventListener('message', (event) => {
        state.incomingMessages.push(projectMessage(event.data));
        if (state.incomingMessages.length > 240) state.incomingMessages.shift();
      }, true);
      state.listenerInstalled = true;
    }
    globalThis[key] = state;
    return {
      installedAt: state.installedAt,
      listenerInstalled: state.listenerInstalled,
      incomingCount: state.incomingMessages.length,
      location: String(location.href).slice(0, 240),
      title: document.title,
    };
  })()`;
}

function buildSubmitPromptExpression(prompt) {
  return `(async () => {
    const prompt = ${JSON.stringify(prompt)};
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const textarea = document.querySelector('textarea.agent-composer-textarea, textarea');
    if (!textarea) {
      throw new Error('Agent composer textarea was not found in the visible Webview.');
    }
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (!valueSetter) {
      throw new Error('Unable to set Agent composer textarea value.');
    }
    textarea.focus();
    valueSetter.call(textarea, prompt);
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }));
    await delay(120);
    const buttons = Array.from(document.querySelectorAll('button'));
    const buttonText = (button) => [button.getAttribute('aria-label'), button.getAttribute('title'), button.textContent]
      .filter(Boolean)
      .join(' ');
    const sendButton = buttons.find((button) =>
      button.matches('.agent-composer-send, .agent-composer-queue') ||
      /send|发送|queue|排队/i.test(buttonText(button))
    );
    if (!sendButton) {
      throw new Error('Agent composer send button was not found.');
    }
    if (sendButton.disabled) {
      throw new Error('Agent composer send button is disabled after prompt injection.');
    }
    sendButton.click();
    return {
      submitted: true,
      promptLength: prompt.length,
      sendButtonLabel: buttonText(sendButton).slice(0, 120),
    };
  })()`;
}

function buildProjectionSummaryExpression(expectedTexts) {
  return `(() => {
    const key = '__nekoAgentGuiRealApiHarness';
    const state = globalThis[key] ?? { incomingMessages: [] };
    const visible = (element) => Boolean(element && (element.offsetWidth || element.offsetHeight || element.getClientRects().length));
    const elements = (selector) => Array.from(document.querySelectorAll(selector)).filter(visible);
    const text = (element) => (element?.innerText || element?.textContent || '').trim();
    const bodyText = document.body?.innerText || '';
    const assistantBubbles = elements('.agent-bubble-assistant').filter((element) => text(element).length > 0);
    const inlineCards = elements('.agent-inline-card');
    const mediaElements = elements('img[src], video[src], audio[src]');
    const expectedTexts = ${JSON.stringify(expectedTexts)};
    const incomingMessages = Array.isArray(state.incomingMessages) ? state.incomingMessages : [];
    const incomingTypes = Array.from(new Set(incomingMessages.map((message) => message.type).filter(Boolean))).sort();
    return {
      location: String(location.href).slice(0, 240),
      title: document.title,
      bridge: {
        incomingCount: incomingMessages.length,
        incomingTypes,
        recent: incomingMessages.slice(-20),
      },
      dom: {
        agentShellPresent: elements('.agent-chat-view, .agent-composer-textarea').length > 0,
        messageRowCount: elements('.agent-message-row').length,
        assistantTextCount: assistantBubbles.length,
        assistantTextSample: assistantBubbles.map(text).join('\\n').slice(0, 500),
        inlineCardCount: inlineCards.length,
        toolTimelineRowCount: inlineCards.filter((element) => /tool|工具|harness|inspect|read|write|validator|validation/i.test(text(element))).length,
        taskCardCount: inlineCards.filter((element) => /task|tasks\\.|任务|progress|provider|eta|generation|生成|进度/i.test(text(element))).length,
        mediaCardCount: mediaElements.length + inlineCards.filter((element) => /preview|image|video|audio|media|图像|视频|音频|媒体/i.test(text(element))).length,
        diagnosticPresent: /diagnostic|error|failed|rejected|invalid|错误|失败|诊断|拒绝/i.test(bodyText) || elements('.is-danger').length > 0,
        cancellationPresent: /cancelled|canceled|cancel|stopped|interrupted|取消|中断|停止/i.test(bodyText),
        recoveryPresent: /retry|repair|recover|recovery|escalat|重试|修复|恢复|升级/i.test(bodyText),
        stopButtonCount: elements('.agent-composer-stop').length,
      },
      expectedTextMatches: expectedTexts.map((expected) => ({
        text: expected,
        present: bodyText.toLowerCase().includes(String(expected).toLowerCase()),
      })),
      bodyTextSample: bodyText.slice(0, 1000),
    };
  })()`;
}

function resolveSkill(skill) {
  const candidates = skillCandidates(skill);
  const skillPath = candidates.find((candidate) => existsSync(candidate));

  if (!skillPath) {
    throw new Error(
      `Skill "${skill}" was not found. Checked: ${candidates.map(formatPath).join(', ')}`,
    );
  }

  const source = readFileSync(skillPath, 'utf8');
  return {
    input: skill,
    path: formatPath(skillPath),
    declaredName: readFrontMatterField(source, 'name') ?? basename(resolve(skillPath, '..')),
    description: readFrontMatterField(source, 'description'),
  };
}

function skillCandidates(skill) {
  const home = homedir();
  const codexHome = process.env.CODEX_HOME
    ? resolve(process.env.CODEX_HOME)
    : resolve(home, '.codex');
  const resolvedSkill = resolve(repoRoot, skill);
  const candidates = [];

  if (skill.endsWith('SKILL.md')) {
    candidates.push(resolvedSkill);
  } else {
    candidates.push(resolve(repoRoot, '.codex/skills', skill, 'SKILL.md'));
    candidates.push(resolve(codexHome, 'skills', skill, 'SKILL.md'));
    candidates.push(resolve(home, '.codex/skills', skill, 'SKILL.md'));
    candidates.push(resolve(repoRoot, 'skills', skill, 'SKILL.md'));
    candidates.push(resolve(resolvedSkill, 'SKILL.md'));
  }

  return [...new Set(candidates)];
}

function readFrontMatterField(source, fieldName) {
  const match = source.match(new RegExp(`^${fieldName}:\\s*(.+)$`, 'm'));
  const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
  return value === '|' || value === '>' ? undefined : value;
}

function projectTarget(target) {
  return {
    id: String(target.id ?? ''),
    type: String(target.type ?? ''),
    title: String(target.title ?? ''),
    url: String(target.url ?? '').slice(0, 240),
    parentId: typeof target.parentId === 'string' ? target.parentId : undefined,
  };
}

function isWebviewTarget(target) {
  return target.type === 'iframe' || String(target.url).includes('vscode-webview://');
}

function readValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function readNumber(value, label) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return numberValue;
}

function assertion(condition, okMessage, failMessage) {
  if (!condition) {
    throw new Error(failMessage);
  }
  return okMessage;
}

function includesIgnoreCase(value, expected) {
  return String(value).toLowerCase().includes(String(expected).toLowerCase());
}

function isTruthy(value) {
  return value === '1' || value === 'true' || value === 'yes';
}

function splitList(value) {
  return value
    ? value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readArray(value) {
  return Array.isArray(value) ? value : [];
}

function redactPath(pathValue) {
  return formatPath(pathValue);
}

function formatPath(pathValue) {
  const absolutePath = resolve(pathValue);
  const home = homedir();
  const codexHome = process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME) : undefined;

  if (absolutePath.startsWith(`${repoRoot}${sep}`)) {
    return absolutePath.slice(repoRoot.length + 1);
  }
  if (codexHome && absolutePath.startsWith(`${codexHome}${sep}`)) {
    return join('${CODEX_HOME}', absolutePath.slice(codexHome.length + 1));
  }
  if (absolutePath.startsWith(`${home}${sep}`)) {
    return join('${HOME}', absolutePath.slice(home.length + 1));
  }
  return absolutePath;
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function fail(error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[smoke:agent-real-gui] ${message}`);
  process.exit(1);
}
