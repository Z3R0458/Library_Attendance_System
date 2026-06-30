import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { PageLayout } from '../components/layout/Navbar';
import { Alert } from '../components/ui/Alert';
import { getSupabaseErrorMessage, supabase } from '../lib/supabase';
import { buildQrPayload, COURSE_OPTIONS, YEAR_LEVELS } from '../lib/constants';
import { createSvgPngObjectUrl } from '../lib/qrDownload';
import {
  getProfileImageErrorMessage,
  uploadStudentProfileImage,
  validateProfileImage,
} from '../lib/profileImages';
import {
  escapeLikePattern,
  isDuplicateStudentNameError,
  normalizeStudentName,
} from '../lib/studentValidation';
import type { Student } from '../types';

export default function Register() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registeredStudent, setRegisteredStudent] = useState<Student | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrDownloadUrl, setQrDownloadUrl] = useState('');
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [profilePreviewUrl, setProfilePreviewUrl] = useState('');
  const [form, setForm] = useState({
    student_id: '',
    name: '',
    course: '',
    year_level: 1,
  });

  useEffect(() => {
    return () => {
      if (profilePreviewUrl) URL.revokeObjectURL(profilePreviewUrl);
    };
  }, [profilePreviewUrl]);

  const handleProfileImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setError('');

    if (profilePreviewUrl) {
      URL.revokeObjectURL(profilePreviewUrl);
      setProfilePreviewUrl('');
    }

    if (!file) {
      setProfileImage(null);
      return;
    }

    const validationError = validateProfileImage(file);
    if (validationError) {
      setProfileImage(null);
      e.target.value = '';
      setError(validationError);
      return;
    }

    setProfileImage(file);
    setProfilePreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setRegisteredStudent(null);
    setShowQrModal(false);
    setQrDownloadUrl('');
    setLoading(true);

    const { student_id, name, course, year_level } = form;
    const studentId = student_id.trim();
    const normalizedName = normalizeStudentName(name);

    if (!studentId || !normalizedName || !course.trim()) {
      setError('All fields are required.');
      setLoading(false);
      return;
    }

    if (!profileImage) {
      setError('Profile picture is required.');
      setLoading(false);
      return;
    }

    if (!COURSE_OPTIONS.includes(course as (typeof COURSE_OPTIONS)[number])) {
      setError('Please select a valid course.');
      setLoading(false);
      return;
    }

    try {
      const { data: existing, error: existingError } = await supabase
        .from('students')
        .select('id')
        .eq('student_id', studentId)
        .maybeSingle();

      if (existingError) {
        setError(existingError.message);
        return;
      }

      if (existing) {
        setError('Student ID already exists.');
        return;
      }

      const { data: existingName, error: existingNameError } = await supabase
        .from('students')
        .select('id')
        .ilike('name', escapeLikePattern(normalizedName))
        .limit(1);

      if (existingNameError) {
        setError(existingNameError.message);
        return;
      }

      if (existingName.length > 0) {
        setError('Student name already exists.');
        return;
      }

      let profilePictureUrl = '';
      try {
        profilePictureUrl = await uploadStudentProfileImage(profileImage, studentId);
      } catch (error) {
        setError(getProfileImageErrorMessage(error));
        return;
      }

      const { data: newStudent, error: insertError } = await supabase
        .from('students')
        .insert({
          student_id: studentId,
          name: normalizedName,
          course: course.trim(),
          year_level,
          profile_picture_url: profilePictureUrl,
        })
        .select('*')
        .single();

      if (insertError) {
        setError(isDuplicateStudentNameError(insertError) ? 'Student name already exists.' : insertError.message);
        return;
      }

      setRegisteredStudent(newStudent as Student);
      setShowQrModal(true);
    } catch (error) {
      setError(
        getSupabaseErrorMessage(
          error,
          'Unable to register right now. Check your Supabase URL, key, and network connection.',
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let nextUrl = '';
    let cancelled = false;

    setQrDownloadUrl('');

    if (!registeredStudent || !showQrModal) return undefined;

    const frame = window.requestAnimationFrame(() => {
      void createSvgPngObjectUrl(
        document.getElementById('registered-student-qr') as unknown as SVGElement | null,
      )
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
  }, [registeredStudent, showQrModal]);

  return (
    <PageLayout>
      <div className="container" style={{ maxWidth: 560 }}>
        <div className="card">
          <div className="card-header">
            <h2>Student Registration</h2>
            <p>Create your library account and get your unique QR code</p>
          </div>
          <div className="card-body">
            {error && <Alert type="error">{error}</Alert>}
            {registeredStudent && (
              <div className="registration-success">
                <Alert type="success">Registration successful! Your QR code is ready.</Alert>
                <button
                  type="button"
                  className="btn btn-maroon"
                  style={{ width: '100%' }}
                  onClick={() => setShowQrModal(true)}
                >
                  Show QR Code
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="student_id">Student ID</label>
                <input
                  id="student_id"
                  className="form-control"
                  value={form.student_id}
                  onChange={(e) => setForm({ ...form, student_id: e.target.value })}
                  placeholder="Enter your student ID"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="name">Full Name</label>
                <input
                  id="name"
                  className="form-control"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Enter your full name"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="course">Course</label>
                <select
                  id="course"
                  className="form-control"
                  value={form.course}
                  onChange={(e) => setForm({ ...form, course: e.target.value })}
                  required
                >
                  <option value="">Select course</option>
                  {COURSE_OPTIONS.map((courseOption) => (
                    <option key={courseOption} value={courseOption}>
                      {courseOption}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Year Level</label>
                <div className="year-options">
                  {YEAR_LEVELS.map(({ value, label }) => (
                    <label
                      key={value}
                      className={`year-option${form.year_level === value ? ' selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="year_level"
                        value={value}
                        checked={form.year_level === value}
                        onChange={() => setForm({ ...form, year_level: value })}
                      />
                      <div style={{ fontWeight: 700, fontSize: '1.25rem' }}>{value}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label}</div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="profile_picture">Profile Picture</label>
                <input
                  id="profile_picture"
                  type="file"
                  className="form-control"
                  accept="image/jpeg,image/png,image/webp,image/*"
                  onChange={handleProfileImageChange}
                />
                <p className="form-help">
                  Choose a photo from Gallery, Photos, Files, or Camera when your phone asks.
                </p>
                {profilePreviewUrl && (
                  <div className="profile-upload-preview">
                    <img src={profilePreviewUrl} alt="Profile preview" />
                    <span>{profileImage?.name}</span>
                  </div>
                )}
              </div>

              <button type="submit" className="btn btn-maroon" style={{ width: '100%' }} disabled={loading}>
                {loading ? 'Registering...' : 'Register Account'}
              </button>
            </form>

            <p style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--text-muted)' }}>
              Already registered? <Link to="/my-qr">View your QR code</Link>
            </p>
          </div>
        </div>
      </div>

      {registeredStudent && showQrModal && (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowQrModal(false)}>
          <div
            className="qr-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="registered-qr-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="qr-modal-header">
              <div>
                <h3 id="registered-qr-title">Student QR Code</h3>
                <p>{registeredStudent.name}</p>
              </div>
              <button
                type="button"
                className="modal-close"
                aria-label="Close QR code"
                onClick={() => setShowQrModal(false)}
              >
                x
              </button>
            </div>
            <div className="qr-modal-body">
              <QRCodeSVG
                id="registered-student-qr"
                value={buildQrPayload(registeredStudent.qr_token)}
                size={360}
                level="H"
                includeMargin
              />
              {registeredStudent.profile_picture_url && (
                <img
                  className="qr-modal-photo"
                  src={registeredStudent.profile_picture_url}
                  alt={`${registeredStudent.name} profile`}
                />
              )}
              <p>
                {registeredStudent.student_id} | {registeredStudent.course} | Year{' '}
                {registeredStudent.year_level}
              </p>
              <a
                href={qrDownloadUrl || undefined}
                download={`qr-${registeredStudent.student_id}.png`}
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
          </div>
        </div>
      )}
    </PageLayout>
  );
}
