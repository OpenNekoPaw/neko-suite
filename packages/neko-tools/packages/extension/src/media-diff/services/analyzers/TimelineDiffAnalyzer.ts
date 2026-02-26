/**
 * TimelineDiffAnalyzer - JVI Project Structural Diff
 *
 * Analyzes differences between two .jvi project files by comparing:
 * - Project metadata (name, resolution, fps)
 * - Track structure (added/removed/reordered)
 * - Element properties (timing, transform, text, source)
 *
 * Performance strategy:
 * - Structure diff is pure JSON comparison (fast, <50ms)
 * - Content diff (pixel-level) is deferred to user interaction (lazy)
 */

import type {
	DiffOptions,
	DiffResult,
	TimelineDiffDetails,
	TrackChange,
	ElementChange,
	PropertyChange,
	TimelineChangeType,
} from '@neko/shared';
import { BaseMediaDiffAnalyzer } from './IMediaDiffAnalyzer';

// =============================================================================
// JVI Types (minimal, for parsing)
// =============================================================================

interface JviProject {
	version?: string;
	name: string;
	resolution: { width: number; height: number };
	fps: number;
	tracks: JviTrack[];
	defaults?: Record<string, unknown>;
}

interface JviTrack {
	id: string;
	name: string;
	type: string;
	elements: JviElement[];
	muted: boolean;
	isMain?: boolean;
}

interface JviElement {
	id: string;
	type: string;
	name?: string;
	src?: string;
	duration: number;
	startTime: number;
	trimStart?: number;
	trimEnd?: number;
	transform?: Record<string, number>;
	text?: string;
	fontSize?: number;
	fontFamily?: string;
	color?: string;
	animations?: unknown[];
}

// =============================================================================
// Analyzer
// =============================================================================

export class TimelineDiffAnalyzer extends BaseMediaDiffAnalyzer {
	readonly mediaType = 'timeline' as const;

	constructor() {
		super(['.jvi']);
	}

	async analyze(
		current: Buffer,
		previous: Buffer,
		_options?: DiffOptions
	): Promise<DiffResult> {
		this.createAbortController();

		const currentProject = this.parseJvi(current);
		const previousProject = this.parseJvi(previous);

		this.throwIfAborted();

		const trackChanges = this.diffTracks(
			currentProject.tracks,
			previousProject.tracks
		);

		const summary = this.buildSummary(trackChanges);

		const currentDuration = this.calcDuration(currentProject.tracks);
		const previousDuration = this.calcDuration(previousProject.tracks);

		const details: TimelineDiffDetails = {
			project: {
				name: {
					current: currentProject.name,
					previous: previousProject.name,
				},
				resolution: {
					current: currentProject.resolution,
					previous: previousProject.resolution,
				},
				fps: {
					current: currentProject.fps,
					previous: previousProject.fps,
				},
			},
			trackChanges,
			summary,
			duration: { current: currentDuration, previous: previousDuration },
		};

		const similarity = this.calcSimilarity(details);

		return {
			mediaType: 'timeline',
			similarity,
			details,
		};
	}

	// =========================================================================
	// Parsing
	// =========================================================================

	private parseJvi(buffer: Buffer): JviProject {
		const text = buffer.toString('utf-8');
		const data = JSON.parse(text) as JviProject;
		return {
			name: data.name ?? 'Untitled',
			resolution: data.resolution ?? { width: 1920, height: 1080 },
			fps: data.fps ?? 30,
			tracks: data.tracks ?? [],
		};
	}

	// =========================================================================
	// Track Diff
	// =========================================================================

	private diffTracks(
		currentTracks: JviTrack[],
		previousTracks: JviTrack[]
	): TrackChange[] {
		const changes: TrackChange[] = [];
		const currentMap = new Map(currentTracks.map((t) => [t.id, t]));
		const previousMap = new Map(previousTracks.map((t) => [t.id, t]));

		// Removed tracks
		for (const prev of previousTracks) {
			if (!currentMap.has(prev.id)) {
				changes.push({
					trackId: prev.id,
					trackName: prev.name,
					trackType: prev.type,
					changeType: 'removed',
					elementChanges: prev.elements.map((el) => ({
						elementId: el.id,
						elementName: el.name ?? el.type,
						elementType: el.type,
						changeType: 'removed' as TimelineChangeType,
						src: el.src,
						startTime: el.startTime,
						duration: el.duration,
					})),
				});
			}
		}

		// Added or modified tracks
		for (const curr of currentTracks) {
			const prev = previousMap.get(curr.id);
			if (!prev) {
				changes.push({
					trackId: curr.id,
					trackName: curr.name,
					trackType: curr.type,
					changeType: 'added',
					elementChanges: curr.elements.map((el) => ({
						elementId: el.id,
						elementName: el.name ?? el.type,
						elementType: el.type,
						changeType: 'added' as TimelineChangeType,
						src: el.src,
						startTime: el.startTime,
						duration: el.duration,
					})),
				});
			} else {
				const trackPropChanges = this.diffTrackProps(curr, prev);
				const elementChanges = this.diffElements(
					curr.elements,
					prev.elements
				);

				if (trackPropChanges.length > 0 || elementChanges.length > 0) {
					changes.push({
						trackId: curr.id,
						trackName: curr.name,
						trackType: curr.type,
						changeType: 'modified',
						propertyChanges:
							trackPropChanges.length > 0
								? trackPropChanges
								: undefined,
						elementChanges:
							elementChanges.length > 0
								? elementChanges
								: undefined,
					});
				}
			}
		}

		return changes;
	}

