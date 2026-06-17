import type { AudioProjectData } from '../types/audioProject';
import type {
  NkmLiveActorRef,
  NkmProjectData,
  NkmScene2DParallaxLayer,
  NkmScene2DSprite,
  NkmScene2DTilemap,
} from '../types/model-project';
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
    const descriptors: ProjectSourceDescriptor[] = [];
    if (document.model.src) {
      descriptors.push({
        id: 'model.src',
        role: 'model',
        path: document.model.src,
        fieldPath: ['model', 'src'],
      });
    }
    document.scene2d?.sprites?.forEach((sprite, index) => {
      descriptors.push({
        id: `scene2d.sprites.${index}.assetRef`,
        role: 'image',
        path: sprite.assetRef,
        fieldPath: ['scene2d', 'sprites', index, 'assetRef'],
      });
    });
    document.scene2d?.tilemaps?.forEach((tilemap, index) => {
      descriptors.push({
        id: `scene2d.tilemaps.${index}.tilesetRef`,
        role: 'image',
        path: tilemap.tilesetRef,
        fieldPath: ['scene2d', 'tilemaps', index, 'tilesetRef'],
      });
    });
    document.scene2d?.parallaxLayers?.forEach((layer, index) => {
      descriptors.push({
        id: `scene2d.parallaxLayers.${index}.assetRef`,
        role: 'image',
        path: layer.assetRef,
        fieldPath: ['scene2d', 'parallaxLayers', index, 'assetRef'],
      });
    });
    document.live?.actors?.forEach((actor, index) => {
      descriptors.push({
        id: `live.actors.${index}.ref`,
        role: 'puppet',
        path: actor.ref,
        fieldPath: ['live', 'actors', index, 'ref'],
      });
    });
    return descriptors;
  },
  replaceSources(document, replacements) {
    let next: NkmProjectData = document;
    for (const replacement of replacements) {
      next = replaceNkmSource(next, replacement);
    }
    return next;
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
    case 'puppet.bundle.manifest':
      return document.puppet.bundle
        ? {
            ...document,
            puppet: {
              ...document.puppet,
              bundle: {
                ...document.puppet.bundle,
                manifest: {
                  ...document.puppet.bundle.manifest,
                  bundlePath: replacement.path,
                  fragmentRef: `${replacement.path}#${document.puppet.bundle.manifest.entryPath}`,
                },
              },
            },
          }
        : document;
    case 'puppet.bundle.moc':
      return document.puppet.bundle
        ? {
            ...document,
            puppet: {
              ...document.puppet,
              bundle: {
                ...document.puppet.bundle,
                moc: {
                  ...document.puppet.bundle.moc,
                  bundlePath: replacement.path,
                  fragmentRef: `${replacement.path}#${document.puppet.bundle.moc.entryPath}`,
                },
              },
            },
          }
        : document;
    case 'bundleIndex.manifest':
      return document.bundleIndex
        ? {
            ...document,
            bundleIndex: {
              ...document.bundleIndex,
              manifest: {
                ...document.bundleIndex.manifest,
                bundlePath: replacement.path,
                fragmentRef: `${replacement.path}#${document.bundleIndex.manifest.entryPath}`,
              },
            },
          }
        : document;
    case 'bundleIndex.moc':
      return document.bundleIndex
        ? {
            ...document,
            bundleIndex: {
              ...document.bundleIndex,
              moc: {
                ...document.bundleIndex.moc,
                bundlePath: replacement.path,
                fragmentRef: `${replacement.path}#${document.bundleIndex.moc.entryPath}`,
              },
            },
          }
        : document;
    case 'bundleIndex.physics':
      return document.bundleIndex?.physics
        ? {
            ...document,
            bundleIndex: {
              ...document.bundleIndex,
              physics: {
                ...document.bundleIndex.physics,
                bundlePath: replacement.path,
                fragmentRef: `${replacement.path}#${document.bundleIndex.physics.entryPath}`,
              },
            },
          }
        : document;
    default:
      return replaceNkpIndexedBundleSource(document, replacement);
  }
}

