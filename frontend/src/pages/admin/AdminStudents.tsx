import { useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageLayout } from '../../components/layout/Navbar';
import { Alert } from '../../components/ui/Alert';
import { supabase } from '../../lib/supabase';
import { COURSE_OPTIONS, YEAR_LEVELS } from '../../lib/constants';
import { uploadStudentProfileImage, validateProfileImage } from '../../lib/profileImages';
import {
  escapeLikePattern,
  isDuplicateStudentNameError,
  normalizeStudentName,
} from '../../lib/studentValidation';
import type { Student } from '../../types';

export default function AdminStudents() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const pageSize = 10;

  const { data, isLoading } = useQuery({
    queryKey: ['students', page],
    queryFn: async () => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data: rows, error, count } = await supabase
        .from('students')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { rows: rows as Student[], count: count ?? 0 };
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (
      student: Pick<Student, 'id' | 'student_id' | 'name' | 'course' | 'year_level'> & {
        profileImage?: File | null;
      },
    ) => {
      const normalizedName = normalizeStudentName(student.name);

      if (!normalizedName) {
        throw new Error('Student name is required.');
      }

      const { data: existingName, error: existingNameError } = await supabase
        .from('students')
        .select('id')
        .ilike('name', escapeLikePattern(normalizedName))
        .neq('id', student.id)
        .limit(1);

      if (existingNameError) throw existingNameError;
      if (existingName.length > 0) throw new Error('Student name already exists.');

      let profilePictureUrl: string | undefined;
      if (student.profileImage) {
        profilePictureUrl = await uploadStudentProfileImage(student.profileImage, student.student_id);
      }

      const { error } = await supabase
        .from('students')
        .update({
          name: normalizedName,
          course: student.course,
          year_level: student.year_level,
          ...(profilePictureUrl ? { profile_picture_url: profilePictureUrl } : {}),
        })
        .eq('id', student.id);
      if (error) throw error;
    },
    onMutate: () => {
      setMessage('');
      setError('');
    },
    onSuccess: () => {
      setMessage('Student updated successfully.');
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (err) => {
      setError(isDuplicateStudentNameError(err) ? 'Student name already exists.' : err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('students').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: () => {
      setMessage('');
      setError('');
    },
    onSuccess: () => {
      setMessage('Student deleted successfully.');
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const totalPages = Math.ceil((data?.count ?? 0) / pageSize);

  return (
    <PageLayout>
      <div className="container">
        <div className="admin-header">
          <div>
            <h1>Student Management</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>{data?.count ?? 0} total students</p>
          </div>
          <Link to="/admin/dashboard" className="btn btn-secondary">Back to Dashboard</Link>
        </div>

        {message && <Alert type="success">{message}</Alert>}
        {error && <Alert type="error">{error}</Alert>}

        <div className="card">
          <div className="card-body">
            {isLoading ? (
              <div className="loading">Loading students...</div>
            ) : !data?.rows.length ? (
              <div className="empty-state"><p>No students found.</p></div>
            ) : (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Student ID</th>
                        <th>Photo</th>
                        <th>Name</th>
                        <th>Course</th>
                        <th>Year</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((student) => (
                        <StudentRow
                          key={student.id}
                          student={student}
                          onUpdate={(s) => updateMutation.mutate(s)}
                          onDelete={() => {
                            if (confirm('Delete this student?')) deleteMutation.mutate(student.id);
                          }}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1rem' }}>
                    <button type="button" className="btn btn-secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                      Previous
                    </button>
                    <span style={{ alignSelf: 'center' }}>Page {page + 1} of {totalPages}</span>
                    <button type="button" className="btn btn-secondary" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

function StudentRow({
  student,
  onUpdate,
  onDelete,
}: {
  student: Student;
  onUpdate: (
    s: Pick<Student, 'id' | 'student_id' | 'name' | 'course' | 'year_level'> & {
      profileImage?: File | null;
    },
  ) => void;
  onDelete: () => void;
}) {
  const [edit, setEdit] = useState({ name: student.name, course: student.course, year_level: student.year_level });
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [profilePreviewUrl, setProfilePreviewUrl] = useState('');
  const [imageError, setImageError] = useState('');

  const handleProfileImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setImageError('');

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
      setImageError(validationError);
      return;
    }

    setProfileImage(file);
    setProfilePreviewUrl(URL.createObjectURL(file));
  };

  const photoUrl = profilePreviewUrl || student.profile_picture_url;

  return (
    <tr>
      <td>
        <span className="readonly-id">{student.student_id}</span>
      </td>
      <td>
        <div className="student-photo-cell">
          {photoUrl ? (
            <a href={photoUrl} target="_blank" rel="noreferrer" aria-label={`View ${student.name} profile picture`}>
              <img className="student-photo-thumb" src={photoUrl} alt={`${student.name} profile`} />
            </a>
          ) : (
            <div className="student-photo-thumb placeholder">No Photo</div>
          )}
          <label className="btn btn-secondary file-button">
            Update
            <input type="file" accept="image/*" onChange={handleProfileImageChange} />
          </label>
          {imageError && <span className="field-error">{imageError}</span>}
        </div>
      </td>
      <td>
        <input className="form-control" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} style={{ minWidth: 120 }} />
      </td>
      <td>
        <select className="form-control" value={edit.course} onChange={(e) => setEdit({ ...edit, course: e.target.value })} style={{ minWidth: 120 }}>
          {COURSE_OPTIONS.map((course) => <option key={course} value={course}>{course}</option>)}
        </select>
      </td>
      <td>
        <select className="form-control" value={edit.year_level} onChange={(e) => setEdit({ ...edit, year_level: +e.target.value })}>
          {YEAR_LEVELS.map(({ value }) => <option key={value} value={value}>Year {value}</option>)}
        </select>
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <button
          type="button"
          className="btn btn-maroon"
          style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
          onClick={() => onUpdate({ id: student.id, student_id: student.student_id, ...edit, profileImage })}
        >
          Save
        </button>{' '}
        <button type="button" className="btn btn-danger" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} onClick={onDelete}>
          Delete
        </button>
      </td>
    </tr>
  );
}
