import type { CanvasStoryboardPayload, ShotScale, StoryboardImportMode } from '@neko/shared';
import type {
  PluginTransferAssetRef,
  PluginTransferCutStoryboardPayload,
  PluginTransferCutStoryboardShot,
  PluginTransferPayload,
  PluginTransferProvenance,
  PluginTransferTargetRef,
} from '@neko-agent/types';
import type { StoryboardScene } from '@/components/ChatView/MediaPreview';
import type {
  ResolvedCompositeMedia,
  ResolvedCompositeSection,
  StoryboardTableRichData,
} from './composite-content-presenter';

const DEFAULT_SHOT_DURATION_SECONDS = 3;
const DEFAULT_SHOT_SCALE: ShotScale = 'MS';
const MARKDOWN_STORYBOARD_SOURCE_URI = 'agent://markdown/storyboard-table';

interface MarkdownCanvasTransferInput {
  readonly content: string;
  readonly target?: PluginTransferTargetRef;
  readonly provenance?: PluginTransferProvenance;
}

interface MarkdownStoryboardTable {
  readonly title: string;
  readonly rows: readonly MarkdownStoryboardRow[];
}

interface MarkdownStoryboardRow {
  readonly shotNumber?: number;
  readonly sceneTitle?: string;
  readonly visualDescription: string;
  readonly duration?: number;
  readonly shotScale?: ShotScale;
  readonly characterAction?: string;
  readonly dialogue?: string;
  readonly voiceOver?: string;
  readonly soundCue?: string;
  readonly generationPrompt?: string;
  readonly visualStyle?: string;
  readonly referenceImagePath?: string;
}

