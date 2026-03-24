/**
 * VersionResolver — Semver version resolution utilities.
 *
 * Self-implemented (zero external dependency) semver parser and comparator.
 * Supports basic semver ranges: exact, caret, tilde, comparison, wildcard.
 */

import type { AssetCompatibility, IVersionResolver } from '@neko/shared/types/asset/market';

// =============================================================================
// Parsed Version
// =============================================================================

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

// =============================================================================
// Parsing
// =============================================================================

/** Parse a semver version string into components */
export function parseVersion(version: string): ParsedVersion | undefined {
  const cleaned = version.replace(/^v/, '');
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.]+))?/.exec(cleaned);
  if (!match) return undefined;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

/** Compare two parsed versions: -1 (a<b), 0 (a=b), 1 (a>b) */
function compareVersions(a: ParsedVersion, b: ParsedVersion): -1 | 0 | 1 {
  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;

  // No prerelease > with prerelease
  if (a.prerelease.length === 0 && b.prerelease.length > 0) return 1;
  if (a.prerelease.length > 0 && b.prerelease.length === 0) return -1;

  // Compare prerelease identifiers
  const len = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < len; i++) {
    const ai = a.prerelease[i];
    const bi = b.prerelease[i];
    if (ai === undefined) return -1;
    if (bi === undefined) return 1;
    if (ai === bi) continue;

    const aNum = Number(ai);
    const bNum = Number(bi);
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return aNum > bNum ? 1 : -1;
    }
    return ai > bi ? 1 : -1;
  }

  return 0;
}

// =============================================================================
// Range Matching
// =============================================================================

/**
 * Check if a version satisfies a simple range.
 *
 * Supported range formats:
 * - Exact: "1.2.3"
 * - Caret: "^1.2.3" (compatible with 1.x.x)
 * - Tilde: "~1.2.3" (compatible with 1.2.x)
 * - Comparison: ">=1.2.3", "<=1.2.3", ">1.2.3", "<1.2.3"
 * - Wildcard: "*", "x", "" (any version)
 */
function matchesRange(version: ParsedVersion, range: string): boolean {
  const trimmed = range.trim();

  // Wildcard
  if (trimmed === '' || trimmed === '*' || trimmed === 'x') {
    return true;
  }

  // Caret range: ^major.minor.patch
  if (trimmed.startsWith('^')) {
    const target = parseVersion(trimmed.slice(1));
    if (!target) return false;
    if (version.major !== target.major) return false;
    if (version.major === 0) {
      if (version.minor !== target.minor) return false;
      return compareVersions(version, target) >= 0;
    }
    return compareVersions(version, target) >= 0;
  }

  // Tilde range: ~major.minor.patch
  if (trimmed.startsWith('~')) {
    const target = parseVersion(trimmed.slice(1));
    if (!target) return false;
    return (
      version.major === target.major &&
      version.minor === target.minor &&
      compareVersions(version, target) >= 0
    );
  }

  // Comparison operators
  if (trimmed.startsWith('>=')) {
    const target = parseVersion(trimmed.slice(2));
    return target ? compareVersions(version, target) >= 0 : false;
  }
  if (trimmed.startsWith('<=')) {
    const target = parseVersion(trimmed.slice(2));
    return target ? compareVersions(version, target) <= 0 : false;
  }
  if (trimmed.startsWith('>') && !trimmed.startsWith('>=')) {
    const target = parseVersion(trimmed.slice(1));
    return target ? compareVersions(version, target) > 0 : false;
  }
  if (trimmed.startsWith('<') && !trimmed.startsWith('<=')) {
    const target = parseVersion(trimmed.slice(1));
    return target ? compareVersions(version, target) < 0 : false;
  }

  // Exact match
  const target = parseVersion(trimmed);
  return target ? compareVersions(version, target) === 0 : false;
}

// =============================================================================
// VersionResolver Implementation
// =============================================================================

export class VersionResolver implements IVersionResolver {
  satisfies(version: string, range: string): boolean {
    const parsed = parseVersion(version);
    if (!parsed) return false;

    // Support space-separated AND ranges: ">=1.0.0 <2.0.0"
    const parts = range.split(/\s+/).filter((p) => p.length > 0);
    return parts.every((part) => matchesRange(parsed, part));
  }

  maxSatisfying(versions: string[], range: string): string | undefined {
    let best: { version: string; parsed: ParsedVersion } | undefined;

    for (const v of versions) {
      if (!this.satisfies(v, range)) continue;
      const parsed = parseVersion(v);
      if (!parsed) continue;

      if (!best || compareVersions(parsed, best.parsed) > 0) {
        best = { version: v, parsed };
      }
    }

    return best?.version;
  }

  compare(a: string, b: string): -1 | 0 | 1 {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    if (!pa || !pb) return 0;
    return compareVersions(pa, pb);
  }

  isCompatible(compatibility: AssetCompatibility | undefined, currentVersion: string): boolean {
    if (!compatibility) return true;

    if (compatibility.nekoSuiteVersion) {
      if (!this.satisfies(currentVersion, compatibility.nekoSuiteVersion)) {
        return false;
      }
    }

    return true;
  }
}
