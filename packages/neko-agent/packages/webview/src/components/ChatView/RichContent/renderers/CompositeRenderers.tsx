import { useState } from 'react';
import type { RichContentProps, RichContentRendererEntry } from '../types';
import type {
  AssetGalleryRichData,
  ComparisonGridRichData,
  CompositeMediaDiagnostic,
  CompositeMediaType,
  ResolvedCompositeMedia,
  ResolvedCompositeSection,
  StoryboardTableRichData,
} from '@/presenters/composite-content-presenter';
import type { StoryboardSceneRow, StoryboardShotRow, StoryboardTextCue } from '@neko/shared';
import type { StoryboardShotPlanOverlay } from '@neko/shared';
import { VSCodeMessages } from '@/messages';
import { SendToMenu } from '@/components/ChatView/SendToMenu';
import { useTranslation } from '@/i18n/I18nContext';
import {
  projectStoryboardTableAssetBatch,
  projectStoryboardTableCutTimelinePayload,
  projectStoryboardTableTransferPayload,
} from '@/presenters/storyboard-transfer-presenter';

function isStoryboardTableRichData(data: unknown): data is StoryboardTableRichData {
  return isCompositeData(data, 'storyboard-table');
}

function isComparisonGridRichData(data: unknown): data is ComparisonGridRichData {
  return isCompositeData(data, 'comparison');
}

function isAssetGalleryRichData(data: unknown): data is AssetGalleryRichData {
  return isCompositeData(data, 'gallery') || isCompositeData(data, 'report');
}

function StoryboardTableRendererComponent({
  data,
  className,
}: RichContentProps<StoryboardTableRichData>) {
  const canvasPayload = projectStoryboardTableTransferPayload(data);
  const cutPayload = projectStoryboardTableCutTimelinePayload(data);
  const assetBatchPayload = projectStoryboardTableAssetBatch(data);
  const plugins = data.plugins;
  const storyboardRows = data.storyboardTable ? projectSemanticStoryboardRows(data) : [];
  const rowCount = storyboardRows.length > 0 ? storyboardRows.length : data.sections.length;
  const { t } = useTranslation();

  return (
    <div className={`agent-inline-card overflow-hidden ${className ?? ''}`}>
      <CompositeHeader
        title={data.title ?? 'Storyboard'}
        count={
          storyboardRows.length > 0
            ? t('chat.storyboardTable.count.shots', { count: rowCount })
            : t('chat.storyboardTable.count.rows', { count: rowCount })
        }
        actions={
          plugins && (canvasPayload || cutPayload || assetBatchPayload) ? (
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
              {canvasPayload && (
                <SendToMenu
                  payload={canvasPayload}
                  mediaType="image"
                  plugins={plugins}
                  allowedTargets={['canvas']}
                  hidePrefixLabel
                />
              )}
              {cutPayload && (
                <SendToMenu
                  payload={cutPayload}
                  mediaType="image"
                  plugins={plugins}
                  allowedTargets={['cut']}
                  hidePrefixLabel
                />
              )}
              {assetBatchPayload && (
                <SendToMenu
                  payload={assetBatchPayload}
                  mediaType="image"
                  plugins={plugins}
                  allowedTargets={['explorer']}
                  hidePrefixLabel
                />
              )}
            </div>
          ) : null
        }
      />
      {storyboardRows.length > 0 ? (
        <SemanticStoryboardTable rows={storyboardRows} />
      ) : (
        <ProjectedStoryboardRows sections={data.sections} />
      )}
      <Diagnostics diagnostics={data.diagnostics} aggregate />
    </div>
  );
}

interface SemanticStoryboardRow {
  readonly id: string;
  readonly rowIndex: number;
  readonly scene: StoryboardSceneRow;
  readonly shot: StoryboardShotRow;
  readonly section?: ResolvedCompositeSection;
  readonly animationOverlay?: StoryboardShotPlanOverlay;
}