interface MarkdownTableBlock {
  readonly title?: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export function projectStoryboardScenesTransferPayload(
  scenes: readonly StoryboardScene[],
): PluginTransferPayload | null {
  const storyboard = projectStoryboardScenesToCanvasPayload(scenes);
  if (!storyboard) return null;
  return { kind: 'canvasStoryboard', storyboard };
}

export function projectStoryboardScenesAssetBatch(
  scenes: readonly StoryboardScene[],
): PluginTransferPayload | null {
  const assets = scenes.flatMap((scene) =>
    scene.shots.flatMap((shot) =>
      shot.localPath
        ? [
            {
              path: shot.localPath,
              mediaType: 'image' as const,
              name: `scene-${scene.sceneIndex}-shot-${shot.shotIndex}`,
            },
          ]
        : [],
    ),
  );
  return assets.length > 0 ? { kind: 'assetBatch', assets } : null;
}

export function projectStoryboardScenesCutTimelinePayload(
  scenes: readonly StoryboardScene[],
): PluginTransferPayload | null {
  const storyboard = projectStoryboardScenesToCutPayload(scenes);
  return storyboard ? { kind: 'cutStoryboard', storyboard } : null;
}

export function projectAssistantMarkdownCanvasTransferPayload(
  input: MarkdownCanvasTransferInput,
): PluginTransferPayload | null {
  const storyboard = projectMarkdownStoryboardTransferPayload(input.content);
  if (storyboard) return storyboard;
  return null;
}

export function projectMarkdownStoryboardTransferPayload(
  markdown: string,
): PluginTransferPayload | null {
  const storyboardTables = extractMarkdownStoryboardTables(markdown);
  if (storyboardTables.length === 0) return null;

  let nextShotNumber = 1;
  const scenes = storyboardTables.flatMap((table, tableIndex) => {
    const groups = groupMarkdownStoryboardRowsByScene(table.rows);
    return groups.map((group, groupIndex) => ({
      sceneId: `agent-markdown-scene-${tableIndex + 1}-${groupIndex + 1}`,
      sceneTitle: group.sceneTitle ?? table.title,
      sceneNumber: groupIndex + 1,
      shotPlans: group.rows.map((row) => {
        const shotNumber = row.shotNumber ?? nextShotNumber;
        nextShotNumber = Math.max(nextShotNumber, shotNumber + 1);
        return {
          shotNumber,
          duration: row.duration ?? DEFAULT_SHOT_DURATION_SECONDS,
          visualDescription: row.visualDescription,
          characters: [],
          shotScale: row.shotScale ?? DEFAULT_SHOT_SCALE,
          characterAction: row.characterAction ?? row.visualDescription,
          emotion: [],
          sceneTags: compactStrings([group.sceneTitle, row.visualStyle]),
          ...(row.dialogue ? { dialogue: row.dialogue } : {}),
          ...(row.voiceOver ? { voiceOver: row.voiceOver } : {}),
          ...(row.soundCue ? { soundCue: row.soundCue } : {}),
          ...(row.generationPrompt ? { generationPrompt: row.generationPrompt } : {}),
          ...(row.visualStyle ? { visualStyle: row.visualStyle } : {}),
          ...(row.referenceImagePath ? { referenceImagePath: row.referenceImagePath } : {}),
        };
      }),
    }));
  });

  if (scenes.length === 0) return null;
  return {
    kind: 'canvasStoryboard',
    storyboard: createCanvasStoryboardPayload('semantic', MARKDOWN_STORYBOARD_SOURCE_URI, scenes),
  };
}

export function projectStoryboardTableTransferPayload(
  data: StoryboardTableRichData,
): PluginTransferPayload | null {
  const storyboard = projectStoryboardTableToCanvasPayload(data);
  if (!storyboard) return null;
  return { kind: 'canvasStoryboard', storyboard };
}

export function projectStoryboardTableAssetBatch(
  data: StoryboardTableRichData,
): PluginTransferPayload | null {
  const assets = data.sections.flatMap((section) =>
    section.media.flatMap((media, mediaIndex) => {
      const asset = projectCompositeMediaAssetRef(media, section, mediaIndex);
      return asset ? [asset] : [];
    }),
  );
  return assets.length > 0 ? { kind: 'assetBatch', assets } : null;
}

export function projectStoryboardTableCutTimelinePayload(
  data: StoryboardTableRichData,
): PluginTransferPayload | null {
  const storyboard = projectStoryboardTableToCutPayload(data);
  return storyboard ? { kind: 'cutStoryboard', storyboard } : null;
}

function projectStoryboardScenesToCanvasPayload(
  scenes: readonly StoryboardScene[],
): CanvasStoryboardPayload | null {
  let nextShotNumber = 1;
  const projectedScenes = scenes.map((scene, index) => {
    const shotPlans = scene.shots.map((shot) => ({
      shotNumber: nextShotNumber++,
      duration: DEFAULT_SHOT_DURATION_SECONDS,
      visualDescription: `Scene ${scene.sceneIndex} shot ${shot.shotIndex}`,
      characters: [],
      shotScale: normalizeShotScale(shot.shotScale),
      characterAction: '',
      emotion: [],
      sceneTags: [],
    }));

    return {
      sceneId: `agent-storyboard-scene-${scene.sceneIndex || index + 1}`,
      sceneTitle: scene.heading || `Scene ${scene.sceneIndex || index + 1}`,
      sceneNumber: scene.sceneIndex || index + 1,
      shotPlans,
    };
  });

  if (projectedScenes.length === 0) return null;
  return createCanvasStoryboardPayload(
    'semantic',
    'agent://rich-content/storyboard',
    projectedScenes,
  );
}

function projectStoryboardTableToCanvasPayload(
  data: StoryboardTableRichData,
): CanvasStoryboardPayload | null {
  let nextShotNumber = 1;
  const scenes = data.sections.map((section, index) => {
    const imageMedia = section.media.filter((media) => media.type === 'image');
    const shotPlans = (imageMedia.length > 0 ? imageMedia : [undefined]).map((media) => {
      const description = section.content ?? section.heading ?? `Storyboard row ${index + 1}`;
      return {
        shotNumber: nextShotNumber++,
        duration: DEFAULT_SHOT_DURATION_SECONDS,
        visualDescription: description,
        characters: [],
        shotScale: DEFAULT_SHOT_SCALE,
        characterAction: description,
        emotion: [],
        sceneTags: compactStrings([media?.caption, media?.role]),
      };
    });

    return {
      sceneId: `agent-composite-section-${section.index + 1}`,
      sceneTitle: section.heading ?? data.title ?? `Storyboard ${section.index + 1}`,
      sceneNumber: section.index + 1,
      shotPlans,
    };
  });

  if (scenes.length === 0) return null;
  return createCanvasStoryboardPayload('semantic', 'agent://rich-content/storyboard-table', scenes);
}

function projectStoryboardScenesToCutPayload(
  scenes: readonly StoryboardScene[],
): PluginTransferCutStoryboardPayload | null {
  const shots: PluginTransferCutStoryboardShot[] = [];
  let nextShotNumber = 1;
  for (const scene of scenes) {
    for (const shot of scene.shots) {
      if (!shot.localPath) continue;
      const shotNumber = nextShotNumber++;
      shots.push({
        id: `agent-scene-${scene.sceneIndex}-shot-${shot.shotIndex}`,
        shotNumber,
        duration: DEFAULT_SHOT_DURATION_SECONDS,
        imagePath: shot.localPath,
        label: `#${String(shotNumber).padStart(3, '0')} ${shot.shotScale ?? ''}`.trim(),
      });
    }
  }

  return shots.length > 0 ? { projectName: 'Agent Storyboard', shots } : null;
}

function projectStoryboardTableToCutPayload(
  data: StoryboardTableRichData,
): PluginTransferCutStoryboardPayload | null {
  let nextShotNumber = 1;
  const shots = data.sections.flatMap((section) =>
    section.media.flatMap((media, mediaIndex) => {
      if (media.type !== 'image' || !media.localPath) return [];
      const shotNumber = nextShotNumber++;
      const label = media.caption ?? section.heading ?? `#${String(shotNumber).padStart(3, '0')}`;
      return [
        {
          id: media.assetId ?? media.id,
          shotNumber,
          duration: DEFAULT_SHOT_DURATION_SECONDS,
          imagePath: media.localPath,
          ...(section.content ? { dialogue: section.content } : {}),
          label: mediaIndex === 0 ? label : `${label} ${mediaIndex + 1}`,
        } satisfies PluginTransferCutStoryboardShot,
      ];
    }),
  );

  return shots.length > 0 ? { projectName: data.title ?? 'Agent Storyboard', shots } : null;
}

function createCanvasStoryboardPayload(
  mode: StoryboardImportMode,
  sourceScriptUri: string,
  scenes: CanvasStoryboardPayload['scenes'],
): CanvasStoryboardPayload {
  return {
    mode,
    sourceScriptUri,
    scenes,
  };
}

function extractMarkdownStoryboardTables(markdown: string): readonly MarkdownStoryboardTable[] {
  return extractMarkdownTableBlocks(markdown).flatMap((table) => {
    const rows = table.rows.flatMap((row) => {
      const projected = projectMarkdownStoryboardRow(table.headers, row, table.title);
      return projected ? [projected] : [];
    });
    if (rows.length === 0) return [];
    return [
      {
        title: table.title ?? 'Agent Storyboard',
        rows,
      },
    ];
  });
}

function extractMarkdownTableBlocks(markdown: string): readonly MarkdownTableBlock[] {
  const lines = markdown.split(/\r?\n/);
  const tables: MarkdownTableBlock[] = [];
  let heading: string | undefined;
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const headingText = parseMarkdownHeading(line);
    if (headingText) {
      heading = headingText;
      continue;
    }

    const delimiter = lines[index + 1];
    if (!isMarkdownTableRow(line) || !delimiter || !isMarkdownTableDelimiter(delimiter)) {
      continue;
    }

    const headers = splitMarkdownTableRow(line);
    const rows: string[][] = [];
    index += 2;
    while (index < lines.length && isMarkdownTableRow(lines[index] ?? '')) {
      rows.push(splitMarkdownTableRow(lines[index] ?? ''));
      index += 1;
    }
    index -= 1;

    if (isStoryboardTable(headers, rows, heading)) {
      tables.push({ ...(heading ? { title: heading } : {}), headers, rows });
    }
  }

