/**
 * Custom Hooks Module
 *
 * Exports all custom hooks for state management.
 */

export { useUIState, type UIState, type UIStateActions, type UseUIStateReturn } from './useUIState';

export {
  useConversationState,
  type StreamingState,
  type ConversationState,
  type ConversationStateRefs,
  type ConversationStateActions,
  type UseConversationStateReturn,
} from './useConversationState';

export {
  useConfigState,
  DEFAULT_SETTINGS,
  type ProjectFileInfo,
  type ConfigState,
  type ConfigStateActions,
  type UseConfigStateReturn,
} from './useConfigState';

export {
  useResourceState,
  type ResourceState,
  type PromiseResolvers,
  type ResourceStateActions,
  type UseResourceStateReturn,
} from './useResourceState';

export {
  useMessageQueue,
  type QueuedMessage,
  type UseMessageQueueReturn,
} from './useMessageQueue';

export {
  useConversationSession,
  type UseConversationSessionProps,
  type UseConversationSessionReturn,
} from './useConversationSession';

export {
  useTabManager,
  type UseTabManagerProps,
  type UseTabManagerReturn,
} from './useTabManager';

export {
  useSlashCommands,
  type UseSlashCommandsProps,
  type UseSlashCommandsReturn,
} from './useSlashCommands';
