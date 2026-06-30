export const APP_NAME = 'Library Attendance System';
export const TIMEZONE = 'Asia/Manila';

export const PURPOSES = ['Study', 'Research', 'Reading', 'Group Work', 'Other'] as const;

export const COURSE_OPTIONS = [
  'BSIT',
  'BSHM',
  'BSCRIM',
  'BSENTREP',
  'BPA',
  'BEED',
  'BECED',
] as const;

export const YEAR_LEVELS = [
  { value: 1, label: 'First Year' },
  { value: 2, label: 'Second Year' },
  { value: 3, label: 'Third Year' },
  { value: 4, label: 'Fourth Year' },
] as const;

export function buildQrPayload(qrToken: string): string {
  return JSON.stringify({ v: 1, token: qrToken });
}

export function parseQrPayload(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { v?: number; token?: string };
    if (parsed.token) return parsed.token;
  } catch {
    // Plain UUID fallback
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(raw.trim())) return raw.trim();
  }
  return null;
}
