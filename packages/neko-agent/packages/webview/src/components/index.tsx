/**
 * AIAssistant — Public export (backward-compatible re-export).
 *
 * The component has been decomposed into three layers:
 *   - AppShell (root layout + global state)
 *   - ConversationController (session orchestration)
 *   - ChatWorkspace (view composition)
 *
 * See docs/architecture/neko-agent-webview-optimization.md for ADR.
 */

export { AppShell as AIAssistant } from './AppShell';
