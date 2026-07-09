/**
 * App Component — Root Layout
 *
 * Orchestrates the TUI layout:
 * - ChatView (scrollable, fills available space)
 * - ToolApprovalPanel (overlays when needed)
 * - InputEditor (fixed at bottom, multi-line + history)
 * - StatusBar (fixed at bottom)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from 'ink';
import type { CLIConfig } from '../core/types';
import type { AgentCapabilityProvider, IService } from '@neko/shared';
import { ChatView } from './ChatView/ChatView';
import { InputEditor } from './Input/InputEditor';
import { StatusBar } from './StatusBar/StatusBar';
import { ToolApprovalPanel } from './ToolApproval/ToolApprovalPanel';
import { SelectionMenu } from './Selection/SelectionMenu';
import type { InputSuggestionOption } from './Input/input-suggestions';
import { createTuiReferenceSuggestions } from './Input/reference-suggestions';
import { ErrorBoundary } from './shared/ErrorBoundary';
import { useAgentSession } from '../hooks/useAgentSession';
import { useKeyboard } from '../hooks/useKeyboard';
import { useSlashCommands } from '../hooks/useSlashCommands';
import { useTerminalSize } from '../hooks/useTerminalSize';
import { useConversationStore } from '../stores/conversation-store';
import { useConfigStore } from '../stores/config-store';
import { useUIStore } from '../stores/ui-store';
import { createTuiSkillInvocationCatalog } from '../core/slash-command-catalog';
import {
  createTuiAutomationAppPort,
  type TuiAutomationSessionHandle,
} from '../core/debug-automation/app-port';
import type { TuiDebugAutomationController } from '../core/debug-automation/types';

interface AppProps {
  /** CLI configuration (loaded before render) */
  readonly config: CLIConfig;
  /** Optional Platform Service from extension */
  readonly service?: IService;
  /** Host-agnostic capability providers injected by embedding hosts. */
  readonly capabilityProviders?: readonly AgentCapabilityProvider[];
  /** Optional prompt submitted once after the TUI session is initialized. */
  readonly initialPrompt?: string;
  /** Optional persisted conversation id to resume inside the Ink TUI session. */
  readonly resumeConversationId?: string;
  /** Optional local developer automation controller. */
  readonly automation?: TuiDebugAutomationController;
}

