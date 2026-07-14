import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { AgentWebviewRoot } from '@neko-agent/webview/root';
import { useTranslation } from '@neko/shared/i18n/react';
import type { HomeSnapshot, HomeSurfaceId } from '../shared/contracts';
import { createElectronAgentHostRuntimeAdapter } from './agent-host-runtime-adapter';
import { getHomeBridge } from './home-bridge';

type HomeView = 'overview' | HomeSurfaceId | 'agent';

const navigation: readonly { readonly id: HomeView; readonly labelKey: string }[] = [
  { id: 'overview', labelKey: 'nav.overview' },
  { id: 'assets', labelKey: 'nav.assets' },
  { id: 'generations', labelKey: 'nav.generations' },
  { id: 'agent', labelKey: 'nav.agent' },
  { id: 'market', labelKey: 'nav.market' },
  { id: 'skills', labelKey: 'nav.skills' },
];

export function App(): ReactElement {
  const { locale, t } = useTranslation();
  const [snapshot, setSnapshot] = useState<HomeSnapshot>();
  const [view, setView] = useState<HomeView>('overview');
  const [error, setError] = useState<string>();
  const agentAdapter = useMemo(() => createElectronAgentHostRuntimeAdapter(), []);

  useEffect(() => {
    let active = true;
    getHomeBridge()
      .getSnapshot()
      .then((value) => {
        if (active) setSnapshot(value);
      })
      .catch((value: unknown) => {
        if (active) setError(value instanceof Error ? value.message : String(value));
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) return <main className="home-error" role="alert">{error}</main>;
  if (!snapshot) return <main className="home-loading" aria-busy="true">{t('app.loading')}</main>;

  const surface = snapshot.resourceSurfaces.find((item) => item.surfaceId === view);
  return (
    <div className="home-shell" data-application-id="neko-home">
      <header className="home-topbar">
        <strong>{t('title.brand')}</strong>
        <span>{snapshot.workspace.label}</span>
        <span className={`engine-state engine-state--${snapshot.engine.availability}`}>
          {t(`engine.${snapshot.engine.availability}`)}
        </span>
      </header>
      <nav className="home-navigation" aria-label={t('nav.label')}>
        {navigation.map((item) => (
          <button
            key={item.id}
            type="button"
            data-view-id={item.id}
            aria-current={view === item.id ? 'page' : undefined}
            onClick={() => setView(item.id)}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </nav>
      <main className="home-content">
        {view === 'overview' ? <Overview snapshot={snapshot} onOpenAgent={() => setView('agent')} /> : null}
        {view === 'agent' ? (
          <section className="home-agent" aria-label="Agent">
            <AgentWebviewRoot hostRuntimeAdapter={agentAdapter} locale={locale} />
          </section>
        ) : null}
        {surface ? (
          <section className="home-surface" aria-labelledby="surface-title">
            <header>
              <h1 id="surface-title">{surface.title}</h1>
              <p>{surface.description}</p>
            </header>
            <div className="resource-list">
              {surface.nodes.length === 0 ? <p className="empty-state">{t('surface.empty')}</p> : null}
              {surface.nodes.map((node) => (
                <article key={node.id} className="resource-row">
                  <span className="resource-swatch" style={{ background: node.thumbnail?.accent }} />
                  <div>
                    <strong>{node.label}</strong>
                    <p>{node.preview?.summary ?? node.metadata?.status ?? node.sourceId}</p>
                  </div>
                  <span>{node.badges?.[0]?.label}</span>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function Overview({ snapshot, onOpenAgent }: { readonly snapshot: HomeSnapshot; readonly onOpenAgent: () => void }): ReactElement {
  const { t } = useTranslation();
  const totalResources = snapshot.resourceSurfaces.reduce((sum, surface) => sum + surface.nodes.length, 0);
  const [handoffState, setHandoffState] = useState<
    | { readonly status: 'idle' }
    | { readonly status: 'pending' }
    | { readonly status: 'accepted'; readonly requestId: string }
    | { readonly status: 'failed'; readonly message: string }
  >({ status: 'idle' });
  const openVSCode = async (): Promise<void> => {
    const requestId = `home-handoff-${Date.now()}`;
    setHandoffState({ status: 'pending' });
    try {
      const result = await getHomeBridge().handoff({
        schemaVersion: 1,
        requestId,
        source: snapshot.application,
        target: { toolId: 'neko-vscode', workspaceId: snapshot.workspace.workspaceId },
      });
      setHandoffState({ status: 'accepted', requestId: result.requestId });
    } catch (error: unknown) {
      setHandoffState({
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
  return (
    <section className="home-overview" aria-labelledby="home-title">
      <header>
        <p className="eyebrow">{t('workspace.personal')}</p>
        <h1 id="home-title">{t('overview.title')}</h1>
        <p>{t('overview.description')}</p>
      </header>
      <div className="overview-actions">
        <button type="button" onClick={onOpenAgent}>{t('overview.createWithAgent')}</button>
        <button
          type="button"
          data-tool-id="neko-vscode"
          data-workspace-id={snapshot.workspace.workspaceId}
          disabled={handoffState.status === 'pending'}
          onClick={() => void openVSCode()}
        >
          {t('overview.openInVSCode')}
        </button>
      </div>
      {handoffState.status === 'accepted' ? (
        <p role="status" data-handoff-request-id={handoffState.requestId}>{t('overview.handoffAccepted')}</p>
      ) : null}
      {handoffState.status === 'failed' ? (
        <p role="alert">{handoffState.message}</p>
      ) : null}
      <dl className="home-summary">
        <div><dt>{t('summary.resources')}</dt><dd>{totalResources}</dd></div>
        <div><dt>{t('summary.providers')}</dt><dd>{snapshot.resourceProviders.length}</dd></div>
        <div><dt>{t('summary.engine')}</dt><dd>{snapshot.engine.availability}</dd></div>
      </dl>
      <p className="engine-diagnostic">{snapshot.engine.diagnostic}</p>
    </section>
  );
}