function replaceNkpIndexedBundleSource(
  document: NkpProjectData,
  replacement: ProjectSourceReplacement,
): NkpProjectData {
  if (!document.bundleIndex) return document;
  const [collection, index] = parseIndexedBundleSourceId(replacement.descriptor.id);
  if (!collection || index === undefined) return document;

  switch (collection) {
    case 'textures':
      return {
        ...document,
        bundleIndex: {
          ...document.bundleIndex,
          textures: document.bundleIndex.textures.map((entry, entryIndex) =>
            entryIndex === index
              ? {
                  ...entry,
                  locator: {
                    ...entry.locator,
                    bundlePath: replacement.path,
                    fragmentRef: `${replacement.path}#${entry.locator.entryPath}`,
                  },
                }
              : entry,
          ),
        },
      };
    case 'motions':
      return {
        ...document,
        bundleIndex: {
          ...document.bundleIndex,
          motions: document.bundleIndex.motions.map((entry, entryIndex) =>
            entryIndex === index
              ? {
                  ...entry,
                  locator: {
                    ...entry.locator,
                    bundlePath: replacement.path,
                    fragmentRef: `${replacement.path}#${entry.locator.entryPath}`,
                  },
                }
              : entry,
          ),
        },
      };
    case 'expressions':
      return {
        ...document,
        bundleIndex: {
          ...document.bundleIndex,
          expressions: document.bundleIndex.expressions.map((entry, entryIndex) =>
            entryIndex === index
              ? {
                  ...entry,
                  locator: {
                    ...entry.locator,
                    bundlePath: replacement.path,
                    fragmentRef: `${replacement.path}#${entry.locator.entryPath}`,
                  },
                }
              : entry,
          ),
        },
      };
    default:
      return document;
  }
}

function parseIndexedBundleSourceId(
  id: string,
): readonly ['textures' | 'motions' | 'expressions' | undefined, number | undefined] {
  const match = id.match(/^bundleIndex\.(textures|motions|expressions)\.(\d+)\.locator$/);
  if (!match) return [undefined, undefined];
  return [match[1] as 'textures' | 'motions' | 'expressions', Number(match[2])];
}

function replaceNkmSource(
  document: NkmProjectData,
  replacement: ProjectSourceReplacement,
): NkmProjectData {
  switch (replacement.descriptor.id) {
    case 'model.src':
      return { ...document, model: { ...document.model, src: replacement.path } };
    default:
      return replaceNkmIndexedSource(document, replacement);
  }
}

function replaceNkmIndexedSource(
  document: NkmProjectData,
  replacement: ProjectSourceReplacement,
): NkmProjectData {
  const [section, index] = parseNkmIndexedSourceId(replacement.descriptor.id);
  if (!section || index === undefined) return document;

  switch (section) {
    case 'sprites':
      return {
        ...document,
        scene2d: document.scene2d
          ? {
              ...document.scene2d,
              sprites: replaceIndexedAssetRef<NkmScene2DSprite>(
                document.scene2d.sprites,
                index,
                'assetRef',
                replacement.path,
              ),
            }
          : document.scene2d,
      };
    case 'tilemaps':
      return {
        ...document,
        scene2d: document.scene2d
          ? {
              ...document.scene2d,
              tilemaps: replaceIndexedAssetRef<NkmScene2DTilemap>(
                document.scene2d.tilemaps,
                index,
                'tilesetRef',
                replacement.path,
              ),
            }
          : document.scene2d,
      };
    case 'parallaxLayers':
      return {
        ...document,
        scene2d: document.scene2d
          ? {
              ...document.scene2d,
              parallaxLayers: replaceIndexedAssetRef<NkmScene2DParallaxLayer>(
                document.scene2d.parallaxLayers,
                index,
                'assetRef',
                replacement.path,
              ),
            }
          : document.scene2d,
      };
    case 'actors':
      return {
        ...document,
        live: document.live
          ? {
              ...document.live,
              actors: replaceIndexedAssetRef<NkmLiveActorRef>(
                document.live.actors,
                index,
                'ref',
                replacement.path,
              ),
            }
          : document.live,
      };
    default:
      return document;
  }
}

function parseNkmIndexedSourceId(
  id: string,
): readonly ['sprites' | 'tilemaps' | 'parallaxLayers' | 'actors' | undefined, number | undefined] {
  const match = id.match(/^(?:scene2d\.)?(sprites|tilemaps|parallaxLayers|actors)\.(\d+)\./);
  if (!match) return [undefined, undefined];
  return [match[1] as 'sprites' | 'tilemaps' | 'parallaxLayers' | 'actors', Number(match[2])];
}

function replaceIndexedAssetRef<TEntry extends Record<TKey, string>, TKey extends keyof TEntry>(
  entries: readonly TEntry[] | undefined,
  index: number,
  key: TKey,
  value: string,
): readonly TEntry[] | undefined {
  if (!entries) return entries;
  return entries.map((entry, entryIndex) =>
    entryIndex === index ? { ...entry, [key]: value } : entry,
  );
}