function projectSemanticStoryboardRows(
  data: StoryboardTableRichData,
): readonly SemanticStoryboardRow[] {
  const rows: SemanticStoryboardRow[] = [];
  const animationOverlays = createAnimationOverlayIndex(data);
  for (const scene of data.storyboardTable?.scenes ?? []) {
    for (const shot of scene.shots) {
      const rowIndex = rows.length;
      const shotId = shot.shotId ?? `${scene.sceneId}-shot-${shot.shotNumber}`;
      rows.push({
        id: shotId,
        rowIndex,
        scene,
        shot,
        ...(data.sections[rowIndex] ? { section: data.sections[rowIndex] } : {}),
        ...(animationOverlays.get(shotId)
          ? { animationOverlay: animationOverlays.get(shotId) }
          : {}),
      });
    }
  }
  return rows;
}

function createAnimationOverlayIndex(
  data: StoryboardTableRichData,
): ReadonlyMap<string, StoryboardShotPlanOverlay> {
  const index = new Map<string, StoryboardShotPlanOverlay>();
  for (const overlay of data.storyboardPlanOverlays ?? []) {
    if (overlay.overlayType !== 'AnimationPlan') continue;
    for (const shotOverlay of overlay.shotOverlays) {
      index.set(shotOverlay.shotId, shotOverlay);
    }
  }
  return index;
}

