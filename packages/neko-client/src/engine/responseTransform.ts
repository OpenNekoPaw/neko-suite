/**
 * Response transform — Rust tagged enum → flat TypeScript
 *
 * Rust's ContentDiff is a tagged enum:
 *   { content: { type: "Image"|"Audio"|"Video"|"Timeline", ...fields } }
 *
 * TypeScript EngineDiffResult expects flat fields:
 *   { imageDiff?, audioDiff?, videoDiff?, timelineDiff? }
 *
 * Ported from neko-engine/packages/extension/src/extension.ts:168-185
 */

const CONTENT_TYPE_KEY_MAP: Record<string, string> = {
	Image: 'imageDiff',
	Audio: 'audioDiff',
	Video: 'videoDiff',
	Timeline: 'timelineDiff',
	image: 'imageDiff',
	audio: 'audioDiff',
	video: 'videoDiff',
	timeline: 'timelineDiff',
};

/**
 * Transform Rust tagged-enum diff response to flat TypeScript format.
 * Mutates `data` in place and returns it.
 */
export function transformDiffResponse<T extends Record<string, unknown>>(data: T): T {
	const content = data['content'] as Record<string, unknown> | undefined;
	if (!content) return data;

	const { type: contentType, ...contentFields } = content;
	const key = CONTENT_TYPE_KEY_MAP[contentType as string];
	if (key) {
		(data as Record<string, unknown>)[key] = contentFields;
	}
	delete (data as Record<string, unknown>)['content'];
	return data;
}
