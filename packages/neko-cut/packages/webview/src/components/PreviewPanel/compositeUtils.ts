/**
 * Composite layer builder utility.
 * Extracted from PreviewPanel.tsx.
 */

import type { ProjectData, MediaElement, CompositeLayerConfig } from '@neko/shared';
import type { ElementTransform } from '../../types/animation';
import type { EditorElement } from '../../types/editor-types';
import { getComputedTransform } from '../../utils/animation';
import { getEffectParametersAtTime } from '../../types/effects';
import {
  buildCompositeMasks,
  applyTransitions,
  colorCorrectionToCompositeEffect,
} from '../../utils/composite-helpers';

/**
 * Build CompositeLayerConfig[] from ProjectData at a given time.
 * Extracts all visible media elements at the specified time point.
 *
 * Priority: animTransform (keyframe interpolation) > element.transform (engine static) > centered defaults.
 */
export function buildCompositeLayers(project: ProjectData, time: number): CompositeLayerConfig[] {
  const layers: CompositeLayerConfig[] = [];
  let zIndex = 0;

  for (const track of project.tracks) {
    for (const element of track.elements) {
      if (element.type !== 'media') continue;
      if (element.hidden) continue;

      const elementEnd = element.startTime + element.duration;
      if (time < element.startTime || time >= elementEnd) continue;

      const mediaElement = element as MediaElement;
      const sourceTime = element.trimStart + (time - element.startTime);

      // EditorElement may carry animTransform (UI keyframe animation layer)
      const animTransform = (element as { animTransform?: ElementTransform }).animTransform;

      let x: number, y: number, scaleX: number, scaleY: number;
      let rotation: number, anchorX: number, anchorY: number, opacity: number;

      if (animTransform) {
        const localTime = sourceTime;
        const computed = getComputedTransform(animTransform, localTime);
        x = computed.x;
        y = computed.y;
        scaleX = computed.scaleX;
        scaleY = computed.scaleY;
        rotation = computed.rotation;
        anchorX = computed.anchorX;
        anchorY = computed.anchorY;
        opacity = computed.opacity;
      } else if (element.transform) {
        x = element.transform.x;
        y = element.transform.y;
        scaleX = element.transform.scaleX;
        scaleY = element.transform.scaleY;
        rotation = element.transform.rotation;
        anchorX = element.transform.anchorX;
        anchorY = element.transform.anchorY;
        opacity = element.opacity;
      } else {
        x = 0.5;
        y = 0.5;
        scaleX = 1;
        scaleY = 1;
        rotation = 0;
        anchorX = 0.5;
        anchorY = 0.5;
        opacity = element.opacity ?? 1;
      }

      const layer: CompositeLayerConfig = {
        elementId: element.id,
        source: mediaElement.src,
        sourceTime,
        transform: { x, y, scaleX, scaleY, rotation, anchorX, anchorY },
        opacity,
        zIndex: zIndex++,
        ...(element.blendMode &&
          element.blendMode !== 'normal' && { blendMode: element.blendMode }),
      };

      // Flow effects to composite layer
      if (element.effects && element.effects.length > 0) {
        const localTime = element.trimStart + (time - element.startTime);
        layer.effects = element.effects
          .filter((e) => e.enabled)
          .sort((a, b) => a.order - b.order)
          .map((e) => ({
            type: e.type,
            parameters: getEffectParametersAtTime(e, localTime) as Record<
              string,
              number | string | boolean
            >,
            order: e.order,
          }));
      }

      // Flow colorCorrection to composite layer as a color-correction effect
      const editorElement = element as EditorElement;
      if (editorElement.colorCorrection) {
        const ccEffect = colorCorrectionToCompositeEffect(editorElement.colorCorrection);
        if (ccEffect) {
          if (!layer.effects) layer.effects = [];
          layer.effects.unshift(ccEffect);
        }
      }

      // Flow masks to composite layer
      if (editorElement.masks && editorElement.masks.length > 0) {
        const localTime = element.trimStart + (time - element.startTime);
        layer.masks = buildCompositeMasks(editorElement.masks, localTime);
      }

      layers.push(layer);
    }
  }

  // Apply transitions between adjacent elements on the same track
  const trackElements = project.tracks.map((track) => ({
    elements: track.elements
      .filter((e) => e.type === 'media')
      .sort((a, b) => a.startTime - b.startTime)
      .map((e) => ({
        id: e.id,
        startTime: e.startTime,
        duration: e.duration,
        transitionIn: e.transitionIn
          ? {
              type: e.transitionIn.type,
              duration: e.transitionIn.duration,
              easing: e.transitionIn.easing,
            }
          : undefined,
        transitionOut: e.transitionOut
          ? {
              type: e.transitionOut.type,
              duration: e.transitionOut.duration,
              easing: e.transitionOut.easing,
            }
          : undefined,
      })),
  }));
  applyTransitions(layers, trackElements, time);

  return layers;
}
