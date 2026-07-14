import type { ReactElement } from 'react';
import type { AgentHostRuntimeAdapter } from '@neko-agent/types';
import type { SupportedLocale } from '@neko/shared';

export interface AgentWebviewRootProps {
  readonly locale?: SupportedLocale;
  readonly hostRuntimeAdapter?: AgentHostRuntimeAdapter;
}

export function AgentWebviewRoot(_props: AgentWebviewRootProps): ReactElement {
  throw new Error('webview-root-types is a TypeScript-only Home renderer shim.');
}
