import { describe, expect, it } from 'vitest';
import { isComposingKeyboardEvent, isEditableTarget } from './editable-target';

describe('keyboard editable and IME guards', () => {
  it('treats text inputs, textareas, selects, textbox roles, contenteditable, and text-input scopes as editable', () => {
    document.body.innerHTML = `
      <input id="text" />
      <textarea id="textarea"></textarea>
      <select id="select"></select>
      <div id="editable" contenteditable="true"><span id="nested"></span></div>
      <div id="role" role="textbox"></div>
      <div data-neko-keyboard-scope="text-input"><span id="scoped"></span></div>
    `;

    expect(isEditableTarget(document.getElementById('text'))).toBe(true);
    expect(isEditableTarget(document.getElementById('textarea'))).toBe(true);
    expect(isEditableTarget(document.getElementById('select'))).toBe(true);
    expect(isEditableTarget(document.getElementById('nested'))).toBe(true);
    expect(isEditableTarget(document.getElementById('role'))).toBe(true);
    expect(isEditableTarget(document.getElementById('scoped'))).toBe(true);
  });

  it('does not treat button-like inputs as editable text targets', () => {
    document.body.innerHTML = `
      <input id="range" type="range" />
      <input id="checkbox" type="checkbox" />
      <button id="button"></button>
    `;

    expect(isEditableTarget(document.getElementById('range'))).toBe(false);
    expect(isEditableTarget(document.getElementById('checkbox'))).toBe(false);
    expect(isEditableTarget(document.getElementById('button'))).toBe(false);
  });

  it('detects active IME composition events', () => {
    expect(
      isComposingKeyboardEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true })),
    ).toBe(true);
    expect(
      isComposingKeyboardEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229 })),
    ).toBe(true);
  });
});