  return tables;
}

function projectMarkdownStoryboardRow(
  headers: readonly string[],
  row: readonly string[],
  tableTitle: string | undefined,
): MarkdownStoryboardRow | null {
  const cells = createMarkdownRowLookup(headers, row);
  const visualDescription =
    readStoryboardCell(cells, 'visual') ??
    readStoryboardCell(cells, 'action') ??
    readStoryboardCell(cells, 'prompt') ??
    readStoryboardCell(cells, 'scene');
  if (!visualDescription) return null;

  return {
    visualDescription,
    ...(parseFirstInteger(readStoryboardCell(cells, 'shot')) !== undefined
      ? { shotNumber: parseFirstInteger(readStoryboardCell(cells, 'shot')) }
      : {}),
    ...(readStoryboardCell(cells, 'scene') &&
    readStoryboardCell(cells, 'scene') !== visualDescription
      ? { sceneTitle: readStoryboardCell(cells, 'scene') }
      : tableTitle
        ? { sceneTitle: tableTitle }
        : {}),
    ...(parseDurationSeconds(readStoryboardCell(cells, 'duration')) !== undefined
      ? { duration: parseDurationSeconds(readStoryboardCell(cells, 'duration')) }
      : {}),
    ...(parseShotScale(readStoryboardCell(cells, 'scale')) !== undefined
      ? { shotScale: parseShotScale(readStoryboardCell(cells, 'scale')) }
      : {}),
    ...(readStoryboardCell(cells, 'action')
      ? { characterAction: readStoryboardCell(cells, 'action') }
      : {}),
    ...(readStoryboardCell(cells, 'dialogue')
      ? { dialogue: readStoryboardCell(cells, 'dialogue') }
      : {}),
    ...(readStoryboardCell(cells, 'voiceOver')
      ? { voiceOver: readStoryboardCell(cells, 'voiceOver') }
      : {}),
    ...(readStoryboardCell(cells, 'sound') ? { soundCue: readStoryboardCell(cells, 'sound') } : {}),
    ...(readStoryboardCell(cells, 'prompt')
      ? { generationPrompt: readStoryboardCell(cells, 'prompt') }
      : {}),
    ...(readStoryboardCell(cells, 'style')
      ? { visualStyle: readStoryboardCell(cells, 'style') }
      : {}),
    ...(readStoryboardCell(cells, 'reference')
      ? { referenceImagePath: readStoryboardCell(cells, 'reference') }
      : {}),
  };
}

function isStoryboardTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  heading: string | undefined,
): boolean {
  if (rows.length === 0 || headers.length < 2) return false;
  const normalized = headers.map(normalizeHeader);
  const hasVisual = normalized.some((header) =>
    STORYBOARD_HEADER_GROUPS.visual.some((token) => header.includes(token)),
  );
  const hasPrompt = normalized.some((header) =>
    STORYBOARD_HEADER_GROUPS.prompt.some((token) => header.includes(token)),
  );
  const hasShot = normalized.some((header) =>
    STORYBOARD_HEADER_GROUPS.shot.some((token) => header.includes(token)),
  );
  const headingLooksStoryboard = heading ? /storyboard|shot|分镜|镜头/i.test(heading) : false;
  return (hasVisual || hasPrompt) && (hasShot || headingLooksStoryboard);
}

function createMarkdownRowLookup(
  headers: readonly string[],
  row: readonly string[],
): ReadonlyMap<StoryboardColumnKind, string> {
  const values = new Map<StoryboardColumnKind, string>();
  headers.forEach((header, index) => {
    const kind = classifyStoryboardHeader(header);
    const cell = sanitizeMarkdownCell(row[index] ?? '');
    if (kind && cell && !values.has(kind)) values.set(kind, cell);
  });
  return values;
}

type StoryboardColumnKind =
  | 'shot'
  | 'scene'
  | 'visual'
  | 'duration'
  | 'scale'
  | 'action'
  | 'dialogue'
  | 'voiceOver'
  | 'sound'
  | 'prompt'
  | 'style'
  | 'reference';

