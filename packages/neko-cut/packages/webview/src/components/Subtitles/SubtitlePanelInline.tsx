import { memo, useCallback, useMemo, useRef } from 'react';
import type { SubtitleElement, EditOperation } from '@neko/shared';
import { CENTERED_TRANSFORM } from '@neko/shared';
import type { TimelineElement } from '../../types';
import { SubtitlePanel } from './SubtitlePanel';
import { useEditorStore } from '../../stores/editor-store';
import { createMeta } from '../../stores/utils/operation-helpers';
import {
  createDefaultSubtitleStyle,
  type SubtitleStyle,
  type SubtitleTrack,
} from '../../types/subtitle';

type SubtitleTrackElement = SubtitleElement & Record<string, unknown>;

function buildShadow(style: SubtitleStyle): SubtitleElement['shadow'] | undefined {
  if (
    style.shadowBlur <= 0 &&
    style.shadowOffsetX === 0 &&
    style.shadowOffsetY === 0 &&
    (style.shadowColor === 'transparent' || style.shadowColor === 'rgba(0, 0, 0, 0)')
  ) {
    return undefined;
  }

  return {
    color: style.shadowColor,
    offsetX: style.shadowOffsetX,
    offsetY: style.shadowOffsetY,
    blur: style.shadowBlur,
  };
}

function subtitleStyleToElementUpdates(style: SubtitleStyle): Partial<SubtitleElement> {
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    color: style.color,
    backgroundColor: style.backgroundColor,
    textAlign: style.alignment,
    strokeColor: style.outlineColor,
    strokeWidth: style.outlineWidth,
    shadow: buildShadow(style),
  };
}

function elementToSubtitleStyle(element: SubtitleTrackElement): SubtitleStyle {
  const fallback = createDefaultSubtitleStyle();
  return {
    ...fallback,
    fontFamily: element.fontFamily ?? fallback.fontFamily,
    fontSize: element.fontSize ?? fallback.fontSize,
    color: element.color ?? fallback.color,
    backgroundColor: element.backgroundColor ?? fallback.backgroundColor,
    alignment:
      element.textAlign === 'left' || element.textAlign === 'right'
        ? element.textAlign
        : fallback.alignment,
    outlineColor: element.strokeColor ?? fallback.outlineColor,
    outlineWidth: element.strokeWidth ?? fallback.outlineWidth,
    shadowColor: element.shadow?.color ?? fallback.shadowColor,
    shadowOffsetX: element.shadow?.offsetX ?? fallback.shadowOffsetX,
    shadowOffsetY: element.shadow?.offsetY ?? fallback.shadowOffsetY,
    shadowBlur: element.shadow?.blur ?? fallback.shadowBlur,
  };
}

function cueDuration(element: SubtitleTrackElement): number {
  return Math.max(0, element.duration - element.trimStart - element.trimEnd);
}

