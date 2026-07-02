export const APP_NAME = 'Library Attendance System';
export const TIMEZONE = 'Asia/Manila';
export const AUTO_LOGOUT_WINDOW_MINUTES = 5;

export const LIBRARY_AUTO_LOGOUT_TIMES = [
  { id: 'lunch', label: 'Lunch break', hour: 12, minute: 0, display: '12:00 PM' },
  { id: 'closing', label: 'Library closing', hour: 17, minute: 0, display: '5:00 PM' },
] as const;

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

export interface ParsedQrPayload {
  studentId?: string;
  qrToken?: string;
}

export function buildQrPayload(qrToken: string, studentId?: string): string {
  return JSON.stringify({ v: 2, student_id: studentId, token: qrToken });
}

export function parseQrPayload(raw: string): ParsedQrPayload | null {
  try {
    const parsed = JSON.parse(raw) as { v?: number; token?: string; student_id?: string };
    if (parsed.student_id || parsed.token) {
      return {
        studentId: parsed.student_id,
        qrToken: parsed.token,
      };
    }
  } catch {
    // Plain UUID fallback
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(raw.trim())) return { qrToken: raw.trim() };
    if (raw.trim()) return { studentId: raw.trim() };
  }
  return null;
}
