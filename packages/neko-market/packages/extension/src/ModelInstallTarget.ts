/**
 * ModelInstallTarget — Install target for marketplace AI models.
 *
 * Installs to ~/.neko/models/{framework}/{name}/
 * Framework is derived from manifest typeMetadata (onnx/pytorch/safetensors/gguf),
 * falling back to 'generic' when not specified.
 *
 * Post-install hooks:
 * - GGUF → ensure Ollama running + `ollama create` to register model
 * - ONNX → register with neko-engine ModelsController
 *
 * Handles: 'ai-model', 'lora', 'embedding'
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import type { AssetManifest } from '@neko/shared/types/asset/manifest';
import type { IInstallTarget } from '@neko/shared/types/asset/market';
import { EngineClient } from '@neko/neko-client';

const execFileAsync = promisify(execFile);

/** Base directory for marketplace-installed models */
const MARKET_MODELS_BASE = path.join(os.homedir(), '.neko', 'models');

/** Ollama API defaults */
const OLLAMA_API_URL = 'http://localhost:11434';
const OLLAMA_HEALTH_TIMEOUT_MS = 2000;
const OLLAMA_STARTUP_POLL_INTERVAL_MS = 1000;
const OLLAMA_STARTUP_MAX_ATTEMPTS = 10;
const OLLAMA_CREATE_TIMEOUT_MS = 60_000;

/** Handles 'ai-model', 'lora', and 'embedding' asset types */
export class ModelInstallTarget implements IInstallTarget<'ai-model' | 'lora' | 'embedding'> {
  constructor(public readonly type: 'ai-model' | 'lora' | 'embedding') {}

  /**
   * Compute install path: ~/.neko/models/{framework}/{name}/
   * Framework comes from typeMetadata.data.framework or defaults to 'generic'.
   */
  getInstallPath(manifest: AssetManifest): string {
    const metadata = manifest.typeMetadata;
    const framework = metadata?.type === 'model' ? metadata.data.framework : 'generic';
    return path.join(MARKET_MODELS_BASE, framework, manifest.name);
  }

  /**
   * Post-install hook: register model with the appropriate runtime.
   * - GGUF → Ollama (ensure running + create model)
   * - ONNX → neko-engine ModelsController
   */
  async onPostInstall(manifest: AssetManifest, installedPath: string): Promise<void> {
    const metadata = manifest.typeMetadata;
    if (metadata?.type !== 'model') return;

    const { framework, task } = metadata.data;

    switch (framework) {
      case 'gguf':
        await this.registerWithOllama(manifest.name, installedPath);
        break;
      case 'onnx':
        await this.registerWithEngine(manifest.name, installedPath, framework, task);
        break;
      // safetensors/pytorch: download to disk only, user configures ComfyUI via MCP/Provider
    }
  }

  /**
   * Pre-uninstall hook: deregister model from runtime.
   */
  async onPreUninstall(manifest: AssetManifest, _installedPath: string): Promise<void> {
    const metadata = manifest.typeMetadata;
    if (metadata?.type !== 'model') return;

    const { framework } = metadata.data;

    switch (framework) {
      case 'gguf': {
        const ollamaBin = await this.findOllamaBinary();
        if (ollamaBin) {
          await execFileAsync(ollamaBin, ['rm', manifest.name], { timeout: 30_000 }).catch(() => {
            // Ollama may not be running or model already removed — ignore
          });
        }
        break;
      }
      case 'onnx':
        await this.unregisterFromEngine(manifest.name).catch(() => {
          // Engine may not be running — ignore
        });
        break;
    }
  }

  // ===========================================================================
  // Ollama integration
  // ===========================================================================

  /**
   * Register GGUF model with Ollama: ensure running → generate Modelfile → ollama create.
   */
  private async registerWithOllama(modelName: string, installedPath: string): Promise<void> {
    const ollamaPath = await this.ensureOllamaRunning();

    // Find the GGUF file in the installed directory
    const ggufFile = this.findFileByExtension(installedPath, '.gguf');
    if (!ggufFile) {
      throw new Error(`No .gguf file found in ${installedPath}`);
    }

    // Generate Modelfile
    const modelfilePath = path.join(installedPath, 'Modelfile');
    fs.writeFileSync(modelfilePath, `FROM ${ggufFile}\n`, 'utf-8');

    // Register with Ollama using the resolved binary path
    await execFileAsync(ollamaPath, ['create', modelName, '-f', modelfilePath], {
      timeout: OLLAMA_CREATE_TIMEOUT_MS,
    });

    // Notify neko-agent to refresh model list (graceful — ignore if agent not available)
    await vscode.commands.executeCommand('neko.agent.refreshModels').then(undefined, () => {});
  }

