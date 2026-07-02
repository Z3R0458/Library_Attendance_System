import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { PageLayout } from '../../components/layout/Navbar';
import { Alert } from '../../components/ui/Alert';
import { APP_NAME } from '../../lib/constants';
import { getAllStudentsForReports, getAttendanceForDateRange } from '../../lib/libraryRepository';

type ExportType = 'attendance' | 'students';
type ExportFormat = 'pdf' | 'csv';
type ReportRow = Record<string, string>;
type ReportColumn = {
  key: string;
  label: string;
  width: number;
};
type PreparedReport = {
  title: string;
  subtitle: string;
  reportCode: string;
  filenameBase: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  summary: { label: string; value: string }[];
  details: { label: string; value: string }[];
};

const attendanceColumns: ReportColumn[] = [
  { key: 'student_id', label: 'Student ID', width: 72 },
  { key: 'name', label: 'Name', width: 120 },
  { key: 'course', label: 'Course', width: 48 },
  { key: 'year_level', label: 'Year', width: 34 },
  { key: 'date', label: 'Date', width: 66 },
  { key: 'time_in', label: 'Time In', width: 58 },
  { key: 'time_out', label: 'Time Out', width: 58 },
  { key: 'purpose', label: 'Purpose', width: 88 },
  { key: 'status', label: 'Status', width: 72 },
];

const studentColumns: ReportColumn[] = [
  { key: 'student_id', label: 'Student ID', width: 90 },
  { key: 'name', label: 'Name', width: 150 },
  { key: 'course', label: 'Course', width: 70 },
  { key: 'year_level', label: 'Year Level', width: 70 },
  { key: 'status', label: 'Status', width: 70 },
  { key: 'qr_issued_at', label: 'QR Issued', width: 110 },
  { key: 'created_at', label: 'Registered', width: 110 },
];

