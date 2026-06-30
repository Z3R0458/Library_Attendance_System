import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { PageLayout } from '../../components/layout/Navbar';
import { supabase } from '../../lib/supabase';
import type { AttendanceStatusFilter } from '../../types';

export default function AttendanceHistory() {
  const [filters, setFilters] = useState({
    student_id: '',
    name: '',
    start_date: format(new Date(Date.now() - 7 * 86400000), 'yyyy-MM-dd'),
    end_date: format(new Date(), 'yyyy-MM-dd'),
    status: '' as AttendanceStatusFilter,
  });
  const [applied, setApplied] = useState(filters);

  const { data: records, isLoading } = useQuery({
    queryKey: ['attendance-history', applied],
    queryFn: async () => {
      let query = supabase
        .from('attendance')
        .select('*, students(name, course, year_level)')
        .gte('date', applied.start_date)
        .lte('date', applied.end_date)
        .order('time_in', { ascending: false });

      if (applied.student_id) {
        query = query.ilike('student_id', `%${applied.student_id}%`);
      }
      if (applied.status) {
        query = query.eq('status', applied.status);
      }

      const { data, error } = await query;
      if (error) throw error;

      let results = data ?? [];

      if (applied.name) {
        const term = applied.name.toLowerCase();
        results = results.filter((r) =>
          (r.students as { name: string })?.name?.toLowerCase().includes(term),
        );
      }

      return results;
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setApplied({ ...filters });
  };

  return (
    <PageLayout>
      <div className="container">
        <div className="admin-header">
          <div>
            <h1>Attendance History</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Search and filter attendance records</p>
          </div>
          <Link to="/admin/dashboard" className="btn btn-secondary">← Dashboard</Link>
        </div>

        <div className="filter-bar">
          <form onSubmit={handleSearch}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Student ID</label>
                <input
                  className="form-control"
                  value={filters.student_id}
                  onChange={(e) => setFilters({ ...filters, student_id: e.target.value })}
                  placeholder="Filter by ID"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input
                  className="form-control"
                  value={filters.name}
                  onChange={(e) => setFilters({ ...filters, name: e.target.value })}
                  placeholder="Filter by name"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  className="form-control"
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value as AttendanceStatusFilter })}
                >
                  <option value="">All Statuses</option>
                  <option value="checked_in">Checked In (Active)</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">From</label>
                <input type="date" className="form-control" value={filters.start_date} onChange={(e) => setFilters({ ...filters, start_date: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">To</label>
                <input type="date" className="form-control" value={filters.end_date} onChange={(e) => setFilters({ ...filters, end_date: e.target.value })} />
              </div>
            </div>
            <button type="submit" className="btn btn-maroon">Search</button>
          </form>
        </div>

        <div className="card">
          <div className="card-body">
            {isLoading ? (
              <div className="loading">Loading records...</div>
            ) : !records?.length ? (
              <div className="empty-state"><p>No records match your filters.</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Student ID</th>
                      <th>Name</th>
                      <th>Date</th>
                      <th>Time In</th>
                      <th>Time Out</th>
                      <th>Status</th>
                      <th>Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((row) => (
                      <tr key={row.id}>
                        <td>{row.student_id}</td>
                        <td>{(row.students as { name: string })?.name}</td>
                        <td>{row.date}</td>
                        <td>{row.time_in ? format(new Date(row.time_in), 'hh:mm a') : '—'}</td>
                        <td>{row.time_out ? format(new Date(row.time_out), 'hh:mm a') : '—'}</td>
                        <td>
                          <span className={`badge ${row.status === 'checked_in' ? 'badge-warning' : 'badge-success'}`}>
                            {row.status === 'checked_in' ? 'Active' : 'Completed'}
                          </span>
                        </td>
                        <td>{row.purpose}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {records.length} record(s) found
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