  /**
   * Ensure Ollama is running. If not, attempt to start it.
   * Returns the resolved ollama binary path.
   * Throws if Ollama is not installed or fails to start within timeout.
   */
  private async ensureOllamaRunning(): Promise<string> {
    // 1. Already running?
    const ollamaPath = await this.findOllamaBinary();
    if (!ollamaPath) {
      throw new Error(
        'Ollama is not installed. Install from https://ollama.com to use local LLM models.',
      );
    }

    if (await this.isOllamaRunning()) return ollamaPath;

    // 2. Start in background
    const proc = spawn(ollamaPath, ['serve'], {
      detached: true,
      stdio: 'ignore',
    });
    proc.unref();

    // 3. Wait for ready
    for (let i = 0; i < OLLAMA_STARTUP_MAX_ATTEMPTS; i++) {
      await this.sleep(OLLAMA_STARTUP_POLL_INTERVAL_MS);
      if (await this.isOllamaRunning()) return ollamaPath;
    }

    throw new Error(
      `Ollama failed to start within ${OLLAMA_STARTUP_MAX_ATTEMPTS}s. Try running 'ollama serve' manually.`,
    );
  }

  private async isOllamaRunning(): Promise<boolean> {
    try {
      const response = await fetch(`${OLLAMA_API_URL}/api/version`, {
        signal: AbortSignal.timeout(OLLAMA_HEALTH_TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Locate the ollama binary cross-platform.
   * - Unix/macOS: `which ollama`, fallback to common paths
   * - Windows: `where ollama`, fallback to common %LOCALAPPDATA% / %ProgramFiles% paths
   */
  private async findOllamaBinary(): Promise<string | null> {
    const isWindows = process.platform === 'win32';
    const locateCmd = isWindows ? 'where' : 'which';

    try {
      const { stdout } = await execFileAsync(locateCmd, ['ollama'], { timeout: 5000 });
      // `where` may return multiple lines — take the first non-empty one
      const first = stdout.trim().split(/\r?\n/)[0];
      return first ?? null;
    } catch {
      // Fallback to well-known install paths per platform
      const commonPaths: string[] = isWindows
        ? [
            path.join(process.env['LOCALAPPDATA'] ?? '', 'Programs', 'Ollama', 'ollama.exe'),
            path.join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'Ollama', 'ollama.exe'),
          ]
        : ['/usr/local/bin/ollama', '/opt/homebrew/bin/ollama', '/usr/bin/ollama'];

      for (const p of commonPaths) {
        if (fs.existsSync(p)) return p;
      }
      return null;
    }
  }

  // ===========================================================================
  // Engine ONNX integration
  // ===========================================================================

  /**
   * Register ONNX model with neko-engine ModelsController.
   */
  private async registerWithEngine(
    modelName: string,
    installedPath: string,
    framework: string,
    task: string,
  ): Promise<void> {
    const result = await vscode.commands.executeCommand<{ port: number }>(
      'neko.engine.ensureFrameServer',
    );
    if (!result?.port) return;

    const client = new EngineClient(result.port);
    await client.dispatch({
      group: 'models',
      action: 'register',
      options: { name: modelName, path: installedPath, framework, task },
    });
  }

  private async unregisterFromEngine(modelName: string): Promise<void> {
    const result = await vscode.commands.executeCommand<{ port: number }>(
      'neko.engine.ensureFrameServer',
    );
    if (!result?.port) return;

    const client = new EngineClient(result.port);
    await client.dispatch({
      group: 'models',
      action: 'unregister',
      options: { name: modelName },
    });
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  private findFileByExtension(dir: string, ext: string): string | null {
    try {
      const entries = fs.readdirSync(dir);
      const match = entries.find((e) => e.endsWith(ext));
      return match ? path.join(dir, match) : null;
    } catch {
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
