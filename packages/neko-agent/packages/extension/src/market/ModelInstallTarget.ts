/**
 * ModelInstallTarget — contributed install target for AI model packages.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type { AssetManifest, IInstallTarget } from '@neko/shared';
import { EngineClient } from '@neko/neko-client/EngineClient';

const execFileAsync = promisify(execFile);

const MARKET_MODELS_BASE = path.join(os.homedir(), '.neko', 'models');
const OLLAMA_API_URL = 'http://localhost:11434';
const OLLAMA_HEALTH_TIMEOUT_MS = 2000;
const OLLAMA_STARTUP_POLL_INTERVAL_MS = 1000;
const OLLAMA_STARTUP_MAX_ATTEMPTS = 10;
const OLLAMA_CREATE_TIMEOUT_MS = 60_000;

export interface ModelInstallTargetHost {
  executeCommand<T>(command: string, ...args: unknown[]): Promise<T | undefined>;
  refreshModels?(): Promise<void>;
}

export class ModelInstallTarget implements IInstallTarget<'model'> {
  readonly type = 'model' as const;

  constructor(
    private readonly modelsBaseDir: string = MARKET_MODELS_BASE,
    private readonly host?: ModelInstallTargetHost,
  ) {}

  validateManifest(manifest: AssetManifest): void {
    if (manifest.type !== 'model') {
      throw new Error(`ModelInstallTarget cannot install asset type: ${manifest.type}`);
    }
    if (manifest.typeMetadata?.type !== 'model') {
      throw new Error('model packages must include model typeMetadata');
    }
  }

  getInstallPath(manifest: AssetManifest): string {
    const metadata = manifest.typeMetadata;
    const framework = metadata?.type === 'model' ? metadata.data.framework : 'generic';
    return path.join(this.modelsBaseDir, framework, manifest.name);
  }

  async onPostInstall(manifest: AssetManifest, installedPath: string): Promise<void> {
    const metadata = manifest.typeMetadata;
    if (metadata?.type !== 'model') return;

    const { framework, task } = metadata.data;
    if (framework === 'gguf') {
      await this.registerWithOllama(manifest.name, installedPath);
    } else if (framework === 'onnx') {
      await this.registerWithEngine(manifest.name, installedPath, framework, task);
    }
  }

  async onPreUninstall(manifest: AssetManifest, _installedPath: string): Promise<void> {
    const metadata = manifest.typeMetadata;
    if (metadata?.type !== 'model') return;

    if (metadata.data.framework === 'gguf') {
      const ollamaBin = await this.findOllamaBinary();
      if (ollamaBin) {
        await execFileAsync(ollamaBin, ['rm', manifest.name], { timeout: 30_000 }).catch(
          () => undefined,
        );
      }
    } else if (metadata.data.framework === 'onnx') {
      await this.unregisterFromEngine(manifest.name).catch(() => undefined);
    }
  }

  private async registerWithOllama(modelName: string, installedPath: string): Promise<void> {
    const ollamaPath = await this.ensureOllamaRunning();
    const ggufFile = this.findFileByExtension(installedPath, '.gguf');
    if (!ggufFile) {
      throw new Error(`No .gguf file found in ${installedPath}`);
    }

    const modelfilePath = path.join(installedPath, 'Modelfile');
    fs.writeFileSync(modelfilePath, `FROM ${ggufFile}\n`, 'utf-8');
    await execFileAsync(ollamaPath, ['create', modelName, '-f', modelfilePath], {
      timeout: OLLAMA_CREATE_TIMEOUT_MS,
    });
    await this.host?.refreshModels?.().catch(() => undefined);
  }

  private async ensureOllamaRunning(): Promise<string> {
    const ollamaPath = await this.findOllamaBinary();
    if (!ollamaPath) {
      throw new Error(
        'Ollama is not installed. Install from https://ollama.com to use local LLM models.',
      );
    }
    if (await this.isOllamaRunning()) return ollamaPath;

    const proc = spawn(ollamaPath, ['serve'], { detached: true, stdio: 'ignore' });
    proc.unref();

    for (let i = 0; i < OLLAMA_STARTUP_MAX_ATTEMPTS; i += 1) {
      await this.sleep(OLLAMA_STARTUP_POLL_INTERVAL_MS);
      if (await this.isOllamaRunning()) return ollamaPath;
    }

    throw new Error(`Ollama failed to start within ${OLLAMA_STARTUP_MAX_ATTEMPTS}s.`);
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

  private async findOllamaBinary(): Promise<string | null> {
    const isWindows = process.platform === 'win32';
    const locateCmd = isWindows ? 'where' : 'which';

    try {
      const { stdout } = await execFileAsync(locateCmd, ['ollama'], { timeout: 5000 });
      const first = stdout.trim().split(/\r?\n/)[0];
      return first ?? null;
    } catch {
      const commonPaths = isWindows
        ? [
            path.join(process.env['LOCALAPPDATA'] ?? '', 'Programs', 'Ollama', 'ollama.exe'),
            path.join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'Ollama', 'ollama.exe'),
          ]
        : ['/usr/local/bin/ollama', '/opt/homebrew/bin/ollama', '/usr/bin/ollama'];
      return commonPaths.find((candidate) => fs.existsSync(candidate)) ?? null;
    }
  }

  private async registerWithEngine(
    modelName: string,
    installedPath: string,
    framework: string,
    task: string,
  ): Promise<void> {
    const result = await this.host?.executeCommand<{ port: number }>(
      'neko.engine.ensureFrameServer',
    );
    if (!result?.port) return;

    const client = new EngineClient(result.port);
    await client.registerModel(modelName, installedPath, framework, task);
  }

  private async unregisterFromEngine(modelName: string): Promise<void> {
    const result = await this.host?.executeCommand<{ port: number }>(
      'neko.engine.ensureFrameServer',
    );
    if (!result?.port) return;

    const client = new EngineClient(result.port);
    await client.unregisterModel(modelName);
  }

  private findFileByExtension(dir: string, ext: string): string | null {
    try {
      const entries = fs.readdirSync(dir);
      const match = entries.find((entry) => entry.endsWith(ext));
      return match ? path.join(dir, match) : null;
    } catch {
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
