import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageLayout } from '../../components/layout/Navbar';
import { Alert } from '../../components/ui/Alert';
import { listStudents, removeStudent, updateStudent, type StudentListFilters } from '../../lib/libraryRepository';
import { COURSE_OPTIONS, YEAR_LEVELS } from '../../lib/constants';
import {
  isDuplicateStudentIdError,
  isDuplicateStudentNameError,
  normalizeStudentName,
} from '../../lib/studentValidation';
import type { Student } from '../../types';

const initialFilters: StudentListFilters = {
  search: '',
  course: '',
  year_level: '',
  status: '',
};

export default function AdminStudents() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<StudentListFilters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<StudentListFilters>(initialFilters);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const pageSize = 10;

  const { data, isLoading } = useQuery({
    queryKey: ['students', page, appliedFilters],
    queryFn: async () => {
      return listStudents(page, pageSize, appliedFilters);
    },
  });

  const handleFilterSubmit = (e: FormEvent) => {
    e.preventDefault();
    setPage(0);
    setAppliedFilters({ ...filters });
  };

  const clearFilters = () => {
    setFilters(initialFilters);
    setAppliedFilters(initialFilters);
    setPage(0);
  };

  const updateMutation = useMutation({
    mutationFn: async (student: Pick<Student, 'id' | 'student_id' | 'name' | 'course' | 'year_level'>) => {
      const studentId = student.student_id.trim();
      const normalizedName = normalizeStudentName(student.name);

      if (!studentId) {
        throw new Error('Student ID is required.');
      }

      if (!normalizedName) {
        throw new Error('Student name is required.');
      }

      if (!COURSE_OPTIONS.includes(student.course as (typeof COURSE_OPTIONS)[number])) {
        throw new Error('Please select a valid course.');
      }

      await updateStudent({
        id: student.id,
        student_id: studentId,
        name: normalizedName,
        course: student.course,
        year_level: student.year_level,
      });
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
      setError(
        isDuplicateStudentIdError(err)
          ? 'Student ID already exists.'
          : isDuplicateStudentNameError(err)
            ? 'Student name already exists.'
            : err instanceof Error
              ? err.message
              : 'Unable to update student.',
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await removeStudent(id);
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
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>
              {data?.count ?? 0} shown of {data?.totalCount ?? 0} total students
            </p>
          </div>
          <Link to="/admin/dashboard" className="btn btn-secondary">Back to Dashboard</Link>
        </div>

        {message && <Alert type="success">{message}</Alert>}
        {error && <Alert type="error">{error}</Alert>}

        <div className="filter-bar">
          <form onSubmit={handleFilterSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="student-search">Search</label>
                <input
                  id="student-search"
                  className="form-control"
                  value={filters.search ?? ''}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  placeholder="Name or student ID"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="student-course-filter">Course</label>
                <select
                  id="student-course-filter"
                  className="form-control"
                  value={filters.course ?? ''}
                  onChange={(e) => setFilters({ ...filters, course: e.target.value })}
                >
                  <option value="">All Courses</option>
                  {COURSE_OPTIONS.map((course) => (
                    <option key={course} value={course}>{course}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="student-year-filter">Year</label>
                <select
                  id="student-year-filter"
                  className="form-control"
                  value={filters.year_level ?? ''}
                  onChange={(e) =>
                    setFilters({ ...filters, year_level: e.target.value ? Number(e.target.value) : '' })
                  }
                >
                  <option value="">All Years</option>
                  {YEAR_LEVELS.map(({ value }) => (
                    <option key={value} value={value}>Year {value}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="student-status-filter">Status</label>
                <select
                  id="student-status-filter"
                  className="form-control"
                  value={filters.status ?? ''}
                  onChange={(e) =>
                    setFilters({ ...filters, status: e.target.value as StudentListFilters['status'] })
                  }
                >
                  <option value="">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="filter-actions">
              <button type="submit" className="btn btn-maroon">Apply Filters</button>
              <button type="button" className="btn btn-secondary" onClick={clearFilters}>Clear</button>
            </div>
          </form>
        </div>

        <div className="card">
          <div className="card-body">
            {isLoading ? (
              <div className="loading">Loading students...</div>
            ) : !data?.rows.length ? (
              <div className="empty-state"><p>No students found.</p></div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="stacked-table">
                    <thead>
                      <tr>
                        <th>Student ID</th>
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
                  <div className="pagination-actions">
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
  onUpdate: (s: Pick<Student, 'id' | 'student_id' | 'name' | 'course' | 'year_level'>) => void;
  onDelete: () => void;
}) {
  const [edit, setEdit] = useState({
    student_id: student.student_id,
    name: student.name,
    course: student.course,
    year_level: student.year_level,
  });

  return (
    <tr>
      <td data-label="Student ID">
        <input
          aria-label="Student ID"
          className="form-control"
          value={edit.student_id}
          onChange={(e) => setEdit({ ...edit, student_id: e.target.value })}
          style={{ minWidth: 120 }}
        />
      </td>
      <td data-label="Name">
        <input
          aria-label="Name"
          className="form-control"
          value={edit.name}
          onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          style={{ minWidth: 120 }}
        />
      </td>
      <td data-label="Course">
        <select
          aria-label="Course"
          className="form-control"
          value={edit.course}
          onChange={(e) => setEdit({ ...edit, course: e.target.value })}
          style={{ minWidth: 120 }}
        >
          {COURSE_OPTIONS.map((course) => <option key={course} value={course}>{course}</option>)}
        </select>
      </td>
      <td data-label="Year">
        <select
          aria-label="Year level"
          className="form-control"
          value={edit.year_level}
          onChange={(e) => setEdit({ ...edit, year_level: +e.target.value })}
        >
          {YEAR_LEVELS.map(({ value }) => <option key={value} value={value}>Year {value}</option>)}
        </select>
      </td>
      <td data-label="Actions" style={{ whiteSpace: 'nowrap' }}>
        <button
          type="button"
          className="btn btn-maroon"
          style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
          onClick={() => onUpdate({ id: student.id, ...edit })}
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
