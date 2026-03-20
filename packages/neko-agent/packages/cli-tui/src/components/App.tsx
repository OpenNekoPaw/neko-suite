/**
 * App Component — Root Layout
 *
 * Orchestrates the TUI layout:
 * - ChatView (scrollable, fills available space)
 * - ToolApprovalPanel (overlays when needed)
 * - InputEditor (fixed at bottom, multi-line + history)
 * - StatusBar (fixed at bottom)
 */

import React, { useCallback, useEffect } from 'react';
import { Box } from 'ink';
import type { CLIConfig } from '../core/types';
import type { IService } from '@neko/shared';
import { ChatView } from './ChatView/ChatView';
import { InputEditor } from './Input/InputEditor';
import { StatusBar } from './StatusBar/StatusBar';
import { ToolApprovalPanel } from './ToolApproval/ToolApprovalPanel';
import { SelectionMenu } from './Selection/SelectionMenu';
import { ErrorBoundary } from './shared/ErrorBoundary';
import { useAgentSession } from '../hooks/useAgentSession';
import { useKeyboard } from '../hooks/useKeyboard';
import { useSlashCommands } from '../hooks/useSlashCommands';
import { useTerminalSize } from '../hooks/useTerminalSize';
import { useAgentStore } from '../stores/agent-store';
import { useConversationStore } from '../stores/conversation-store';
import { useConfigStore } from '../stores/config-store';
import { useUIStore } from '../stores/ui-store';

interface AppProps {
  /** CLI configuration (loaded before render) */
  readonly config: CLIConfig;
  /** Optional Platform Service from extension */
  readonly service?: IService;
}

export function App({ config, service }: AppProps): React.JSX.Element {
  const status = useAgentStore((s) => s.status);
  const pendingApproval = useUIStore((s) => s.pendingApproval);
  const pendingSelection = useUIStore((s) => s.pendingSelection);

  // Track terminal size changes
  useTerminalSize();

  // Initialize config store
  useEffect(() => {
    useConfigStore.getState().replaceConfig(config);
  }, [config]);

  // Initialize agent session
  const {
    submit,
    cancel,
    clearHistory,
    confirmTool,
    updateModel,
    updateMode,
    getSkillService,
    getToolRegistry,
  } = useAgentSession({
    config,
    service,
  });

  // Slash command handling
  const { handleCommand, onClear } = useSlashCommands({
    clearHistory,
    updateModel,
    getSkillService,
    getToolRegistry,
  });

  // Global keyboard shortcuts
  useKeyboard({
    onCancel: cancel,
    onClear: () => {
      onClear();
      useConversationStore.getState().clearMessages();
    },
    onQuit: () => {
      process.exit(0);
    },
    onModeChange: updateMode,
  });

  // Handle user prompt submission
  const handleSubmit = useCallback(
    async (text: string) => {
      await submit(text);
    },
    [submit],
  );

  // Handle tool approval
  const handleApprove = useCallback(() => {
    if (pendingApproval) {
      pendingApproval.resolve(true);
      confirmTool(pendingApproval.toolCallId, true);
    }
  }, [pendingApproval, confirmTool]);

  const handleReject = useCallback(() => {
    if (pendingApproval) {
      pendingApproval.resolve(false);
      confirmTool(pendingApproval.toolCallId, false);
    }
  }, [pendingApproval, confirmTool]);

  const isRunning = status === 'running' || status === 'waiting_confirmation';
  const inputDisabled = isRunning || !!pendingSelection;

  return (
    <ErrorBoundary label="Neko TUI">
      <Box flexDirection="column" height="100%">
        {/* Chat messages — fills available space */}
        <ErrorBoundary label="ChatView">
          <ChatView />
        </ErrorBoundary>

        {/* Tool approval panel — shows when needed */}
        {pendingApproval ? (
          <ToolApprovalPanel
            approval={pendingApproval}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        ) : null}

        {/* Selection menu — shows for /model etc. */}
        {pendingSelection ? <SelectionMenu selection={pendingSelection} /> : null}

        {/* Input — fixed at bottom, with slash command support */}
        <InputEditor
          onSubmit={handleSubmit}
          onSlashCommand={handleCommand}
          disabled={inputDisabled}
        />

        {/* Status bar — fixed at very bottom */}
        <StatusBar />
      </Box>
    </ErrorBoundary>
  );
}
