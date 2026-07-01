export interface TuiReferenceLoadingError {
  readonly reference: string;
  readonly error: string;
}

export function formatTuiReferenceDiagnostics(
  errors: readonly TuiReferenceLoadingError[],
): string | undefined {
  if (errors.length === 0) {
    return undefined;
  }

  return [
    errors.length === 1 ? 'Reference error:' : 'Reference errors:',
    ...errors.map((error) => `- ${error.reference}: ${error.error}`),
  ].join('\n');
}
