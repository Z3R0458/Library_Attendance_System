import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { PageLayout } from '../../components/layout/Navbar';
import { StatCard } from '../../components/ui/StatCard';
import { supabase } from '../../lib/supabase';

type ReportType = 'daily' | 'weekly' | 'monthly' | 'purpose' | 'peak_hours';

export default function AdminReports() {
  const [reportType, setReportType] = useState<ReportType>('daily');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data: stats } = useQuery({
    queryKey: ['report-stats', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance')
        .select('student_id, time_in, time_out, purpose, date')
        .gte('date', startDate)
        .lte('date', endDate);
      if (error) throw error;
      return data;
    },
  });

  const uniqueStudents = new Set(stats?.map((r) => r.student_id)).size;
  const totalVisits = stats?.length ?? 0;

  const dailyData = Object.entries(
    (stats ?? []).reduce<Record<string, number>>((acc, r) => {
      acc[r.date] = (acc[r.date] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const purposeData = Object.entries(
    (stats ?? []).reduce<Record<string, number>>((acc, r) => {
      const p = r.purpose ?? 'Other';
      acc[p] = (acc[p] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([purpose, count]) => ({ purpose, count }));

  const peakHoursData = Object.entries(
    (stats ?? []).reduce<Record<number, number>>((acc, r) => {
      if (!r.time_in) return acc;
      const hour = new Date(r.time_in).getHours();
      acc[hour] = (acc[hour] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([hour, count]) => ({ hour: `${hour}:00`, count }))
    .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));

  return (
    <PageLayout>
      <div className="container">
        <div className="admin-header">
          <div>
            <h1>Analytics & Reports</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Daily, weekly, and monthly attendance statistics</p>
          </div>
          <Link to="/admin/dashboard" className="btn btn-secondary">← Dashboard</Link>
        </div>

        <div className="filter-bar">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Report Type</label>
              <select className="form-control" value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)}>
                <option value="daily">Daily Visits</option>
                <option value="purpose">Purpose Analysis</option>
                <option value="peak_hours">Peak Hours</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">From</label>
              <input type="date" className="form-control" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">To</label>
              <input type="date" className="form-control" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="stats-grid">
          <StatCard icon="📋" value={totalVisits} label="Total Visits" />
          <StatCard icon="👥" value={uniqueStudents} label="Unique Students" />
          <StatCard icon="📅" value={dailyData.length} label="Active Days" />
          <StatCard icon="🎯" value={purposeData.length} label="Purpose Categories" />
        </div>

        <div className="chart-container">
          <h3 style={{ marginTop: 0, color: 'var(--maroon)' }}>
            {reportType === 'daily' && 'Daily Visits'}
            {reportType === 'purpose' && 'Purpose Distribution'}
            {reportType === 'peak_hours' && 'Peak Hours'}
          </h3>
          <ResponsiveContainer width="100%" height={320}>
            {reportType === 'peak_hours' ? (
              <LineChart data={peakHoursData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#800000" strokeWidth={2} />
              </LineChart>
            ) : reportType === 'daily' ? (
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#800000" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <BarChart data={purposeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="purpose" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#800000" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    </PageLayout>
  );
}
