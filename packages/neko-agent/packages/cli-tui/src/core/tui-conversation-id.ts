const PATH_SAFE_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export function createCliConversationId(
  now: number = Date.now(),
  random: number = Math.random(),
): string {
  const randomPart = random.toString(36).slice(2, 10) || '0';
  return `cli-${now.toString(36)}-${randomPart}`;
}

export function isPathSafeCliConversationId(value: string): boolean {
  return PATH_SAFE_ID_PATTERN.test(value);
}
