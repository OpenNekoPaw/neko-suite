/**
 * Image capture and compression utilities for document preview webviews.
 *
 * Used by EPUB (iframe image extraction) and CBZ (page capture).
 * All compression is done via Canvas API — no external dependencies.
 */

/** Max dimension (px) before downscaling. 1024 fits well within agent context. */
const MAX_DIM = 1024;
/** JPEG quality. 0.75 gives ~4:1 compression over PNG with acceptable quality. */
const JPEG_QUALITY = 0.75;
/**
 * Max base64 length per image (~200 KB raw → ~267 KB base64).
 * Keeps total payload well under Claude's 5 MB input budget for 5 images.
 */
const MAX_B64_LEN = 280_000;

// =============================================================================
// Core compression
// =============================================================================

/**
 * Compress a Blob to a JPEG data URL, downscaling if larger than MAX_DIM.
 * Returns null if the result exceeds the size budget.
 */
export async function compressBlob(
  blob: Blob,
  maxDim = MAX_DIM,
  quality = JPEG_QUALITY,
): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { naturalWidth: w, naturalHeight: h } = img;
      if (w === 0 || h === 0) {
        resolve(null);
        return;
      }
      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);

      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl.length <= MAX_B64_LEN ? dataUrl : null);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Fetch a URL (including blob:) and compress to JPEG data URL.
 * Returns null on network error, decode error, or size overflow.
 */
export async function fetchAndCompress(src: string, maxDim = MAX_DIM): Promise<string | null> {
  try {
    const resp = await fetch(src);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return compressBlob(blob, maxDim);
  } catch {
    return null;
  }
}

// =============================================================================
// epubjs iframe image extractor
// =============================================================================

export interface CapturedImage {
  role: 'page' | 'figure';
  dataUrl: string;
}

/**
 * Extract and compress all visible images from an epubjs iframe document.
 *
 * epubjs loads images as same-origin blob: URLs, so fetch() works from the
 * parent webview context without CORS issues.
 *
 * @param iframeDoc  contentDocument of the epubjs iframe
 * @param maxImages  Cap to avoid oversized payloads (default 5)
 */
export async function captureIframeImages(
  iframeDoc: Document,
  maxImages = 5,
): Promise<CapturedImage[]> {
  const imgEls = Array.from(
    iframeDoc.querySelectorAll<HTMLImageElement | SVGImageElement>('img, image'),
  ).slice(0, maxImages);

  const results: CapturedImage[] = [];

  for (const el of imgEls) {
    const src =
      el instanceof HTMLImageElement
        ? el.currentSrc || el.src
        : (el.getAttribute('href') ?? el.getAttribute('xlink:href') ?? '');

    if (!src) continue;

    const dataUrl = await fetchAndCompress(src);
    if (dataUrl) {
      // Heuristic: a single large image that fills the viewport is a "page"
      const isFullPage =
        el instanceof HTMLImageElement &&
        el.naturalWidth > 0 &&
        el.clientWidth > iframeDoc.documentElement.clientWidth * 0.7;
      results.push({ role: isFullPage ? 'page' : 'figure', dataUrl });
    }
  }

  return results;
}

// =============================================================================
// Selection-nearby image extractor
// =============================================================================

/**
 * Find img elements within the closest block ancestor of a Range,
 * up to maxImages. Used to attach inline figures to a text selection.
 */
export function collectNearbyImages(
  range: Range,
  doc: Document,
  maxImages = 3,
): HTMLImageElement[] {
  // Walk up to find the nearest block-level ancestor
  let ancestor: Node | null = range.commonAncestorContainer;
  while (ancestor && ancestor !== doc.body) {
    if (ancestor instanceof HTMLElement) {
      const display = getComputedStyle(ancestor).display;
      if (['block', 'flex', 'grid', 'table-cell'].includes(display)) break;
    }
    ancestor = ancestor.parentNode;
  }
  const container = ancestor instanceof HTMLElement ? ancestor : doc.body;
  return Array.from(container.querySelectorAll<HTMLImageElement>('img')).slice(0, maxImages);
}
