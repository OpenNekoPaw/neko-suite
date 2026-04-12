import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import { useAssetDiffProtocol } from '../../hooks/useAssetDiffProtocol';
import type { AssetDiffAttributeDiff, AssetDiffTab, AssetDiffViewMode } from './types';

function getSimilarityBadgeClass(similarity: number | null): string {
  if (similarity === null) {
    return 'bg-[var(--vscode-input-background)] text-[var(--vscode-foreground)]';
  }
  if (similarity >= 0.9) {
    return 'bg-[var(--vscode-testing-iconPassed)] text-white';
  }
  if (similarity >= 0.5) {
    return 'bg-[var(--vscode-editorWarning-foreground)] text-black';
  }
  return 'bg-[var(--vscode-testing-iconFailed)] text-white';
}

function SimilarityBadge({ similarity }: { similarity: number | null }): JSX.Element {
  const { t } = useTranslation();

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${getSimilarityBadgeClass(similarity)}`}
    >
      {similarity === null
        ? t('assetDiff.loading')
        : `${(similarity * 100).toFixed(1)}% ${t('assetDiff.similar')}`}
    </span>
  );
}

function ImagePanel({
  title,
  fileName,
  imageUri,
}: {
  title: string;
  fileName: string | null;
  imageUri: string | null;
}): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded border border-[var(--vscode-panel-border)]">
      <div className="border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)] px-3 py-2 text-center">
        <div className="text-xs font-medium">{title}</div>
        {fileName ? (
          <div className="mt-1 truncate text-[10px] text-[var(--vscode-descriptionForeground)]">
            {fileName}
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto bg-[var(--vscode-editor-background)] p-3">
        {imageUri ? (
          <img src={imageUri} alt={title} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs text-[var(--vscode-descriptionForeground)]">
            {t('assetDiff.noFile')}
          </span>
        )}
      </div>
    </div>
  );
}

function SliderPreview({
  imageUriA,
  imageUriB,
  labelA,
  labelB,
}: {
  imageUriA: string;
  imageUriB: string;
  labelA: string;
  labelB: string;
}): JSX.Element {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(0.5);
  const draggingRef = useRef(false);

  const updateFromClientX = (clientX: number) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) {
      return;
    }

    const next = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setPosition(next);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromClientX(event.clientX);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) {
      return;
    }
    updateFromClientX(event.clientX);
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        ref={wrapperRef}
        className="relative inline-block max-h-[70vh] max-w-[80vw] touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <img
          src={imageUriB}
          alt={labelB}
          className="block max-h-[70vh] max-w-[80vw] object-contain"
        />
        <div
          className="absolute inset-y-0 left-0 overflow-hidden"
          style={{ width: `${position * 100}%` }}
        >
          <img
            src={imageUriA}
            alt={labelA}
            className="block max-h-[70vh] max-w-[80vw] object-contain"
          />
        </div>
        <div
          className="absolute inset-y-0 z-10 w-1 -translate-x-1/2 cursor-ew-resize bg-[var(--vscode-button-background)]"
          style={{ left: `${position * 100}%` }}
        >
          <div className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--vscode-button-background)] shadow" />
        </div>
        <span className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-[11px] text-white">
          {labelA}
        </span>
        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-[11px] text-white">
          {labelB}
        </span>
      </div>
    </div>
  );
}

function OverlayPreview({
  imageUriA,
  imageUriB,
  labelA,
  labelB,
}: {
  imageUriA: string;
  imageUriB: string;
  labelA: string;
  labelB: string;
}): JSX.Element {
  const [opacity, setOpacity] = useState(0.5);

  return (
    <div className="flex h-full w-full flex-col items-center gap-4">
      <div className="relative flex flex-1 items-center justify-center">
        <img src={imageUriA} alt={labelA} className="max-h-[70vh] max-w-[80vw] object-contain" />
        <img
          src={imageUriB}
          alt={labelB}
          className="absolute inset-0 m-auto max-h-[70vh] max-w-[80vw] object-contain"
          style={{ opacity }}
        />
      </div>
      <div className="flex items-center gap-3 rounded bg-[var(--vscode-sideBar-background)] px-4 py-2 text-xs">
        <span className="max-w-[180px] truncate" title={labelA}>
          {labelA}
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(opacity * 100)}
          onChange={(event) => setOpacity(Number.parseInt(event.target.value, 10) / 100)}
          className="w-48 cursor-pointer"
        />
        <span className="max-w-[180px] truncate" title={labelB}>
          {labelB}
        </span>
      </div>
    </div>
  );
}

function MediaTab({
  viewMode,
  variantAName,
  variantAFileName,
  variantBName,
  variantBFileName,
  imageUriA,
  imageUriB,
}: {
  viewMode: AssetDiffViewMode;
  variantAName: string;
  variantAFileName: string | null;
  variantBName: string;
  variantBFileName: string | null;
  imageUriA: string | null;
  imageUriB: string | null;
}): JSX.Element {
  const { t } = useTranslation();

  if (!imageUriA && !imageUriB) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--vscode-descriptionForeground)]">
        {t('assetDiff.noFile')}
      </div>
    );
  }

  if (viewMode === 'slider' && imageUriA && imageUriB) {
    return (
      <SliderPreview
        imageUriA={imageUriA}
        imageUriB={imageUriB}
        labelA={variantAFileName ?? variantAName}
        labelB={variantBFileName ?? variantBName}
      />
    );
  }

  if (viewMode === 'overlay' && imageUriA && imageUriB) {
    return (
      <OverlayPreview
        imageUriA={imageUriA}
        imageUriB={imageUriB}
        labelA={variantAFileName ?? variantAName}
        labelB={variantBFileName ?? variantBName}
      />
    );
  }

  return (
    <div className="flex h-full w-full gap-4">
      <ImagePanel title={variantAName} fileName={variantAFileName} imageUri={imageUriA} />
      <ImagePanel title={variantBName} fileName={variantBFileName} imageUri={imageUriB} />
    </div>
  );
}

function AttributeRow({ diff }: { diff: AssetDiffAttributeDiff }): JSX.Element {
  const valueA = diff.valueA ?? '-';
  const valueB = diff.valueB ?? '-';
  const classA = !diff.valueA ? 'line-through text-[var(--vscode-testing-iconFailed)]' : '';
  const classB = !diff.valueB
    ? 'text-[var(--vscode-testing-iconPassed)]'
    : diff.valueA !== diff.valueB
      ? 'text-[var(--vscode-editorWarning-foreground)]'
      : '';

  return (
    <tr className="border-b border-[var(--vscode-panel-border)]">
      <td className="px-3 py-2 text-left font-medium">{diff.attribute}</td>
      <td className={`px-3 py-2 text-left ${classA}`}>{valueA}</td>
      <td className={`px-3 py-2 text-left ${classB}`}>{valueB}</td>
    </tr>
  );
}

function AttributesTab({
  attributeDiffs,
  variantAName,
  variantBName,
}: {
  attributeDiffs: AssetDiffAttributeDiff[];
  variantAName: string;
  variantBName: string;
}): JSX.Element {
  const { t } = useTranslation();

  if (attributeDiffs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--vscode-descriptionForeground)]">
        {t('assetDiff.noChanges')}
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl overflow-auto rounded border border-[var(--vscode-panel-border)]">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-[var(--vscode-sideBar-background)]">
          <tr>
            <th className="px-3 py-2 text-left">{t('assetDiff.attributes')}</th>
            <th className="px-3 py-2 text-left">{variantAName}</th>
            <th className="px-3 py-2 text-left">{variantBName}</th>
          </tr>
        </thead>
        <tbody>
          {attributeDiffs.map((diff) => (
            <AttributeRow key={String(diff.attribute)} diff={diff} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AiTab({
  aiSummary,
  aiLoading,
  onRequestAi,
}: {
  aiSummary: string | null;
  aiLoading: boolean;
  onRequestAi: () => void;
}): JSX.Element {
  const { t } = useTranslation();

  if (aiLoading) {
    return (
      <div className="flex flex-col items-center gap-3 text-sm text-[var(--vscode-descriptionForeground)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--vscode-button-background)] border-t-transparent" />
        <div>{t('assetDiff.analyzing')}</div>
      </div>
    );
  }

  if (aiSummary) {
    return (
      <div className="w-full max-w-3xl rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-editorWidget-background)] p-4 text-sm leading-6 whitespace-pre-wrap">
        {aiSummary}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p className="text-sm text-[var(--vscode-descriptionForeground)]">
        {t('assetDiff.aiAnalysis')}
      </p>
      <button
        type="button"
        className="rounded bg-[var(--vscode-button-background)] px-4 py-2 text-sm text-[var(--vscode-button-foreground)] transition-colors hover:bg-[var(--vscode-button-hoverBackground)]"
        onClick={onRequestAi}
      >
        {t('assetDiff.requestAI')}
      </button>
    </div>
  );
}

const TAB_LABELS: Record<AssetDiffTab, string> = {
  media: 'assetDiff.tabs.media',
  attributes: 'assetDiff.tabs.attributes',
  ai: 'assetDiff.tabs.ai',
};

export default function AssetDiffApp(): JSX.Element {
  const { t } = useTranslation();
  const {
    initialState,
    similarity,
    attributeDiffs,
    aiSummary,
    aiLoading,
    isLoading,
    error,
    sendInit,
    sendRequestAi,
  } = useAssetDiffProtocol();
  const [viewMode, setViewMode] = useState<AssetDiffViewMode>('side-by-side');
  const [activeTab, setActiveTab] = useState<AssetDiffTab>('media');

  useEffect(() => {
    sendInit();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const content = useMemo(() => {
    if (error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
          <div className="text-3xl">⚠️</div>
          <div className="max-w-xl text-sm text-[var(--vscode-errorForeground)]">{error}</div>
          <button
            type="button"
            className="rounded bg-[var(--vscode-button-background)] px-4 py-2 text-sm text-[var(--vscode-button-foreground)] transition-colors hover:bg-[var(--vscode-button-hoverBackground)]"
            onClick={sendInit}
          >
            {t('assetDiff.retry')}
          </button>
        </div>
      );
    }

    if (isLoading && similarity === null) {
      return (
        <div className="flex flex-col items-center gap-3 text-sm text-[var(--vscode-descriptionForeground)]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--vscode-button-background)] border-t-transparent" />
          <div>{t('assetDiff.analyzing')}</div>
        </div>
      );
    }

    if (activeTab === 'media') {
      return (
        <MediaTab
          viewMode={viewMode}
          variantAName={initialState.variantA.name}
          variantAFileName={initialState.variantA.fileName}
          variantBName={initialState.variantB.name}
          variantBFileName={initialState.variantB.fileName}
          imageUriA={initialState.imageUriA}
          imageUriB={initialState.imageUriB}
        />
      );
    }

    if (activeTab === 'attributes') {
      return (
        <AttributesTab
          attributeDiffs={attributeDiffs}
          variantAName={initialState.variantA.name}
          variantBName={initialState.variantB.name}
        />
      );
    }

    return <AiTab aiSummary={aiSummary} aiLoading={aiLoading} onRequestAi={sendRequestAi} />;
  }, [
    activeTab,
    aiLoading,
    aiSummary,
    attributeDiffs,
    error,
    initialState,
    isLoading,
    sendInit,
    sendRequestAi,
    similarity,
    t,
    viewMode,
  ]);

  return (
    <div className="flex h-full flex-col bg-[var(--vscode-editor-background)]">
      <div className="flex items-center gap-4 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{initialState.entity.name}</div>
          <div className="truncate text-xs text-[var(--vscode-descriptionForeground)]">
            {initialState.variantA.name} ↔ {initialState.variantB.name}
          </div>
        </div>
        <SimilarityBadge similarity={similarity} />
        <select
          className="rounded border border-[var(--vscode-dropdown-border)] bg-[var(--vscode-dropdown-background)] px-2 py-1 text-xs text-[var(--vscode-dropdown-foreground)]"
          value={viewMode}
          onChange={(event) => setViewMode(event.target.value as AssetDiffViewMode)}
        >
          <option value="side-by-side">{t('assetDiff.viewMode.sideBySide')}</option>
          <option value="slider">{t('assetDiff.viewMode.slider')}</option>
          <option value="overlay">{t('assetDiff.viewMode.overlay')}</option>
        </select>
      </div>

      <div className="flex border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)]">
        {(['media', 'attributes', 'ai'] as AssetDiffTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`border-b-2 px-4 py-2 text-xs transition-colors ${
              activeTab === tab
                ? 'border-[var(--vscode-textLink-foreground)] text-[var(--vscode-textLink-foreground)]'
                : 'border-transparent text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {t(TAB_LABELS[tab])}
            {tab === 'attributes' ? (
              <span className="ml-2 rounded-full bg-[var(--vscode-badge-background)] px-1.5 py-0.5 text-[10px] text-[var(--vscode-badge-foreground)]">
                {attributeDiffs.length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="flex flex-1 items-center justify-center overflow-auto p-4">{content}</div>
    </div>
  );
}
