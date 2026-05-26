import type {
  PropertyDefinition as SharedPropertyDefinition,
  PropertyGroupDefinition as SharedPropertyGroupDefinition,
  PropertyValue as SharedPropertyValue,
} from '@neko/ui/creative';
import { assertNever } from '@neko/ui/creative';
import type {
  AudioProperties,
  ElementTransform,
  ProjectDefaults,
  TimelineElement,
} from '../../../types';
import { DEFAULT_AUDIO_PROPERTIES } from '../../../types';
import type { AnimatableProperty } from '../../../types/animation';
import { createDefaultElementTransform } from '../../../types/animation';
import { getKeyframeAtTime, hasKeyframes } from '../../../utils/animation';
import type { PropertyDefinition as CutPropertyDefinition } from '../PropertyRow';

export interface CutPropertyAdapterContext {
  readonly element: TimelineElement | null;
  readonly projectDefaults: ProjectDefaults | null;
  readonly currentTime: number;
  readonly translate: (key: string) => string;
}

export interface CutPropertyAdapterSource {
  readonly pathPrefix?: string;
  readonly groupId: string;
  readonly groupLabelKey: string;
  readonly definitions: readonly CutPropertyDefinition[];
}

export interface CutPropertyAdapterResult {
  readonly properties: readonly SharedPropertyDefinition[];
  readonly groups: readonly SharedPropertyGroupDefinition[];
}

export type CutPropertyPatch = Partial<TimelineElement>;

export function mapCutPropertySourcesToShared(
  sources: readonly CutPropertyAdapterSource[],
  context: CutPropertyAdapterContext,
): CutPropertyAdapterResult {
  const properties: SharedPropertyDefinition[] = [];
  const groups: SharedPropertyGroupDefinition[] = [];

  for (const source of sources) {
    const propertyIds: string[] = [];

    for (const definition of source.definitions) {
      const propertyPath = buildPropertyPath(source.pathPrefix, definition.key);
      const property = mapCutPropertyDefinitionToShared(definition, propertyPath, context);
      properties.push(property);
      propertyIds.push(property.id);
    }

    groups.push({
      id: source.groupId,
      label: context.translate(source.groupLabelKey),
      propertyIds,
    });
  }

  return { properties, groups };
}

export function mapCutPropertyDefinitionToShared(
  definition: CutPropertyDefinition,
  propertyPath: string,
  context: CutPropertyAdapterContext,
): SharedPropertyDefinition {
  const value = getCutPropertyValue(propertyPath, definition, context);
  const base = {
    id: propertyPath,
    label: context.translate(definition.labelKey),
    disabled: context.element === null,
    animatable: definition.animatable,
    hasKeyframes: getCutPropertyHasKeyframes(propertyPath, context.element),
    isAtKeyframe: getCutPropertyIsAtKeyframe(propertyPath, context),
  };

  switch (definition.type) {
    case 'number':
      return {
        ...base,
        kind: 'number',
        value: typeof value === 'number' ? value : 0,
        min: definition.min,
        max: definition.max,
        step: definition.step,
        unit: definition.unit,
      };
    case 'slider':
      return {
        ...base,
        kind: 'slider',
        value: typeof value === 'number' ? value : (definition.min ?? 0),
        min: definition.min ?? 0,
        max: definition.max ?? 1,
        step: definition.step,
        unit: definition.unit,
      };
    case 'string':
      return {
        ...base,
        kind: 'text',
        value: typeof value === 'string' ? value : '',
      };
    case 'color':
      return {
        ...base,
        kind: 'color',
        value: typeof value === 'string' ? value : '#ffffff',
      };
    case 'boolean':
      return {
        ...base,
        kind: 'boolean',
        value: typeof value === 'boolean' ? value : false,
      };
    case 'select':
      return {
        ...base,
        kind: 'select',
        value: typeof value === 'string' ? value : '',
        options:
          definition.options?.map((option) => ({
            value: option.value,
            label: context.translate(option.labelKey),
          })) ?? [],
      };
    default:
      return assertNever(definition.type);
  }
}

