export function normalizeStudentName(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

export function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function isDuplicateStudentNameError(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const maybeError = error as { code?: string; message?: string; details?: string };
  const text = `${maybeError.message ?? ''} ${maybeError.details ?? ''}`.toLowerCase();

  return maybeError.code === '23505' && text.includes('students_name_normalized_unique');
}
