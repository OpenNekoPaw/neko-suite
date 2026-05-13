import type { DashboardRuntimeStatus } from '../types';

export interface ContextStripProps {
  readonly runtime: DashboardRuntimeStatus;
}

export function ContextStrip({ runtime }: ContextStripProps) {
  const engine = runtime.engine?.available ? (runtime.engine.value?.state ?? 'unknown') : 'n/a';
  const agent = runtime.agent?.available
    ? `${runtime.agent.value?.running ?? 0}/${runtime.agent.value?.total ?? 0} running`
    : 'n/a';
  const assets = runtime.assets?.available
    ? `${runtime.assets.value?.fileCount ?? 0} files`
    : 'n/a';

  return (
    <section className="context-strip" aria-label="Runtime status">
      <span>Engine: {engine}</span>
      <span>Agent: {agent}</span>
      <span>Assets: {assets}</span>
    </section>
  );
}
