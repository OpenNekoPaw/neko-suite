/**
 * Agent Events Module — typed in-process EventBus for dual-flow events.
 *
 * Consumers: ReActLoopRunner (emits execution.round.activation.decided),
 * ProgressNarrator (reads milestones), journal writer (catch-all), UI.
 */

export {
  createEventBus,
  AGENT_RUNTIME_CHANNELS,
  type IEventBus,
  type AgentRuntimeChannel,
  type AgentRuntimeEvent,
  type AgentEventBusChannel,
  type AgentEventBusEvent,
  type ChannelListener,
  type AnyListener,
} from './event-bus';