export const SubtitlePanelInline = memo(function SubtitlePanelInline() {
  const project = useEditorStore((state) => state.project);
  const currentTime = useEditorStore((state) => state.currentTime);
  const getTotalDuration = useEditorStore((state) => state.getTotalDuration);
  const addTrack = useEditorStore((state) => state.addTrack);
  const removeTrack = useEditorStore((state) => state.removeTrack);
  const updateTrack = useEditorStore((state) => state.updateTrack);
  const addElement = useEditorStore((state) => state.addElement);
  const removeElement = useEditorStore((state) => state.removeElement);
  const dispatch = useEditorStore((state) => state.dispatch);

  const trackUiToActualRef = useRef(new Map<string, string>());
  const trackActualToUiRef = useRef(new Map<string, string>());
  const cueUiToActualRef = useRef(new Map<string, string>());
  const cueActualToUiRef = useRef(new Map<string, string>());

  const getTrackUiId = useCallback((actualTrackId: string): string => {
    const existing = trackActualToUiRef.current.get(actualTrackId);
    if (existing) {
      return existing;
    }

    trackUiToActualRef.current.set(actualTrackId, actualTrackId);
    trackActualToUiRef.current.set(actualTrackId, actualTrackId);
    return actualTrackId;
  }, []);

  const getCueUiId = useCallback((trackUiId: string, actualCueId: string): string => {
    const actualKey = `${trackUiId}:${actualCueId}`;
    const existing = cueActualToUiRef.current.get(actualKey);
    if (existing) {
      return existing;
    }

    const uiKey = `${trackUiId}:${actualCueId}`;
    cueUiToActualRef.current.set(uiKey, actualCueId);
    cueActualToUiRef.current.set(actualKey, actualCueId);
    return actualCueId;
  }, []);

  const subtitleTracks = useMemo(() => {
    const actualTracks = project?.tracks.filter((track) => track.type === 'subtitle') ?? [];
    const activeTrackIds = new Set<string>();
    const activeCueKeys = new Set<string>();

    const mappedTracks: SubtitleTrack[] = actualTracks.map((track, index) => {
      const uiTrackId = getTrackUiId(track.id);
      activeTrackIds.add(uiTrackId);

      const subtitleElements = track.elements
        .filter((element): element is SubtitleTrackElement => element.type === 'subtitle')
        .sort((a, b) => a.startTime - b.startTime);

      const style =
        subtitleElements.length > 0
          ? elementToSubtitleStyle(subtitleElements[0])
          : createDefaultSubtitleStyle();

      const cues = subtitleElements.map((element) => {
        const uiCueId = getCueUiId(uiTrackId, element.id);
        const cueKey = `${uiTrackId}:${uiCueId}`;
        activeCueKeys.add(cueKey);

        return {
          id: uiCueId,
          startTime: element.startTime,
          endTime: element.startTime + cueDuration(element),
          text: element.text,
        };
      });

      return {
        id: uiTrackId,
        name: track.name,
        language: index === 0 ? 'default' : 'und',
        isDefault: index === 0,
        style,
        cues,
      };
    });

    for (const uiId of Array.from(trackUiToActualRef.current.keys())) {
      if (!activeTrackIds.has(uiId)) {
        const actualId = trackUiToActualRef.current.get(uiId);
        trackUiToActualRef.current.delete(uiId);
        if (actualId) {
          trackActualToUiRef.current.delete(actualId);
        }
      }
    }

    for (const uiKey of Array.from(cueUiToActualRef.current.keys())) {
      if (!activeCueKeys.has(uiKey)) {
        const actualId = cueUiToActualRef.current.get(uiKey);
        cueUiToActualRef.current.delete(uiKey);
        if (actualId) {
          const [trackUiId] = uiKey.split(':');
          cueActualToUiRef.current.delete(`${trackUiId}:${actualId}`);
        }
      }
    }

    return mappedTracks;
  }, [getCueUiId, getTrackUiId, project?.tracks]);

  const updateSubtitleElement = useCallback(
    (
      trackId: string,
      element: SubtitleTrackElement,
      updates: Partial<SubtitleElement>,
      label: string,
    ) => {
      const beforeUpdates = Object.fromEntries(
        Object.keys(updates).map((key) => [key, element[key]]),
      ) as Partial<SubtitleElement>;

      const operation: EditOperation = {
        type: 'element.update',
        meta: createMeta('user', label),
        payload: {
          trackId,
          elementId: element.id,
          updates,
        },
        before: { updates: beforeUpdates },
      };

      dispatch(operation);
    },
    [dispatch],
  );

  const handleTracksChange = useCallback(
    (nextTracks: SubtitleTrack[]) => {
      const actualTracks = project?.tracks.filter((track) => track.type === 'subtitle') ?? [];
      const currentTrackByUi = new Map<string, (typeof actualTracks)[number]>();

      for (const track of actualTracks) {
        const uiTrackId = getTrackUiId(track.id);
        currentTrackByUi.set(uiTrackId, track);
      }

      const nextTrackIds = new Set(nextTracks.map((track) => track.id));
      for (const [uiTrackId, track] of currentTrackByUi) {
        if (!nextTrackIds.has(uiTrackId)) {
          removeTrack(track.id);
        }
      }

      for (const nextTrack of nextTracks) {
        let actualTrack = currentTrackByUi.get(nextTrack.id);
        if (!actualTrack) {
          const actualTrackId = addTrack('subtitle', nextTrack.name);
          trackUiToActualRef.current.set(nextTrack.id, actualTrackId);
          trackActualToUiRef.current.set(actualTrackId, nextTrack.id);
          actualTrack = {
            id: actualTrackId,
            name: nextTrack.name,
            type: 'subtitle',
            elements: [],
            muted: false,
            locked: false,
            hidden: false,
            isMain: false,
          };
        } else if (actualTrack.name !== nextTrack.name) {
          updateTrack(actualTrack.id, { name: nextTrack.name });
        }

        const currentElements = actualTrack.elements
          .filter((element): element is SubtitleTrackElement => element.type === 'subtitle')
          .sort((a, b) => a.startTime - b.startTime);

        const nextCueIds = new Set(nextTrack.cues.map((cue) => cue.id));

        for (const element of currentElements) {
          const uiCueId = getCueUiId(nextTrack.id, element.id);
          if (!nextCueIds.has(uiCueId)) {
            removeElement(actualTrack.id, element.id);
          }
        }

        for (const nextCue of nextTrack.cues) {
          const cueUiKey = `${nextTrack.id}:${nextCue.id}`;
          const actualCueId = cueUiToActualRef.current.get(cueUiKey);
          const existingElement = currentElements.find((element) => element.id === actualCueId);

          if (!existingElement) {
            const newElement: Omit<TimelineElement, 'id'> = {
              type: 'subtitle',
              name:
                nextCue.text.length > 30
                  ? `${nextCue.text.slice(0, 30)}...`
                  : nextCue.text || 'Subtitle',
              text: nextCue.text,
              startTime: nextCue.startTime,
              duration: Math.max(0.1, nextCue.endTime - nextCue.startTime),
              trimStart: 0,
              trimEnd: 0,
              transform: CENTERED_TRANSFORM,
              opacity: 1,
              blendMode: 'normal',
              effects: [],
              muted: false,
              hidden: false,
              locked: false,
              ...subtitleStyleToElementUpdates(nextTrack.style),
            };
            const createdId = addElement(actualTrack.id, newElement);
            cueUiToActualRef.current.set(cueUiKey, createdId);
            cueActualToUiRef.current.set(`${nextTrack.id}:${createdId}`, nextCue.id);
            continue;
          }

          const cueUpdates: Partial<SubtitleElement> = {};
          if (existingElement.text !== nextCue.text) {
            cueUpdates.text = nextCue.text;
            cueUpdates.name =
              nextCue.text.length > 30
                ? `${nextCue.text.slice(0, 30)}...`
                : nextCue.text || 'Subtitle';
          }
          if (existingElement.startTime !== nextCue.startTime) {
            cueUpdates.startTime = nextCue.startTime;
          }
          const nextDuration = Math.max(0.1, nextCue.endTime - nextCue.startTime);
          if (existingElement.duration !== nextDuration) {
            cueUpdates.duration = nextDuration;
          }

          if (Object.keys(cueUpdates).length > 0) {
            updateSubtitleElement(
              actualTrack.id,
              existingElement,
              cueUpdates,
              'Update subtitle cue',
            );
          }
        }

        const firstElement = currentElements[0];
        const currentStyle = firstElement
          ? elementToSubtitleStyle(firstElement)
          : createDefaultSubtitleStyle();
        const hasStyleChange = JSON.stringify(currentStyle) !== JSON.stringify(nextTrack.style);

        if (hasStyleChange) {
          const styleUpdates = subtitleStyleToElementUpdates(nextTrack.style);
          const targetElements = actualTrack.elements.filter(
            (element): element is SubtitleTrackElement => element.type === 'subtitle',
          );
          for (const element of targetElements) {
            updateSubtitleElement(actualTrack.id, element, styleUpdates, 'Update subtitle style');
          }
        }
      }
    },
    [
      addElement,
      addTrack,
      getCueUiId,
      getTrackUiId,
      project?.tracks,
      removeElement,
      removeTrack,
      updateSubtitleElement,
      updateTrack,
    ],
  );

  return (
    <SubtitlePanel
      tracks={subtitleTracks}
      currentTime={currentTime}
      duration={getTotalDuration()}
      onTracksChange={handleTracksChange}
    />
  );
});
