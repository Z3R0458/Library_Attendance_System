import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { OfflineProvider } from './contexts/OfflineContext';
import { AdminRoute } from './components/layout/AdminRoute';

const Home = lazy(() => import('./pages/Home'));
const Register = lazy(() => import('./pages/Register'));
const Scan = lazy(() => import('./pages/Scan'));
const MyQR = lazy(() => import('./pages/MyQR'));
const AdminHome = lazy(() => import('./pages/admin/AdminHome'));
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminStudents = lazy(() => import('./pages/admin/AdminStudents'));
const AttendanceHistory = lazy(() => import('./pages/admin/AttendanceHistory'));
const AdminReports = lazy(() => import('./pages/admin/AdminReports'));
const AdminExport = lazy(() => import('./pages/admin/AdminExport'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <OfflineProvider>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<div className="loading">Loading...</div>}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/register" element={<Register />} />
                <Route path="/my-qr" element={<MyQR />} />

                <Route path="/admin" element={<AdminHome />} />
                <Route path="/admin/login" element={<AdminLogin />} />

                <Route element={<AdminRoute />}>
                  <Route path="/admin/dashboard" element={<AdminDashboard />} />
                  <Route path="/admin/scan" element={<Scan />} />
                  <Route path="/admin/scan/login" element={<Navigate to="/admin/scan" replace />} />
                  <Route path="/admin/scan/logout" element={<Navigate to="/admin/scan" replace />} />
                  <Route path="/admin/students" element={<AdminStudents />} />
                  <Route path="/admin/history" element={<AttendanceHistory />} />
                  <Route path="/admin/reports" element={<AdminReports />} />
                  <Route path="/admin/export" element={<AdminExport />} />
                  <Route path="/scan" element={<Navigate to="/admin/scan" replace />} />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </OfflineProvider>
    </QueryClientProvider>
  );
}