export default function AdminExport() {
  const [exportType, setExportType] = useState<ExportType>('attendance');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [preparedBy, setPreparedBy] = useState('Library Administrator');
  const [approvedBy, setApprovedBy] = useState('School Librarian');
  const [downloadError, setDownloadError] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const { data: previewReport, isLoading } = useQuery({
    queryKey: ['export-preview', exportType, startDate, endDate],
    queryFn: async () => prepareReport(exportType, startDate, endDate, 10),
  });

  const reportDescription = useMemo(
    () =>
      exportType === 'attendance'
        ? `Attendance records from ${formatDateOnly(startDate)} to ${formatDateOnly(endDate)}`
        : 'Complete registered student master list',
    [exportType, startDate, endDate],
  );

  const downloadExport = async (formatType: ExportFormat) => {
    setDownloadError('');
    setIsExporting(true);

    try {
      const report = await prepareReport(exportType, startDate, endDate);
      const filename = `${report.filenameBase}_${report.reportCode}.${formatType}`;

      if (formatType === 'pdf') {
        triggerDownload(createPdfBlob(report, preparedBy, approvedBy), filename);
        return;
      }

      triggerDownload(createCsvBlob(report, preparedBy, approvedBy), filename);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Unable to export report.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <PageLayout>
      <div className="container">
        <div className="admin-header">
          <div>
            <h1>Report Export</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>
              Generate formal library reports as PDF or CSV files
            </p>
          </div>
          <Link to="/admin/dashboard" className="btn btn-secondary">Back to Dashboard</Link>
        </div>

        {downloadError && <Alert type="error">{downloadError}</Alert>}

        <div className="filter-bar">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Report Type</label>
              <select
                className="form-control"
                value={exportType}
                onChange={(e) => setExportType(e.target.value as ExportType)}
              >
                <option value="attendance">Attendance Records</option>
                <option value="students">Student Master List</option>
              </select>
            </div>
            {exportType === 'attendance' && (
              <>
                <div className="form-group">
                  <label className="form-label">From</label>
                  <input
                    type="date"
                    className="form-control"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">To</label>
                  <input
                    type="date"
                    className="form-control"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </>
            )}
            <div className="form-group">
              <label className="form-label">Prepared By</label>
              <input
                className="form-control"
                value={preparedBy}
                onChange={(e) => setPreparedBy(e.target.value)}
                placeholder="Prepared by"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Approved By</label>
              <input
                className="form-control"
                value={approvedBy}
                onChange={(e) => setApprovedBy(e.target.value)}
                placeholder="Approved by"
              />
            </div>
          </div>
          <div className="report-actions">
            <div>
              <strong>{previewReport?.title ?? 'Preparing report'}</strong>
              <span>{reportDescription}</span>
            </div>
            <div className="report-downloads">
              <button type="button" className="btn btn-maroon" onClick={() => downloadExport('pdf')} disabled={isExporting}>
                {isExporting ? 'Preparing...' : 'Export PDF'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => downloadExport('csv')} disabled={isExporting}>
                Export CSV
              </button>
            </div>
          </div>
        </div>

        <section className="formal-report-panel">
          <div className="formal-report-ribbon">Official Report Preview</div>
          <div className="formal-report-header">
            <div className="formal-report-mark">LS</div>
            <div>
              <p>{APP_NAME}</p>
              <h2>{previewReport?.title ?? 'Report Preview'}</h2>
              <span>{previewReport?.subtitle ?? reportDescription}</span>
            </div>
          </div>

          {previewReport && (
            <div className="report-detail-grid">
              {previewReport.details.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          )}

          {previewReport && (
            <div className="report-summary-grid">
              {previewReport.summary.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          )}

          {isLoading ? (
            <div className="loading">Loading preview...</div>
          ) : !previewReport?.rows.length ? (
            <div className="empty-state"><p>No data to preview.</p></div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="formal-report-table">
                  <thead>
                    <tr>
                      {previewReport.columns.map((column) => (
                        <th key={column.key}>{column.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewReport.rows.map((row, index) => (
                      <tr key={`${row.student_id}-${row.date ?? index}`}>
                        {previewReport.columns.map((column) => (
                          <td key={column.key}>{row[column.key]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="formal-report-note">
                Preview shows the first 10 rows. The downloaded report includes all matching records.
              </p>
              <div className="report-signature-preview">
                <div>
                  <span>{preparedBy || 'Prepared by'}</span>
                  <strong>Prepared By</strong>
                </div>
                <div>
                  <span>{approvedBy || 'Approved by'}</span>
                  <strong>Approved By</strong>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </PageLayout>
  );
}

async function prepareReport(
  exportType: ExportType,
  startDate: string,
  endDate: string,
  limit?: number,
): Promise<PreparedReport> {
  if (exportType === 'attendance') {
    const data = await getAttendanceForDateRange(startDate, endDate);

    const rows = data.map((record) => {
      const student = record.students as { name?: string; course?: string; year_level?: number } | null;
      return {
        student_id: String(record.student_id ?? ''),
        name: student?.name ?? '',
        course: student?.course ?? '',
        year_level: student?.year_level ? `Year ${student.year_level}` : '',
        date: formatDateOnly(String(record.date ?? '')),
        time_in: formatTimeOnly(record.time_in),
        time_out: formatTimeOnly(record.time_out),
        purpose: String(record.purpose ?? ''),
        status: formatStatus(String(record.status ?? '')),
      };
    });
    const reportCode = createReportCode('ATT');

    return {
      title: 'Formal Attendance Records Report',
      subtitle: `${formatDateOnly(startDate)} to ${formatDateOnly(endDate)}`,
      reportCode,
      filenameBase: 'library_attendance_report',
      columns: attendanceColumns,
      rows: limit ? rows.slice(0, limit) : rows,
      summary: [
        { label: 'Coverage', value: `${formatDateOnly(startDate)} - ${formatDateOnly(endDate)}` },
        { label: 'Records', value: String(rows.length) },
        { label: 'Unique Students', value: String(new Set(rows.map((row) => row.student_id)).size) },
        { label: 'Generated', value: format(new Date(), 'MMM d, yyyy h:mm a') },
      ],
      details: [
        { label: 'Report No.', value: reportCode },
        { label: 'Classification', value: 'Attendance Monitoring' },
        { label: 'Prepared For', value: 'Library Administration' },
        { label: 'Format', value: 'PDF / CSV' },
      ],
    };
  }

  const data = await getAllStudentsForReports();

  const rows = data.map((student) => ({
    student_id: String(student.student_id ?? ''),
    name: String(student.name ?? ''),
    course: String(student.course ?? ''),
    year_level: student.year_level ? `Year ${student.year_level}` : '',
    status: student.is_active ? 'Active' : 'Inactive',
    qr_issued_at: formatDateTime(student.qr_issued_at),
    created_at: formatDateTime(student.created_at),
  }));
  const reportCode = createReportCode('STU');

  return {
    title: 'Formal Student Master List',
    subtitle: 'Complete registered student directory',
    reportCode,
    filenameBase: 'library_student_master_list',
    columns: studentColumns,
    rows: limit ? rows.slice(0, limit) : rows,
    summary: [
      { label: 'Coverage', value: 'All registered students' },
      { label: 'Students', value: String(rows.length) },
      { label: 'Active', value: String(rows.filter((row) => row.status === 'Active').length) },
      { label: 'Generated', value: format(new Date(), 'MMM d, yyyy h:mm a') },
    ],
    details: [
      { label: 'Report No.', value: reportCode },
      { label: 'Classification', value: 'Student Registry' },
      { label: 'Prepared For', value: 'Library Administration' },
      { label: 'Format', value: 'PDF / CSV' },
    ],
  };
}

function createCsvBlob(report: PreparedReport, preparedBy: string, approvedBy: string) {
  const metadata = [
    [APP_NAME],
    ['Official Library Report'],
    [report.title],
    ['Report No.', report.reportCode],
    ['Description', report.subtitle],
    ...report.details.map((item) => [item.label, item.value]),
    ...report.summary.map((item) => [item.label, item.value]),
    ['Prepared By', preparedBy],
    ['Approved By', approvedBy],
    [],
  ];
  const rows = [
    ...metadata,
    report.columns.map((column) => column.label),
    ...report.rows.map((row) => report.columns.map((column) => row[column.key] ?? '')),
  ];
  const csv = rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n');
  return new Blob([csv], { type: 'text/csv;charset=utf-8' });
}

function createPdfBlob(report: PreparedReport, preparedBy: string, approvedBy: string) {
  const pageWidth = 792;
  const pageHeight = 612;
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;
  const firstPageRows = 17;
  const otherPageRows = 23;
  const chunks: ReportRow[][] = [];

  if (!report.rows.length) {
    chunks.push([]);
  } else {
    chunks.push(report.rows.slice(0, firstPageRows));
    for (let index = firstPageRows; index < report.rows.length; index += otherPageRows) {
      chunks.push(report.rows.slice(index, index + otherPageRows));
    }
  }

  const pageTotal = chunks.length + 1;
  const pageContents = chunks.map((rows, pageIndex) => {
    const commands: string[] = [];
    const isFirstPage = pageIndex === 0;
    let y = pageHeight - margin;

    rect(commands, margin, y - 38, contentWidth, 38, '0.50 0.00 0.00');
    text(commands, APP_NAME.toUpperCase(), margin + 16, y - 17, 8, 'F1', '1 1 1');
    text(commands, report.title, margin + 16, y - 32, 15, 'F2', '1 1 1');
    text(commands, `Report No. ${report.reportCode}`, pageWidth - margin - 132, y - 17, 8, 'F1', '1 1 1');
    text(commands, `Page ${pageIndex + 1} of ${pageTotal}`, pageWidth - margin - 80, y - 32, 8, 'F1', '1 1 1');

    y -= 60;
    text(commands, report.subtitle, margin, y, 10, 'F2', '0.13 0.13 0.13');
    y -= 18;

    if (isFirstPage) {
      const summaryWidth = contentWidth / report.summary.length;
      report.summary.forEach((item, index) => {
        const x = margin + index * summaryWidth;
        rect(commands, x, y - 38, summaryWidth - 8, 38, '0.98 0.95 0.95');
        text(commands, item.label.toUpperCase(), x + 8, y - 14, 6.5, 'F2', '0.43 0.43 0.43');
        text(commands, item.value, x + 8, y - 30, 9, 'F2', '0.50 0.00 0.00');
      });
      y -= 62;
    }

    rect(commands, margin, y - 18, contentWidth, 18, '0.50 0.00 0.00');
    drawTableText(commands, report.columns, emptyHeaderRow(report.columns), margin, y - 12, true);
    line(commands, margin, y - 18, margin + contentWidth, y - 18, '0.50 0.00 0.00');
    y -= 18;

    if (!rows.length) {
      text(commands, 'No records found for this report.', margin, y - 22, 10, 'F1', '0.40 0.40 0.40');
    }

    rows.forEach((row, index) => {
      const fill = index % 2 === 0 ? '1 1 1' : '0.98 0.98 0.98';
      rect(commands, margin, y - 19, contentWidth, 19, fill);
      line(commands, margin, y - 19, margin + contentWidth, y - 19, '0.86 0.86 0.86');
      drawTableText(commands, report.columns, row, margin, y - 13, false);
      y -= 19;
    });

    text(
      commands,
      `Generated ${format(new Date(), 'MMM d, yyyy h:mm a')} | ${APP_NAME} | ${report.reportCode}`,
      margin,
      24,
      7,
      'F1',
      '0.45 0.45 0.45',
    );

    return commands.join('\n');
  });

  pageContents.push(createCertificationPage(report, preparedBy, approvedBy, pageWidth, pageHeight, pageTotal));

  return buildPdf(pageContents, pageWidth, pageHeight);
}

function createCertificationPage(
  report: PreparedReport,
  preparedBy: string,
  approvedBy: string,
  pageWidth: number,
  pageHeight: number,
  pageTotal: number,
) {
  const commands: string[] = [];
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  let y = pageHeight - margin;

  rect(commands, margin, y - 48, contentWidth, 48, '0.50 0.00 0.00');
  text(commands, APP_NAME.toUpperCase(), margin + 18, y - 18, 8, 'F1', '1 1 1');
  text(commands, 'Report Certification', margin + 18, y - 36, 18, 'F2', '1 1 1');
  text(commands, `Page ${pageTotal} of ${pageTotal}`, pageWidth - margin - 78, y - 28, 8, 'F1', '1 1 1');

  y -= 82;
  text(commands, report.title, margin, y, 13, 'F2', '0.13 0.13 0.13');
  y -= 18;
  text(commands, `Report No. ${report.reportCode}`, margin, y, 9, 'F1', '0.40 0.40 0.40');
  y -= 30;

  [...report.details, ...report.summary].forEach((item, index) => {
    const columnWidth = contentWidth / 2;
    const x = margin + (index % 2) * columnWidth;
    const rowY = y - Math.floor(index / 2) * 36;
    rect(commands, x, rowY - 24, columnWidth - 10, 28, '0.98 0.95 0.95');
    text(commands, item.label.toUpperCase(), x + 8, rowY - 7, 6.5, 'F2', '0.43 0.43 0.43');
    text(commands, item.value, x + 8, rowY - 19, 8.5, 'F1', '0.13 0.13 0.13');
  });

  y -= Math.ceil((report.details.length + report.summary.length) / 2) * 36 + 24;
  text(
    commands,
    'This report was generated from the Library Attendance System records and is intended for official administrative review.',
    margin,
    y,
    9,
    'F1',
    '0.13 0.13 0.13',
  );

  y -= 90;
  drawSignature(commands, margin, y, preparedBy || 'Library Administrator', 'Prepared By');
  drawSignature(commands, margin + contentWidth / 2 + 20, y, approvedBy || 'School Librarian', 'Approved By');

  text(commands, `Generated ${format(new Date(), 'MMM d, yyyy h:mm a')}`, margin, 30, 7, 'F1', '0.45 0.45 0.45');

  return commands.join('\n');
}

function drawSignature(commands: string[], x: number, y: number, name: string, label: string) {
  line(commands, x, y, x + 230, y, '0.25 0.25 0.25');
  text(commands, name, x, y - 16, 10, 'F2', '0.13 0.13 0.13');
  text(commands, label.toUpperCase(), x, y - 30, 7, 'F1', '0.45 0.45 0.45');
}

function drawTableText(
  commands: string[],
  columns: ReportColumn[],
  row: ReportRow,
  startX: number,
  y: number,
  isHeader: boolean,
) {
  let x = startX + 6;
  columns.forEach((column) => {
    const value = isHeader ? column.label : row[column.key] ?? '';
    text(
      commands,
      truncateText(value, column.width, isHeader ? 7 : 6.8),
      x,
      y,
      isHeader ? 7 : 6.8,
      isHeader ? 'F2' : 'F1',
      isHeader ? '1 1 1' : '0.13 0.13 0.13',
    );
    x += column.width;
  });
}

function buildPdf(contents: string[], pageWidth: number, pageHeight: number) {
  const objects: string[] = [];
  const pageObjectIds: number[] = [];

  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
  objects.push('');
  objects.push('3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');
  objects.push('4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj');

  contents.forEach((content, index) => {
    const pageObjectId = 5 + index * 2;
    const contentObjectId = pageObjectId + 1;
    pageObjectIds.push(pageObjectId);
    objects.push(
      `${pageObjectId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectId} 0 R >> endobj`,
    );
    objects.push(`${contentObjectId} 0 obj << /Length ${byteLength(content)} >> stream\n${content}\nendstream\nendobj`);
  });

  objects[1] = `2 0 obj << /Type /Pages /Kids [${pageObjectIds
    .map((id) => `${id} 0 R`)
    .join(' ')}] /Count ${pageObjectIds.length} >> endobj`;

  let output = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object) => {
    offsets.push(byteLength(output));
    output += `${object}\n`;
  });

  const xrefOffset = byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    output += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  output += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([output], { type: 'application/pdf' });
}

function emptyHeaderRow(columns: ReportColumn[]) {
  return columns.reduce<ReportRow>((row, column) => {
    row[column.key] = column.label;
    return row;
  }, {});
}

function rect(commands: string[], x: number, y: number, width: number, height: number, color: string) {
  commands.push(`q ${color} rg ${x} ${y} ${width} ${height} re f Q`);
}

function line(commands: string[], x1: number, y1: number, x2: number, y2: number, color: string) {
  commands.push(`q ${color} RG 0.7 w ${x1} ${y1} m ${x2} ${y2} l S Q`);
}

function text(
  commands: string[],
  value: string,
  x: number,
  y: number,
  size: number,
  font: 'F1' | 'F2',
  color: string,
) {
  commands.push(`BT ${color} rg /${font} ${size} Tf ${x} ${y} Td (${escapePdfText(value)}) Tj ET`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatDateOnly(value: string) {
  if (!value) return '';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, 'MMM d, yyyy');
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return format(parsed, 'MMM d, yyyy h:mm a');
}

function formatTimeOnly(value: string | null | undefined) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return format(parsed, 'h:mm a');
}

function formatStatus(value: string) {
  if (value === 'checked_in') return 'Active';
  if (value === 'completed') return 'Completed';
  if (value === 'checked_out') return 'Checked Out';
  return value;
}

function createReportCode(prefix: string) {
  return `${prefix}-${format(new Date(), 'yyyyMMdd-HHmmss')}`;
}

function escapeCsvValue(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function escapePdfText(value: string) {
  return sanitizePdfText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function sanitizePdfText(value: string) {
  return value.normalize('NFKD').replace(/[^\x20-\x7E]/g, '-');
}

function truncateText(value: string, width: number, size: number) {
  const clean = sanitizePdfText(value);
  const maxCharacters = Math.max(4, Math.floor(width / (size * 0.5)));
  if (clean.length <= maxCharacters) return clean;
  return `${clean.slice(0, maxCharacters - 3)}...`;
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}