export function App({
  config,
  service,
  capabilityProviders,
  initialPrompt,
  resumeConversationId,
  automation,
}: AppProps): React.JSX.Element {
  const pendingApproval = useUIStore((s) => s.pendingApproval);
  const pendingSelection = useUIStore((s) => s.pendingSelection);
  const pendingPlanReview = useUIStore((s) => s.pendingPlanReview);
  const [referenceSuggestions, setReferenceSuggestions] = useState<
    readonly InputSuggestionOption[]
  >([]);
  const submittedInitialPromptRef = useRef<string | null>(null);
  const referenceRequestIdRef = useRef(0);

  // Track terminal size changes
  useTerminalSize();

  // Initialize config store
  useEffect(() => {
    useConfigStore.getState().replaceConfig(config);
  }, [config]);

  // Initialize agent session
  const agentSession = useAgentSession({
    config,
    service,
    capabilityProviders,
    resumeConversationId,
  });
  const agentSessionRef = useRef<TuiAutomationSessionHandle>(agentSession);
  agentSessionRef.current = agentSession;

  const {
    submit,
    cancel,
    clearHistory,
    confirmTool,
    updateModel,
    updateMode,
    validateLlmConfig,
    applyLlmConfig,
    getContextTokenCount,
    compactContext,
    getMessageQueueSnapshot,
    listTasks,
    promoteQueuedMessage,
    cancelQueuedMessage,
    editQueuedMessage,
    activateSkill,
    deactivateSkill,
    getSkillService,
    getToolRegistry,
    listMcpServers,
    listMcpTools,
    connectMcpServer,
    disconnectMcpServer,
    reconnectMcpServer,
    getCapabilityProviderSummaries,
    getCapabilityDiagnostics,
    listCapabilityTools,
    getReferenceContributors,
    getConversationStorage,
    getCurrentConversationId,
    resumeConversation,
    getHistory,
    syncRuntimeState,
    slashCommands,
  } = agentSession;

  useEffect(() => {
    if (!automation) {
      return;
    }
    const port = createTuiAutomationAppPort({
      readHandle: () => agentSessionRef.current,
    });
    automation.bind(port);
    return () => {
      automation.unbind(port);
    };
  }, [automation]);

  const refreshReferenceSuggestions = useCallback((query = '') => {
    let cancelled = false;
    const requestId = referenceRequestIdRef.current + 1;
    referenceRequestIdRef.current = requestId;
    void createTuiReferenceSuggestions({
      workspaceRoot: config.workDir,
      query,
      referenceContributors: getReferenceContributors(),
    }).then(
      (suggestions) => {
        if (!cancelled && referenceRequestIdRef.current === requestId) {
          setReferenceSuggestions(suggestions);
        }
      },
      (error) => {
        if (!cancelled && referenceRequestIdRef.current === requestId) {
          const message = error instanceof Error ? error.message : String(error);
          useConversationStore
            .getState()
            .addError(new Error(`Reference suggestion error: ${message}`));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [config.workDir, getReferenceContributors, slashCommands]);

  useEffect(() => refreshReferenceSuggestions(), [refreshReferenceSuggestions]);

  // Slash command handling
  const { handleCommand, onClear } = useSlashCommands({
    clearHistory,
    submit,
    updateModel,
    updateMode,
    validateLlmConfig,
    applyLlmConfig,
    getContextTokenCount,
    compactContext,
    getMessageQueueSnapshot,
    listTasks,
    promoteQueuedMessage,
    cancelQueuedMessage,
    editQueuedMessage,
    activateSkill,
    deactivateSkill,
    getSkillService,
    getToolRegistry,
    listMcpServers,
    listMcpTools,
    connectMcpServer,
    disconnectMcpServer,
    reconnectMcpServer,
    getCapabilityProviderSummaries,
    getCapabilityDiagnostics,
    listCapabilityTools,
    getConversationStorage,
    getCurrentConversationId,
    resumeConversation,
    getHistory,
    syncRuntimeState,
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

  useEffect(() => {
    const trimmed = initialPrompt?.trim();
    if (!trimmed || submittedInitialPromptRef.current === trimmed) {
      return;
    }
    submittedInitialPromptRef.current = trimmed;
    void submit(trimmed);
  }, [initialPrompt, submit]);

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

  // Plan review: execute → switch to auto and re-submit the plan
  const handlePlanReviewExecute = useCallback(async () => {
    useUIStore.getState().dismissPlanReview();
    updateMode('auto');
    await submit('Execute the plan above.');
  }, [updateMode, submit]);

  const handlePlanReviewDismiss = useCallback(() => {
    useUIStore.getState().dismissPlanReview();
  }, []);

  // Build plan review selection menu items (shown when pendingPlanReview is true)
  const planReviewSelection = pendingPlanReview
    ? {
        title: 'Plan ready — what next?',
        items: [
          {
            id: 'execute',
            label: '✅ Execute',
            description: 'Switch to auto mode and run the plan',
          },
          { id: 'modify', label: '✏️  Modify', description: 'Edit your message and re-plan' },
          { id: 'cancel', label: '❌ Cancel', description: 'Stay in plan mode' },
        ],
        resolve: (selectedId: string | null) => {
          if (selectedId === 'execute') {
            void handlePlanReviewExecute();
          } else {
            handlePlanReviewDismiss();
          }
        },
      }
    : null;

  const inputDisabled = !!pendingSelection || pendingPlanReview;
  const skillSuggestions = createTuiSkillInvocationCatalog(
    getSkillService()
      ?.registry.listSkills()
      .map((skill) => ({
        name: skill.name,
        description: skill.description ?? undefined,
        enabled: skill.enabled,
      })),
  ).map((skill) => ({
    trigger: '$' as const,
    name: skill.name.startsWith('$') ? skill.name.slice(1) : skill.name,
    description: skill.description,
    kind: 'skill',
  }));

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

        {/* Selection menu — shows for /model, /skill etc. */}
        {pendingSelection ? <SelectionMenu selection={pendingSelection} /> : null}

        {/* Plan review menu — shows after plan-mode execution completes */}
        {planReviewSelection ? <SelectionMenu selection={planReviewSelection} /> : null}

        {/* Input — fixed at bottom, with slash command support */}
        <InputEditor
          onSubmit={handleSubmit}
          onSlashCommand={handleCommand}
          onSkillInvocation={handleCommand}
          disabled={inputDisabled}
          commands={slashCommands}
          skills={skillSuggestions}
          references={referenceSuggestions}
          onReferenceQueryChange={refreshReferenceSuggestions}
        />

        {/* Status bar — fixed at very bottom */}
        <StatusBar />
      </Box>
    </ErrorBoundary>
  );
}
