import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { PageLayout } from '../../components/layout/Navbar';
import { supabase } from '../../lib/supabase';

type ExportType = 'attendance' | 'students';

export default function AdminExport() {
  const [exportType, setExportType] = useState<ExportType>('attendance');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formatType, setFormatType] = useState<'csv' | 'json'>('csv');

  const { data: preview, isLoading } = useQuery({
    queryKey: ['export-preview', exportType, startDate, endDate],
    queryFn: async () => {
      if (exportType === 'attendance') {
        const { data, error } = await supabase
          .from('attendance')
          .select('*, students(name, course, year_level)')
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: false })
          .limit(10);
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase.from('students').select('*').limit(10);
      if (error) throw error;
      return data;
    },
  });

  const downloadExport = async () => {
    let rows: Record<string, unknown>[] = [];

    if (exportType === 'attendance') {
      const { data, error } = await supabase
        .from('attendance')
        .select('*, students(name, course, year_level)')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });
      if (error) return;
      rows = (data ?? []).map((r) => ({
        student_id: r.student_id,
        name: (r.students as { name: string })?.name,
        course: (r.students as { course: string })?.course,
        year_level: (r.students as { year_level: number })?.year_level,
        date: r.date,
        time_in: r.time_in,
        time_out: r.time_out,
        purpose: r.purpose,
        status: r.status,
      }));
    } else {
      const { data, error } = await supabase.from('students').select('*');
      if (error) return;
      rows = data ?? [];
    }

    const filename = `library_${exportType}_${format(new Date(), 'yyyy-MM-dd')}.${formatType}`;

    if (formatType === 'json') {
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
      triggerDownload(blob, filename);
    } else {
      const headers = rows.length ? Object.keys(rows[0]) : [];
      const csv = [
        headers.join(','),
        ...rows.map((row) =>
          headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','),
        ),
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      triggerDownload(blob, filename);
    }
  };

  return (
    <PageLayout>
      <div className="container">
        <div className="admin-header">
          <div>
            <h1>Data Export</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Export attendance and student data</p>
          </div>
          <Link to="/admin/dashboard" className="btn btn-secondary">← Dashboard</Link>
        </div>

        <div className="filter-bar">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Export Type</label>
              <select className="form-control" value={exportType} onChange={(e) => setExportType(e.target.value as ExportType)}>
                <option value="attendance">Attendance Records</option>
                <option value="students">Student List</option>
              </select>
            </div>
            {exportType === 'attendance' && (
              <>
                <div className="form-group">
                  <label className="form-label">From</label>
                  <input type="date" className="form-control" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">To</label>
                  <input type="date" className="form-control" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </>
            )}
            <div className="form-group">
              <label className="form-label">Format</label>
              <select className="form-control" value={formatType} onChange={(e) => setFormatType(e.target.value as 'csv' | 'json')}>
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
              </select>
            </div>
          </div>
          <button type="button" className="btn btn-maroon" onClick={downloadExport}>
            Download Export
          </button>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Preview (first 10 rows)</h2>
          </div>
          <div className="card-body">
            {isLoading ? (
              <div className="loading">Loading preview...</div>
            ) : !preview?.length ? (
              <div className="empty-state"><p>No data to preview.</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {Object.keys(preview[0]).map((key) => (
                        <th key={key}>{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i}>
                        {Object.values(row).map((val, j) => (
                          <td key={j}>{typeof val === 'object' ? JSON.stringify(val) : String(val ?? '')}</td>
                        ))}
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

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
