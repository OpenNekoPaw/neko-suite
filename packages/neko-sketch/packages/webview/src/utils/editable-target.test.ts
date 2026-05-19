import { describe, expect, it } from 'vitest';
import { isEditableTarget } from './editable-target';

describe('isEditableTarget', () => {
  it('treats text inputs, textareas, selects, and contenteditable nodes as editable', () => {
    document.body.innerHTML = `
      <input id="text" />
      <textarea id="textarea"></textarea>
      <select id="select"></select>
      <div id="editable" contenteditable="true"><span id="nested"></span></div>
    `;

    expect(isEditableTarget(document.getElementById('text'))).toBe(true);
    expect(isEditableTarget(document.getElementById('textarea'))).toBe(true);
    expect(isEditableTarget(document.getElementById('select'))).toBe(true);
    expect(isEditableTarget(document.getElementById('nested'))).toBe(true);
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
});
