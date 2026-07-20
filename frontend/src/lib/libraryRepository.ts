import { PURPOSES, TIMEZONE, type ParsedQrPayload } from './constants';
import {
  countPendingQueueItems,
  createUuid,
  deleteLocalStudent,
  deleteQueueItem,
  getLocalAttendance,
  getLocalAttendanceByStudentId,
  getLocalAttendanceRows,
  getLocalAttendanceWithStudents,
  getLocalStudent,
  getLocalStudentByQrToken,
  getLocalStudentByStudentId,
  getLocalStudents,
  getQueueItems,
  hasPendingQueueFor,
  putLocalAttendance,
  putLocalAttendanceRows,
  putLocalStudent,
  putLocalStudents,
  putQueueItem,
  setMetaValue,
  type SyncQueueItem,
} from './offlineDatabase';
import { getSupabaseErrorMessage, supabase } from './supabase';
import type { Attendance, AttendanceWithStudent, DashboardStats, ScanResult, Student } from '../types';

type StudentInput = Pick<Student, 'student_id' | 'name' | 'course' | 'year_level'>;

type StudentUpdateInput = Pick<Student, 'id' | 'student_id' | 'name' | 'course' | 'year_level'>;

export type StudentListFilters = {
  search?: string;
  course?: string;
  year_level?: number | '';
  status?: '' | 'active' | 'inactive';
};

const PAGE_SIZE = 1000;

function isNetworkUnavailable(error: unknown) {
  if (!navigator.onLine) return true;
  if (error instanceof TypeError && error.message.includes('fetch')) return true;
  if (error instanceof Error && error.message === 'Failed to fetch') return true;
  return false;
}

