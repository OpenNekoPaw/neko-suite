import type { ReactElement } from 'react';
import type { ProjectData, SupportedLocale } from '@neko/shared';

export interface AgentWebviewRootProps {
  readonly locale?: SupportedLocale;
}

export interface CutWebviewRootProps {
  readonly initialProject?: ProjectData;
  readonly projectRoot?: string;
  readonly locale?: SupportedLocale;
}

export function AgentWebviewRoot(_props: AgentWebviewRootProps): ReactElement {
  throw new Error('webview-root-types is a TypeScript-only desktop renderer shim.');
}

export function CutWebviewRoot(_props: CutWebviewRootProps): ReactElement {
  throw new Error('webview-root-types is a TypeScript-only desktop renderer shim.');
}
