import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageLayout } from '../components/layout/Navbar';

function LiveClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="clock-display">
      {time.toLocaleTimeString('en-US', { hour12: true })}
      <div style={{ fontSize: '0.85rem', fontWeight: 400, opacity: 0.8 }}>
        {time.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <PageLayout>
      <section className="hero">
        <div className="container">
          <h1>Library Attendance System</h1>
          <p>
            Register online before visiting the library and keep your QR code ready for fast
            attendance verification.
          </p>
          <div className="hero-actions">
            <Link to="/register" className="btn btn-primary">
              Register Student
            </Link>
            <Link to="/my-qr" className="btn btn-outline">
              My QR Code
            </Link>
          </div>
        </div>
      </section>

      <div className="container">
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon">ID</div>
            <h3>Student Registration</h3>
            <p>Submit your student details to generate your unique QR code.</p>
            <Link to="/register" className="btn btn-maroon">Register Now</Link>
          </div>
          <div className="feature-card">
            <div className="feature-icon">QR</div>
            <h3>My QR Code</h3>
            <p>Retrieve and download your QR code anytime using your Student ID.</p>
            <Link to="/my-qr" className="btn btn-maroon">View QR Code</Link>
          </div>
          <div className="feature-card">
            <div className="feature-icon">VIS</div>
            <h3>Ready to Visit</h3>
            <p>Bring your QR code to the library so staff can verify your identity quickly.</p>
            <Link to="/register" className="btn btn-maroon">Get Started</Link>
          </div>
        </div>

        <div className="card clock-card">
          <div className="card-body" style={{ textAlign: 'center' }}>
            <h3 style={{ color: 'var(--maroon)', marginTop: 0 }}>Current Time</h3>
            <LiveClock />
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
