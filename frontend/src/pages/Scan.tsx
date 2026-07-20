import { useCallback, useEffect, useRef, useState } from 'react';
import { QRScanner } from '../components/scanner/QRScanner';
import { Alert } from '../components/ui/Alert';
import { PURPOSES, TIMEZONE, type ParsedQrPayload } from '../lib/constants';
import { getStudentByQrPayload, processQrScan } from '../lib/libraryRepository';
import type { ScanAction } from '../hooks/useAttendance';
import type { ScanResult, Student } from '../types';

const SAME_STUDENT_SCAN_COOLDOWN_MS = 8000;
const RESULT_DISPLAY_MS = 2500;

const SCAN_MODES: Record<ScanAction, { label: string; result: string; help: string }> = {
  time_in: {
    label: 'Login',
    result: 'Successfully Logged In',
    help: 'Scan the student QR code to automatically log the student in.',
  },
  time_out: {
    label: 'Logout',
    result: 'Successfully Logged Out',
    help: 'Scan the student QR code to automatically log the student out.',
  },
};

function formatDate(value: Date) {
  return value.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: TIMEZONE,
  });
}

function formatTime(value?: string | Date | null) {
  if (!value) return '-';
  return new Date(value).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: TIMEZONE,
  });
}

function formatDuration(start?: string | null, end?: string | null) {
  if (!start || !end) return '-';

  const diff = Math.max(0, new Date(end).getTime() - new Date(start).getTime());
  const totalMinutes = Math.floor(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours && minutes) return `${hours} hr ${minutes} min`;
  if (hours) return `${hours} hr`;
  return `${minutes} min`;
}

export default function Scan() {
  const [selectedPurpose, setSelectedPurpose] = useState<(typeof PURPOSES)[number]>(PURPOSES[0]);
  const [verifiedStudent, setVerifiedStudent] = useState<Student | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<Date | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [purposeError, setPurposeError] = useState('');
  const [recording, setRecording] = useState(false);
  const lastProcessedRef = useRef(new Map<string, number>());
  const inFlightScansRef = useRef(new Set<string>());
  const clearTimerRef = useRef<number | null>(null);

  const clearScan = useCallback(() => {
    setVerifiedStudent(null);
    setVerifiedAt(null);
    setResult(null);
    setPurposeError('');
  }, []);

  const scheduleClearScan = useCallback(() => {
    if (clearTimerRef.current) {
      window.clearTimeout(clearTimerRef.current);
    }
    clearTimerRef.current = window.setTimeout(clearScan, RESULT_DISPLAY_MS);
  }, [clearScan]);

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) {
        window.clearTimeout(clearTimerRef.current);
      }
    };
  }, []);

  const handleScan = useCallback(
    async (payload: ParsedQrPayload) => {
      const scanKey = payload.studentId ?? payload.qrToken;
      if (!scanKey) return;
      if (inFlightScansRef.current.has(scanKey)) return;

      const nowMs = Date.now();
      const lastProcessedAt = lastProcessedRef.current.get(scanKey) ?? 0;
      if (nowMs - lastProcessedAt < SAME_STUDENT_SCAN_COOLDOWN_MS) {
        return;
      }

      lastProcessedRef.current.set(scanKey, nowMs);
      inFlightScansRef.current.add(scanKey);
      setRecording(true);
      setResult(null);
      setPurposeError('');

      try {
        const data = await getStudentByQrPayload(payload);

        if (!data) {
          setResult({
            success: false,
            message: 'Invalid or unregistered QR code. Attendance was not recorded.',
            error: 'invalid_qr',
          });
          scheduleClearScan();
          return;
        }

        const student = data as Student;
        setVerifiedStudent(student);
        setVerifiedAt(new Date());

        const scanResult = await processQrScan(payload, selectedPurpose);

        const nextResult: ScanResult =
          scanResult.success && scanResult.action === 'time_in' && scanResult.attendance
            ? {
                ...scanResult,
                message: `${scanResult.message} Purpose: ${selectedPurpose}`,
                attendance: { ...scanResult.attendance, purpose: selectedPurpose },
              }
            : scanResult;

        setResult(nextResult);
        scheduleClearScan();
      } catch (error) {
        lastProcessedRef.current.delete(scanKey);
        setResult({
          success: false,
          message: error instanceof Error ? error.message : 'Unable to validate this QR code.',
          error: 'invalid_qr',
        });
        scheduleClearScan();
      } finally {
        inFlightScansRef.current.delete(scanKey);
        setRecording(false);
      }
    },
    [scheduleClearScan, selectedPurpose],
  );

  return (
    <main className="scanner-kiosk-page">
      <section className="card scanner-kiosk-card">
        <div className="card-header scanner-kiosk-header">
          <h2>Attendance Scanner</h2>
          <p>Scan the student QR code. The system automatically records login or logout from today's latest local attendance record.</p>
        </div>
        <div className="card-body">
          <p className="scan-mode-help">
            Mode: <strong>Automatic</strong>. No attendance request is sent to Supabase during scanning.
          </p>

          {!verifiedStudent && (
            <div className="form-group scan-purpose-select">
              <label className="form-label" htmlFor="scan-purpose">Purpose of Visit</label>
              <select
                id="scan-purpose"
                className="form-control"
                value={selectedPurpose}
                onChange={(e) => setSelectedPurpose(e.target.value as (typeof PURPOSES)[number])}
              >
                {PURPOSES.map((purpose) => (
                  <option key={purpose} value={purpose}>
                    {purpose}
                  </option>
                ))}
              </select>
            </div>
          )}

          {recording && <Alert type="info">Recording attendance...</Alert>}
          {purposeError && <Alert type="error">{purposeError}</Alert>}

          {result && !verifiedStudent && (
            <div className="scan-result error">
              <strong>Scan failed</strong>
              <p style={{ margin: '0.5rem 0 0' }}>{result.message}</p>
            </div>
          )}

          {verifiedStudent && verifiedAt && (
            <VerificationCard
              student={verifiedStudent}
              verifiedAt={verifiedAt}
              scanAction={result?.action ?? 'time_in'}
              selectedPurpose={selectedPurpose}
              result={result}
              recording={recording}
            />
          )}

          <QRScanner
            onScan={handleScan}
            paused={false}
            label="student QR code"
          />

          <div style={{ marginTop: '1rem' }}>
            <Alert type="info">
              <strong>Automatic workflow:</strong> Scan once. The system validates the QR code locally, detects login or logout, and saves the attendance record for synchronization.
            </Alert>
          </div>
        </div>
      </section>
    </main>
  );
}