function SemanticStoryboardTable({ rows }: { rows: readonly SemanticStoryboardRow[] }) {
  const { t } = useTranslation();
  const groups = groupStoryboardRowsByScene(rows);

  return (
    <div className="overflow-x-auto">
      <table className="w-[1124px] max-w-none table-fixed border-separate border-spacing-0 text-left">
        <colgroup>
          <col className="w-[96px]" />
          <col className="w-[180px]" />
          <col className="w-[56px]" />
          <col className="w-[72px]" />
          <col className="w-[160px]" />
          <col className="w-[100px]" />
          <col className="w-[120px]" />
          <col className="w-[130px]" />
          <col className="w-[90px]" />
          <col className="w-[120px]" />
        </colgroup>
        <thead>
          <tr className="bg-[var(--agent-elevated)] text-[10px] uppercase text-[var(--agent-fg-secondary)]">
            {STORYBOARD_TABLE_COLUMNS.map((columnKey) => (
              <TableHeader key={columnKey}>{t(columnKey)}</TableHeader>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <SemanticStoryboardSceneGroup key={group.id} group={group} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface SemanticStoryboardSceneGroup {
  readonly id: string;
  readonly scene: StoryboardSceneRow;
  readonly rows: readonly SemanticStoryboardRow[];
}

function groupStoryboardRowsByScene(
  rows: readonly SemanticStoryboardRow[],
): readonly SemanticStoryboardSceneGroup[] {
  const groups: Array<{
    id: string;
    scene: StoryboardSceneRow;
    rows: SemanticStoryboardRow[];
  }> = [];
  let current:
    | {
        id: string;
        scene: StoryboardSceneRow;
        rows: SemanticStoryboardRow[];
      }
    | undefined;

  for (const row of rows) {
    if (!current || current.scene !== row.scene) {
      current = {
        id: `${row.scene.sceneId || 'scene'}:${groups.length + 1}`,
        scene: row.scene,
        rows: [],
      };
      groups.push(current);
    }
    current.rows.push(row);
  }

  return groups;
}

function SemanticStoryboardSceneGroup({ group }: { group: SemanticStoryboardSceneGroup }) {
  return (
    <>
      <SemanticStoryboardSceneHeader scene={group.scene} shotCount={group.rows.length} />
      {group.rows.map((row) => (
        <SemanticStoryboardTableRow key={row.id} row={row} />
      ))}
    </>
  );
}

function SemanticStoryboardSceneHeader({
  scene,
  shotCount,
}: {
  scene: StoryboardSceneRow;
  shotCount: number;
}) {
  const { t } = useTranslation();
  const title = scene.sceneTitle || scene.sceneId;
  const meta = compactStrings([
    scene.sceneNumber
      ? t('chat.storyboardTable.scene.number', { number: scene.sceneNumber })
      : undefined,
    scene.sceneId,
    scene.location
      ? t('chat.storyboardTable.scene.location', { location: scene.location })
      : undefined,
    scene.timeOfDay
      ? t('chat.storyboardTable.scene.timeOfDay', { timeOfDay: scene.timeOfDay })
      : undefined,
    t('chat.storyboardTable.scene.shots', { count: shotCount }),
  ]);

  return (
    <tr className="bg-[color-mix(in_srgb,var(--agent-accent)_12%,var(--agent-elevated))]">
      <td
        colSpan={STORYBOARD_TABLE_COLUMN_COUNT}
        className="border-b border-[var(--agent-divider)] px-2 py-2"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 break-words text-[12px] font-medium text-[var(--agent-fg)]">
            {title}
          </span>
          {meta.length > 0 && (
            <span className="break-words font-mono text-[10px] text-[var(--agent-fg-secondary)]">
              {meta.join(' / ')}
            </span>
          )}
        </div>
        {scene.summary && (
          <div className="mt-1 whitespace-pre-wrap break-words text-[10px] leading-relaxed text-[var(--agent-fg-secondary)]">
            {scene.summary}
          </div>
        )}
      </td>
    </tr>
  );
}

function SemanticStoryboardTableRow({ row }: { row: SemanticStoryboardRow }) {
  const { t } = useTranslation();
  const { shot, section } = row;
  const camera = compactStrings([shot.shotScale, shot.cameraAngle, shot.cameraMovement]).join(
    ' / ',
  );
  const characters = formatCharacters(shot.characters);
  const emotion = formatList(shot.emotion);
  const tags = formatList(shot.sceneTags);
  const vfx = formatList(shot.vfx);
  const dialogue = formatStoryboardTextAndVoice(shot, t);
  const supplementalAudio = formatSupplementalAudio(shot, t);
  const cueDisplay = compactStrings([dialogue, supplementalAudio]).join('\n');
  const style = compactStrings([
    shot.visualStyle ? `${t('chat.storyboardTable.labels.style')}: ${shot.visualStyle}` : undefined,
    vfx ? `${t('chat.storyboardTable.labels.vfx')}: ${vfx}` : undefined,
    shot.generationPrompt
      ? `${t('chat.storyboardTable.labels.prompt')}: ${shot.generationPrompt}`
      : undefined,
  ]).join('\n');
  const animation = formatAnimationOverlay(row.animationOverlay, t);

  return (
    <tr className="align-top text-[11px] text-[var(--agent-fg)] odd:bg-[color-mix(in_srgb,var(--agent-elevated)_40%,transparent)]">
      <TableCell className="w-[96px]">
        <div className="font-mono text-[11px] font-medium">{formatShotNumber(shot.shotNumber)}</div>
        {shot.shotId && (
          <div className="mt-1 break-words font-mono text-[10px] text-[var(--agent-fg-secondary)]">
            {shot.shotId}
          </div>
        )}
      </TableCell>
      <TableCell className="w-[180px] max-w-[180px]">
        {section && section.media.length > 0 ? (
          <div className="grid gap-1">
            {section.media.map((media) => (
              <MediaPreview key={media.id} media={media} compact />
            ))}
          </div>
        ) : (
          <span className="text-[var(--agent-fg-secondary)]">-</span>
        )}
        {section && <Diagnostics diagnostics={section.diagnostics} />}
      </TableCell>
      <TableCell className="w-[56px] font-mono">{formatDuration(shot.duration)}</TableCell>
      <TableCell className="w-[72px] whitespace-pre-wrap">{camera || '-'}</TableCell>
      <TableCell className="w-[160px]">
        <div className="whitespace-pre-wrap break-words">{shot.visualDescription}</div>
        <div className="mt-1 whitespace-pre-wrap break-words text-[var(--agent-fg-secondary)]">
          {shot.characterAction}
        </div>
        {emotion && (
          <div className="mt-1 break-words text-[10px] text-[var(--agent-fg-secondary)]">
            {t('chat.storyboardTable.labels.emotion')}: {emotion}
          </div>
        )}
        {tags && (
          <div className="mt-1 break-words text-[10px] text-[var(--agent-fg-secondary)]">
            {t('chat.storyboardTable.labels.tags')}: {tags}
          </div>
        )}
      </TableCell>
      <TableCell className="w-[100px] whitespace-pre-wrap break-words">
        {characters || '-'}
      </TableCell>
      <TableCell className="w-[120px] whitespace-pre-wrap break-words">
        {cueDisplay || supplementalAudio || '-'}
      </TableCell>
      <TableCell className="w-[130px] whitespace-pre-wrap break-words">{style || '-'}</TableCell>
      <TableCell className="w-[90px] whitespace-pre-wrap break-words">
        <div className="font-medium">{shot.imageStrategy}</div>
        {shot.decisionReason && (
          <div className="mt-1 text-[var(--agent-fg-secondary)]">{shot.decisionReason}</div>
        )}
      </TableCell>
      <TableCell className="w-[120px] whitespace-pre-wrap break-words">
        {animation || '-'}
      </TableCell>
    </tr>
  );
}

function TableHeader({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-[var(--agent-divider)] px-2 py-1.5 font-medium tracking-normal">
      {children}
    </th>
  );
}

function TableCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`border-b border-[var(--agent-divider)] px-2 py-2 ${className ?? ''}`}>
      {children}
    </td>
  );
}

const STORYBOARD_TABLE_COLUMNS = [
  'chat.storyboardTable.columns.shot',
  'chat.storyboardTable.columns.image',
  'chat.storyboardTable.columns.duration',
  'chat.storyboardTable.columns.camera',
  'chat.storyboardTable.columns.visualAction',
  'chat.storyboardTable.columns.characters',
  'chat.storyboardTable.columns.dialogueSfx',
  'chat.storyboardTable.columns.stylePrompt',
  'chat.storyboardTable.columns.strategy',
  'chat.storyboardTable.columns.animation',
] as const;

const STORYBOARD_TABLE_COLUMN_COUNT = STORYBOARD_TABLE_COLUMNS.length;

function ProjectedStoryboardRows({ sections }: { sections: readonly ResolvedCompositeSection[] }) {
  return (
    <div className="divide-y divide-[var(--agent-divider)]">
      {sections.map((section) => (
        <div
          key={section.id}
          className="grid gap-2 px-2 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(240px,440px)]"
        >
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded bg-[var(--agent-elevated)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--agent-fg-secondary)]">
                {String(section.index + 1).padStart(2, '0')}
              </span>
              {section.heading && (
                <span className="truncate text-[12px] font-medium text-[var(--agent-fg)]">
                  {section.heading}
                </span>
              )}
            </div>
            {section.content && (
              <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[var(--agent-fg)]">
                {section.content}
              </p>
            )}
            <Diagnostics diagnostics={section.diagnostics} />
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-1">
            {section.media.map((media) => (
              <MediaPreview key={media.id} media={media} compact />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatShotNumber(shotNumber: number): string {
  return `#${String(shotNumber).padStart(2, '0')}`;
}

function formatDuration(duration: number): string {
  return `${Number.isFinite(duration) ? duration : 0}s`;
}

function formatCharacters(characters: StoryboardShotRow['characters']): string | undefined {
  const text = (characters ?? [])
    .map((character) =>
      compactStrings([
        character.name,
        character.role ? `(${character.role})` : undefined,
        character.action,
        character.emotion,
        character.appearanceNotes,
      ]).join(' '),
    )
    .filter((value) => value.length > 0)
    .join(', ');
  return text || undefined;
}

function formatStoryboardTextAndVoice(
  shot: StoryboardShotRow,
  t: (key: string) => string,
): string | undefined {
  const textCueLines = (shot.textCues ?? []).map((cue) => formatStoryboardTextCue(cue, t));
  const voiceCueLines = (shot.voiceCues ?? [])
    .filter((cue) => !hasMatchingTextCue(shot.textCues, cue.kind, cue.text))
    .map((cue) => {
      const label =
        cue.kind === 'dialogue'
          ? t('chat.storyboardTable.labels.dialogue')
          : t('chat.storyboardTable.labels.voiceOver');
      const speaker = formatCueSpeaker(
        cue.speakerName,
        cue.speakerCharacterId,
        cue.speakerEntityRef?.entityId,
      );
      return `${label}${speaker ? ` / ${speaker}` : ''}: ${cue.text}`;
    });
  return compactStrings([...textCueLines, ...voiceCueLines]).join('\n') || undefined;
}

function hasMatchingTextCue(
  textCues: StoryboardShotRow['textCues'],
  voiceKind: 'dialogue' | 'voiceOver',
  text: string,
): boolean {
  const expectedKind = voiceKind === 'dialogue' ? 'dialogue' : 'narration';
  const normalizedText = normalizeCueDisplayText(text);
  return (textCues ?? []).some(
    (cue) => cue.kind === expectedKind && normalizeCueDisplayText(cue.text) === normalizedText,
  );
}

function formatStoryboardTextCue(cue: StoryboardTextCue, t: (key: string) => string): string {
  const label = t(`chat.storyboardTable.textCueKinds.${cue.kind}`);
  const speaker = formatCueSpeaker(
    cue.speakerName,
    cue.speakerCharacterId,
    cue.speakerEntityRef?.entityId,
  );
  const suffix = compactStrings([cue.emotion, cue.delivery]).join(' / ');
  return compactStrings([
    `${label}${speaker ? ` / ${speaker}` : ''}: ${cue.text}`,
    suffix ? `(${suffix})` : undefined,
  ]).join(' ');
}

function formatSupplementalAudio(
  shot: StoryboardShotRow,
  t: (key: string) => string,
): string | undefined {
  const hasDialogueCue =
    (shot.textCues ?? []).some((cue) => cue.kind === 'dialogue') ||
    (shot.voiceCues ?? []).some((cue) => cue.kind === 'dialogue');
  const hasVoiceOverCue =
    (shot.textCues ?? []).some((cue) => cue.kind === 'narration') ||
    (shot.voiceCues ?? []).some((cue) => cue.kind === 'voiceOver');
  const hasSoundCue = (shot.textCues ?? []).some((cue) => cue.kind === 'sfx');
  return compactStrings([
    shot.dialogue && !hasDialogueCue
      ? `${t('chat.storyboardTable.labels.dialogue')}: ${shot.dialogue}`
      : undefined,
    shot.voiceOver && !hasVoiceOverCue
      ? `${t('chat.storyboardTable.labels.voiceOver')}: ${shot.voiceOver}`
      : undefined,
    shot.soundCue && !hasSoundCue
      ? `${t('chat.storyboardTable.labels.soundCue')}: ${shot.soundCue}`
      : undefined,
  ]).join('\n');
}

function formatAnimationOverlay(
  overlay: StoryboardShotPlanOverlay | undefined,
  t: (key: string) => string,
): string | undefined {
  if (!overlay) return undefined;
  const imagePrep = overlay.imagePrep?.operations?.join(', ') ?? overlay.imagePrep?.notes;
  const providerHints = overlay.providerHints
    ?.map((hint) => compactStrings([hint.providerId, hint.modelId, hint.capabilityId]).join('/'))
    .filter((value) => value.length > 0)
    .join(', ');
  const requirements = compactStrings([
    overlay.requiresImagePrep ? t('chat.storyboardTable.animation.requiresImagePrep') : undefined,
    overlay.requiresVideoGeneration
      ? t('chat.storyboardTable.animation.requiresVideoGeneration')
      : undefined,
  ]).join(', ');
  return compactStrings([
    overlay.motionIntent
      ? `${t('chat.storyboardTable.animation.motion')}: ${overlay.motionIntent}`
      : undefined,
    overlay.cameraIntent
      ? `${t('chat.storyboardTable.animation.camera')}: ${overlay.cameraIntent}`
      : undefined,
    imagePrep ? `${t('chat.storyboardTable.animation.imagePrep')}: ${imagePrep}` : undefined,
    overlay.videoPromptIntent?.positive
      ? `${t('chat.storyboardTable.animation.videoPrompt')}: ${overlay.videoPromptIntent.positive}`
      : undefined,
    overlay.audioPromptIntent?.positive
      ? `${t('chat.storyboardTable.animation.audioPrompt')}: ${overlay.audioPromptIntent.positive}`
      : undefined,
    requirements ? `${t('chat.storyboardTable.animation.requires')}: ${requirements}` : undefined,
    providerHints
      ? `${t('chat.storyboardTable.animation.providerHints')}: ${providerHints}`
      : undefined,
    overlay.approvalNotes
      ? `${t('chat.storyboardTable.animation.approval')}: ${overlay.approvalNotes}`
      : undefined,
  ]).join('\n');
}

function formatCueSpeaker(
  speakerName: string | undefined,
  speakerCharacterId: string | undefined,
  speakerEntityId: string | undefined,
): string | undefined {
  if (speakerName && speakerEntityId && speakerName !== speakerEntityId) {
    return `${speakerName} [${speakerEntityId}]`;
  }
  if (speakerName && speakerCharacterId && speakerName !== speakerCharacterId) {
    return `${speakerName} [${speakerCharacterId}]`;
  }
  return speakerName ?? speakerEntityId ?? speakerCharacterId;
}

function normalizeCueDisplayText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function formatList(values: readonly string[] | undefined): string | undefined {
  const text = compactStrings(values).join(', ');
  return text || undefined;
}

function compactStrings(values: readonly (string | undefined | null)[] | undefined): string[] {
  return (values ?? []).filter((value): value is string => Boolean(value && value.trim()));
}

function ComparisonGridRendererComponent({
  data,
  className,
}: RichContentProps<ComparisonGridRichData>) {
  const cells = data.sections.flatMap((section) =>
    section.media.map((media) => ({ section, media })),
  );

  return (
    <div className={`agent-inline-card overflow-hidden ${className ?? ''}`}>
      <CompositeHeader title={data.title ?? 'Comparison'} count={`${cells.length} variants`} />
      <div className="grid gap-2 p-2 sm:grid-cols-2">
        {cells.map(({ section, media }) => (
          <div
            key={`${section.id}:${media.id}`}
            className="min-w-0 rounded border border-[var(--agent-divider)] bg-[var(--agent-elevated)] p-1.5"
          >
            <MediaPreview media={media} />
            <div className="mt-1 min-w-0">
              <div className="truncate text-[11px] font-medium text-[var(--agent-fg)]">
                {media.caption ??
                  section.heading ??
                  media.label ??
                  `Variant ${media.assetIndex + 1}`}
              </div>
              {section.content && (
                <p className="mt-0.5 line-clamp-3 text-[10px] leading-relaxed text-[var(--agent-fg-secondary)]">
                  {section.content}
                </p>
              )}
              <MediaTransferActions media={media} plugins={data.plugins} />
            </div>
          </div>
        ))}
      </div>
      <Diagnostics diagnostics={data.diagnostics} aggregate />
    </div>
  );
}

function AssetGalleryRendererComponent({
  data,
  className,
}: RichContentProps<AssetGalleryRichData>) {
  const assets = data.sections.flatMap((section) =>
    section.media.map((media) => ({ section, media })),
  );

  return (
    <div className={`agent-inline-card overflow-hidden ${className ?? ''}`}>
      <CompositeHeader title={data.title ?? 'Assets'} count={`${assets.length} assets`} />
      <div className="grid gap-2 p-2 sm:grid-cols-3">
        {assets.map(({ section, media }) => (
          <div
            key={`${section.id}:${media.id}`}
            className="min-w-0 rounded border border-[var(--agent-divider)] bg-[var(--agent-elevated)] p-1.5"
          >
            <MediaPreview media={media} />
            <div className="mt-1 flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--agent-fg-secondary)]">
                {media.caption ?? section.heading ?? media.label ?? media.assetId ?? 'Asset'}
              </span>
              {media.localPath && (
                <button
                  type="button"
                  className="rounded border border-[var(--agent-input-border)] px-1.5 py-0.5 text-[10px] text-[var(--agent-fg)] hover:bg-[var(--agent-hover)]"
                  onClick={() => VSCodeMessages.openFile(media.localPath!)}
                >
                  Open
                </button>
              )}
              <MediaTransferActions media={media} plugins={data.plugins} />
            </div>
          </div>
        ))}
      </div>
      <Diagnostics diagnostics={data.diagnostics} aggregate />
    </div>
  );
}

function CompositeHeader({
  title,
  count,
  actions,
}: {
  title: string;
  count: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--agent-divider)] bg-[var(--agent-elevated)] px-2 py-1.5">
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--agent-fg)]">
        {title}
      </span>
      {actions ? (
        <div className="flex max-w-full shrink-0 flex-wrap justify-end">{actions}</div>
      ) : null}
      <span className="shrink-0 text-[10px] text-[var(--agent-fg-secondary)]">{count}</span>
    </div>
  );
}

function MediaPreview({
  media,
  compact = false,
}: {
  media: ResolvedCompositeMedia;
  compact?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const label = media.caption ?? media.label ?? media.assetId ?? 'Media';
  const imagePreviewFrameClassName = compact
    ? 'inline-flex max-h-[220px] max-w-[170px]'
    : 'flex h-[220px] max-h-[220px] w-full';
  const previewImageClassName = compact
    ? 'h-auto max-h-[220px] w-auto max-w-full object-contain'
    : 'h-full w-full object-contain';
  const fallbackPreviewFrameClassName = compact
    ? 'h-[160px] max-h-[160px]'
    : 'h-[220px] max-h-[220px]';
  const roleLabel = formatMediaRole(media.role);
  const hasRenderableSource = media.src.trim().length > 0;
  const canOpen = canOpenMedia(media);

  if (media.type === 'image') {
    return (
      <div className="min-w-0">
        <button
          type="button"
          className={`min-w-0 items-center justify-center overflow-hidden rounded border border-[var(--agent-divider)] bg-[var(--vscode-editor-background)] disabled:cursor-default ${imagePreviewFrameClassName}`}
          onClick={() => openMedia(media)}
          disabled={!canOpen}
          title={label}
        >
          {hasRenderableSource && !imageFailed ? (
            <img
              src={media.src}
              alt={label}
              className={previewImageClassName}
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <MediaPreviewFallback mediaType={media.type} label={label} compact={compact} />
          )}
        </button>
        {roleLabel && (
          <div className="mt-0.5 truncate text-[9px] leading-tight text-[var(--agent-fg-secondary)]">
            {roleLabel}
          </div>
        )}
      </div>
    );
  }

  if (media.type === 'video') {
    if (!hasRenderableSource) {
      return (
        <MediaPreviewFallbackFrame
          media={media}
          label={label}
          compact={compact}
          previewHeightClassName={fallbackPreviewFrameClassName}
        />
      );
    }
    return (
      <video
        src={media.src}
        controls
        preload="metadata"
        className={`w-full rounded bg-black object-contain ${fallbackPreviewFrameClassName}`}
        title={label}
      />
    );
  }

  if (media.type === 'audio') {
    if (!hasRenderableSource) {
      return (
        <MediaPreviewFallbackFrame
          media={media}
          label={label}
          compact={compact}
          previewHeightClassName="min-h-[42px]"
        />
      );
    }
    return <audio src={media.src} controls className="w-full" title={label} />;
  }

  if (media.type === 'model') {
    return (
      <button
        type="button"
        className="flex w-full items-center justify-center rounded border border-[var(--agent-divider)] bg-[var(--vscode-editor-background)] px-2 py-4 text-[10px] text-[var(--agent-fg-secondary)]"
        onClick={() => openMedia(media)}
        title={label}
      >
        3D Model - {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="flex w-full items-center justify-center rounded border border-[var(--agent-divider)] bg-[var(--vscode-editor-background)] px-2 py-4 text-[10px] text-[var(--agent-fg-secondary)]"
      onClick={() => openMedia(media)}
      title={label}
    >
      {label}
    </button>
  );
}

function MediaPreviewFallbackFrame({
  media,
  label,
  compact,
  previewHeightClassName,
}: {
  media: ResolvedCompositeMedia;
  label: string;
  compact: boolean;
  previewHeightClassName: string;
}) {
  const canOpen = canOpenMedia(media);
  return (
    <button
      type="button"
      className={`flex w-full min-w-0 overflow-hidden rounded border border-[var(--agent-divider)] bg-[var(--vscode-editor-background)] disabled:cursor-default ${previewHeightClassName}`}
      onClick={() => openMedia(media)}
      disabled={!canOpen}
      title={label}
    >
      <MediaPreviewFallback mediaType={media.type} label={label} compact={compact} />
    </button>
  );
}

function MediaPreviewFallback({
  mediaType,
  label,
  compact,
}: {
  mediaType: CompositeMediaType;
  label: string;
  compact: boolean;
}) {
  return (
    <div className="flex h-full w-full min-w-0 flex-col items-center justify-center gap-0.5 px-2 text-center text-[var(--agent-fg-secondary)]">
      <span className="font-mono text-[9px] uppercase tracking-normal">
        {formatMediaTypeLabel(mediaType)}
      </span>
      <span
        className={`${compact ? 'line-clamp-2 text-[9px]' : 'line-clamp-3 text-[10px]'} max-w-full break-all font-medium leading-snug text-[var(--agent-fg)]`}
      >
        {label}
      </span>
      <span className="text-[9px] leading-tight">Preview unavailable</span>
    </div>
  );
}

function formatMediaTypeLabel(mediaType: CompositeMediaType): string {
  switch (mediaType) {
    case 'image':
      return 'Image';
    case 'video':
      return 'Video';
    case 'audio':
      return 'Audio';
    case 'model':
      return 'Model';
    default:
      return 'Media';
  }
}

function formatMediaRole(role: string | undefined): string | undefined {
  switch (role) {
    case 'original':
      return 'Original';
    case 'colorized':
      return 'Color';
    case 'generated':
      return 'Generated';
    default:
      return role;
  }
}

function MediaTransferActions({
  media,
  plugins,
}: {
  media: ResolvedCompositeMedia;
  plugins?: AssetGalleryRichData['plugins'];
}) {
  if (!plugins || !media.localPath) return null;
  const mediaType = toPluginTransferMediaType(media.type);
  if (!mediaType) return null;

  return (
    <SendToMenu
      assetPath={media.localPath}
      mediaType={mediaType}
      plugins={plugins}
      allowedTargets={mediaType === 'model' ? ['model', 'explorer'] : undefined}
    />
  );
}

function toPluginTransferMediaType(
  mediaType: CompositeMediaType,
): 'image' | 'video' | 'audio' | 'model' | null {
  if (
    mediaType === 'image' ||
    mediaType === 'video' ||
    mediaType === 'audio' ||
    mediaType === 'model'
  ) {
    return mediaType;
  }
  return null;
}

function Diagnostics({
  diagnostics,
  aggregate = false,
}: {
  diagnostics: readonly CompositeMediaDiagnostic[];
  aggregate?: boolean;
}) {
  if (diagnostics.length === 0) return null;

  const visible = aggregate ? dedupeDiagnostics(diagnostics) : diagnostics;
  if (visible.length === 0) return null;

  return (
    <div
      className={`${aggregate ? 'border-t border-[var(--agent-divider)] px-2 py-1.5' : 'mt-1'} space-y-1`}
    >
      {visible.map((diagnostic) => (
        <div
          key={`${diagnostic.code}:${diagnostic.toolCallId}:${diagnostic.assetIndex ?? 'x'}:${diagnostic.assetId ?? ''}`}
          className="rounded bg-[color-mix(in_srgb,var(--agent-warning-fg)_10%,transparent)] px-1.5 py-1 text-[10px] text-[var(--agent-warning-fg)]"
        >
          {diagnostic.message}
        </div>
      ))}
    </div>
  );
}

function openMedia(media: ResolvedCompositeMedia): void {
  if (media.localPath) {
    VSCodeMessages.openFile(media.localPath);
    return;
  }
  if (media.src) {
    VSCodeMessages.openUrl(media.src);
  }
}

function canOpenMedia(media: ResolvedCompositeMedia): boolean {
  return Boolean(media.localPath || media.src);
}

function dedupeDiagnostics(
  diagnostics: readonly CompositeMediaDiagnostic[],
): readonly CompositeMediaDiagnostic[] {
  const seen = new Set<string>();
  const result: CompositeMediaDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.code}:${diagnostic.toolCallId}:${diagnostic.assetIndex ?? ''}:${diagnostic.assetId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(diagnostic);
  }
  return result;
}

function isCompositeData<T extends string>(data: unknown, template: T): data is { template: T } {
  if (typeof data !== 'object' || data === null) return false;
  const record = data as Record<string, unknown>;
  return record['template'] === template && Array.isArray(record['sections']);
}

export const storyboardTableRendererEntry: RichContentRendererEntry<StoryboardTableRichData> = {
  kind: 'storyboard-table',
  validate: isStoryboardTableRichData,
  component: StoryboardTableRendererComponent,
};

export const comparisonGridRendererEntry: RichContentRendererEntry<ComparisonGridRichData> = {
  kind: 'comparison-grid',
  validate: isComparisonGridRichData,
  component: ComparisonGridRendererComponent,
};

export const assetGalleryRendererEntry: RichContentRendererEntry<AssetGalleryRichData> = {
  kind: 'asset-gallery',
  validate: isAssetGalleryRichData,
  component: AssetGalleryRendererComponent,
};
