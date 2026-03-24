/**
 * IntegrityChecker — SRI (Subresource Integrity) hash verification.
 *
 * Computes and verifies SHA-256/384/512 hashes for downloaded packages.
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

// =============================================================================
// Types
// =============================================================================

/** Supported hash algorithms */
export type HashAlgorithm = 'sha256' | 'sha384' | 'sha512';

/** SRI hash format: "sha256-<base64>" */
export type SRIHash = `${HashAlgorithm}-${string}`;

// =============================================================================
// Implementation
// =============================================================================

/**
 * Compute an SRI hash for a file.
 *
 * @param filePath Absolute path to the file
 * @param algorithm Hash algorithm (default: sha256)
 * @returns SRI hash string (e.g., "sha256-abc123...")
 */
export async function computeHash(
  filePath: string,
  algorithm: HashAlgorithm = 'sha256',
): Promise<SRIHash> {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm);
    const stream = createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => {
      const digest = hash.digest('base64');
      resolve(`${algorithm}-${digest}` as SRIHash);
    });
    stream.on('error', reject);
  });
}

/**
 * Verify a file against an SRI hash.
 *
 * @param filePath Absolute path to the file
 * @param expectedHash SRI hash string (e.g., "sha256-abc123...")
 * @returns true if hash matches
 */
export async function verifyIntegrity(filePath: string, expectedHash: string): Promise<boolean> {
  const dashIndex = expectedHash.indexOf('-');
  if (dashIndex === -1) return false;

  const algorithm = expectedHash.slice(0, dashIndex) as HashAlgorithm;
  if (!['sha256', 'sha384', 'sha512'].includes(algorithm)) {
    return false;
  }

  const actual = await computeHash(filePath, algorithm);
  return actual === expectedHash;
}