export function createCutElementPatch(
  element: TimelineElement,
  propertyPath: string,
  value: SharedPropertyValue,
  definition: CutPropertyDefinition,
): CutPropertyPatch {
  if (propertyPath === 'duration' && typeof value === 'number') {
    return { duration: Math.max(0.1, value) + element.trimStart + element.trimEnd };
  }

  const parts = propertyPath.split('.');
  if (parts.length === 1) {
    return createDirectElementPatch(propertyPath, value);
  }

  const rootKey = parts[0];
  const subKey = parts[1];
  if (!subKey) {
    return {};
  }

  if (rootKey === 'animTransform') {
    return createAnimTransformPatch(element, subKey, value, definition);
  }

  if (rootKey === 'audio') {
    return createAudioPatch(element.audio, subKey, value);
  }

  return {};
}

export function createCutDefaultsPatch(
  projectDefaults: ProjectDefaults,
  propertyPath: string,
  value: SharedPropertyValue,
): Partial<ProjectDefaults> {
  const parts = propertyPath.split('.');
  if (parts.length < 2) {
    return {};
  }

  const rootKey = parts[0] as keyof ProjectDefaults;
  const subKey = parts[1];

  if (!subKey) {
    return {};
  }

  switch (rootKey) {
    case 'text':
      return createTextDefaultsPatch(projectDefaults.text, subKey, value);
    case 'transform':
      return createTransformDefaultsPatch(projectDefaults.transform, subKey, value);
    case 'audio':
      return createAudioDefaultsPatch(projectDefaults.audio, subKey, value);
    default:
      return {};
  }
}

export function getCutPropertyValue(
  propertyPath: string,
  definition: CutPropertyDefinition,
  { element, projectDefaults }: Pick<CutPropertyAdapterContext, 'element' | 'projectDefaults'>,
): SharedPropertyValue | undefined {
  const dataSource = element ?? projectDefaults;
  if (!dataSource) return undefined;

  if (!element) {
    if (propertyPath === 'name') return '';
    if (propertyPath === 'startTime') return 0;
    if (propertyPath === 'duration') return 0;
  }

  if (propertyPath === 'duration' && element) {
    return Math.max(0.1, element.duration - element.trimStart - element.trimEnd);
  }

  const current = getNestedValue(dataSource, propertyPath);
  if (current !== undefined) {
    if (definition.animatable && current && typeof current === 'object' && 'baseValue' in current) {
      return (current as AnimatableProperty).baseValue;
    }
    return isSharedPropertyValue(current) ? current : undefined;
  }

  if (propertyPath.startsWith('animTransform.') && definition.animatable) {
    const subKey = propertyPath.split('.')[1];
    const defaultTransform = createDefaultElementTransform();
    if (subKey && subKey in defaultTransform) {
      const animProp = defaultTransform[subKey as keyof typeof defaultTransform];
      if (typeof animProp === 'object' && 'baseValue' in animProp) {
        return animProp.baseValue;
      }
    }
  }

  return undefined;
}

export function getCutPropertyHasKeyframes(
  propertyPath: string,
  element: TimelineElement | null,
): boolean {
  const animatableProperty = getAnimatableProperty(element, propertyPath);
  return animatableProperty ? hasKeyframes(animatableProperty) : false;
}

export function getCutPropertyIsAtKeyframe(
  propertyPath: string,
  { currentTime, element }: Pick<CutPropertyAdapterContext, 'currentTime' | 'element'>,
): boolean {
  const animatableProperty = getAnimatableProperty(element, propertyPath);
  if (!element || !animatableProperty) return false;

  const localTime = currentTime - element.startTime + element.trimStart;
  return getKeyframeAtTime(animatableProperty, localTime) !== undefined;
}