const STORYBOARD_HEADER_GROUPS: Record<StoryboardColumnKind, readonly string[]> = {
  shot: ['shot', '镜头', '分镜', '编号', '序号', '#'],
  scene: ['scene', '场景', '段落', '章节'],
  visual: ['visual', '画面', '描述', '内容', '构图', 'panel', '镜头内容'],
  duration: ['duration', '时长', '秒'],
  scale: ['shot scale', 'scale', '景别', '镜别'],
  action: ['action', '动作', '表演', '角色动作'],
  dialogue: ['dialogue', '对白', '台词'],
  voiceOver: ['voice over', 'voiceover', '旁白'],
  sound: ['sound', 'sfx', '音效', '声音'],
  prompt: ['prompt', '提示词', '生成提示', '画面提示词'],
  style: ['style', '风格', '视觉风格'],
  reference: ['reference', '参考图', '图片', 'image', '路径'],
};

function classifyStoryboardHeader(header: string): StoryboardColumnKind | undefined {
  const normalized = normalizeHeader(header);
  for (const [kind, tokens] of Object.entries(STORYBOARD_HEADER_GROUPS)) {
    if (tokens.some((token) => normalized.includes(normalizeHeader(token)))) {
      return kind as StoryboardColumnKind;
    }
  }
  return undefined;
}

function readStoryboardCell(
  cells: ReadonlyMap<StoryboardColumnKind, string>,
  kind: StoryboardColumnKind,
): string | undefined {
  return cells.get(kind);
}

function groupMarkdownStoryboardRowsByScene(
  rows: readonly MarkdownStoryboardRow[],
): Array<{ sceneTitle?: string; rows: MarkdownStoryboardRow[] }> {
  const groups: Array<{ sceneTitle?: string; rows: MarkdownStoryboardRow[] }> = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.sceneTitle === row.sceneTitle) {
      last.rows.push(row);
      continue;
    }
    groups.push({ ...(row.sceneTitle ? { sceneTitle: row.sceneTitle } : {}), rows: [row] });
  }
  return groups;
}

function parseMarkdownHeading(line: string): string | undefined {
  const match = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
  return match?.[1]?.trim() || undefined;
}

function isMarkdownTableRow(line: string): boolean {
  return line.includes('|') && splitMarkdownTableRow(line).length >= 2;
}

function isMarkdownTableDelimiter(line: string): boolean {
  const cells = splitMarkdownTableRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function sanitizeMarkdownCell(value: string): string | undefined {
  const cleaned = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim();
  return cleaned.length > 0 && cleaned !== '-' ? cleaned : undefined;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '').trim();
}

function parseFirstInteger(value: string | undefined): number | undefined {
  const match = value?.match(/\d+/);
  if (!match) return undefined;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDurationSeconds(value: string | undefined): number | undefined {
  const match = value?.match(/\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseShotScale(value: string | undefined): ShotScale | undefined {
  if (!value) return undefined;
  const normalized = value.toUpperCase();
  for (const scale of ['ECU', 'MCU', 'MLS', 'VLS', 'ELS', 'CU', 'MS', 'LS'] as const) {
    if (normalized.includes(scale)) return scale;
  }
  if (/特写|近景/.test(value)) return 'CU';
  if (/中近景/.test(value)) return 'MCU';
  if (/中景/.test(value)) return 'MS';
  if (/远景|全景/.test(value)) return 'LS';
  return undefined;
}

function projectCompositeMediaAssetRef(
  media: ResolvedCompositeMedia,
  section: ResolvedCompositeSection,
  mediaIndex: number,
): PluginTransferAssetRef | null {
  if (!media.localPath || media.type === 'unknown') return null;
  return {
    path: media.localPath,
    mediaType: media.type,
    name:
      media.caption ??
      media.label ??
      section.heading ??
      `section-${section.index + 1}-asset-${mediaIndex + 1}`,
  };
}

function normalizeShotScale(value: string | undefined): ShotScale {
  if (
    value === 'ECU' ||
    value === 'CU' ||
    value === 'MCU' ||
    value === 'MS' ||
    value === 'MLS' ||
    value === 'LS' ||
    value === 'VLS' ||
    value === 'ELS'
  ) {
    return value;
  }
  return DEFAULT_SHOT_SCALE;
}

function compactStrings(values: readonly (string | undefined)[]): string[] {
  return values.filter((value): value is string => typeof value === 'string' && value.length > 0);
}
