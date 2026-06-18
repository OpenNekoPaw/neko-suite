import type { AssetEntity, AssetFile } from '@neko/shared';
import type { AssetReference } from '@neko-story/types';
import type { AssetLinkMatch, AssetLinkMatchSource, IAssetLinker } from './types';
import { getNekoAssetsApi } from './assetsApi';

const CHARACTER_CATEGORY = 'character';
const LOCATION_CATEGORY = 'environment';
const OBJECT_CATEGORY = 'object';

export interface AssetLinkingServiceDeps {
  readonly loadEntities?: () => Promise<readonly AssetEntity[]>;
}

export class AssetLinkingService implements IAssetLinker {
  constructor(private readonly deps: AssetLinkingServiceDeps = {}) {}

  async linkCharacter(
    name: string,
    options: {
      characterId?: string;
      aliases?: readonly string[];
    } = {},
  ): Promise<AssetLinkMatch | null> {
    const entities = await this.loadEntities();
    const characterEntities = entities.filter((entity) => entity.category === CHARACTER_CATEGORY);

    if (options.characterId) {
      const exact = characterEntities.find(
        (entity) => entity.metadata.character?.registryId === options.characterId,
      );
      const linked = exact ? toAssetLinkMatch(exact, 'registryId') : null;
      if (linked) {
        return linked;
      }
    }

    const names = buildLookupSet([name, ...(options.aliases ?? [])]);
    return findBestMatch(characterEntities, names);
  }

  async linkLocation(location: string): Promise<AssetLinkMatch | null> {
    const entities = await this.loadEntities();
    const candidates = entities.filter((entity) => entity.category === LOCATION_CATEGORY);
    const names = buildLookupSet([location]);
    return findBestMatch(candidates, names);
  }

  async linkObject(name: string): Promise<AssetLinkMatch | null> {
    const entities = await this.loadEntities();
    const candidates = entities.filter((entity) => entity.category === OBJECT_CATEGORY);
    const names = buildLookupSet([name]);
    return findBestMatch(candidates, names);
  }

  private async loadEntities(): Promise<readonly AssetEntity[]> {
    if (this.deps.loadEntities) {
      return this.deps.loadEntities();
    }

    return getNekoAssetsApi().then((api) => api.getAllEntities());
  }
}

function findBestMatch(
  entities: readonly AssetEntity[],
  lookupKeys: ReadonlySet<string>,
): AssetLinkMatch | null {
  for (const source of ['name', 'alias', 'tag'] satisfies readonly AssetLinkMatchSource[]) {
    for (const entity of entities) {
      if (!matchesEntity(entity, lookupKeys, source)) {
        continue;
      }

      const linked = toAssetLinkMatch(entity, source);
      if (linked) {
        return linked;
      }
    }
  }

  return null;
}

function matchesEntity(
  entity: AssetEntity,
  lookupKeys: ReadonlySet<string>,
  source: Exclude<AssetLinkMatchSource, 'registryId'>,
): boolean {
  switch (source) {
    case 'name':
      return lookupKeys.has(normalizeLookupKey(entity.name));
    case 'alias':
      return (entity.aliases ?? []).some((alias) => lookupKeys.has(normalizeLookupKey(alias)));
    case 'tag':
      return entity.tags.some((tag) => lookupKeys.has(normalizeLookupKey(tag)));
  }
}

function toAssetLinkMatch(
  entity: AssetEntity,
  matchedBy: AssetLinkMatchSource,
): AssetLinkMatch | null {
  const reference = selectAssetReference(entity);
  if (!reference) {
    return null;
  }

  return {
    entity,
    reference,
    matchedBy,
  };
}

function selectAssetReference(entity: AssetEntity): AssetReference | null {
  const variants = [
    ...(entity.defaultVariantId
      ? entity.variants.filter((variant) => variant.id === entity.defaultVariantId)
      : []),
    ...entity.variants.filter((variant) => variant.id !== entity.defaultVariantId),
  ];

  for (const variant of variants) {
    const file = selectBestFile(variant.files);
    if (!file) {
      continue;
    }

    const type = mapFileToReferenceType(file);
    if (!type) {
      continue;
    }

    return {
      type,
      path: file.path,
    };
  }

  return null;
}

function selectBestFile(files: readonly AssetFile[]): AssetFile | undefined {
  return [...files].sort((left, right) => getFilePriority(left) - getFilePriority(right))[0];
}

function getFilePriority(file: AssetFile): number {
  const purposeScore =
    file.purpose === 'main'
      ? 0
      : file.purpose === 'preview'
        ? 1
        : file.purpose === 'reference'
          ? 2
          : file.purpose === 'thumbnail'
            ? 3
            : 4;
  const mediaScore =
    file.mediaType === 'image'
      ? 0
      : file.mediaType === 'video'
        ? 1
        : file.mediaType === 'audio'
          ? 2
          : 9;

  return purposeScore * 10 + mediaScore;
}

function mapFileToReferenceType(file: AssetFile): AssetReference['type'] | undefined {
  switch (file.mediaType) {
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    default:
      return undefined;
  }
}

function buildLookupSet(values: readonly string[]): ReadonlySet<string> {
  const keys = values.map(normalizeLookupKey).filter((value): value is string => value.length > 0);

  return new Set(keys);
}

function normalizeLookupKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
