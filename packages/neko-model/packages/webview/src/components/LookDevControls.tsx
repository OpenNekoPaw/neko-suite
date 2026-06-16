import React from 'react';
import type { ViewportRenderMode } from '@neko/shared';
import type {
  ModelLookDevSceneControlCapabilities,
  ModelSceneControlCapabilityState,
} from '@neko/neko-client';
import type { LookDevUiState } from '../stores/modelStore';
import { RefreshIcon } from '@neko/ui/icons';
import { useTranslation } from '../i18n/I18nContext';
import {
  availableControl,
  disabledControl,
  formatControlAvailabilityTitle,
  isControlDisabled,
  type ModelControlAvailability,
} from '../baseline/controlAvailability';

export interface LookDevControlsProps {
  state: LookDevUiState;
  capabilities: ModelLookDevSceneControlCapabilities;
  routeAReady: boolean;
  availability?: ModelControlAvailability;
  helperPassesEnabled: boolean;
  onModeChange: (mode: ViewportRenderMode) => void;
}

const LOOKDEV_MODES: readonly {
  readonly mode: ViewportRenderMode;
  readonly labelKey: string;
  readonly titleKey: string;
}[] = [
  { mode: 'pbr', labelKey: 'lookdev.mode.pbr', titleKey: 'lookdev.title.pbr' },
  { mode: 'clay', labelKey: 'lookdev.mode.clay', titleKey: 'lookdev.title.clay' },
  { mode: 'wireframe', labelKey: 'lookdev.mode.wireframe', titleKey: 'lookdev.title.wireframe' },
  { mode: 'normal', labelKey: 'lookdev.mode.normal', titleKey: 'lookdev.title.normal' },
  { mode: 'depth', labelKey: 'lookdev.mode.depth', titleKey: 'lookdev.title.depth' },
  {
    mode: 'lightComplexity',
    labelKey: 'lookdev.mode.lightComplexity',
    titleKey: 'lookdev.title.lightComplexity',
  },
  { mode: 'unlit', labelKey: 'lookdev.mode.unlit', titleKey: 'lookdev.title.unlit' },
  {
    mode: 'shadowAtlas',
    labelKey: 'lookdev.mode.shadowAtlas',
    titleKey: 'lookdev.title.shadowAtlas',
  },
];

export function LookDevControls({
  state,
  capabilities,
  routeAReady,
  availability,
  helperPassesEnabled,
  onModeChange,
}: LookDevControlsProps): React.JSX.Element {
  const { t } = useTranslation();
  const activeMode = state.requestedMode ?? state.appliedMode;
  const canRetry = state.status === 'timeout' && state.requestedMode !== null && routeAReady;

  return (
    <div className="model-lookdev-controls" aria-label={t('lookdev.aria.renderModes')}>
      <label className="model-compact-select-field">
        <span>{t('lookdev.label.mode')}</span>
        <select
          aria-label={t('lookdev.aria.renderModes')}
          className="model-compact-select"
          value={activeMode}
          onChange={(event) => onModeChange(event.currentTarget.value as ViewportRenderMode)}
        >
          {LOOKDEV_MODES.map((item) => {
            const modeAvailability = lookDevModeAvailability({
              capabilities,
              mode: item.mode,
              routeAReady,
              baseAvailability: availability,
            });
            return (
              <option
                key={item.mode}
                data-availability-state={modeAvailability.state}
                data-availability-reason={
                  modeAvailability.state === 'available' ? undefined : modeAvailability.reason
                }
                disabled={isControlDisabled(modeAvailability)}
                title={formatControlAvailabilityTitle(modeAvailability, t, t(item.titleKey))}
                value={item.mode}
              >
                {t(item.labelKey)}
              </option>
            );
          })}
        </select>
      </label>
      <div className="model-lookdev-segments" role="tablist" aria-hidden="true">
        {LOOKDEV_MODES.map((item) => {
          const modeAvailability = lookDevModeAvailability({
            capabilities,
            mode: item.mode,
            routeAReady,
            baseAvailability: availability,
          });
          const disabled = isControlDisabled(modeAvailability);
          return (
            <button
              key={item.mode}
              type="button"
              role="tab"
              aria-selected={activeMode === item.mode}
              className={activeMode === item.mode ? 'active' : undefined}
              data-availability-state={modeAvailability.state}
              data-availability-reason={
                modeAvailability.state === 'available' ? undefined : modeAvailability.reason
              }
              disabled={disabled}
              title={formatControlAvailabilityTitle(modeAvailability, t, t(item.titleKey))}
              onClick={() => onModeChange(item.mode)}
            >
              {t(item.labelKey)}
            </button>
          );
        })}
      </div>
      <div className="model-lookdev-status">
        <span data-lookdev-status={state.status}>{statusLabel(state.status, t)}</span>
        <span>
          {helperPassesEnabled ? t('lookdev.helpers.enabled') : t('lookdev.helpers.disabled')}
        </span>
        <span>
          {capabilities.liveViewportSettings
            ? t('lookdev.live.enabled')
            : t('lookdev.live.pending')}
        </span>
        {canRetry ? (
          <button
            type="button"
            className="model-lookdev-retry"
            title={t('lookdev.retry')}
            onClick={() => {
              if (state.requestedMode) {
                onModeChange(state.requestedMode);
              }
            }}
          >
            <RefreshIcon size={12} />
          </button>
        ) : null}
      </div>
      {state.diagnostic ? <div className="model-lookdev-diagnostic">{state.diagnostic}</div> : null}
    </div>
  );
}

function lookDevModeAvailability({
  capabilities,
  mode,
  routeAReady,
  baseAvailability,
}: {
  readonly capabilities: ModelLookDevSceneControlCapabilities;
  readonly mode: ViewportRenderMode;
  readonly routeAReady: boolean;
  readonly baseAvailability?: ModelControlAvailability;
}): ModelControlAvailability {
  if (!routeAReady) {
    return disabledControl('scene-control-disconnected');
  }
  const modeState = lookDevModeCapabilityState(capabilities, mode);
  if (modeState === 'unsupported') {
    return disabledControl('capability-unsupported');
  }
  if (modeState === 'unknown') {
    return disabledControl('capability-unknown');
  }
  return baseAvailability ?? availableControl();
}

function lookDevModeCapabilityState(
  capabilities: ModelLookDevSceneControlCapabilities,
  mode: ViewportRenderMode,
): ModelSceneControlCapabilityState {
  const renderModeState =
    capabilities.capabilityStates.renderModes[mode] ??
    (capabilities.renderModes.includes(mode) ? 'supported' : 'unsupported');
  if (renderModeState !== 'supported') {
    return renderModeState;
  }
  if (mode === 'clay') {
    return capabilities.capabilityStates.clay;
  }
  return renderModeState;
}

function statusLabel(
  status: LookDevUiState['status'],
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  switch (status) {
    case 'requested':
      return t('lookdev.status.requested');
    case 'pending':
      return t('lookdev.status.pending');
    case 'rejected':
      return t('lookdev.status.rejected');
    case 'timeout':
      return t('lookdev.status.timeout');
    case 'unavailable':
      return t('lookdev.status.unavailable');
    case 'applied':
      return t('lookdev.status.applied');
  }
}