	private diffTrackProps(
		current: JviTrack,
		previous: JviTrack
	): PropertyChange[] {
		const changes: PropertyChange[] = [];
		if (current.name !== previous.name) {
			changes.push({
				property: 'name',
				previous: previous.name,
				current: current.name,
			});
		}
		if (current.type !== previous.type) {
			changes.push({
				property: 'type',
				previous: previous.type,
				current: current.type,
			});
		}
		if (current.muted !== previous.muted) {
			changes.push({
				property: 'muted',
				previous: previous.muted,
				current: current.muted,
			});
		}
		return changes;
	}

	// =========================================================================
	// Element Diff
	// =========================================================================

	private diffElements(
		currentElements: JviElement[],
		previousElements: JviElement[]
	): ElementChange[] {
		const changes: ElementChange[] = [];
		const currentMap = new Map(currentElements.map((e) => [e.id, e]));
		const previousMap = new Map(previousElements.map((e) => [e.id, e]));

		// Removed elements
		for (const prev of previousElements) {
			if (!currentMap.has(prev.id)) {
				changes.push({
					elementId: prev.id,
					elementName: prev.name ?? prev.type,
					elementType: prev.type,
					changeType: 'removed',
					src: prev.src,
					startTime: prev.startTime,
					duration: prev.duration,
				});
			}
		}

		// Added or modified elements
		for (const curr of currentElements) {
			const prev = previousMap.get(curr.id);
			if (!prev) {
				changes.push({
					elementId: curr.id,
					elementName: curr.name ?? curr.type,
					elementType: curr.type,
					changeType: 'added',
					src: curr.src,
					startTime: curr.startTime,
					duration: curr.duration,
				});
			} else {
				const propChanges = this.diffElementProps(curr, prev);
				if (propChanges.length > 0) {
					changes.push({
						elementId: curr.id,
						elementName: curr.name ?? curr.type,
						elementType: curr.type,
						changeType: 'modified',
						propertyChanges: propChanges,
						src: curr.src,
						previousSrc:
							curr.src !== prev.src ? prev.src : undefined,
						startTime: curr.startTime,
						duration: curr.duration,
					});
				}
			}
		}

		return changes;
	}

	private diffElementProps(
		current: JviElement,
		previous: JviElement
	): PropertyChange[] {
		const changes: PropertyChange[] = [];
		const keys: (keyof JviElement)[] = [
			'src',
			'duration',
			'startTime',
			'trimStart',
			'trimEnd',
			'text',
			'fontSize',
			'fontFamily',
			'color',
		];

		for (const key of keys) {
			if (current[key] !== previous[key]) {
				changes.push({
					property: key,
					previous: previous[key],
					current: current[key],
				});
			}
		}

		// Deep compare transform
		if (
			JSON.stringify(current.transform) !==
			JSON.stringify(previous.transform)
		) {
			changes.push({
				property: 'transform',
				previous: previous.transform,
				current: current.transform,
			});
		}

		// Deep compare animations
		if (
			JSON.stringify(current.animations) !==
			JSON.stringify(previous.animations)
		) {
			changes.push({
				property: 'animations',
				previous: previous.animations,
				current: current.animations,
			});
		}

		return changes;
	}

	// =========================================================================
	// Summary & Similarity
	// =========================================================================

	private buildSummary(trackChanges: TrackChange[]) {
		let tracksAdded = 0;
		let tracksRemoved = 0;
		let tracksModified = 0;
		let elementsAdded = 0;
		let elementsRemoved = 0;
		let elementsModified = 0;
		let mediaSourceChanges = 0;

		for (const tc of trackChanges) {
			if (tc.changeType === 'added') tracksAdded++;
			else if (tc.changeType === 'removed') tracksRemoved++;
			else if (tc.changeType === 'modified') tracksModified++;

			for (const ec of tc.elementChanges ?? []) {
				if (ec.changeType === 'added') elementsAdded++;
				else if (ec.changeType === 'removed') elementsRemoved++;
				else if (ec.changeType === 'modified') elementsModified++;

				if (ec.previousSrc) mediaSourceChanges++;
			}
		}

		return {
			tracksAdded,
			tracksRemoved,
			tracksModified,
			elementsAdded,
			elementsRemoved,
			elementsModified,
			mediaSourceChanges,
		};
	}

	private calcSimilarity(details: TimelineDiffDetails): number {
		const { summary } = details;
		const totalChanges =
			summary.tracksAdded +
			summary.tracksRemoved +
			summary.tracksModified +
			summary.elementsAdded +
			summary.elementsRemoved +
			summary.elementsModified;

		if (totalChanges === 0) {
			// Check project metadata
			const metaChanged =
				details.project.name.current !== details.project.name.previous ||
				details.project.fps.current !== details.project.fps.previous ||
				details.project.resolution.current.width !==
					details.project.resolution.previous.width ||
				details.project.resolution.current.height !==
					details.project.resolution.previous.height;
			return metaChanged ? 0.95 : 1.0;
		}

		// Rough heuristic: more changes = lower similarity
		const totalItems =
			details.trackChanges.reduce(
				(sum, tc) => sum + (tc.elementChanges?.length ?? 0),
				0
			) + details.trackChanges.length;

		if (totalItems === 0) return 1.0;

		const changeRatio = totalChanges / Math.max(totalItems * 2, 1);
		return Math.max(0, 1 - changeRatio);
	}

	private calcDuration(tracks: JviTrack[]): number {
		let maxEnd = 0;
		for (const track of tracks) {
			for (const el of track.elements) {
				const end = el.startTime + el.duration;
				if (end > maxEnd) maxEnd = end;
			}
		}
		return maxEnd;
	}
}
