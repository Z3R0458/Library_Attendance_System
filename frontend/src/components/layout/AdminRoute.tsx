import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/auth';
import { useScheduledAutoLogout } from '../../hooks/useScheduledAutoLogout';

export function AdminRoute() {
  const { isAdmin, loading } = useAuth();
  useScheduledAutoLogout(!loading && isAdmin);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!isAdmin) {
    return <Navigate to="/admin/login" replace />;
  }

  return <Outlet />;
}

export function AdminLayout() {
  return (
    <>
      <Outlet />
    </>
  );
}
