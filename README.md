# Library Attendance System

Modern library attendance system with QR code check-in/out, built with React, Vite, and Supabase.

## Features

- Student registration with auto-generated unique QR codes
- Offline QR scanner that automatically detects login/logout using today's local attendance record
- Duplicate scan prevention in the camera workflow
- Admin dashboard for today's visitors, current visitors, and live attendance
- Attendance history with search and date filtering
- Reports and analytics with charts
- Data export as PDF or CSV
- Offline-first local data storage with automatic synchronization

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
2. Open SQL Editor and run the files in `supabase/migrations/` in number order.
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
VITE_OFFLINE_DATABASE_SECRET=use-a-long-random-secret-for-local-encryption
```

Find these values in Supabase > Project Settings > API.

`VITE_OFFLINE_DATABASE_SECRET` is optional. If it is not set, the browser generates a local AES key and stores it on that device.

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
| Scanner | `/scan` | Offline automatic login/logout QR scanner |
| My QR | `/my-qr` | View/download personal QR code |
| Admin Login | `/admin/login` | Supabase Auth login |
| Dashboard | `/admin/dashboard` | Stats and live visitors |
| Students | `/admin/students` | Manage student records |
| History | `/admin/history` | Attendance search and filter |
| Reports | `/admin/reports` | Charts and analytics |
| Export | `/admin/export` | Download PDF/CSV |

## QR Attendance Logic

1. Scan the student QR code.
2. The QR payload provides the student ID for local lookup. Older QR codes that only contain the QR token still work.
3. The scanner reads today's local attendance records and determines the next action automatically.
4. No attendance record today means Login.
5. The latest open Login record means Logout.
6. The latest completed Logout record allows another Login, matching the current multiple-visits-per-day system rule.
7. The attendance write is saved locally with the device timestamp and queued for synchronization.
8. No Supabase request is made by the scan operation.

## Build for Production

```powershell
npm run build
npm run preview
```

Deploy the `frontend/dist` folder to Vercel, Netlify, or any static host.

## Auto-Logout

The SQL function `auto_logout_all()` logs out all active visitors. Migration `010_scheduled_auto_logout_closures.sql` tries to schedule it with Supabase `pg_cron` at:

- 12:00 PM Philippine time for lunch break
- 5:00 PM Philippine time for library closing

If `pg_cron` is not available in your Supabase project, the admin scanner/dashboard also runs a fallback check while an admin page is open.

## Offline Architecture

The frontend is offline-first. Core screens read and write through `frontend/src/lib/libraryRepository.ts`, which persists records in IndexedDB via `frontend/src/lib/offlineDatabase.ts` before any network sync is attempted. Browser IndexedDB is used instead of native SQLite because this project is deployed as a static Vite web app; SQLite would require an Electron/Tauri wrapper, a local server, or a WASM SQLite package.

### Local Database Schema

IndexedDB database: `library-attendance-offline`

| Store | Key | Important indexes | Purpose |
|-------|-----|-------------------|---------|
| `students` | `id` | `student_id`, `qr_token`, `created_at` | Local student/member registry and QR lookup |
| `attendance` | `id` | `student_id`, `date`, `status`, `time_in` | Local login/logout attendance log |
| `sync_queue` | `id` | `status`, `created_at`, `[entity, recordId]` | Durable pending transaction queue |
| `sync_logs` | `id` | none | Reserved for future detailed sync audit records |
| `meta` | `key` | none | Last successful sync and local state |

Sensitive local fields such as student names, courses, and visit purposes are encrypted with AES-GCM before they are written to IndexedDB. Student IDs and QR tokens remain indexed so lookup, scanning, duplicate checks, and sync reconciliation stay fast.

### Sync Strategy

All student registration, student edits/deletes, attendance login/logout, and scheduled auto-logout changes are committed locally first and queued in `sync_queue`. When the browser reports that it is online, `OfflineProvider` calls `syncOfflineQueue()` automatically and also retries every 45 seconds.

Synchronization pushes queued changes to Supabase with stable UUID primary keys, then pulls remote `students` and `attendance` pages into the local cache. Local queued records win until they successfully sync; remote records fill or refresh anything without pending local edits. Duplicate prevention is handled locally before writes and remotely by the existing Supabase unique constraints. Sync errors are retained on the queue item, logged to the console, shown by the navbar status badge, and retried later.

### Offline Behavior

- Online/offline status is detected with browser network events and shown in the navbar.
- The status badge shows pending queued changes and can be clicked to retry sync.
- The app shell is cached by `frontend/public/offline-sw.js` after the first successful load.
- Admin login still requires one online Supabase login on a device. After that, the cached Supabase session can continue to open admin tools while offline.

### Recovery Notes

IndexedDB writes and queue entries are stored in the same browser database before sync begins, so unexpected shutdowns should not lose completed local operations. If a sync fails because of network loss, duplicate constraints, or Supabase errors, the queue item remains failed/pending and is retried on the next sync. For managed deployments, set `VITE_OFFLINE_DATABASE_SECRET` and use OS-level disk encryption for stronger device-at-rest protection.

## Tech Stack

- Frontend: React 19, TypeScript, Vite, React Router, TanStack Query
- QR: html5-qrcode scanner, qrcode.react generator
- Charts: Recharts
- Backend/DB: Supabase PostgreSQL, Auth, RLS, RPC

## Developer

Developed by Kyle T. Tangcogo
