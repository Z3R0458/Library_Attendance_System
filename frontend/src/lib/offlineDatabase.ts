import type { Attendance, AttendanceWithStudent, Student } from '../types';

const DB_NAME = 'library-attendance-offline';
const DB_VERSION = 1;
const ENCRYPTION_PREFIX = 'enc:v1:';
const GENERATED_KEY_STORAGE_KEY = 'library-offline-generated-key-v1';
const KEY_SALT = 'library-attendance-system-offline-cache';

export type SyncEntity = 'students' | 'attendance';
export type SyncOperation = 'upsert' | 'delete';
export type SyncStatus = 'pending' | 'syncing' | 'failed' | 'synced';

export interface SyncQueueItem {
  id: string;
  entity: SyncEntity;
  operation: SyncOperation;
  recordId: string;
  recordKey?: string;
  status: SyncStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

type StoredStudent = Omit<Student, 'name' | 'course' | 'profile_picture_url'> & {
  name: string;
  course: string;
  profile_picture_url: string | null;
};

type StoredAttendance = Omit<Attendance, 'purpose'> & {
  purpose: string | null;
};

let dbPromise: Promise<IDBDatabase> | null = null;
let cryptoKeyPromise: Promise<CryptoKey> | null = null;

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
  });
}

function openOfflineDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains('students')) {
          const students = db.createObjectStore('students', { keyPath: 'id' });
          students.createIndex('student_id', 'student_id', { unique: true });
          students.createIndex('qr_token', 'qr_token', { unique: true });
          students.createIndex('created_at', 'created_at');
        }

        if (!db.objectStoreNames.contains('attendance')) {
          const attendance = db.createObjectStore('attendance', { keyPath: 'id' });
          attendance.createIndex('student_id', 'student_id');
          attendance.createIndex('date', 'date');
          attendance.createIndex('status', 'status');
          attendance.createIndex('time_in', 'time_in');
        }

        if (!db.objectStoreNames.contains('sync_queue')) {
          const queue = db.createObjectStore('sync_queue', { keyPath: 'id' });
          queue.createIndex('status', 'status');
          queue.createIndex('created_at', 'created_at');
          queue.createIndex('record', ['entity', 'recordId']);
        }

        if (!db.objectStoreNames.contains('sync_logs')) {
          db.createObjectStore('sync_logs', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Unable to open offline database.'));
    });
  }

  return dbPromise;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function getCryptoKey() {
  if (!cryptoKeyPromise) {
    cryptoKeyPromise = (async () => {
      const configuredSecret = String(import.meta.env.VITE_OFFLINE_DATABASE_SECRET ?? '').trim();

      if (configuredSecret) {
        const material = await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(configuredSecret),
          'PBKDF2',
          false,
          ['deriveKey'],
        );

        return crypto.subtle.deriveKey(
          {
            name: 'PBKDF2',
            salt: new TextEncoder().encode(`${KEY_SALT}:${location.origin}`),
            iterations: 210_000,
            hash: 'SHA-256',
          },
          material,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt'],
        );
      }

      const existing = localStorage.getItem(GENERATED_KEY_STORAGE_KEY);
      if (existing) {
        return crypto.subtle.importKey('raw', base64ToBytes(existing), 'AES-GCM', false, [
          'encrypt',
          'decrypt',
        ]);
      }

      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
        'encrypt',
        'decrypt',
      ]);
      const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
      localStorage.setItem(GENERATED_KEY_STORAGE_KEY, bytesToBase64(raw));
      return key;
    })();
  }

  return cryptoKeyPromise;
}

async function encryptNullable(value: string | null | undefined) {
  if (!value) return value ?? null;
  if (value.startsWith(ENCRYPTION_PREFIX)) return value;

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await getCryptoKey(),
    new TextEncoder().encode(value),
  );

  return `${ENCRYPTION_PREFIX}${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ciphertext))}`;
}

async function decryptNullable(value: string | null | undefined) {
  if (!value) return value ?? null;
  if (!value.startsWith(ENCRYPTION_PREFIX)) return value;

  const parts = value.slice(ENCRYPTION_PREFIX.length).split(':');
  const [encodedIv, encodedCiphertext] = parts;
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(encodedIv) },
    await getCryptoKey(),
    base64ToBytes(encodedCiphertext),
  );

  return new TextDecoder().decode(plaintext);
}