function todayInLibraryTimezone() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}`;
}

function normalizeRemoteStudent(row: Record<string, unknown>): Student {
  return {
    id: String(row.id),
    student_id: String(row.student_id),
    name: String(row.name),
    course: String(row.course),
    year_level: Number(row.year_level),
    qr_token: String(row.qr_token),
    qr_issued_at: String(row.qr_issued_at),
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
  };
}

function normalizeRemoteAttendance(row: Record<string, unknown>): Attendance {
  return {
    id: String(row.id),
    student_id: String(row.student_id),
    date: String(row.date),
    time_in: (row.time_in as string | null | undefined) ?? null,
    time_out: (row.time_out as string | null | undefined) ?? null,
    purpose: (row.purpose as string | null | undefined) ?? null,
    status: row.status as Attendance['status'],
    last_scan_at: (row.last_scan_at as string | null | undefined) ?? null,
    created_at: String(row.created_at),
  };
}

export async function warmLocalCache() {
  if (!navigator.onLine) return;

  try {
    await pullRemoteData();
  } catch (error) {
    console.warn(getSupabaseErrorMessage(error, 'Unable to refresh local offline cache.'));
  }
}

export async function registerStudent(input: StudentInput) {
  const existingById = await getLocalStudentByStudentId(input.student_id);
  if (existingById) throw new Error('Student ID already exists.');

  const existingByName = (await getLocalStudents()).find(
    (student) => student.name.toLowerCase() === input.name.toLowerCase(),
  );
  if (existingByName) throw new Error('Student name already exists.');

  const now = new Date().toISOString();
  const student: Student = {
    id: createUuid(),
    student_id: input.student_id,
    name: input.name,
    course: input.course,
    year_level: input.year_level,
    qr_token: createUuid(),
    qr_issued_at: now,
    is_active: true,
    created_at: now,
  };

  await putLocalStudent(student, true);
  void syncOfflineQueue();
  return student;
}

export async function updateStudent(input: StudentUpdateInput) {
  const existing = await getLocalStudent(input.id);
  if (!existing) throw new Error('Student was not found.');

  const [duplicateId, allStudents] = await Promise.all([
    getLocalStudentByStudentId(input.student_id),
    getLocalStudents(),
  ]);
  if (duplicateId && duplicateId.id !== input.id) throw new Error('Student ID already exists.');

  const duplicateName = allStudents.find(
    (student) => student.id !== input.id && student.name.toLowerCase() === input.name.toLowerCase(),
  );
  if (duplicateName) throw new Error('Student name already exists.');

  const student: Student = {
    ...existing,
    student_id: input.student_id,
    name: input.name,
    course: input.course,
    year_level: input.year_level,
  };

  await putLocalStudent(student, true);
  void syncOfflineQueue();
}

export async function removeStudent(id: string) {
  const student = await getLocalStudent(id);
  await deleteLocalStudent(id, student?.student_id, true);
  void syncOfflineQueue();
}

export async function getStudentByStudentId(studentId: string) {
  return getLocalStudentByStudentId(studentId);
}

export async function getStudentByQrToken(qrToken: string) {
  const student = await getLocalStudentByQrToken(qrToken);
  return student?.is_active ? student : null;
}

export async function getStudentByQrPayload(payload: ParsedQrPayload) {
  const student = payload.studentId
    ? await getLocalStudentByStudentId(payload.studentId)
    : payload.qrToken
      ? await getLocalStudentByQrToken(payload.qrToken)
      : null;

  return student?.is_active ? student : null;
}

export async function listStudents(page: number, pageSize: number, filters: StudentListFilters = {}) {
  const search = filters.search?.trim().toLowerCase() ?? '';
  const students = await getLocalStudents();
  const filteredStudents = students.filter((student) => {
    const matchesSearch =
      !search ||
      student.student_id.toLowerCase().includes(search) ||
      student.name.toLowerCase().includes(search);
    const matchesCourse = !filters.course || student.course === filters.course;
    const matchesYear = !filters.year_level || student.year_level === filters.year_level;
    const matchesStatus =
      !filters.status ||
      (filters.status === 'active' && student.is_active) ||
      (filters.status === 'inactive' && !student.is_active);

    return matchesSearch && matchesCourse && matchesYear && matchesStatus;
  });
  const rows = filteredStudents
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(page * pageSize, page * pageSize + pageSize);
  return { rows, count: filteredStudents.length, totalCount: students.length };
}

export async function processQrScan(payload: ParsedQrPayload, purpose = 'Study') {
  const student = await getStudentByQrPayload(payload);
  if (!student) {
    return {
      success: false,
      message: 'Invalid or unregistered QR code.',
      error: 'invalid_qr',
    } satisfies ScanResult;
  }

  const now = new Date().toISOString();
  const today = todayInLibraryTimezone();
  const studentAttendanceRows = await getLocalAttendanceByStudentId(student.student_id);
  const latestAttendance = studentAttendanceRows
    .filter((attendance) => attendance.student_id === student.student_id && attendance.date === today)
    .sort(
      (a, b) =>
        (b.last_scan_at ?? b.time_out ?? b.time_in ?? b.created_at).localeCompare(
          a.last_scan_at ?? a.time_out ?? a.time_in ?? a.created_at,
        ),
    )[0];
  const shouldLogin =
    !latestAttendance || latestAttendance.status === 'completed' || Boolean(latestAttendance.time_out);

  if (shouldLogin) {
    const attendance: Attendance = {
      id: createUuid(),
      student_id: student.student_id,
      date: today,
      time_in: now,
      time_out: null,
      purpose: PURPOSES.includes(purpose as (typeof PURPOSES)[number]) ? purpose : 'Study',
      status: 'checked_in',
      last_scan_at: now,
      created_at: now,
    };

    await putLocalAttendance(attendance, true);

    return {
      success: true,
      action: 'time_in',
      message: `Login recorded for ${student.name}.`,
      student,
      attendance: {
        id: attendance.id,
        date: attendance.date,
        time_in: attendance.time_in ?? now,
        purpose: attendance.purpose ?? undefined,
        status: attendance.status,
      },
    } satisfies ScanResult;
  }

  if (!latestAttendance || latestAttendance.status !== 'checked_in' || latestAttendance.time_out) {
    return {
      success: false,
      error: 'already_completed',
      message: `${student.name} already has a completed logout record for today.`,
      student,
    } satisfies ScanResult;
  }

  const completed: Attendance = {
    ...latestAttendance,
    time_out: now,
    status: 'completed',
    last_scan_at: now,
  };

  await putLocalAttendance(completed, true);

  return {
    success: true,
    action: 'time_out',
    message: `Logout recorded for ${student.name}.`,
    student,
    attendance: {
      id: completed.id,
      date: completed.date,
      time_in: completed.time_in ?? '',
      time_out: completed.time_out ?? undefined,
      purpose: completed.purpose ?? undefined,
      status: completed.status,
    },
  } satisfies ScanResult;
}

export async function autoLogoutAll() {
  const now = new Date().toISOString();
  const today = todayInLibraryTimezone();
  const rows = await getLocalAttendanceRows();
  const activeRows = rows.filter(
    (attendance) => attendance.date === today && attendance.status === 'checked_in' && !attendance.time_out,
  );

  await Promise.all(
    activeRows.map((attendance) =>
      putLocalAttendance(
        {
          ...attendance,
          time_out: now,
          status: 'completed',
          last_scan_at: now,
        },
        true,
      ),
    ),
  );
  void syncOfflineQueue();
  return { success: true, logged_out: activeRows.length };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const rows = await getLocalAttendanceRows();
  const today = todayInLibraryTimezone();
  const todayRows = rows.filter((row) => row.date === today);
  const currentRows = todayRows.filter((row) => row.status === 'checked_in' && !row.time_out);

  const dailyCounts = new Map<string, Set<string>>();
  rows.forEach((row) => {
    if (!dailyCounts.has(row.date)) dailyCounts.set(row.date, new Set());
    dailyCounts.get(row.date)?.add(row.student_id);
  });

  const daily = [...dailyCounts.entries()]
    .map(([date, students]) => ({ date, count: students.size }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7);

  const monthlyCounts = new Map<string, Set<string>>();
  rows.forEach((row) => {
    const month = row.date.slice(0, 7);
    if (!monthlyCounts.has(month)) monthlyCounts.set(month, new Set());
    monthlyCounts.get(month)?.add(row.student_id);
  });

  return {
    visitors_today: new Set(todayRows.map((row) => row.student_id)).size,
    currently_inside: currentRows.length,
    daily,
    weekly: [],
    monthly: [...monthlyCounts.entries()]
      .map(([month, students]) => ({ month, count: students.size }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6),
  };
}

export async function getCurrentlyInside() {
  const today = todayInLibraryTimezone();
  return (await getLocalAttendanceWithStudents())
    .filter((row) => row.date === today && row.status === 'checked_in' && !row.time_out)
    .sort((a, b) => (b.time_in ?? '').localeCompare(a.time_in ?? ''));
}

export async function searchAttendance(filters: {
  student_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: '' | 'checked_in' | 'completed';
}) {
  return (await getLocalAttendanceWithStudents())
    .filter((row) => row.date >= filters.start_date && row.date <= filters.end_date)
    .filter((row) => !filters.student_id || row.student_id.toLowerCase().includes(filters.student_id.toLowerCase()))
    .filter((row) => !filters.status || row.status === filters.status)
    .filter(
      (row) =>
        !filters.name ||
        row.students?.name?.toLowerCase().includes(filters.name.toLowerCase()),
    )
    .sort((a, b) => (b.time_in ?? '').localeCompare(a.time_in ?? ''));
}

export async function getAttendanceForDateRange(startDate: string, endDate: string): Promise<AttendanceWithStudent[]> {
  return (await getLocalAttendanceWithStudents())
    .filter((row) => row.date >= startDate && row.date <= endDate)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.time_in ?? '').localeCompare(a.time_in ?? ''));
}

export async function getAllStudentsForReports() {
  return (await getLocalStudents()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function syncOfflineQueue() {
  if (!navigator.onLine) {
    return { synced: 0, failed: 0, pending: await countPendingQueueItems(), pulled: false };
  }

  let synced = 0;
  let failed = 0;
  const items = await getQueueItems(['pending', 'failed']);

  for (const item of items) {
    const syncingItem: SyncQueueItem = {
      ...item,
      status: 'syncing',
      attempts: item.attempts + 1,
      updated_at: new Date().toISOString(),
    };
    await putQueueItem(syncingItem);

    try {
      await pushQueueItem(syncingItem);
      await deleteQueueItem(syncingItem.id);
      synced += 1;
    } catch (error) {
      const failedItem: SyncQueueItem = {
        ...syncingItem,
        status: 'failed',
        last_error: getSupabaseErrorMessage(error, 'Unable to synchronize offline change.'),
        updated_at: new Date().toISOString(),
      };
      await putQueueItem(failedItem);
      failed += 1;
      console.error('Offline sync failed:', failedItem.last_error);
      if (isNetworkUnavailable(error)) break;
    }
  }

  let pulled = false;
  if (failed === 0 && navigator.onLine) {
    try {
      await pullRemoteData();
      pulled = true;
    } catch (error) {
      failed += 1;
      console.error(getSupabaseErrorMessage(error, 'Unable to pull remote data after sync.'));
    }
  }

  const pending = await countPendingQueueItems();
  return { synced, failed, pending, pulled };
}

async function pushQueueItem(item: SyncQueueItem) {
  if (item.entity === 'students') {
    if (item.operation === 'delete') {
      const { error } = await supabase.from('students').delete().eq('id', item.recordId);
      if (error) throw error;
      return;
    }

    const student = await getLocalStudent(item.recordId);
    if (!student) return;

    const { data: existingStudent, error: lookupError } = await supabase
      .from('students')
      .select('id')
      .eq('id', item.recordId)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (existingStudent) {
      const { error } = await supabase.from('students').update(student).eq('id', item.recordId);
      if (error) throw error;
      return;
    }

    const { error } = await supabase.from('students').insert(student);
    if (error) throw error;
    return;
  }

  const attendance = await getLocalAttendance(item.recordId);
  if (!attendance) return;
  const { error } = await supabase.from('attendance').upsert(attendance, { onConflict: 'id' });
  if (error) throw error;
}

async function pullRemoteData() {
  const remoteStudents: Student[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    remoteStudents.push(...((data ?? []) as Record<string, unknown>[]).map(normalizeRemoteStudent));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const remoteAttendance: Attendance[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    remoteAttendance.push(...((data ?? []) as Record<string, unknown>[]).map(normalizeRemoteAttendance));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const cleanStudents = [];
  for (const student of remoteStudents) {
    if (!(await hasPendingQueueFor('students', student.id))) cleanStudents.push(student);
  }

  const cleanAttendance = [];
  for (const attendance of remoteAttendance) {
    if (!(await hasPendingQueueFor('attendance', attendance.id))) cleanAttendance.push(attendance);
  }

  await putLocalStudents(cleanStudents);
  await putLocalAttendanceRows(cleanAttendance);
  await setMetaValue('last_successful_sync_at', new Date().toISOString());
}
