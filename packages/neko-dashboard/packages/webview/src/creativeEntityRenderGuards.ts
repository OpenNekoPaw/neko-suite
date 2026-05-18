import type {
  DashboardCreativeEntityDetail,
  DashboardCreativeEntityRow,
} from '@neko/shared/types/dashboard-creative-entity';

export function containsUnsafeCreativeEntityPath(value: unknown): boolean {
  if (typeof value === 'string') {
    return isUnsafePathString(value);
  }
  if (Array.isArray(value)) {
    return value.some(containsUnsafeCreativeEntityPath);
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some(containsUnsafeCreativeEntityPath);
  }
  return false;
}

export function shouldRenderCreativeEntityRow(row: DashboardCreativeEntityRow): boolean {
  return !containsUnsafeCreativeEntityPath(row);
}

export function shouldRenderCreativeEntityDetail(detail: DashboardCreativeEntityDetail): boolean {
  return !containsUnsafeCreativeEntityPath(detail);
}

function isUnsafePathString(value: string): boolean {
  const normalized = value.replace(/\\/g, '/');
  return (
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    /^file:/i.test(normalized) ||
    /(?:^|\/)\.neko\/\.cache(?:\/|$)/i.test(normalized)
  );
}
