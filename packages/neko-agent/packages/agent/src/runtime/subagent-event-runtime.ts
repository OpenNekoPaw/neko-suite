import {
  buildSubAgentEventMessage,
  type SubAgentEventMessage,
  type SubAgentWorkItemEvent,
} from '@neko-agent/types';
import type { SubAgentEvent } from '../subagent/types';
import { projectSubAgentEventToWorkItem } from './work-item-projector';

export interface ProjectSubAgentEventForConversationInput {
  readonly conversationId: string;
  readonly event: SubAgentEvent;
}

export interface SubAgentEventRuntime {
  projectForConversation(
    input: ProjectSubAgentEventForConversationInput,
  ): SubAgentEventMessage | null;
}

export function createSubAgentEventRuntime(): SubAgentEventRuntime {
  return new DefaultSubAgentEventRuntime();
}

class DefaultSubAgentEventRuntime implements SubAgentEventRuntime {
  projectForConversation(
    input: ProjectSubAgentEventForConversationInput,
  ): SubAgentEventMessage | null {
    if (input.event.conversationId !== input.conversationId) {
      return null;
    }

    const event = input.event satisfies SubAgentWorkItemEvent;
    return buildSubAgentEventMessage({
      event,
      workItem: projectSubAgentEventToWorkItem(event),
    });
  }
}
