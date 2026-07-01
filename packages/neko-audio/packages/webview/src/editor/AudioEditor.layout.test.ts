import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AudioEditor workbench layout boundary', () => {
  const source = readFileSync(join(__dirname, 'AudioEditor.tsx'), 'utf-8');
  const toolbarSource = readFileSync(join(__dirname, '../components/Toolbar.tsx'), 'utf-8');
  const sidePanelSource = readFileSync(join(__dirname, '../components/SidePanel.tsx'), 'utf-8');
  const sidePanelItemsSource = readFileSync(
    join(__dirname, '../components/audioSidePanelItems.tsx'),
    'utf-8',
  );

  it('uses the shared creative workbench shell for audio regions', () => {
    expect(source).toMatch(/import \{ CreativeWorkbenchShell \} from '@neko\/ui\/workbench'/);
    expect(source).toMatch(/<CreativeWorkbenchShell/);
    expect(source).toMatch(/mainKind="waveform-timeline"/);
    expect(source).toMatch(/leftRail=\{/);
    expect(source).toMatch(/rightDock=\{\s*activeSidePanel/);
    expect(source).toMatch(/id: 'audio-side-panel'/);
    expect(source).toMatch(/panelId: 'audio\.sidePanel'/);
    expect(source).toMatch(/children: <SidePanel mode=\{rightDockMode\} \/>/);
  });

  it('exposes basic and professional right-dock tabs through the shared shell', () => {
    expect(source).toMatch(/type AudioRightDockMode = 'basic' \| 'professional'/);
    expect(source).toMatch(
      /const \[rightDockMode, setRightDockMode\] = useState<AudioRightDockMode>\('basic'\)/,
    );
    expect(source).toMatch(/groups: \{/);
    expect(source).toMatch(/activeId: rightDockMode/);
    expect(source).toMatch(
      /onActiveIdChange: \(id\) => setRightDockMode\(toAudioRightDockMode\(id\)\)/,
    );
    expect(source).toMatch(/label: t\('audio\.rightDock\.mode\.basic'\)/);
    expect(source).toMatch(/label: t\('audio\.rightDock\.mode\.professional'\)/);
  });

  it('keeps the main surface focused on waveform and timeline workbench actions', () => {
    expect(source).toMatch(/className="audio-main-surface"/);
    expect(source).not.toMatch(/<AudioMainPanelTools/);
    expect(source).not.toMatch(/<AudioHudControls/);
    expect(source).toMatch(/<TimelineToolModeBar \/>/);
    expect(source).toMatch(/<SelectionActionBar \/>/);
    expect(source).toMatch(/<AddSourceStrip \/>/);
    expect(source).toMatch(/<MixerPanel \/>/);
  });

  it('keeps the left rail responsible for right panel visibility only', () => {
    expect(toolbarSource).toMatch(/CreativeLeftRail/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-action="toggle-side-panel"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-target="right-panel"/);
    expect(toolbarSource).toMatch(/aria-controls="audio-side-panel"/);
    expect(toolbarSource).not.toMatch(/data-audio-toolbar-action=/);
    expect(toolbarSource).not.toMatch(/data-creative-left-rail-action="open-/);
    expect(toolbarSource).not.toMatch(/audio\.analysis\.loudness/);
    expect(toolbarSource).not.toMatch(/audio\.export\.toggle/);
  });

  it('routes audio command surfaces through right dock panels', () => {
    expect(sidePanelItemsSource).toMatch(/panel: 'ai'/);
    expect(sidePanelItemsSource).toMatch(/panel: 'inspector'/);
    expect(sidePanelItemsSource).toMatch(/panel: 'effects'/);
    expect(sidePanelItemsSource).toMatch(/panel: 'markers'/);
    expect(sidePanelItemsSource).toMatch(/panel: 'recording'/);
    expect(sidePanelItemsSource).toMatch(/panel: 'export'/);
    expect(sidePanelItemsSource).toMatch(/panel: 'presets'/);
    expect(sidePanelSource).toMatch(/<AudioAiOperationPanel \/>/);
    expect(sidePanelSource).toMatch(/<AudioInspectorPanel \/>/);
    expect(sidePanelSource).toMatch(/<EffectsPanel chain=\{effectsChain\} \/>/);
    expect(sidePanelSource).toMatch(/<MarkersRegionsPanel \/>/);
    expect(sidePanelSource).toMatch(/<RecordingPanel \/>/);
    expect(sidePanelSource).toMatch(/<ExportPanel \/>/);
    expect(sidePanelSource).toMatch(/<PresetBrowser \/>/);
  });
});
