import { useState, useEffect, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { PageLayout } from '../components/layout/Navbar';
import { Alert } from '../components/ui/Alert';
import { buildQrPayload } from '../lib/constants';
import { getStudentByStudentId } from '../lib/libraryRepository';
import { createSvgPngObjectUrl } from '../lib/qrDownload';
import type { Student } from '../types';

export default function MyQR() {
  const location = useLocation();
  const initialId = (location.state as { studentId?: string })?.studentId ?? '';
  const justRegistered = (location.state as { justRegistered?: boolean })?.justRegistered;

  const [studentId, setStudentId] = useState(initialId);
  const [student, setStudent] = useState<Student | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [qrDownloadUrl, setQrDownloadUrl] = useState('');

  const lookup = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!studentId.trim()) return;

    setLoading(true);
    setError('');
    setStudent(null);
    setQrDownloadUrl('');

    const data = await getStudentByStudentId(studentId.trim());

    setLoading(false);

    if (!data) {
      setError('Student ID not found. Please register first.');
      return;
    }

    setStudent(data as Student);
  };

  useEffect(() => {
    if (initialId) {
      lookup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let nextUrl = '';
    let cancelled = false;

    setQrDownloadUrl('');

    if (!student) return undefined;

    const frame = window.requestAnimationFrame(() => {
      void createSvgPngObjectUrl(document.getElementById('student-qr') as unknown as SVGElement | null)
        .then((url) => {
          if (cancelled || !url) {
            if (url) URL.revokeObjectURL(url);
            return;
          }

          nextUrl = url;
          setQrDownloadUrl(url);
        })
        .catch(() => setQrDownloadUrl(''));
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [student]);

  return (
    <PageLayout>
      <div className="container" style={{ maxWidth: 480 }}>
        <div className="card">
          <div className="card-header">
            <h2>My QR Code</h2>
            <p>Your unique library attendance QR code</p>
          </div>
          <div className="card-body">
            {justRegistered && (
              <Alert type="success">Registration successful! Save or print your QR code below.</Alert>
            )}

            <form onSubmit={lookup}>
              <div className="form-group">
                <label className="form-label" htmlFor="lookup_id">Student ID</label>
                <input
                  id="lookup_id"
                  className="form-control"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder="Enter your student ID"
                />
              </div>
              <button type="submit" className="btn btn-maroon" style={{ width: '100%' }} disabled={loading}>
                {loading ? 'Looking up...' : 'Show My QR Code'}
              </button>
            </form>

            {error && <Alert type="error">{error}</Alert>}

            {student && (
              <div className="qr-display">
                {student.profile_picture_url && (
                  <img
                    className="student-profile-large"
                    src={student.profile_picture_url}
                    alt={`${student.name} profile`}
                  />
                )}
                <QRCodeSVG
                  id="student-qr"
                  value={buildQrPayload(student.qr_token, student.student_id)}
                  size={220}
                  level="H"
                  includeMargin
                />
                <h3 style={{ margin: '1rem 0 0.25rem' }}>{student.name}</h3>
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>
                  {student.student_id} | {student.course} | Year {student.year_level}
                </p>
                <a
                  href={qrDownloadUrl || undefined}
                  download={student ? `qr-${student.student_id}.png` : undefined}
                  className="btn btn-maroon"
                  aria-disabled={!qrDownloadUrl}
                  style={{
                    marginTop: '1rem',
                    pointerEvents: qrDownloadUrl ? 'auto' : 'none',
                    opacity: qrDownloadUrl ? 1 : 0.65,
                  }}
                >
                  {qrDownloadUrl ? 'Download QR Code' : 'Preparing QR Code...'}
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
