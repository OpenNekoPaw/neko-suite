export const HTML5_RUNTIME_BUNDLE_PATH = 'assets/neko-narrative-runtime.js';
export const HTML5_RENDERER_BUNDLE_PATH = 'assets/neko-narrative-renderer.js';

export function createHtml5RuntimeBundle(): string {
  return `(() => {
  const COMPARISON_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*)\\s*(==|!=|>=|<=|>|<)\\s*(true|false|null|-?\\d+(?:\\.\\d+)?|"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')$/;
  const TRUTHY_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*)$/;
  const NEGATED_PATTERN = /^!\\s*([A-Za-z_][A-Za-z0-9_]*)$/;

  function createRuntime(snapshot) {
    let graph = snapshot;
    let currentNodeId;
    let variables = createInitialVariables(graph);
    let history = [];
    let path = [];
    let diagnostics = [];
    let status = 'idle';

    function state() {
      const currentNode = getCurrentNode();
      const choices = currentNode ? getChoicesForNode(currentNode.nodeId) : [];
      const next = {
        status,
        revision: graph.revision || 0,
        graph,
        variables,
        history,
        path,
        choices,
        diagnostics,
      };
      if (currentNode) next.currentNode = currentNode;
      if (status === 'ended' && currentNode) next.endingStats = createEndingStats(currentNode);
      return next;
    }

    function start() {
      const entryNodeId = resolveEntryNodeId(graph);
      if (!entryNodeId) {
        status = 'error';
        diagnostics = [{ code: 'runtime-no-entry', severity: 'error', message: 'Narrative graph has no playable entry node.' }];
        return state();
      }
      history = [];
      path = [entryNodeId];
      return enterNode(entryNodeId);
    }

    function advance(choiceIndex) {
      const current = getCurrentNode();
      if (!current) return state();
      const choices = getChoicesForNode(current.nodeId);
      if (choices.length === 0) {
        status = current.type === 'narrative-ending' ? 'ended' : 'waiting-choice';
        return state();
      }
      const index = choiceIndex == null ? 0 : choiceIndex;
      const selected = choices[index];
      if (!selected || selected.disabled) {
        diagnostics = diagnostics.concat([{ code: 'runtime-choice-disabled', severity: 'warning', message: 'The selected choice is unavailable.', nodeId: current.nodeId }]);
        status = 'waiting-choice';
        return state();
      }
      const target = findNode(graph, selected.targetNodeId);
      if (!target) {
        status = 'error';
        diagnostics = diagnostics.concat([{ code: 'runtime-choice-target-missing', severity: 'error', message: 'Choice target "' + selected.targetNodeId + '" is missing.', nodeId: current.nodeId }]);
        return state();
      }
      history = history.concat([{ nodeId: current.nodeId, variables, choiceIndex: index }]);
      path = path.concat([target.nodeId]);
      return enterNode(target.nodeId);
    }

    function stepBack() {
      const previous = history[history.length - 1];
      if (!previous) return state();
      history = history.slice(0, -1);
      variables = previous.variables;
      currentNodeId = previous.nodeId;
      path = path.slice(0, Math.max(1, path.lastIndexOf(previous.nodeId) + 1));
      status = getChoicesForNode(previous.nodeId).length > 0 ? 'waiting-choice' : 'playing';
      return state();
    }

    function jumpTo(nodeId) {
      if (!findNode(graph, nodeId)) {
        status = 'error';
        diagnostics = diagnostics.concat([{ code: 'runtime-node-missing', severity: 'error', message: 'Narrative node "' + nodeId + '" is missing.', nodeId }]);
        return state();
      }
      history = [];
      path = [nodeId];
      return enterNode(nodeId);
    }

    function setVariables(values) {
      variables = normalizeVariableRecord(values || {});
      return state();
    }

    function getChoicesForNode(nodeId) {
      return (graph.connections || [])
        .filter((connection) => connection.sourceNodeId === nodeId)
        .slice()
        .sort((left, right) => (left.priority || 0) - (right.priority || 0))
        .map(toChoiceOption);
    }

    function enterNode(nodeId) {
      const node = findNode(graph, nodeId);
      if (!node) {
        status = 'error';
        diagnostics = diagnostics.concat([{ code: 'runtime-node-missing', severity: 'error', message: 'Narrative node "' + nodeId + '" is missing.', nodeId }]);
        return state();
      }
      currentNodeId = nodeId;
      variables = applyVariableEffects(variables, (node.scene && node.scene.variableEffects) || [], graph, (diagnostic) => {
        diagnostics = diagnostics.concat([Object.assign({}, diagnostic, { nodeId })]);
      });
      status = node.type === 'narrative-ending'
        ? 'ended'
        : getChoicesForNode(nodeId).length > 0 ? 'waiting-choice' : 'playing';
      return state();
    }

    function getCurrentNode() {
      return currentNodeId ? findNode(graph, currentNodeId) : undefined;
    }

    function toChoiceOption(connection) {
      const evaluation = evaluateCondition(connection.condition, variables);
      return {
        connection,
        label: connection.choiceText || 'Continue',
        targetNodeId: connection.targetNodeId,
        condition: connection.condition,
        conditionMet: evaluation.result,
        disabled: !evaluation.result,
        diagnostics: evaluation.diagnostics,
      };
    }

    function createEndingStats(node) {
      return {
        endingNodeId: node.nodeId,
        endingLabel: (node.ending && node.ending.endingLabel) || node.label,
        visitedCount: Array.from(new Set(path)).length,
        totalNodes: (graph.nodes || []).length,
        pathTaken: path,
        variableSnapshot: variables,
      };
    }

    return { state, start, advance, stepBack, jumpTo, setVariables, getChoicesForNode };
  }

  function createInitialVariables(snapshot) {
    const values = {};
    for (const variable of (snapshot.metadata && snapshot.metadata.variables) || []) {
      values[variable.name] = normalizeVariableValue(variable.value);
    }
    return values;
  }

  function normalizeVariableRecord(values) {
    const result = {};
    for (const key of Object.keys(values)) {
      result[key] = normalizeVariableValue(values[key]);
    }
    return result;
  }

  function normalizeVariableValue(value) {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? value
      : null;
  }

  function applyVariableEffects(variables, effects, snapshot, report) {
    let next = Object.assign({}, variables);
    for (const effect of effects) {
      const key = resolveVariableKey(effect.variableId, snapshot);
      const current = next[key];
      const value = normalizeVariableValue(effect.value);
      if (effect.operation === 'set') {
        next = Object.assign({}, next, { [key]: value });
      } else if (effect.operation === 'add' || effect.operation === 'subtract') {
        if (typeof current === 'number' && typeof value === 'number') {
          next = Object.assign({}, next, { [key]: effect.operation === 'add' ? current + value : current - value });
        } else {
          report({ code: 'runtime-unsupported-variable-effect', severity: 'warning', message: 'Variable effect "' + effect.operation + '" requires numeric values.' });
        }
      } else if (effect.operation === 'toggle') {
        if (typeof current === 'boolean') {
          next = Object.assign({}, next, { [key]: !current });
        } else {
          report({ code: 'runtime-unsupported-variable-effect', severity: 'warning', message: 'Variable effect "toggle" requires a boolean value.' });
        }
      }
    }
    return next;
  }

  function evaluateCondition(expression, variables) {
    const condition = (expression || '').trim();
    if (!condition) return { status: 'supported', result: true, diagnostics: [] };
    const comparison = COMPARISON_PATTERN.exec(condition);
    if (comparison) {
      const variableName = comparison[1] || '';
      const operator = comparison[2] || '==';
      const expected = parseLiteral(comparison[3] || '');
      const actual = variables[variableName];
      if (actual === undefined) return missingVariable(variableName);
      return { status: 'supported', result: compareValues(actual, expected, operator), diagnostics: [] };
    }
    const truthy = TRUTHY_PATTERN.exec(condition);
    if (truthy) {
      const variableName = truthy[1] || '';
      const actual = variables[variableName];
      if (actual === undefined) return missingVariable(variableName);
      return { status: 'supported', result: Boolean(actual), diagnostics: [] };
    }
    const negated = NEGATED_PATTERN.exec(condition);
    if (negated) {
      const variableName = negated[1] || '';
      const actual = variables[variableName];
      if (actual === undefined) return missingVariable(variableName);
      return { status: 'supported', result: !Boolean(actual), diagnostics: [] };
    }
    return { status: 'unsupported', result: false, diagnostics: [{ code: 'condition-unsupported', message: 'Unsupported condition syntax: ' + condition }] };
  }

  function parseLiteral(raw) {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw === 'null') return null;
    if (/^-?\\d/.test(raw)) return Number(raw);
    return raw.slice(1, -1).replace(/\\\\"/g, '"').replace(/\\\\'/g, "'");
  }

  function compareValues(actual, expected, operator) {
    if (operator === '==') return actual === expected;
    if (operator === '!=') return actual !== expected;
    if (typeof actual !== 'number' || typeof expected !== 'number') return false;
    if (operator === '>') return actual > expected;
    if (operator === '>=') return actual >= expected;
    if (operator === '<') return actual < expected;
    if (operator === '<=') return actual <= expected;
    return false;
  }

  function missingVariable(variableName) {
    return {
      status: 'missing-variable',
      result: false,
      diagnostics: [{ code: 'condition-missing-variable', message: 'Condition variable "' + variableName + '" is not defined.', variableName }],
    };
  }

  function resolveVariableKey(variableId, snapshot) {
    const variable = ((snapshot.metadata && snapshot.metadata.variables) || []).find((item) => item.id === variableId);
    return variable ? variable.name : variableId;
  }

  function resolveEntryNodeId(snapshot) {
    const start = (snapshot.nodes || []).find((node) => node.type === 'narrative-start');
    return (start && start.nodeId) || (snapshot.metadata && snapshot.metadata.entryNodeId) || ((snapshot.nodes || [])[0] && snapshot.nodes[0].nodeId);
  }

  function findNode(snapshot, nodeId) {
    return (snapshot.nodes || []).find((node) => node.nodeId === nodeId);
  }

  globalThis.NekoNarrativeRuntime = { version: '1', createRuntime };
})();`;
}

