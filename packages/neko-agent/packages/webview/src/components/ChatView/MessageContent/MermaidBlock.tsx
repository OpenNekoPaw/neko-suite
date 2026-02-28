/**
 * MermaidBlock - Mermaid diagram rendering component
 * Renders mermaid diagram from code with VSCode theme support
 * Uses dynamic import to avoid build-time d3 compatibility issues
 *
 * Features:
 * - Fullscreen mode with zoom and pan
 * - Zoom controls (zoom in/out/reset)
 * - Drag to pan when zoomed
 * - SVG download and source code copy
 */

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { vscode } from '../../hooks/useVSCode';
import { getLogger } from '../../../utils/logger';

const logger = getLogger('MermaidBlock');

interface MermaidBlockProps {
  code: string;
}

// Zoom configuration
const ZOOM_CONFIG = {
  min: 0.25,
  max: 4,
  step: 0.25,
  default: 1,
};

// Generate unique ID for each mermaid diagram
let mermaidId = 0;
const getMermaidId = () => `mermaid-${++mermaidId}-${Date.now()}`;

// Mermaid instance (lazy loaded)
let mermaidInstance: typeof import('mermaid') | null = null;
let mermaidLoading: Promise<typeof import('mermaid')> | null = null;

async function getMermaid() {
  if (mermaidInstance) return mermaidInstance;

  if (!mermaidLoading) {
    mermaidLoading = import('mermaid').then((mod) => {
      mermaidInstance = mod;
      // Initialize mermaid with custom theme for better contrast
      // Using 'base' theme with custom variables for VSCode integration
      mod.default.initialize({
        startOnLoad: false,
        theme: 'base',
        securityLevel: 'loose',
        fontFamily: 'var(--vscode-font-family)',
        // Custom theme variables for high contrast and VSCode integration
        themeVariables: {
          // Background and text colors - high contrast
          primaryColor: '#4fc3f7',      // Light blue for main nodes
          primaryTextColor: '#1a1a1a',  // Dark text on light nodes
          primaryBorderColor: '#29b6f6',
          secondaryColor: '#81c784',    // Light green for secondary
          secondaryTextColor: '#1a1a1a',
          secondaryBorderColor: '#66bb6a',
          tertiaryColor: '#fff176',     // Light yellow for tertiary
          tertiaryTextColor: '#1a1a1a',
          tertiaryBorderColor: '#fdd835',
          // Line and edge colors
          lineColor: '#90a4ae',         // Muted blue-gray for lines
          textColor: '#e0e0e0',         // Light text for labels
          // Background
          background: 'transparent',
          mainBkg: '#4fc3f7',
          nodeBorder: '#29b6f6',
          // Flowchart specific
          clusterBkg: 'rgba(79, 195, 247, 0.15)',
          clusterBorder: '#4fc3f7',
          defaultLinkColor: '#90a4ae',
          titleColor: '#e0e0e0',
          edgeLabelBackground: '#2d2d2d',
          // Sequence diagram
          actorBkg: '#4fc3f7',
          actorBorder: '#29b6f6',
          actorTextColor: '#1a1a1a',
          actorLineColor: '#90a4ae',
          signalColor: '#90a4ae',
          signalTextColor: '#e0e0e0',
          labelBoxBkgColor: '#4fc3f7',
          labelBoxBorderColor: '#29b6f6',
          labelTextColor: '#1a1a1a',
          loopTextColor: '#e0e0e0',
          noteBkgColor: '#fff176',
          noteTextColor: '#1a1a1a',
          noteBorderColor: '#fdd835',
          activationBkgColor: '#81c784',
          activationBorderColor: '#66bb6a',
          // Class diagram
          classText: '#1a1a1a',
          // State diagram
          labelColor: '#e0e0e0',
          // Git graph
          git0: '#4fc3f7',
          git1: '#81c784',
          git2: '#fff176',
          git3: '#ef9a9a',
          git4: '#ce93d8',
          git5: '#ffcc80',
          git6: '#80deea',
          git7: '#a5d6a7',
          gitBranchLabel0: '#1a1a1a',
          gitBranchLabel1: '#1a1a1a',
          gitBranchLabel2: '#1a1a1a',
          gitBranchLabel3: '#1a1a1a',
          // Pie chart
          pie1: '#4fc3f7',
          pie2: '#81c784',
          pie3: '#fff176',
          pie4: '#ef9a9a',
          pie5: '#ce93d8',
          pie6: '#ffcc80',
          pie7: '#80deea',
          pieStrokeColor: '#1a1a1a',
          pieStrokeWidth: '2px',
          pieOuterStrokeColor: '#1a1a1a',
          pieOuterStrokeWidth: '2px',
          pieOpacity: '0.9',
          pieTitleTextSize: '14px',
          pieTitleTextColor: '#e0e0e0',
          pieSectionTextColor: '#1a1a1a',
          pieSectionTextSize: '12px',
          pieLegendTextColor: '#e0e0e0',
          pieLegendTextSize: '12px',
        },
        flowchart: {
          htmlLabels: true,
          curve: 'basis',
          padding: 15,
          nodeSpacing: 50,
          rankSpacing: 50,
        },
        sequence: {
          diagramMarginX: 10,
          diagramMarginY: 10,
          actorMargin: 50,
          width: 150,
          height: 65,
          boxMargin: 10,
          boxTextMargin: 5,
          noteMargin: 10,
          messageMargin: 35,
        },
      });
      return mod;
    });
  }

  return mermaidLoading;
}

