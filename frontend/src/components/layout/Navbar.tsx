import { Link, NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { APP_NAME } from '../../lib/constants';

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const isAdminArea = pathname.startsWith('/admin');

  type NavItem = { to: string; label: string; end?: boolean };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `nav-link${isActive ? ' active' : ''}`;

  const publicLinks: NavItem[] = [
    { to: '/', label: 'Home', end: true },
    { to: '/register', label: 'Register' },
    { to: '/my-qr', label: 'My QR Code' },
  ];

  const adminLinks: NavItem[] = [
    { to: '/admin/dashboard', label: 'Dashboard' },
    { to: '/admin/scan', label: 'QR Scanner' },
    { to: '/admin/students', label: 'Student Management' },
    { to: '/admin/history', label: 'Attendance History' },
    { to: '/admin/reports', label: 'Reports' },
    { to: '/admin/export', label: 'Export Data' },
  ];

  const links = isAdminArea ? adminLinks : publicLinks;

  return (
    <nav className="navbar">
      <div className="container navbar-inner">
        <Link
          to={isAdminArea ? '/admin/dashboard' : '/'}
          className="navbar-brand"
          onClick={() => setMenuOpen(false)}
        >
          <span className="brand-mark" aria-hidden="true">LA</span>
          <span>{APP_NAME}</span>
        </Link>
        <button
          type="button"
          className="menu-toggle"
          aria-label="Toggle menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          Menu
        </button>
        <ul className={`nav-links${menuOpen ? ' open' : ''}`}>
          {links.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                className={linkClass}
                end={link.end}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <p>Copyright {new Date().getFullYear()} {APP_NAME}</p>
      <p>Developed by Kyle T. Tangcogo</p>
    </footer>
  );
}

export function PageLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="page-main">{children}</main>
      <Footer />
    </>
  );
}
