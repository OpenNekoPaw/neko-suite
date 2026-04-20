/**
 * Agent Events Module — typed in-process EventBus for dual-flow events.
 *
 * Consumers: ReActLoopRunner (emits execution.round.activation.decided),
 * ProgressNarrator (reads milestones), journal writer (catch-all), UI.
 */

export {
  createEventBus,
  CREATION_CHANNELS,
  EXECUTION_CHANNELS,
  type IEventBus,
  type DualFlowChannel,
  type DualFlowEvent,
  type ChannelListener,
  type AnyListener,
} from './event-bus';
