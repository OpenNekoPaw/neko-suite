// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportPanel } from './ExportPanel';
import { MasterLoudnessStrip } from './MasterLoudnessStrip';
import { useAudioStore } from '../stores/audioStore';
import { postMessage } from '../shared/useVscodeMessage';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('../i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('../shared/useVscodeMessage', () => ({
  postMessage: vi.fn(),
}));

describe('MasterLoudnessStrip', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    useAudioStore.getState().reset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    vi.restoreAllMocks();
  });

  it('shows needs-analysis and starts loudness analysis through audio:analyze', () => {
    act(() => {
      root.render(<MasterLoudnessStrip />);
    });

    expect(host.querySelector('[data-master-readiness="needs-analysis"]')).not.toBeNull();
    expect(host.textContent).toContain('audio.masterReadiness.needsAnalysis');

    const analyze = host.querySelector<HTMLButtonElement>('button');
    act(() => {
      analyze?.click();
    });

    expect(useAudioStore.getState().loudnessAnalysisStatus).toBe('pending');
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'audio:analyze',
        kind: 'loudness',
        requestId: expect.stringContaining('audio-analysis-loudness-1000-'),
      }),
    );
  });

  it('shows pending and disables duplicate analysis requests', () => {
    useAudioStore.getState().setLoudnessAnalysisPending('req-1');

    act(() => {
      root.render(<MasterLoudnessStrip />);
    });

    expect(host.querySelector('[data-master-readiness="pending"]')).not.toBeNull();
    expect(host.querySelector<HTMLButtonElement>('button')?.disabled).toBe(true);
  });

  it('shows ready metrics when loudness data is available', () => {
    useAudioStore
      .getState()
      .setLoudness({ integratedLoudness: -14, truePeak: -1.2, loudnessRange: 6.5 });

    act(() => {
      root.render(<MasterLoudnessStrip variant="export" />);
    });

    expect(host.querySelector('[data-master-readiness="ready"]')).not.toBeNull();
    expect(host.textContent).toContain('-14.0 LUFS');
    expect(host.textContent).toContain('-1.2 dBTP');
  });

  it('shows clipping diagnostics for hot true peak values', () => {
    useAudioStore
      .getState()
      .setLoudness({ integratedLoudness: -12.4, truePeak: -0.2, loudnessRange: 5 });

    act(() => {
      root.render(<MasterLoudnessStrip variant="export" />);
    });

    expect(host.querySelector('[data-master-readiness="clipping"]')).not.toBeNull();
    expect(host.textContent).toContain('audio.masterReadiness.clipping');
  });

  it('shows the shared readiness summary inside ExportPanel', () => {
    useAudioStore.getState().setLoudnessAnalysisPending('req-1');
    useAudioStore.getState().setLoudnessAnalysisUnavailable('req-1');

    act(() => {
      root.render(<ExportPanel />);
    });

    expect(host.querySelector('[data-master-readiness="unavailable"]')).not.toBeNull();
    expect(host.textContent).toContain('audio.masterReadiness.unavailable');
    expect(host.textContent).toContain('audio.export.export');
  });
});
