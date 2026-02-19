/**
 * Message Processing Modules
 *
 * Specialized processors extracted from MessageHandler:
 * - AttachmentProcessor: File/image attachment handling
 * - AgentStreamProcessor: Agent event stream processing
 */

export { AttachmentProcessor, type ProcessedAttachments } from './attachmentProcessor';
export {
  AgentStreamProcessor,
  type AgentStreamProcessorDeps,
  type ContentBlock,
  type CollectedToolCall,
  type StreamProcessingResult,
  type StreamCallbacks,
} from './agentStreamProcessor';
