export function normalizeSlashCommandName(command: string): string {
  return command.trim().replace(/^\//, '').toLowerCase();
}