function getAnimatableProperty(
  element: TimelineElement | null,
  propertyPath: string,
): AnimatableProperty | null {
  if (!element) return null;

  const current = getNestedValue(element, propertyPath);
  if (current && typeof current === 'object' && 'keyframes' in current && 'baseValue' in current) {
    return current as AnimatableProperty;
  }

  return null;
}

function getNestedValue(source: unknown, propertyPath: string): unknown {
  return propertyPath.split('.').reduce<unknown>((current, part) => {
    if (current && typeof current === 'object' && part in current) {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, source);
}

function buildPropertyPath(pathPrefix: string | undefined, key: string): string {
  return pathPrefix ? `${pathPrefix}.${key}` : key;
}

function isSharedPropertyValue(value: unknown): value is SharedPropertyValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function createDirectElementPatch(
  propertyPath: string,
  value: SharedPropertyValue,
): CutPropertyPatch {
  switch (propertyPath) {
    case 'name':
      return typeof value === 'string' ? { name: value } : {};
    case 'startTime':
      return typeof value === 'number' ? { startTime: value } : {};
    case 'content':
      return typeof value === 'string' ? { content: value } : {};
    case 'fontSize':
      return typeof value === 'number' ? { fontSize: value } : {};
    case 'fontFamily':
      return typeof value === 'string' ? { fontFamily: value } : {};
    case 'color':
      return typeof value === 'string' ? { color: value } : {};
    case 'backgroundColor':
      return typeof value === 'string' ? { backgroundColor: value } : {};
    case 'textAlign':
      return isTextAlign(value) ? { textAlign: value } : {};
    case 'fontWeight':
      return isFontWeight(value) ? { fontWeight: value } : {};
    case 'fontStyle':
      return isFontStyle(value) ? { fontStyle: value } : {};
    case 'textDecoration':
      return isTextDecoration(value) ? { textDecoration: value } : {};
    case 'text':
      return typeof value === 'string' ? { text: value } : {};
    case 'strokeColor':
      return typeof value === 'string' ? { strokeColor: value } : {};
    case 'strokeWidth':
      return typeof value === 'number' ? { strokeWidth: value } : {};
    default:
      return {};
  }
}

function createAnimTransformPatch(
  element: TimelineElement,
  subKey: string,
  value: SharedPropertyValue,
  definition: CutPropertyDefinition,
): CutPropertyPatch {
  if (!definition.animatable || typeof value !== 'number' || !isAnimatableTransformKey(subKey)) {
    return {};
  }

  const transform = element.animTransform ?? createDefaultElementTransform();
  const nextProperty = { ...transform[subKey], baseValue: value };
  return { animTransform: updateAnimTransformProperty(transform, subKey, nextProperty) };
}

function createAudioPatch(
  audio: AudioProperties | undefined,
  subKey: string,
  value: SharedPropertyValue,
): CutPropertyPatch {
  const base = audio ?? DEFAULT_AUDIO_PROPERTIES;

  switch (subKey) {
    case 'volume':
      return typeof value === 'number' ? { audio: { ...base, volume: value } } : {};
    case 'pan':
      return typeof value === 'number' ? { audio: { ...base, pan: value } } : {};
    case 'muted':
      return typeof value === 'boolean' ? { audio: { ...base, muted: value } } : {};
    case 'fadeIn':
      return typeof value === 'number' ? { audio: { ...base, fadeIn: value } } : {};
    case 'fadeOut':
      return typeof value === 'number' ? { audio: { ...base, fadeOut: value } } : {};
    case 'gain':
      return typeof value === 'number' ? { audio: { ...base, gain: value } } : {};
    default:
      return {};
  }
}

function createTextDefaultsPatch(
  text: ProjectDefaults['text'],
  subKey: string,
  value: SharedPropertyValue,
): Partial<ProjectDefaults> {
  switch (subKey) {
    case 'fontSize':
      return typeof value === 'number' ? { text: { ...text, fontSize: value } } : {};
    case 'fontFamily':
      return typeof value === 'string' ? { text: { ...text, fontFamily: value } } : {};
    case 'color':
      return typeof value === 'string' ? { text: { ...text, color: value } } : {};
    case 'backgroundColor':
      return typeof value === 'string' ? { text: { ...text, backgroundColor: value } } : {};
    case 'textAlign':
      return isTextAlign(value) ? { text: { ...text, textAlign: value } } : {};
    case 'fontWeight':
      return isFontWeight(value) ? { text: { ...text, fontWeight: value } } : {};
    case 'fontStyle':
      return isFontStyle(value) ? { text: { ...text, fontStyle: value } } : {};
    case 'textDecoration':
      return isTextDecoration(value) ? { text: { ...text, textDecoration: value } } : {};
    default:
      return {};
  }
}

function createTransformDefaultsPatch(
  transform: ProjectDefaults['transform'],
  subKey: string,
  value: SharedPropertyValue,
): Partial<ProjectDefaults> {
  if (typeof value !== 'number') {
    return {};
  }

  switch (subKey) {
    case 'x':
      return { transform: { ...transform, x: value } };
    case 'y':
      return { transform: { ...transform, y: value } };
    case 'scaleX':
      return { transform: { ...transform, scaleX: value } };
    case 'scaleY':
      return { transform: { ...transform, scaleY: value } };
    case 'rotation':
      return { transform: { ...transform, rotation: value } };
    case 'opacity':
      return { transform: { ...transform, opacity: value } };
    default:
      return {};
  }
}

function createAudioDefaultsPatch(
  audio: ProjectDefaults['audio'],
  subKey: string,
  value: SharedPropertyValue,
): Partial<ProjectDefaults> {
  if (typeof value !== 'number') {
    return {};
  }

  switch (subKey) {
    case 'volume':
      return { audio: { ...audio, volume: value } };
    case 'pan':
      return { audio: { ...audio, pan: value } };
    case 'fadeIn':
      return { audio: { ...audio, fadeIn: value } };
    case 'fadeOut':
      return { audio: { ...audio, fadeOut: value } };
    case 'gain':
      return { audio: { ...audio, gain: value } };
    default:
      return {};
  }
}

function updateAnimTransformProperty(
  transform: ElementTransform,
  key: AnimatableTransformKey,
  value: AnimatableProperty,
): ElementTransform {
  switch (key) {
    case 'x':
      return { ...transform, x: value };
    case 'y':
      return { ...transform, y: value };
    case 'scaleX':
      return { ...transform, scaleX: value };
    case 'scaleY':
      return { ...transform, scaleY: value };
    case 'rotation':
      return { ...transform, rotation: value };
    case 'opacity':
      return { ...transform, opacity: value };
    default:
      return assertNever(key);
  }
}

type AnimatableTransformKey = Exclude<keyof ElementTransform, 'anchorX' | 'anchorY'>;

function isAnimatableTransformKey(value: string): value is AnimatableTransformKey {
  return (
    value === 'x' ||
    value === 'y' ||
    value === 'scaleX' ||
    value === 'scaleY' ||
    value === 'rotation' ||
    value === 'opacity'
  );
}

function isTextAlign(value: SharedPropertyValue): value is ProjectDefaults['text']['textAlign'] {
  return value === 'left' || value === 'center' || value === 'right';
}

function isFontWeight(value: SharedPropertyValue): value is ProjectDefaults['text']['fontWeight'] {
  return value === 'normal' || value === 'bold';
}

function isFontStyle(value: SharedPropertyValue): value is ProjectDefaults['text']['fontStyle'] {
  return value === 'normal' || value === 'italic';
}

function isTextDecoration(
  value: SharedPropertyValue,
): value is ProjectDefaults['text']['textDecoration'] {
  return value === 'none' || value === 'underline' || value === 'line-through';
}
