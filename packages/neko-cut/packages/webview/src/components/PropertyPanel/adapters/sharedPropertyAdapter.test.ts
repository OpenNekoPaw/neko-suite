import { describe, expect, it } from 'vitest';
import type { ProjectDefaults, TimelineElement } from '../../../types';
import { createDefaultElementTransform } from '../../../types/animation';
import type { PropertyDefinition as CutPropertyDefinition } from '../PropertyRow';
import {
  createCutDefaultsPatch,
  createCutElementPatch,
  mapCutPropertySourcesToShared,
} from './sharedPropertyAdapter';

const t = (key: string) => key;

describe('Cut shared PropertyPanel adapter', () => {
  it('maps Cut definitions into discriminated shared property definitions', () => {
    const element = createElement();
    const result = mapCutPropertySourcesToShared(
      [
        {
          groupId: 'transform',
          groupLabelKey: 'propertyPanel.group.transform',
          pathPrefix: 'animTransform',
          definitions: [
            {
              key: 'opacity',
              labelKey: 'propertyPanel.transform.opacity',
              type: 'slider',
              animatable: true,
              min: 0,
              max: 1,
              step: 0.01,
            },
          ],
        },
        {
          groupId: 'text',
          groupLabelKey: 'propertyPanel.group.text',
          definitions: [
            {
              key: 'textAlign',
              labelKey: 'propertyPanel.text.textAlign',
              type: 'select',
              animatable: false,
              options: [
                { value: 'left', labelKey: 'propertyPanel.text.alignLeft' },
                { value: 'center', labelKey: 'propertyPanel.text.alignCenter' },
              ],
            },
          ],
        },
      ],
      { currentTime: 2.5, element, projectDefaults: null, translate: t },
    );

    expect(result.groups).toEqual([
      {
        id: 'transform',
        label: 'propertyPanel.group.transform',
        propertyIds: ['animTransform.opacity'],
      },
      {
        id: 'text',
        label: 'propertyPanel.group.text',
        propertyIds: ['textAlign'],
      },
    ]);
    expect(result.properties[0]).toMatchObject({
      id: 'animTransform.opacity',
      kind: 'slider',
      value: 0.75,
      min: 0,
      max: 1,
      animatable: true,
      hasKeyframes: true,
      isAtKeyframe: true,
    });
    expect(result.properties[1]).toMatchObject({
      id: 'textAlign',
      kind: 'select',
      options: [
        { value: 'left', label: 'propertyPanel.text.alignLeft' },
        { value: 'center', label: 'propertyPanel.text.alignCenter' },
      ],
    });
  });

  it('creates preview and commit patches without owning undo history', () => {
    const element = createElement();
    const definition: CutPropertyDefinition = {
      key: 'opacity',
      labelKey: 'propertyPanel.transform.opacity',
      type: 'slider',
      animatable: true,
      min: 0,
      max: 1,
      step: 0.01,
    };

    const patch = createCutElementPatch(element, 'animTransform.opacity', 0.4, definition);

    expect((patch.animTransform?.opacity as { baseValue: number }).baseValue).toBe(0.4);
    expect(element.animTransform?.opacity.baseValue).toBe(0.75);
  });

  it('keeps duration patch compatible with trimmed element semantics', () => {
    const element = createElement({ trimStart: 1, trimEnd: 2, duration: 10 });
    const definition: CutPropertyDefinition = {
      key: 'duration',
      labelKey: 'propertyPanel.basic.duration',
      type: 'number',
      animatable: false,
      min: 0.1,
      step: 0.01,
    };

    expect(createCutElementPatch(element, 'duration', 4, definition)).toEqual({ duration: 7 });
  });

  it('creates defaults patches only for nested default properties', () => {
    const defaults: ProjectDefaults = {
      text: {
        fontSize: 48,
        fontFamily: 'Arial',
        color: '#ffffff',
        backgroundColor: 'transparent',
        textAlign: 'center',
        fontWeight: 'normal',
        fontStyle: 'normal',
        textDecoration: 'none',
      },
      transform: {
        x: 0.5,
        y: 0.5,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
      },
      audio: {
        volume: 1,
        pan: 0,
        fadeIn: 0,
        fadeOut: 0,
        gain: 0,
      },
    };

    expect(createCutDefaultsPatch(defaults, 'text.fontSize', 64)).toEqual({
      text: {
        ...defaults.text,
        fontSize: 64,
      },
    });
    expect(createCutDefaultsPatch(defaults, 'name', 'Clip')).toEqual({});
  });
});

function createElement(overrides: Partial<TimelineElement> = {}): TimelineElement {
  const animTransform = createDefaultElementTransform();
  animTransform.opacity = {
    baseValue: 0.75,
    keyframes: [{ id: 'kf-opacity', time: 1.5, value: 0.75, easing: 'linear' }],
  };

  return {
    id: 'element-1',
    type: 'media',
    name: 'Clip 1',
    src: '/clip.mp4',
    startTime: 1,
    duration: 10,
    trimStart: 0,
    trimEnd: 0,
    transform: {},
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
    animTransform,
    ...overrides,
  } as TimelineElement;
}