function VerificationCard({
  student,
  verifiedAt,
  scanAction,
  selectedPurpose,
  result,
  recording,
}: {
  student: Student;
  verifiedAt: Date;
  scanAction: ScanAction;
  selectedPurpose: string;
  result: ScanResult | null;
  recording: boolean;
}) {
  const isRecorded = Boolean(result?.success);
  const isError = Boolean(result && !result.success);
  const statusText = isRecorded
    ? SCAN_MODES[scanAction].result
    : isError
      ? result?.message
      : recording
        ? 'Recording attendance...'
        : 'Validated. Recording attendance...';

  return (
    <div className={`verification-card${isRecorded ? ' recorded' : ''}${isError ? ' failed' : ''}`}>
      <div className="verification-details">
        <div className="verification-title-row">
          <div>
            <span className="eyebrow">Student Verification</span>
            <h3>{student.name}</h3>
          </div>
          {isRecorded && <span className="success-pulse" aria-hidden="true" />}
        </div>

        <dl className="verification-grid">
          <div>
            <dt>Student ID</dt>
            <dd>{student.student_id}</dd>
          </div>
          <div>
            <dt>Course</dt>
            <dd>{student.course}</dd>
          </div>
          <div>
            <dt>Year Level</dt>
            <dd>Year {student.year_level}</dd>
          </div>
          <div>
            <dt>Current Date</dt>
            <dd>{formatDate(verifiedAt)}</dd>
          </div>
          <div>
            <dt>Current Time</dt>
            <dd>{formatTime(verifiedAt)}</dd>
          </div>
          <div>
            <dt>Detected Action</dt>
            <dd>{SCAN_MODES[scanAction].label}</dd>
          </div>
          {scanAction === 'time_in' && (
            <div>
              <dt>Selected Purpose</dt>
              <dd>{result?.attendance?.purpose ?? selectedPurpose}</dd>
            </div>
          )}
          {scanAction === 'time_out' && (
            <>
              <div>
                <dt>Time In</dt>
                <dd>{formatTime(result?.attendance?.time_in)}</dd>
              </div>
              <div>
                <dt>Time Out</dt>
                <dd>{formatTime(result?.attendance?.time_out)}</dd>
              </div>
              <div>
                <dt>Total Duration</dt>
                <dd>{formatDuration(result?.attendance?.time_in, result?.attendance?.time_out)}</dd>
              </div>
            </>
          )}
          <div className="verification-status">
            <dt>Status</dt>
            <dd>{statusText}</dd>
          </div>
        </dl>

        {recording && <p className="verification-note">Please wait. Attendance is being recorded automatically.</p>}
      </div>
    </div>
  );
}
