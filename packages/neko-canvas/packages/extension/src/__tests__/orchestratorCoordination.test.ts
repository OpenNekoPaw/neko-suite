/**
 * Orchestrator coordination contract tests.
 *
 * Phase 2+ horizontal task: the neko-agent Workflow Orchestrator fires
 * `neko.canvas.orchestrator.planStateChanged` on plan state transitions.
 * The canvas side must register that command and route it into the
 * BatchGenerationScheduler's quiet mode so the canvas queue doesn't
 * double-run with the orchestrator's batchGenerate stage.
 *
 * These are source-contract tests (string-match on the production files)
 * to match the existing protocol.test.ts style — the canvas extension
 * currently has no behavioural harness for its services.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const schedulerSource = readFileSync(
  join(__dirname, '../services/batchGenerationScheduler.ts'),
  'utf-8',
);
const extensionSource = readFileSync(join(__dirname, '../extension.ts'), 'utf-8');

describe('Orchestrator coordination — contract', () => {
  describe('BatchGenerationScheduler surface', () => {
    it('exposes setQuietMode(reason?) on instances', () => {
      expect(schedulerSource).toContain('setQuietMode(reason: string | undefined)');
    });

    it('exposes module-level broadcastQuietMode', () => {
      expect(schedulerSource).toContain('export function broadcastQuietMode(');
    });

    it('tracks a quietReason and guards pump() with it', () => {
      expect(schedulerSource).toContain('private quietReason: string | undefined');
      expect(schedulerSource).toContain('if (this.quietReason !== undefined) return;');
    });

    it('registers live schedulers on construction and unregisters on dispose', () => {
      expect(schedulerSource).toContain('liveSchedulers.add(this)');
      expect(schedulerSource).toContain('liveSchedulers.delete(this)');
    });
  });

  describe('Command registration', () => {
    it('registers `neko.canvas.orchestrator.planStateChanged`', () => {
      expect(extensionSource).toContain(
        "registerCommand(\n      'neko.canvas.orchestrator.planStateChanged'",
      );
    });

    it('routes the command into broadcastQuietMode', () => {
      expect(extensionSource).toContain('broadcastQuietMode(');
      expect(extensionSource).toContain(
        "payload.status === 'executing' || payload.status === 'paused'",
      );
    });

    it('imports broadcastQuietMode from the scheduler module', () => {
      expect(extensionSource).toMatch(
        /import \{ broadcastQuietMode \} from '\.\/services\/batchGenerationScheduler'/,
      );
    });
  });
});
