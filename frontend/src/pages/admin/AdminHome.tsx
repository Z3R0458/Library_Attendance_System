import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/auth';

export default function AdminHome() {
  const { isAdmin, loading } = useAuth();

  if (loading) return <div className="loading">Loading...</div>;
  if (isAdmin) return <Navigate to="/admin/dashboard" replace />;
  return <Navigate to="/admin/login" replace />;
}
