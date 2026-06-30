/**
 * TUI Feature Audit Tests
 *
 * Comprehensive snapshot tests to verify:
 * 1. Claude Code-like visual style
 * 2. Thinking/reasoning process display
 * 3. Task progress (TodoList)
 * 4. Agent execution progress (iteration, spinner, token bar)
 * 5. Model display from .neko/config.toml
 * 6. Slash commands (/help, /status, /config, /plan, /auto, /ask)
 * 7. Diff preview in tool approval
 * 8. Command preview in tool approval
 * 9. Full conversation flow with tool calls
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { Box } from 'ink';

import { MessageItem } from '../components/ChatView/MessageItem';
import { StreamingText } from '../components/ChatView/StreamingText';
import { ThinkingBlock } from '../components/ChatView/ThinkingBlock';
import { TodoList } from '../components/ChatView/TodoList';
import { StatusBar } from '../components/StatusBar/StatusBar';
import { InputEditor } from '../components/Input/InputEditor';
import { ChatView } from '../components/ChatView/ChatView';
import { ToolApprovalPanel } from '../components/ToolApproval/ToolApprovalPanel';
import { SlashCommandMenu, TUI_COMMANDS } from '../components/Input/SlashCommandMenu';

import { useAgentStore } from '../stores/agent-store';
import { useConversationStore } from '../stores/conversation-store';
import { useConfigStore } from '../stores/config-store';

import type { Message, TodoItem } from '../types/state';
import { DEFAULT_CLI_CONFIG } from '../core/types';

// ─── Test Config (mirrors .neko/config.toml) ────────────────────────

const TEST_CONFIG = {
  ...DEFAULT_CLI_CONFIG,
  provider: 'openai',
  providerType: 'openai',
  providerRequiresApiKey: true,
  model: 'gpt-5.3-codex',
  baseUrl: 'https://www.nekoapi.com/v1',
  apiKey: 'sk-test-key',
};

function resetStores(): void {
  useAgentStore.getState().reset();
  useConversationStore.getState().clearMessages();
  useConfigStore.getState().replaceConfig(TEST_CONFIG);
}

function msg(
  role: 'user' | 'assistant' | 'system',
  content: string,
  extra?: Partial<Message>,
): Message {
  return {
    id: `${role}-${Date.now()}-${Math.random()}`,
    role,
    content,
    toolCalls: [],
    todos: [],
    timestamp: Date.now(),
    ...extra,
  };
}

// ═════════════════════════════════════════════════════════════════════
// 1. Claude Code 风格对比
// ═════════════════════════════════════════════════════════════════════

describe('1. Claude Code Visual Style', () => {
  beforeEach(resetStores);

  it('user prompt uses ❯ prefix (Claude Code style)', () => {
    const { lastFrame } = render(<MessageItem message={msg('user', 'Explain this code')} />);
    const frame = lastFrame()!;
    expect(frame).toContain('❯');
    expect(frame).toContain('Explain this code');
    console.log('[Style] User prompt:\n', frame);
  });

  it('status bar shows model + mode + shortcuts (Claude Code style)', () => {
    const { lastFrame } = render(<StatusBar />);
    const frame = lastFrame()!;
    // Model from config
    expect(frame).toContain('gpt-5.3-codex');
    // Execution mode
    expect(frame).toContain('auto');
    // Keyboard shortcuts
    expect(frame).toContain('Esc:cancel');
    expect(frame).toContain('^L:clear');
    console.log('[Style] StatusBar:\n', frame);
  });

  it('input has bordered box with placeholder (Claude Code style)', () => {
    const { lastFrame } = render(<InputEditor onSubmit={() => {}} />);
    const frame = lastFrame()!;
    // Bordered round box
    expect(frame).toContain('╭');
    expect(frame).toContain('╰');
    // Placeholder
    expect(frame).toContain('Type a message or /help');
    // Cursor
    expect(frame).toContain('▋');
    console.log('[Style] Input:\n', frame);
  });

  it('tool calls use ✓/◐/✗ icons (Claude Code style)', () => {
    const m = msg('assistant', '', {
      toolCalls: [
        { id: '1', name: 'ReadFile', arguments: { path: 'src/app.ts' }, status: 'success' },
        { id: '2', name: 'Bash', arguments: { command: 'pnpm build' }, status: 'running' },
        {
          id: '3',
          name: 'WriteFile',
          arguments: { path: 'out.ts' },
          status: 'error',
          error: 'fail',
        },
      ],
    });
    const { lastFrame } = render(<MessageItem message={m} />);
    const frame = lastFrame()!;
    expect(frame).toContain('✓');
    expect(frame).toContain('◐');
    expect(frame).toContain('✗');
    console.log('[Style] Tool call icons:\n', frame);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 2. Thinking/Reasoning 过程显示
// ═════════════════════════════════════════════════════════════════════

describe('2. Thinking/Reasoning Process Display', () => {
  beforeEach(resetStores);

  it('shows spinner during active thinking', () => {
    const { lastFrame } = render(
      <ThinkingBlock content="Analyzing architecture patterns..." isThinking={true} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Thinking...');
    // Braille spinner character
    expect(frame).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    console.log('[Thinking] Active:\n', frame);
  });

  it('shows line count and preview after thinking completes', () => {
    const thinking = [
      'First analyze the module dependencies.',
      'Check for circular imports.',
      'The config layer uses three-tier merging.',
      'Need to verify SOLID compliance.',
    ].join('\n');

    const { lastFrame } = render(
      <ThinkingBlock content={thinking} isThinking={false} maxLines={2} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Thought for 4 lines');
    expect(frame).toContain('First analyze');
    expect(frame).toContain('Check for circular');
    expect(frame).toContain('... 2 more lines');
    console.log('[Thinking] Completed:\n', frame);
  });

  it('thinking block renders inside assistant message', () => {
    const m = msg('assistant', 'Here is the analysis result.', {
      thinking: 'Let me check the code...\nFound the issue.',
    });
    const { lastFrame } = render(<MessageItem message={m} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Thought for 2 lines');
    expect(frame).toContain('Here is the analysis result.');
    console.log('[Thinking] In message:\n', frame);
  });

  it('streaming thinking shows before content delta', () => {
    const m = msg('assistant', '');
    const { lastFrame } = render(
      <MessageItem
        message={m}
        isStreaming={true}
        currentThinking="Analyzing dependencies..."
        currentDelta=""
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Thinking...');
    console.log('[Thinking] Streaming (thinking only):\n', frame);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 3. 任务进度 (TodoList)
// ═════════════════════════════════════════════════════════════════════

describe('3. Task Progress (TodoList)', () => {
  it('renders all four todo states with correct icons', () => {
    const todos: TodoItem[] = [
      { content: 'Read source files', status: 'completed' },
      { content: 'Refactoring modules', status: 'in_progress' },
      { content: 'Write unit tests', status: 'pending' },
      { content: 'Integration test failed', status: 'failed' },
    ];
    const { lastFrame } = render(<TodoList todos={todos} />);
    const frame = lastFrame()!;

    expect(frame).toContain('[✓] Read source files');
    expect(frame).toContain('Refactoring modules'); // in_progress uses spinner
    expect(frame).toContain('[ ] Write unit tests');
    expect(frame).toContain('[✗] Integration test failed');

    // in_progress should have braille spinner
    expect(frame).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);

    console.log('[Todo] All states:\n', frame);
  });

  it('todos render inside assistant message', () => {
    const m = msg('assistant', 'Working on the refactor.', {
      todos: [
        { content: 'Extract interfaces', status: 'completed' },
        { content: 'Implement adapter', status: 'in_progress' },
        { content: 'Add tests', status: 'pending' },
      ],
    });
    const { lastFrame } = render(<MessageItem message={m} />);
    const frame = lastFrame()!;
    expect(frame).toContain('[✓] Extract interfaces');
    expect(frame).toContain('Implement adapter');
    expect(frame).toContain('[ ] Add tests');
    console.log('[Todo] In message:\n', frame);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 4. Agent 执行进度
// ═════════════════════════════════════════════════════════════════════

describe('4. Agent Execution Progress', () => {
  beforeEach(resetStores);

  it('shows iteration progress (current/max)', () => {
    useAgentStore.getState().setRunning();
    useAgentStore.getState().setIteration(3, 10);

    const { lastFrame } = render(<StatusBar />);
    const frame = lastFrame()!;
    expect(frame).toContain('3/10');
    expect(frame).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/); // spinner
    console.log('[Progress] Iteration:\n', frame);
  });

  it('shows token usage bar with formatted count', () => {
    useAgentStore.getState().setRunning();
    useAgentStore.getState().updateUsage({
      inputTokens: 45000,
      outputTokens: 5000,
      totalTokens: 50000,
    });

    const { lastFrame } = render(<StatusBar />);
    const frame = lastFrame()!;
    expect(frame).toContain('50.0K');
    // Progress bar characters
    expect(frame).toMatch(/[█░]/);
    console.log('[Progress] Token usage:\n', frame);
  });

  it('shows streaming cursor during content generation', () => {
    const { lastFrame } = render(<StreamingText content="Generating code..." isStreaming={true} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Generating code...');
    expect(frame).toContain('▋');
    console.log('[Progress] Streaming cursor:\n', frame);
  });

  it('shows error state in status bar', () => {
    useAgentStore.getState().setError(new Error('Rate limit exceeded'));
    const { lastFrame } = render(<StatusBar />);
    const frame = lastFrame()!;
    expect(frame).toContain('error');
    console.log('[Progress] Error state:\n', frame);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 5. 模型配置显示
// ═════════════════════════════════════════════════════════════════════

describe('5. Model Configuration Display', () => {
  beforeEach(resetStores);

  it('status bar displays configured model name', () => {
    const { lastFrame } = render(<StatusBar />);
    const frame = lastFrame()!;
    expect(frame).toContain('gpt-5.3-codex');
    console.log('[Config] Model in StatusBar:\n', frame);
  });

  it('status bar truncates model date suffix', () => {
    useConfigStore.getState().replaceConfig({
      ...TEST_CONFIG,
      model: 'claude-sonnet-4-20250514',
    });
    const { lastFrame } = render(<StatusBar />);
    const frame = lastFrame()!;
    expect(frame).toContain('claude-sonnet-4');
    expect(frame).not.toContain('20250514');
    console.log('[Config] Truncated model:\n', frame);
  });

  it('status bar shows different execution modes', () => {
    // Plan mode
    useAgentStore.getState().setExecutionMode('plan');
    const { lastFrame: f1 } = render(<StatusBar />);
    expect(f1()).toContain('plan');
    console.log('[Config] Plan mode:\n', f1());

    // Ask mode
    useAgentStore.getState().setExecutionMode('ask');
    const { lastFrame: f2 } = render(<StatusBar />);
    expect(f2()).toContain('ask');
    console.log('[Config] Ask mode:\n', f2());

    // Auto mode
    useAgentStore.getState().setExecutionMode('auto');
    const { lastFrame: f3 } = render(<StatusBar />);
    expect(f3()).toContain('auto');
    console.log('[Config] Auto mode:\n', f3());
  });

  it('status bar shows active Skill lifecycle records compactly', () => {
    useAgentStore.getState().setActiveSkillLifecycleRecords([
      {
        id: 'domain-1',
        skillName: 'review',
        slot: 'domainSkill',
        owner: 'user',
        clearable: true,
        status: 'active',
      },
      {
        id: 'stage-1',
        skillName: 'creation-persona',
        slot: 'stagePersona',
        owner: 'idc',
        clearable: false,
        lockedReason: 'IDC stage persona is cleared when its owning stage exits',
        status: 'active',
      },
    ]);

    const { lastFrame } = render(<StatusBar />);
    const frame = lastFrame()!;

    expect(frame).toContain('skills:');
    expect(frame).toContain('review[domainSkill]+1');
    expect(frame).not.toContain('skill:review');
    console.log('[Config] Skill lifecycle status:\n', frame);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 6. Slash 命令功能
// ═════════════════════════════════════════════════════════════════════

describe('6. Slash Command System', () => {
  beforeEach(resetStores);

  it('/help generates categorized command list', async () => {
    const { generateCliHelpText } = await import('@neko/agent');

    const helpText = generateCliHelpText();
    expect(helpText).toContain('Available Commands');
    expect(helpText).toContain('/help');
    expect(helpText).toContain('/status');
    expect(helpText).toContain('/clear');
    expect(helpText).toContain('/config');
    console.log('[Help] Generated text:\n', helpText);
  });

  it('slash command menu renders with TUI_COMMANDS (max 8 visible)', () => {
    const { lastFrame } = render(
      <SlashCommandMenu
        commands={TUI_COMMANDS}
        filter=""
        onSelect={() => {}}
        onDismiss={() => {}}
      />,
    );
    const frame = lastFrame()!;
    // First 8 commands are visible
    expect(frame).toContain('/help');
    expect(frame).toContain('/clear');
    expect(frame).toContain('/compact');
    expect(frame).toContain('/config');
    expect(frame).toContain('/plan');
    expect(frame).toContain('/auto');
    expect(frame).toContain('/ask');
    // Items 9-10 (status, exit) are truncated
    expect(frame).toContain('... 2 more');
    console.log('[Commands] Full menu (8 visible + 2 more):\n', frame);
  });

  it('slash command menu filters by input', () => {
    const { lastFrame } = render(
      <SlashCommandMenu
        commands={TUI_COMMANDS}
        filter="/co"
        onSelect={() => {}}
        onDismiss={() => {}}
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('/config');
    expect(frame).toContain('/compact');
    // Should not show unrelated commands
    expect(frame).not.toContain('/exit');
    expect(frame).not.toContain('/help');
    console.log('[Commands] Filtered "/co":\n', frame);
  });

  it('/status shows model info in system message', () => {
    useAgentStore.getState().setExecutionMode('auto');
    useAgentStore.getState().updateUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });

    // Simulate /status command output
    const config = useConfigStore.getState().config;
    const status = useAgentStore.getState();
    const statusMsg = [
      `Model: ${config.model}`,
      `Mode: ${status.executionMode}`,
      `Status: ${status.status}`,
      `Tokens: ${status.usage.total}`,
    ].join('\n');

    const m = msg('system', statusMsg);
    const { lastFrame } = render(<MessageItem message={m} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Model: gpt-5.3-codex');
    expect(frame).toContain('Mode: auto');
    expect(frame).toContain('Tokens: 150');
    console.log('[Status] Command output:\n', frame);
  });

  it('/plan, /auto, /ask switch execution mode', () => {
    // Simulate mode switching
    useAgentStore.getState().setExecutionMode('plan');
    expect(useAgentStore.getState().executionMode).toBe('plan');

    useAgentStore.getState().setExecutionMode('auto');
    expect(useAgentStore.getState().executionMode).toBe('auto');

    useAgentStore.getState().setExecutionMode('ask');
    expect(useAgentStore.getState().executionMode).toBe('ask');
  });

  it('TUI_COMMANDS includes all expected commands', () => {
    const names = TUI_COMMANDS.map((c) => c.name);
    expect(names).toContain('help');
    expect(names).toContain('clear');
    expect(names).toContain('compact');
    expect(names).toContain('model');
    expect(names).toContain('config');
    expect(names).toContain('plan');
    expect(names).toContain('auto');
    expect(names).toContain('ask');
    expect(names).toContain('status');
    expect(names).toContain('exit');
  });
});

// ═════════════════════════════════════════════════════════════════════
// 7. Diff 显示
// ═════════════════════════════════════════════════════════════════════

describe('7. Diff Display', () => {
  it('tool approval shows diff for file write with +/- lines', () => {
    const approval = {
      toolCallId: 'tc-diff',
      toolName: 'edit_file',
      arguments: {
        path: '/src/config.ts',
        old_content: 'const MAX = 100;\nconst MIN = 0;\n',
        new_content: 'const MAX = 200;\nconst MIN = 0;\nconst DEFAULT = 50;\n',
      },
      resolve: () => {},
    };

    const { lastFrame } = render(
      <ToolApprovalPanel approval={approval} onApprove={() => {}} onReject={() => {}} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Tool Approval Required');
    expect(frame).toContain('edit_file');
    expect(frame).toContain('/src/config.ts');
    // Diff stats
    expect(frame).toMatch(/\+\d/);
    expect(frame).toMatch(/-\d/);
    console.log('[Diff] Edit file approval:\n', frame);
  });

  it('tool approval shows diff for new file creation', () => {
    const approval = {
      toolCallId: 'tc-new',
      toolName: 'WriteFile',
      arguments: {
        path: '/src/utils/helper.ts',
        content: [
          'export function clamp(value: number, min: number, max: number): number {',
          '  return Math.min(Math.max(value, min), max);',
          '}',
          '',
        ].join('\n'),
      },
      resolve: () => {},
    };

    const { lastFrame } = render(
      <ToolApprovalPanel approval={approval} onApprove={() => {}} onReject={() => {}} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('WriteFile');
    expect(frame).toContain('helper.ts');
    // New file should show all lines as additions
    expect(frame).toContain('+');
    expect(frame).toContain('clamp');
    console.log('[Diff] New file creation:\n', frame);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 8. Command 预览
// ═════════════════════════════════════════════════════════════════════

describe('8. Command Preview in Tool Approval', () => {
  it('bash command shows $ prefix', () => {
    const approval = {
      toolCallId: 'tc-bash',
      toolName: 'Bash',
      arguments: { command: 'pnpm build && pnpm test' },
      resolve: () => {},
    };

    const { lastFrame } = render(
      <ToolApprovalPanel approval={approval} onApprove={() => {}} onReject={() => {}} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('$');
    expect(frame).toContain('pnpm build && pnpm test');
    expect(frame).toContain('[y]');
    expect(frame).toContain('[n]');
    expect(frame).toContain('[a]');
    console.log('[Command] Bash approval:\n', frame);
  });

  it('bash command with cwd shows working directory', () => {
    const approval = {
      toolCallId: 'tc-cwd',
      toolName: 'execute_command',
      arguments: {
        command: 'cargo test',
        cwd: '/packages/neko-engine',
      },
      resolve: () => {},
    };

    const { lastFrame } = render(
      <ToolApprovalPanel approval={approval} onApprove={() => {}} onReject={() => {}} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('execute_command');
    expect(frame).toContain('cargo test');
    expect(frame).toContain('/packages/neko-engine');
    console.log('[Command] With cwd:\n', frame);
  });

  it('generic tool shows argument summary', () => {
    const approval = {
      toolCallId: 'tc-generic',
      toolName: 'SearchCode',
      arguments: {
        query: 'IService interface',
        language: 'typescript',
        maxResults: 10,
      },
      resolve: () => {},
    };

    const { lastFrame } = render(
      <ToolApprovalPanel approval={approval} onApprove={() => {}} onReject={() => {}} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('SearchCode');
    expect(frame).toContain('IService interface');
    console.log('[Command] Generic tool:\n', frame);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 9. 完整对话流测试
// ═════════════════════════════════════════════════════════════════════

describe('9. Full Conversation Flow', () => {
  beforeEach(resetStores);

  it('full agent session: query → thinking → tools → response → todos', () => {
    const store = useConversationStore.getState();

    // User asks
    store.addUserMessage('Refactor the ConfigManager to use dependency injection');

    // Agent starts
    store.startAssistantMessage();

    // Tool calls
    store.addToolCall({
      id: 'tc-1',
      name: 'ReadFile',
      arguments: { path: '/src/config/config-manager.ts' },
    });
    store.updateToolResult({ toolCallId: 'tc-1', success: true, data: '...' });

    store.addToolCall({
      id: 'tc-2',
      name: 'ReadFile',
      arguments: { path: '/src/config/types.ts' },
    });
    store.updateToolResult({ toolCallId: 'tc-2', success: true, data: '...' });

    // Todos
    store.updateTodos([
      { content: 'Read ConfigManager source', status: 'completed' },
      { content: 'Read type definitions', status: 'completed' },
      { content: 'Extract IConfigSource interface', status: 'completed' },
      { content: 'Implement constructor injection', status: 'in_progress' },
      { content: 'Update tests', status: 'pending' },
    ]);

    // Complete with content
    store.completeMessage(
      "I've refactored `ConfigManager` to use **dependency injection**.\n\n" +
        'Key changes:\n' +
        '- Extracted `IConfigSource` interface\n' +
        '- Constructor now accepts `IConfigSource[]`\n' +
        '- Removed hard-coded file system access',
    );

    // Set running state for status bar
    useAgentStore.getState().setRunning();
    useAgentStore.getState().setIteration(4, 10);
    useAgentStore.getState().updateUsage({
      inputTokens: 12000,
      outputTokens: 3500,
      totalTokens: 15500,
    });

    const { lastFrame } = render(
      <Box flexDirection="column" height={40}>
        <ChatView />
        <InputEditor onSubmit={() => {}} disabled={true} />
        <StatusBar />
      </Box>,
    );
    const frame = lastFrame()!;

    // User message
    expect(frame).toContain('❯');
    expect(frame).toContain('Refactor the ConfigManager');

    // Tool calls with icons
    expect(frame).toContain('✓');
    expect(frame).toContain('ReadFile');
    expect(frame).toContain('config-manager.ts');

    // Todos
    expect(frame).toContain('[✓]');
    expect(frame).toContain('[ ]');

    // Content
    expect(frame).toContain('dependency injection');
    expect(frame).toContain('IConfigSource');

    // Status bar
    expect(frame).toContain('gpt-5.3-codex');
    expect(frame).toContain('4/10');
    expect(frame).toContain('15.5K');

    console.log('═══ Full Agent Session ═══\n', frame);
  });

  it('error recovery flow', () => {
    const store = useConversationStore.getState();

    store.addUserMessage('Deploy to production');
    store.startAssistantMessage();
    store.addToolCall({
      id: 'tc-1',
      name: 'Bash',
      arguments: { command: 'pnpm deploy:prod' },
    });
    store.updateToolResult({
      toolCallId: 'tc-1',
      success: false,
      data: null,
      error: 'ECONNREFUSED: Connection to deploy server failed',
    });
    store.completeMessage(
      'The deployment failed due to a connection error. Let me check the server status.',
    );

    // Error message
    store.addError(new Error('Deploy server unreachable'));

    useAgentStore.getState().setError(new Error('Deploy server unreachable'));

    const { lastFrame } = render(
      <Box flexDirection="column" height={24}>
        <ChatView />
        <StatusBar />
      </Box>,
    );
    const frame = lastFrame()!;

    expect(frame).toContain('Deploy to production');
    expect(frame).toContain('✗');
    expect(frame).toContain('Bash');
    expect(frame).toContain('pnpm deploy:prod');
    expect(frame).toContain('connection error');
    expect(frame).toContain('error');

    console.log('═══ Error Recovery Flow ═══\n', frame);
  });

  it('multi-turn conversation with mode switch', () => {
    const store = useConversationStore.getState();

    // Turn 1
    store.addUserMessage('What is the architecture?');
    store.startAssistantMessage();
    store.completeMessage('The project uses a monorepo structure with pnpm workspaces.');

    // System message (mode switch)
    store.addSystemMessage('Switched to plan mode');
    useAgentStore.getState().setExecutionMode('plan');

    // Turn 2 in plan mode
    store.addUserMessage('Plan the auth refactor');
    store.startAssistantMessage();
    store.completeMessage('## Plan\n\n1. Extract interfaces\n2. Implement DI\n3. Write tests');

    const { lastFrame } = render(
      <Box flexDirection="column" height={30}>
        <ChatView />
        <StatusBar />
      </Box>,
    );
    const frame = lastFrame()!;

    expect(frame).toContain('What is the architecture?');
    expect(frame).toContain('monorepo');
    expect(frame).toContain('Switched to plan mode');
    expect(frame).toContain('Plan the auth refactor');
    expect(frame).toContain('plan');

    console.log('═══ Multi-turn with Mode Switch ═══\n', frame);
  });
});