export function createHtml5RendererBundle(): string {
  return `(() => {
  function render(root, runtime, story) {
    const state = runtime.state();
    root.innerHTML = '';
    const article = document.createElement('article');
    article.className = 'neko-narrative-scene';
    const title = document.createElement('h1');
    title.textContent = (state.currentNode && (state.currentNode.label || state.currentNode.nodeId)) || 'Narrative';
    article.appendChild(title);

    const scene = state.currentNode && state.currentNode.scene && state.currentNode.scene.sceneRef
      ? story.scenes[state.currentNode.scene.sceneRef]
      : undefined;
    const body = document.createElement('div');
    body.className = 'neko-narrative-body';
    if (scene && Array.isArray(scene.directives)) {
      for (const directive of scene.directives) {
        if (directive.type === 'action') {
          appendParagraph(body, directive.text, 'action');
        } else if (directive.type === 'dialogue') {
          appendParagraph(body, (directive.character ? directive.character + ': ' : '') + directive.text, 'dialogue');
        } else if (directive.type === 'scene-heading') {
          appendParagraph(body, [directive.location, directive.time].filter(Boolean).join(' - '), 'heading');
        }
      }
    } else if (state.currentNode && state.currentNode.scene && state.currentNode.scene.sceneRef) {
      appendParagraph(body, state.currentNode.scene.sceneRef, 'missing-scene');
    }
    article.appendChild(body);

    if (state.status === 'ended' && state.endingStats) {
      appendParagraph(article, state.endingStats.endingLabel || 'Ending', 'ending');
    } else {
      const choices = document.createElement('div');
      choices.className = 'neko-narrative-choices';
      state.choices.forEach((choice, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = choice.label;
        button.disabled = choice.disabled;
        button.addEventListener('click', () => {
          runtime.advance(index);
          render(root, runtime, story);
        });
        choices.appendChild(button);
      });
      article.appendChild(choices);
    }

    root.appendChild(article);
  }

  function appendParagraph(root, text, className) {
    const paragraph = document.createElement('p');
    paragraph.className = className;
    paragraph.textContent = text || '';
    root.appendChild(paragraph);
  }

  globalThis.NekoNarrativeRenderer = { version: '1', render };
})();`;
}
