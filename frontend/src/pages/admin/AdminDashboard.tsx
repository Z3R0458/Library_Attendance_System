import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageLayout } from '../../components/layout/Navbar';
import { StatCard } from '../../components/ui/StatCard';
import { useAuth } from '../../contexts/auth';
import { supabase } from '../../lib/supabase';
import type { DashboardStats } from '../../types';

export default function AdminDashboard() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dashboard_stats');
      if (error) throw error;
      return data as DashboardStats;
    },
    refetchInterval: 30000,
  });

  const { data: insideList } = useQuery({
    queryKey: ['currently-inside'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('attendance')
        .select('*, students(name, course, year_level)')
        .eq('date', today)
        .is('time_out', null)
        .eq('status', 'checked_in')
        .order('time_in', { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  const handleLogout = async () => {
    await signOut();
    navigate('/admin/login');
  };

  return (
    <PageLayout>
      <div className="container">
        <div className="admin-header">
          <div>
            <h1>Admin Dashboard</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Real-time library attendance overview</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={handleLogout}>
            Logout
          </button>
        </div>

        {isLoading ? (
          <div className="loading">Loading stats...</div>
        ) : (
          <div className="stats-grid">
            <StatCard icon="👥" value={stats?.visitors_today ?? 0} label="Visitors Today" />
            <StatCard icon="📍" value={stats?.currently_inside ?? 0} label="Currently Inside" />
            <StatCard icon="📅" value={stats?.daily?.length ?? 0} label="Days Tracked (7d)" />
            <StatCard icon="📈" value={stats?.monthly?.length ?? 0} label="Months Tracked" />
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
          <Link to="/admin/scan" className="btn btn-secondary">Open Scanner</Link>
          <Link to="/admin/students" className="btn btn-maroon">Manage Students</Link>
          <Link to="/admin/history" className="btn btn-maroon">Attendance History</Link>
          <Link to="/admin/reports" className="btn btn-maroon">Reports</Link>
          <Link to="/admin/export" className="btn btn-maroon">Export Data</Link>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Currently Inside Library</h2>
            <p>{insideList?.length ?? 0} active visitors</p>
          </div>
          <div className="card-body">
            {!insideList?.length ? (
              <div className="empty-state">
                <div className="empty-state-icon">🏛️</div>
                <p>No active visitors right now.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Student ID</th>
                      <th>Name</th>
                      <th>Course</th>
                      <th>Time In</th>
                      <th>Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insideList.map((row) => (
                      <tr key={row.id}>
                        <td>{row.student_id}</td>
                        <td>{(row.students as { name: string })?.name}</td>
                        <td>{(row.students as { course: string })?.course}</td>
                        <td>{row.time_in ? new Date(row.time_in).toLocaleTimeString('en-US', { hour12: true }) : '—'}</td>
                        <td>{row.purpose}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
