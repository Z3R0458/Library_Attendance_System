# Library Attendance System

Modern library attendance system with QR code check-in/out, built with React, Vite, and Supabase.

## Features

- Student registration with auto-generated unique QR codes
- QR scanner for Time In / Time Out using webcam or mobile camera
- Duplicate scan prevention with a configurable cooldown
- Admin dashboard for today's visitors, current visitors, and live attendance
- Attendance history with search and date filtering
- Reports and analytics with charts
- Data export as CSV or JSON

## Project Structure

```text
library_system/
+-- frontend/                 # React + Vite app
+-- supabase/migrations/      # PostgreSQL schema, policies, and RPC functions
+-- package.json              # Root npm shortcuts
+-- README.md
```

## Setup

### 1. Create a Supabase Project

1. Go to https://supabase.com and create a project.
2. Open SQL Editor and run `supabase/migrations/001_initial_schema.sql`.
3. Optional: use `supabase/migrations/002_mysql_data_import.sql` as a guide if you are migrating old MySQL data.

### 2. Create an Admin User

In Supabase Dashboard > Authentication > Users > Add user, create an admin account such as `admin@library.edu`.

### 3. Configure the Frontend

```powershell
copy frontend\.env.example frontend\.env
```

Edit `frontend/.env`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Find these values in Supabase > Project Settings > API.

### 4. Install and Run

From `C:\xampp\htdocs\library_system`:

```powershell
npm run install:frontend
npm run dev
```

Open http://localhost:5173.

## Usage

| Page | URL | Description |
|------|-----|-------------|
| Home | `/` | Landing page |
| Register | `/register` | New student signup |
| Scanner | `/scan` | Separate Time In and Time Out scanner |
| My QR | `/my-qr` | View/download personal QR code |
| Admin Login | `/admin/login` | Supabase Auth login |
| Dashboard | `/admin/dashboard` | Stats and live visitors |
| Students | `/admin/students` | Manage student records |
| History | `/admin/history` | Attendance search and filter |
| Reports | `/admin/reports` | Charts and analytics |
| Export | `/admin/export` | Download CSV/JSON |

## QR Attendance Logic

1. Choose Time In before scanning students who are entering.
2. Choose Time Out before scanning students who are leaving.
3. Scans within the configured cooldown are rejected.
4. Invalid, unregistered, or out-of-sequence QR codes show a clear error message.

## Build for Production

```powershell
npm run build
npm run preview
```

Deploy the `frontend/dist` folder to Vercel, Netlify, or any static host.

## Auto-Logout

The SQL function `auto_logout_all()` logs out all active visitors. Schedule it through Supabase using `pg_cron` or a scheduled Edge Function.

## Tech Stack

- Frontend: React 19, TypeScript, Vite, React Router, TanStack Query
- QR: html5-qrcode scanner, qrcode.react generator
- Charts: Recharts
- Backend/DB: Supabase PostgreSQL, Auth, RLS, RPC

## Developer

Developed by Kyle T. Tangcogo
