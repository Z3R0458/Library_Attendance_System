export interface Student {
  id: string;
  student_id: string;
  name: string;
  course: string;
  year_level: number;
  profile_picture_url: string | null;
  qr_token: string;
  qr_issued_at: string;
  is_active: boolean;
  created_at: string;
}

export interface Attendance {
  id: string;
  student_id: string;
  date: string;
  time_in: string | null;
  time_out: string | null;
  purpose: string | null;
  status: 'checked_in' | 'checked_out' | 'completed';
  last_scan_at: string | null;
  created_at: string;
}

export interface AttendanceWithStudent extends Attendance {
  students?: Pick<Student, 'name' | 'course' | 'year_level' | 'profile_picture_url'>;
}

export interface ScanResult {
  success: boolean;
  action?: 'time_in' | 'time_out';
  message: string;
  error?: 'invalid_qr' | 'invalid_action' | 'duplicate_scan' | 'already_checked_in' | 'missing_time_in' | 'already_completed';
  student?: {
    student_id: string;
    name: string;
    course?: string;
    year_level?: number;
    profile_picture_url?: string | null;
  };
  attendance?: {
    id: string;
    date: string;
    time_in: string;
    time_out?: string;
    purpose?: string;
    status: string;
  };
}

export interface DashboardStats {
  visitors_today: number;
  currently_inside: number;
  daily: { date: string; count: number }[];
  weekly: { week_start: string; count: number }[];
  monthly: { month: string; count: number }[];
}

export type AttendanceStatusFilter = '' | 'checked_in' | 'completed';