/**
 * Extract helpful error hints from mermaid parse errors
 */
function getErrorHints(error: string, code: string): string[] {
  const hints: string[] = [];

  // Check for common issues
  if (error.includes('PS') || error.includes('Expecting') && code.includes('(')) {
    hints.push('Parentheses () in text need to be quoted: ["text (with parens)"]');
  }
  if (code.includes('[') && code.includes(']') && (code.includes('(') || code.includes('{'))) {
    hints.push('Special characters inside [] nodes need escaping or quotes');
  }
  if (error.includes('Lexical error') || error.includes('Parse error')) {
    hints.push('Check for unmatched brackets, quotes, or special characters');
  }
  if (code.includes('-->') && code.includes('->')) {
    hints.push('Arrow styles should be consistent (use --> or ->)');
  }

  return hints;
}

/**
 * Fullscreen Modal Component with zoom and pan controls
 */
interface FullscreenModalProps {
  svg: string;
  onClose: () => void;
  onDownload: () => void;
  onCopy: () => void;
  copied: boolean;
}

function FullscreenModal({ svg, onClose, onDownload, onCopy, copied }: FullscreenModalProps) {
  const [zoom, setZoom] = useState(ZOOM_CONFIG.default);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + ZOOM_CONFIG.step, ZOOM_CONFIG.max));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - ZOOM_CONFIG.step, ZOOM_CONFIG.min));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoom(ZOOM_CONFIG.default);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Fit to screen
  const handleFitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const svgElement = container.querySelector('svg');
    if (!svgElement) return;

    const containerRect = container.getBoundingClientRect();
    const svgRect = svgElement.getBoundingClientRect();
    const scaleX = (containerRect.width - 80) / (svgRect.width / zoom);
    const scaleY = (containerRect.height - 80) / (svgRect.height / zoom);
    const newZoom = Math.min(scaleX, scaleY, ZOOM_CONFIG.max);

    setZoom(Math.max(newZoom, ZOOM_CONFIG.min));
    setPosition({ x: 0, y: 0 });
  }, [zoom]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_CONFIG.step : ZOOM_CONFIG.step;
    setZoom((prev) => Math.max(ZOOM_CONFIG.min, Math.min(ZOOM_CONFIG.max, prev + delta)));
  }, []);

  // Drag to pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  }, [position]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-') {
        handleZoomOut();
      } else if (e.key === '0') {
        handleZoomReset();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, handleZoomIn, handleZoomOut, handleZoomReset]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-[var(--vscode-editor-background)]"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Header toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--vscode-titleBar-activeBackground)] border-b border-[var(--vscode-panel-border)]">
        <div className="flex items-center gap-2">
          <MermaidIcon className="w-4 h-4" />
          <span className="text-[12px] font-medium text-[var(--vscode-foreground)]">
            Mermaid Diagram
          </span>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleFitToScreen}
            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-foreground)] transition-colors"
            title="Fit to screen (F)"
          >
            <FitIcon className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-4 bg-[var(--vscode-panel-border)] mx-1" />
          <button
            onClick={handleZoomOut}
            disabled={zoom <= ZOOM_CONFIG.min}
            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-foreground)] transition-colors disabled:opacity-40"
            title="Zoom out (-)"
          >
            <ZoomOutIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleZoomReset}
            className="px-2 py-1 text-[11px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-foreground)] transition-colors min-w-[48px] text-center"
            title="Reset zoom (0)"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= ZOOM_CONFIG.max}
            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-foreground)] transition-colors disabled:opacity-40"
            title="Zoom in (+)"
          >
            <ZoomInIcon className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-4 bg-[var(--vscode-panel-border)] mx-1" />
          <button
            onClick={onDownload}
            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-foreground)] transition-colors"
            title="Download SVG"
          >
            <DownloadIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onCopy}
            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-foreground)] transition-colors"
            title={copied ? 'Copied!' : 'Copy source'}
          >
            {copied ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
          </button>
          <div className="w-px h-4 bg-[var(--vscode-panel-border)] mx-1" />
          <button
            onClick={onClose}
            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-foreground)] transition-colors"
            title="Close (Esc)"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Diagram container with pan/zoom */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
      >
        <div
          className="w-full h-full flex items-center justify-center"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          }}
        >
          <div
            className="mermaid-diagram-fullscreen p-8"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      </div>

      {/* Footer hint */}
      <div className="px-4 py-1.5 text-[10px] text-[var(--vscode-descriptionForeground)] text-center border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-titleBar-activeBackground)]">
        Scroll to zoom • Drag to pan • Press Esc to close
      </div>
    </div>,
    document.body
  );
}