export function createUuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function toStoredStudent(student: Student): Promise<StoredStudent> {
  return {
    ...student,
    name: (await encryptNullable(student.name)) ?? '',
    course: (await encryptNullable(student.course)) ?? '',
    profile_picture_url: await encryptNullable(student.profile_picture_url),
  };
}

async function fromStoredStudent(student: StoredStudent): Promise<Student> {
  return {
    ...student,
    name: (await decryptNullable(student.name)) ?? '',
    course: (await decryptNullable(student.course)) ?? '',
    profile_picture_url: await decryptNullable(student.profile_picture_url),
  };
}

async function toStoredAttendance(attendance: Attendance): Promise<StoredAttendance> {
  return {
    ...attendance,
    purpose: await encryptNullable(attendance.purpose),
  };
}

async function fromStoredAttendance(attendance: StoredAttendance): Promise<Attendance> {
  return {
    ...attendance,
    purpose: await decryptNullable(attendance.purpose),
  };
}

async function getAllFromStore<T>(storeName: string) {
  const db = await openOfflineDb();
  const transaction = db.transaction(storeName, 'readonly');
  return requestToPromise<T[]>(transaction.objectStore(storeName).getAll());
}

async function getByIndex<T>(storeName: string, indexName: string, value: IDBValidKey) {
  const db = await openOfflineDb();
  const transaction = db.transaction(storeName, 'readonly');
  return requestToPromise<T | undefined>(transaction.objectStore(storeName).index(indexName).get(value));
}

export async function putLocalStudent(student: Student, enqueue = false) {
  const stored = await toStoredStudent(student);
  const db = await openOfflineDb();
  const stores = enqueue ? ['students', 'sync_queue'] : ['students'];
  const transaction = db.transaction(stores, 'readwrite');
  transaction.objectStore('students').put(stored);
  if (enqueue) {
    transaction.objectStore('sync_queue').put(createQueueItem('students', 'upsert', student.id, student.student_id));
  }
  await transactionDone(transaction);
}

export async function putLocalStudents(students: Student[]) {
  const stored = await Promise.all(students.map(toStoredStudent));
  const db = await openOfflineDb();
  const transaction = db.transaction('students', 'readwrite');
  const store = transaction.objectStore('students');
  stored.forEach((student) => store.put(student));
  await transactionDone(transaction);
}

export async function getLocalStudent(id: string) {
  const db = await openOfflineDb();
  const transaction = db.transaction('students', 'readonly');
  const stored = await requestToPromise<StoredStudent | undefined>(
    transaction.objectStore('students').get(id),
  );
  return stored ? fromStoredStudent(stored) : null;
}

export async function getLocalStudentByStudentId(studentId: string) {
  const stored = await getByIndex<StoredStudent>('students', 'student_id', studentId);
  return stored ? fromStoredStudent(stored) : null;
}

export async function getLocalStudentByQrToken(qrToken: string) {
  const stored = await getByIndex<StoredStudent>('students', 'qr_token', qrToken);
  return stored ? fromStoredStudent(stored) : null;
}

export async function getLocalStudents() {
  const stored = await getAllFromStore<StoredStudent>('students');
  return Promise.all(stored.map(fromStoredStudent));
}

export async function deleteLocalStudent(id: string, studentId?: string, enqueue = false) {
  const db = await openOfflineDb();
  const stores = enqueue ? ['students', 'sync_queue'] : ['students'];
  const transaction = db.transaction(stores, 'readwrite');
  transaction.objectStore('students').delete(id);
  if (enqueue) {
    transaction.objectStore('sync_queue').put(createQueueItem('students', 'delete', id, studentId));
  }
  await transactionDone(transaction);
}

export async function putLocalAttendance(attendance: Attendance, enqueue = false) {
  const stored = await toStoredAttendance(attendance);
  const db = await openOfflineDb();
  const stores = enqueue ? ['attendance', 'sync_queue'] : ['attendance'];
  const transaction = db.transaction(stores, 'readwrite');
  transaction.objectStore('attendance').put(stored);
  if (enqueue) {
    transaction.objectStore('sync_queue').put(
      createQueueItem('attendance', 'upsert', attendance.id, attendance.student_id),
    );
  }
  await transactionDone(transaction);
}

