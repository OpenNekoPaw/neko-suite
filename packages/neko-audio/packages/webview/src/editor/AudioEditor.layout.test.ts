import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AudioEditor workbench layout boundary', () => {
  const source = readFileSync(join(__dirname, 'AudioEditor.tsx'), 'utf-8');
  const toolbarSource = readFileSync(join(__dirname, '../components/Toolbar.tsx'), 'utf-8');

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

  it('moves analysis controls into the left rail instead of a horizontal main-panel toolbar', () => {
    expect(source).toMatch(/className="audio-main-surface"/);
    expect(source).not.toMatch(/<AudioMainPanelTools/);
    expect(source).not.toMatch(/<AudioHudControls/);
    expect(toolbarSource).toMatch(/data-audio-toolbar-action="analyze-loudness"/);
    expect(toolbarSource).toMatch(/data-audio-toolbar-action="toggle-spectrum"/);
    expect(toolbarSource).toMatch(/audio\.analysis\.loudness/);
  });

  it('keeps the left rail responsible for audio commands and right panel visibility', () => {
    expect(toolbarSource).toMatch(/CreativeLeftRail/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-action="open-export"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-action="open-package"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-action="analyze-loudness"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-action="toggle-spectrum"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-target="right-panel"/);
    expect(toolbarSource).toMatch(/aria-controls="audio-side-panel"/);
  });
});