function MermaidBlockComponent({ code }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isRendering, setIsRendering] = useState(true);
  const [showSource, setShowSource] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const idRef = useRef(getMermaidId());

  // Render mermaid diagram
  useEffect(() => {
    let cancelled = false;

    const renderDiagram = async () => {
      if (!code.trim()) {
        setError('Empty mermaid code');
        setIsRendering(false);
        return;
      }

      try {
        setIsRendering(true);
        setError(null);

        // Load mermaid dynamically
        const mermaidModule = await getMermaid();
        const mermaid = mermaidModule.default;

        if (cancelled) return;

        // Validate syntax first
        const isValid = await mermaid.parse(code);
        if (!isValid && !cancelled) {
          setError('Invalid mermaid syntax');
          setIsRendering(false);
          return;
        }

        // Render the diagram
        const { svg: renderedSvg } = await mermaid.render(idRef.current, code);

        if (!cancelled) {
          setSvg(renderedSvg);
          setIsRendering(false);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to render diagram';
          setError(message);
          setIsRendering(false);
        }
      }
    };

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [code]);

  // Copy source code
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error('Failed to copy mermaid code:', err);
    }
  }, [code]);

  // Download as SVG
  const handleDownload = useCallback(() => {
    if (!svg) return;

    // Try VSCode postMessage first (for webview environment)
    if (vscode) {
      vscode.postMessage({
        type: 'downloadSvg',
        svg,
        filename: 'mermaid-diagram.svg',
      });
      return;
    }

    // Fallback: browser download
    try {
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mermaid-diagram.svg';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      // Delay cleanup to ensure download starts
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      logger.error('Failed to download SVG:', err);
    }
  }, [svg]);

  // Send feedback to LLM about the error
  const handleReportError = useCallback(() => {
    if (!error || feedbackSent) return;

    const hints = getErrorHints(error, code);
    const feedbackMessage = `The Mermaid diagram you generated has a syntax error and failed to render.

**Error:** ${error}

${hints.length > 0 ? `**Hints:**\n${hints.map(h => `- ${h}`).join('\n')}\n\n` : ''}**Original code:**
\`\`\`mermaid
${code}
\`\`\`

Please fix the Mermaid syntax. Common issues:
1. Use quotes for text with special characters: \`A["text (with parens)"]\`
2. Escape special characters in node labels
3. Ensure all brackets and quotes are properly matched`;

    // Send message to extension to add as user feedback
    vscode?.postMessage({
      type: 'mermaidError',
      error,
      code,
      feedbackMessage,
    });

    setFeedbackSent(true);
  }, [error, code, feedbackSent]);

  // Toggle source code visibility
  const toggleSource = useCallback(() => {
    setShowSource(prev => !prev);
  }, []);

  const errorHints = error ? getErrorHints(error, code) : [];

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-[var(--vscode-panel-border)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--vscode-titleBar-activeBackground)] border-b border-[var(--vscode-panel-border)]">
        <span className="text-[10px] text-[var(--vscode-descriptionForeground)] uppercase font-medium flex items-center gap-1.5">
          <MermaidIcon className="w-3.5 h-3.5" />
          Mermaid
          {error && (
            <span className="text-[var(--vscode-errorForeground)] normal-case">
              · Error
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          {/* Fullscreen button */}
          {svg && (
            <button
              onClick={() => setIsFullscreen(true)}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-foreground)] transition-colors"
              title="Fullscreen (zoom & pan)"
            >
              <FullscreenIcon className="w-3 h-3" />
              <span>Expand</span>
            </button>
          )}
          {/* Download button */}
          {svg && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-foreground)] transition-colors"
              title="Download SVG"
            >
              <DownloadIcon className="w-3 h-3" />
              <span>SVG</span>
            </button>
          )}
          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-foreground)] transition-colors"
            title={copied ? 'Copied!' : 'Copy source'}
          >
            {copied ? (
              <>
                <CheckIcon className="w-3 h-3" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <CopyIcon className="w-3 h-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Diagram content */}
      <div
        ref={containerRef}
        className="bg-[var(--vscode-editor-background)] min-h-[80px] flex items-center justify-center overflow-x-auto w-full max-w-full"
      >
        {isRendering ? (
          <div className="flex items-center gap-2 text-[var(--vscode-descriptionForeground)] py-6">
            <LoadingSpinner className="w-4 h-4 animate-spin" />
            <span className="text-[12px]">Rendering diagram...</span>
          </div>
        ) : error ? (
          <div className="w-full">
            {/* Error card */}
            <div className="m-3 rounded-lg border border-[var(--vscode-inputValidation-errorBorder)] bg-[color-mix(in_srgb,var(--vscode-inputValidation-errorBackground,#5a1d1d)_30%,transparent)] overflow-hidden">
              {/* Error header */}
              <div className="px-3 py-2 flex items-center gap-2 border-b border-[var(--vscode-inputValidation-errorBorder)] bg-[color-mix(in_srgb,var(--vscode-inputValidation-errorBackground,#5a1d1d)_50%,transparent)]">
                <ErrorIcon className="w-4 h-4 text-[var(--vscode-errorForeground)]" />
                <span className="text-[12px] font-medium text-[var(--vscode-errorForeground)]">
                  Failed to render diagram
                </span>
              </div>

              {/* Error content */}
              <div className="p-3 space-y-3">
                {/* Error message */}
                <div className="text-[11px] text-[var(--vscode-foreground)] font-mono bg-[var(--vscode-textCodeBlock-background)] p-2 rounded overflow-x-auto w-full max-w-full break-all">
                  {error}
                </div>

                {/* Hints */}
                {errorHints.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] text-[var(--vscode-descriptionForeground)] font-medium uppercase">
                      Possible fixes
                    </div>
                    <ul className="text-[11px] text-[var(--vscode-foreground)] space-y-1">
                      {errorHints.map((hint, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-[var(--vscode-charts-yellow)]">•</span>
                          <span>{hint}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleReportError}
                    disabled={feedbackSent}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded transition-colors ${
                      feedbackSent
                        ? 'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-descriptionForeground)] cursor-default'
                        : 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]'
                    }`}
                    title={feedbackSent ? 'Feedback sent' : 'Ask AI to fix this diagram'}
                  >
                    {feedbackSent ? (
                      <>
                        <CheckIcon className="w-3 h-3" />
                        <span>Feedback Sent</span>
                      </>
                    ) : (
                      <>
                        <RefreshIcon className="w-3 h-3" />
                        <span>Ask AI to Fix</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={toggleSource}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] transition-colors"
                  >
                    <CodeIcon className="w-3 h-3" />
                    <span>{showSource ? 'Hide' : 'Show'} Source</span>
                  </button>
                </div>

                {/* Source code (collapsible) */}
                {showSource && (
                  <div className="mt-2">
                    <pre className="p-2 text-[10px] bg-[var(--vscode-textCodeBlock-background)] rounded overflow-x-auto max-h-[200px] text-[var(--vscode-foreground)] w-full max-w-full">
                      <code>{code}</code>
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div
            className="mermaid-diagram p-4 cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
            dangerouslySetInnerHTML={{ __html: svg }}
            onClick={() => setIsFullscreen(true)}
            title="Click to expand"
          />
        )}
      </div>

      {/* Fullscreen modal */}
      {isFullscreen && svg && (
        <FullscreenModal
          svg={svg}
          onClose={() => setIsFullscreen(false)}
          onDownload={handleDownload}
          onCopy={handleCopy}
          copied={copied}
        />
      )}
    </div>
  );
}

export const MermaidBlock = memo(MermaidBlockComponent);

// Icons
function MermaidIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
      />
    </svg>
  );
}

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
      />
    </svg>
  );
}

function FullscreenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
      />
    </svg>
  );
}

function ZoomInIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"
      />
    </svg>
  );
}

function ZoomOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"
      />
    </svg>
  );
}

function FitIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 8V4h4m12 0h-4M4 16v4h4m8 0h4v-4M9 9h6v6H9z"
      />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}