export async function putLocalAttendanceRows(attendanceRows: Attendance[]) {
  const stored = await Promise.all(attendanceRows.map(toStoredAttendance));
  const db = await openOfflineDb();
  const transaction = db.transaction('attendance', 'readwrite');
  const store = transaction.objectStore('attendance');
  stored.forEach((attendance) => store.put(attendance));
  await transactionDone(transaction);
}

export async function getLocalAttendance(id: string) {
  const db = await openOfflineDb();
  const transaction = db.transaction('attendance', 'readonly');
  const stored = await requestToPromise<StoredAttendance | undefined>(
    transaction.objectStore('attendance').get(id),
  );
  return stored ? fromStoredAttendance(stored) : null;
}

export async function getLocalAttendanceRows() {
  const stored = await getAllFromStore<StoredAttendance>('attendance');
  return Promise.all(stored.map(fromStoredAttendance));
}

export async function getLocalAttendanceByStudentId(studentId: string) {
  const db = await openOfflineDb();
  const transaction = db.transaction('attendance', 'readonly');
  const stored = await requestToPromise<StoredAttendance[]>(
    transaction.objectStore('attendance').index('student_id').getAll(studentId),
  );
  return Promise.all(stored.map(fromStoredAttendance));
}

export async function getLocalAttendanceWithStudents(): Promise<AttendanceWithStudent[]> {
  const [attendanceRows, students] = await Promise.all([getLocalAttendanceRows(), getLocalStudents()]);
  const studentById = new Map(students.map((student) => [student.student_id, student]));

  return attendanceRows.map((attendance) => {
    const student = studentById.get(attendance.student_id);
    return {
      ...attendance,
      students: student
        ? {
            name: student.name,
            course: student.course,
            year_level: student.year_level,
            profile_picture_url: student.profile_picture_url,
          }
        : undefined,
    };
  });
}

export async function getQueueItems(statuses: SyncStatus[] = ['pending', 'failed']) {
  const items = await getAllFromStore<SyncQueueItem>('sync_queue');
  return items
    .filter((item) => statuses.includes(item.status))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function countPendingQueueItems() {
  return (await getQueueItems(['pending', 'failed', 'syncing'])).length;
}

export async function putQueueItem(item: SyncQueueItem) {
  const db = await openOfflineDb();
  const transaction = db.transaction('sync_queue', 'readwrite');
  transaction.objectStore('sync_queue').put(item);
  await transactionDone(transaction);
}

export async function deleteQueueItem(id: string) {
  const db = await openOfflineDb();
  const transaction = db.transaction('sync_queue', 'readwrite');
  transaction.objectStore('sync_queue').delete(id);
  await transactionDone(transaction);
}

export async function hasPendingQueueFor(entity: SyncEntity, recordId: string) {
  const items = await getQueueItems(['pending', 'failed', 'syncing']);
  return items.some((item) => item.entity === entity && item.recordId === recordId);
}

export async function getMetaValue<T>(key: string) {
  const db = await openOfflineDb();
  const transaction = db.transaction('meta', 'readonly');
  const row = await requestToPromise<{ key: string; value: T } | undefined>(
    transaction.objectStore('meta').get(key),
  );
  return row?.value ?? null;
}

export async function setMetaValue<T>(key: string, value: T) {
  const db = await openOfflineDb();
  const transaction = db.transaction('meta', 'readwrite');
  transaction.objectStore('meta').put({ key, value, updated_at: new Date().toISOString() });
  await transactionDone(transaction);
}

function createQueueItem(
  entity: SyncEntity,
  operation: SyncOperation,
  recordId: string,
  recordKey?: string,
): SyncQueueItem {
  const now = new Date().toISOString();
  return {
    id: createUuid(),
    entity,
    operation,
    recordId,
    recordKey,
    status: 'pending',
    attempts: 0,
    last_error: null,
    created_at: now,
    updated_at: now,
  };
}
