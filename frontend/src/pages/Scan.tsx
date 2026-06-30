import { useCallback, useState } from 'react';
import { QRScanner } from '../components/scanner/QRScanner';
import { Alert } from '../components/ui/Alert';
import { getSupabaseErrorMessage, supabase } from '../lib/supabase';
import { PURPOSES, TIMEZONE } from '../lib/constants';
import { useProcessScan, type ScanAction } from '../hooks/useAttendance';
import type { ScanResult, Student } from '../types';

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
  const [scanAction, setScanAction] = useState<ScanAction>('time_in');
  const [selectedPurpose, setSelectedPurpose] = useState<(typeof PURPOSES)[number]>(PURPOSES[0]);
  const [verifiedStudent, setVerifiedStudent] = useState<Student | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<Date | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [purposeError, setPurposeError] = useState('');
  const [paused, setPaused] = useState(false);
  const processScan = useProcessScan();

  const clearScan = useCallback(() => {
    setVerifiedStudent(null);
    setVerifiedAt(null);
    setResult(null);
    setPurposeError('');
    setPaused(false);
  }, []);

  const handleScan = useCallback(
    async (token: string) => {
      if (processScan.isPending || paused) return;

      setPaused(true);
      setResult(null);
      setPurposeError('');

      try {
        const { data, error } = await supabase
          .from('students')
          .select('*')
          .eq('qr_token', token)
          .eq('is_active', true)
          .maybeSingle();

        if (error || !data) {
          setResult({
            success: false,
            message: 'Invalid or unregistered QR code. Attendance was not recorded.',
            error: 'invalid_qr',
          });
          window.setTimeout(clearScan, 3000);
          return;
        }

        const student = data as Student;
        setVerifiedStudent(student);
        setVerifiedAt(new Date());

        const scanResult = await processScan.mutateAsync({
          qrToken: student.qr_token,
          action: scanAction,
        });

        let nextResult = scanResult;

        if (scanResult.success && scanResult.action === 'time_in' && scanResult.attendance?.id) {
          try {
            const { data, error } = await supabase.rpc('update_attendance_purpose', {
              p_attendance_id: scanResult.attendance.id,
              p_purpose: selectedPurpose,
            });

            if (error) {
              setPurposeError(error.message);
            } else {
              const response = data as { success?: boolean; message?: string };
              if (!response.success) {
                setPurposeError(response.message ?? 'Unable to save purpose.');
              } else {
                nextResult = {
                  ...scanResult,
                  message: `${scanResult.message}. Purpose: ${selectedPurpose}`,
                  attendance: { ...scanResult.attendance, purpose: selectedPurpose },
                };
              }
            }
          } catch (error) {
            setPurposeError(
              getSupabaseErrorMessage(error, 'Unable to save purpose. Check your Supabase connection.'),
            );
          }
        }

        setResult(nextResult);
        window.setTimeout(clearScan, nextResult.success ? 6500 : 4500);
      } catch (error) {
        setResult({
          success: false,
          message: getSupabaseErrorMessage(error, 'Unable to validate this QR code.'),
          error: 'invalid_qr',
        });
        window.setTimeout(clearScan, 3000);
      }
    },
    [clearScan, paused, processScan, scanAction, selectedPurpose],
  );

  return (
    <main className="scanner-kiosk-page">
      <section className="card scanner-kiosk-card">
        <div className="card-header scanner-kiosk-header">
          <h2>{SCAN_MODES[scanAction].label} Scanner</h2>
          <p>{SCAN_MODES[scanAction].help}</p>
        </div>
        <div className="card-body">
          <div className="scan-mode-control" aria-label="Scanner mode">
            {Object.entries(SCAN_MODES).map(([action, item]) => (
              <button
                key={action}
                type="button"
                className={`scan-mode-button${scanAction === action ? ' active' : ''}`}
                disabled={processScan.isPending || paused}
                onClick={() => {
                  setScanAction(action as ScanAction);
                  clearScan();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          <p className="scan-mode-help">
            Mode: <strong>{SCAN_MODES[scanAction].label}</strong>. Attendance records automatically after a successful scan.
          </p>

          {scanAction === 'time_in' && !verifiedStudent && (
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

          {processScan.isPending && <Alert type="info">Recording attendance...</Alert>}
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
              scanAction={scanAction}
              selectedPurpose={selectedPurpose}
              result={result}
              recording={processScan.isPending}
            />
          )}

          {!verifiedStudent && (
            <QRScanner
              key={scanAction}
              onScan={handleScan}
              paused={paused || processScan.isPending}
              label={`student QR code for ${SCAN_MODES[scanAction].label}`}
            />
          )}

          <div style={{ marginTop: '1rem' }}>
            <Alert type="info">
              <strong>Automatic workflow:</strong> Scan once. The system validates the QR code, displays the student profile, and records {SCAN_MODES[scanAction].label} immediately.
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
      <div className="verification-photo-wrap">
        {student.profile_picture_url ? (
          <img
            className="verification-photo"
            src={student.profile_picture_url}
            alt={`${student.name} profile`}
          />
        ) : (
          <div className="verification-photo placeholder">No Photo</div>
        )}
      </div>

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
            <dt>Scan Mode</dt>
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
