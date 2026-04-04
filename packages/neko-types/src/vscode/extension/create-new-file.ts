/**
 * createNewFile — standard "new project file" UX for Neko extensions.
 *
 * Flow:
 *   1. Find a unique name in the target folder (Untitled.ext → Untitled-1.ext → …)
 *   2. Write template content to the file
 *   3. Call `onCreated` if provided (e.g. open the file in a custom editor)
 *   4. Reveal the file in the Explorer
 *   5. Trigger VSCode's inline rename — the input shows "Untitled.ext" with only
 *      the stem selected, so the extension is always visible and preserved
 *
 * Why not `explorer.newFile`?
 *   That command shows an empty input with no default name or extension hint.
 *   `renameFile` on a pre-created file is the only VSCode API that shows a
 *   pre-filled input (stem selected, extension not selected).
 */
import * as vscode from 'vscode';

export interface CreateNewFileOptions {
  /** Target folder URI. Falls back to the first workspace folder when omitted. */
  targetFolder?: vscode.Uri;
  /** Stem used when generating a unique default name. Defaults to `'Untitled'`. */
  baseName?: string;
  /** File extension including the leading dot, e.g. `'.nkm'`. */
  ext: string;
  /** Returns the initial file content given the file stem (name without extension). */
  template: (title: string) => string | Uint8Array;
  /** Message shown when no target folder can be resolved. */
  noFolderErrorMessage?: string;
  /**
   * Called with the new file URI immediately after the template is written,
   * before the inline rename input appears. Use this to open the file in a
   * custom editor — VSCode will update the editor tab title automatically
   * when the user renames the file.
   */
  onCreated?: (uri: vscode.Uri) => void | Promise<void>;
}

/**
 * Create a new project file with a unique default name, reveal it in the
 * Explorer, and trigger an inline rename so the user can set the final name.
 *
 * The inline input is pre-filled with the default name and extension
 * (e.g. "Untitled.nkm"), with only the stem selected. The user can type a new
 * stem; the extension is preserved automatically by VSCode's rename UX.
 *
 * @returns The URI of the created file (with the default name, before rename),
 *          or `undefined` if no folder was available.
 */
export async function createNewFile(
  options: CreateNewFileOptions,
): Promise<vscode.Uri | undefined> {
  const { ext, template, onCreated } = options;
  const baseName = options.baseName ?? 'Untitled';

  // Resolve target folder
  let targetFolder = options.targetFolder;
  if (!targetFolder) {
    targetFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
  }
  if (!targetFolder) {
    vscode.window.showErrorMessage(options.noFolderErrorMessage ?? 'No workspace folder is open.');
    return undefined;
  }

  // Find a unique name: Untitled.ext → Untitled-1.ext → Untitled-2.ext …
  let fileName = `${baseName}${ext}`;
  let fileUri = vscode.Uri.joinPath(targetFolder, fileName);
  let counter = 1;
  while (true) {
    try {
      await vscode.workspace.fs.stat(fileUri);
      fileName = `${baseName}-${counter}${ext}`;
      fileUri = vscode.Uri.joinPath(targetFolder, fileName);
      counter++;
    } catch {
      break; // file does not exist — use this name
    }
  }

  // Write template content
  const title = fileName.slice(0, fileName.length - ext.length);
  const content = template(title);
  const bytes = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
  await vscode.workspace.fs.writeFile(fileUri, bytes);

  // Open in editor before rename so the tab is ready; VSCode updates the tab
  // title automatically when the user renames the file in Explorer.
  if (onCreated) {
    await onCreated(fileUri);
  }

  // Reveal in Explorer and trigger inline rename.
  // VSCode's renameFile shows the current filename with only the stem selected,
  // so the extension is always visible and the user never needs to type it.
  await vscode.commands.executeCommand('revealInExplorer', fileUri);
  await new Promise<void>((resolve) => setTimeout(resolve, 200));
  await vscode.commands.executeCommand('renameFile');

  return fileUri;
}
