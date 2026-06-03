import { describe, expect, it } from 'vitest';
import {
  controlReasonI18nKey,
  deriveModelControlAvailability,
  disabledControl,
  formatControlAvailabilityTitle,
  isControlDisabled,
} from './controlAvailability';

describe('controlAvailability', () => {
  it('prioritizes runtime diagnostics over static capability hints', () => {
    expect(
      deriveModelControlAvailability({
        sceneControlStatus: 'ready',
        capability: 'supported',
        runtimeDiagnostic: {
          state: 'degraded',
          reason: 'runtime-rejected',
          code: 'scene-command.rejected',
          message: 'Rejected by Engine',
          retryable: true,
        },
      }),
    ).toEqual({
      state: 'degraded',
      reason: 'runtime-rejected',
      retryable: true,
      diagnostic: {
        state: 'degraded',
        reason: 'runtime-rejected',
        code: 'scene-command.rejected',
        message: 'Rejected by Engine',
        retryable: true,
      },
    });
  });

  it('separates Engine readiness, scene-control status, selection, and capability reasons', () => {
    expect(deriveModelControlAvailability({ engineReady: false })).toEqual(
      disabledControl('engine-not-ready'),
    );
    expect(deriveModelControlAvailability({ sceneControlStatus: 'disconnected' })).toEqual(
      disabledControl('scene-control-disconnected'),
    );
    expect(
      deriveModelControlAvailability({
        sceneControlStatus: 'ready',
        requiresSelection: true,
        hasSelection: false,
      }),
    ).toEqual(disabledControl('no-selection'));
    expect(
      deriveModelControlAvailability({
        sceneControlStatus: 'ready',
        capability: 'unknown',
      }),
    ).toEqual(disabledControl('capability-unknown'));
  });

  it('maps structured reasons to stable i18n keys and formatted titles', () => {
    const availability = disabledControl('missing-character-regions');
    const translate = (key: string) =>
      ({
        'controlAvailability.state.disabled': '不可用',
        'controlAvailability.reason.missing-character-regions': '缺少角色区域数据',
      })[key] ?? key;

    expect(isControlDisabled(availability)).toBe(true);
    expect(controlReasonI18nKey('missing-character-regions')).toBe(
      'controlAvailability.reason.missing-character-regions',
    );
    expect(formatControlAvailabilityTitle(availability, translate, '面部选择')).toBe(
      '面部选择 - 不可用: 缺少角色区域数据',
    );
  });
});
