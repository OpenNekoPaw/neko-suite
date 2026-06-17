import type { AudioProjectData } from '../types/audioProject';
import type { NkmProjectData } from '../types/model-project';
import type { ProjectData } from '../types/project';
import type { NkpProjectData } from '../types/puppet';
import type {
  TimelineElement,
  AudioElement,
  MediaElement,
  PuppetElement,
  Scene3DElement,
} from '../types/element';
import type {
  PortableSourcePathPolicy,
  ProjectSourceDescriptor,
  ProjectSourceReplacement,
} from './source-policy';

type SourceBearingTimelineElement = MediaElement | AudioElement | Scene3DElement | PuppetElement;

export const nkvSourcePathPolicy: PortableSourcePathPolicy<ProjectData> = {
  listSources: listTimelineProjectSources,
  replaceSources: replaceTimelineProjectSources,
};

export const nkaSourcePathPolicy: PortableSourcePathPolicy<AudioProjectData> = {
  listSources(document) {
    return listTimelineProjectSources({ tracks: document.tracks });
  },
  replaceSources(document, replacements) {
    return {
      ...document,
      tracks: replaceTimelineTracks(document.tracks, replacements),
    };
  },
};

export const nkpSourcePathPolicy: PortableSourcePathPolicy<NkpProjectData> = {
  listSources(document) {
    const descriptors: ProjectSourceDescriptor[] = [];
    if (document.puppet.src) {
      descriptors.push({
        id: 'puppet.src',
        role: 'puppet',
        path: document.puppet.src,
        fieldPath: ['puppet', 'src'],
      });
    }
    if (document.puppet.importSource?.path) {
      descriptors.push({
        id: 'puppet.importSource.path',
        role: 'puppet',
        path: document.puppet.importSource.path,
        fieldPath: ['puppet', 'importSource', 'path'],
      });
    }
    if (document.puppet.bundle?.path) {
      descriptors.push({
        id: 'puppet.bundle.path',
        role: 'bundle',
        path: document.puppet.bundle.path,
        fieldPath: ['puppet', 'bundle', 'path'],
      });
    }
    pushBundleLocator(
      descriptors,
      'puppet.bundle.manifest',
      ['puppet', 'bundle', 'manifest'],
      document.puppet.bundle?.manifest,
    );
    pushBundleLocator(
      descriptors,
      'puppet.bundle.moc',
      ['puppet', 'bundle', 'moc'],
      document.puppet.bundle?.moc,
    );
    pushBundleLocator(
      descriptors,
      'bundleIndex.manifest',
      ['bundleIndex', 'manifest'],
      document.bundleIndex?.manifest,
    );
    pushBundleLocator(
      descriptors,
      'bundleIndex.moc',
      ['bundleIndex', 'moc'],
      document.bundleIndex?.moc,
    );
    document.bundleIndex?.textures.forEach((texture, index) => {
      pushBundleLocator(
        descriptors,
        `bundleIndex.textures.${index}.locator`,
        ['bundleIndex', 'textures', index, 'locator'],
        texture.locator,
      );
    });
    document.bundleIndex?.motions.forEach((motion, index) => {
      pushBundleLocator(
        descriptors,
        `bundleIndex.motions.${index}.locator`,
        ['bundleIndex', 'motions', index, 'locator'],
        motion.locator,
      );
    });
    document.bundleIndex?.expressions.forEach((expression, index) => {
      pushBundleLocator(
        descriptors,
        `bundleIndex.expressions.${index}.locator`,
        ['bundleIndex', 'expressions', index, 'locator'],
        expression.locator,
      );
    });
    pushBundleLocator(
      descriptors,
      'bundleIndex.physics',
      ['bundleIndex', 'physics'],
      document.bundleIndex?.physics,
    );
    return descriptors;
  },
  replaceSources(document, replacements) {
    let next: NkpProjectData = document;
    for (const replacement of replacements) {
      next = replaceNkpSource(next, replacement);
    }
    return next;
  },
};

export const nkmSourcePathPolicy: PortableSourcePathPolicy<NkmProjectData> = {
  listSources(document) {
    if (!document.model.src) return [];
    return [
      {
        id: 'model.src',
        role: 'model',
        path: document.model.src,
        fieldPath: ['model', 'src'],
      },
    ];
  },
  replaceSources(document, replacements) {
    const modelSrc = replacements.find(
      (replacement) => replacement.descriptor.id === 'model.src',
    )?.path;
    return modelSrc ? { ...document, model: { ...document.model, src: modelSrc } } : document;
  },
};

export function listTimelineProjectSources(
  document: Pick<ProjectData, 'tracks'>,
): readonly ProjectSourceDescriptor[] {
  return document.tracks.flatMap((track, trackIndex) =>
    track.elements.flatMap((element, elementIndex) => {
      if (!isSourceBearingTimelineElement(element) || !element.src) return [];
      return [
        {
          id: `${track.id}.${element.id}.src`,
          role: element.type,
          path: element.src,
          fieldPath: ['tracks', trackIndex, 'elements', elementIndex, 'src'],
          allowRemote: element.type === 'media' || element.type === 'audio',
        },
      ];
    }),
  );
}

export function replaceTimelineProjectSources(
  document: ProjectData,
  replacements: readonly ProjectSourceReplacement[],
): ProjectData {
  return {
    ...document,
    tracks: replaceTimelineTracks(document.tracks, replacements),
  };
}

function replaceTimelineTracks<TTrack extends Pick<ProjectData['tracks'][number], 'elements'>>(
  tracks: readonly TTrack[],
  replacements: readonly ProjectSourceReplacement[],
): TTrack[] {
  const replacementById = new Map(
    replacements.map((replacement) => [replacement.descriptor.id, replacement.path]),
  );
  return tracks.map((track) => ({
    ...track,
    elements: track.elements.map((element) => {
      if (!isSourceBearingTimelineElement(element)) return element;
      const keySuffix = `.${element.id}.src`;
      const replacement = [...replacementById.entries()].find(([id]) => id.endsWith(keySuffix));
      return replacement ? { ...element, src: replacement[1] } : element;
    }),
  }));
}

function isSourceBearingTimelineElement(
  element: TimelineElement,
): element is SourceBearingTimelineElement {
  return (
    element.type === 'media' ||
    element.type === 'audio' ||
    element.type === 'scene3d' ||
    element.type === 'puppet'
  );
}

function pushBundleLocator(
  descriptors: ProjectSourceDescriptor[],
  id: string,
  fieldPath: readonly (string | number)[],
  locator: { readonly bundlePath: string } | undefined,
): void {
  if (!locator?.bundlePath) return;
  descriptors.push({
    id,
    role: 'bundle',
    path: locator.bundlePath,
    fieldPath: [...fieldPath, 'bundlePath'],
  });
}

function replaceNkpSource(
  document: NkpProjectData,
  replacement: ProjectSourceReplacement,
): NkpProjectData {
  switch (replacement.descriptor.id) {
    case 'puppet.src':
      return { ...document, puppet: { ...document.puppet, src: replacement.path } };
    case 'puppet.importSource.path':
      return document.puppet.importSource
        ? {
            ...document,
            puppet: {
              ...document.puppet,
              importSource: { ...document.puppet.importSource, path: replacement.path },
            },
          }
        : document;
    case 'puppet.bundle.path':
      return document.puppet.bundle
        ? {
            ...document,
            puppet: {
              ...document.puppet,
              bundle: { ...document.puppet.bundle, path: replacement.path },
            },
          }
        : document;
    default:
      return document;
  }
}
