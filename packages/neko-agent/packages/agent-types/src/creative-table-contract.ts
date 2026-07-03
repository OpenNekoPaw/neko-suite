import {
  STORYBOARD_CREATIVE_TABLE_PROFILE,
  STORYBOARD_CREATIVE_TABLE_RECOMMENDED_HEADERS,
  normalizeCreativeTableHeader,
  resolveCreativeTableField,
  type CreativeTableFieldDescriptor,
} from '@neko/shared';

export const STORYBOARD_CREATIVE_TABLE_VALIDATOR_ID = 'creative-table.storyboard';

export const STORYBOARD_CREATIVE_TABLE_HEADERS = STORYBOARD_CREATIVE_TABLE_RECOMMENDED_HEADERS;

export type StoryboardCreativeTableHeader = (typeof STORYBOARD_CREATIVE_TABLE_HEADERS)[number];

export type StoryboardCreativeTableFieldDescriptor = CreativeTableFieldDescriptor;

export const STORYBOARD_CREATIVE_TABLE_FIELDS = STORYBOARD_CREATIVE_TABLE_PROFILE.fields;

export function normalizeStoryboardCreativeTableHeader(value: string): string {
  return normalizeCreativeTableHeader(value);
}

export function resolveStoryboardCreativeTableHeader(
  value: string,
): StoryboardCreativeTableHeader | undefined {
  const field = resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, value);
  return field?.id as StoryboardCreativeTableHeader | undefined;
}
