#!/usr/bin/env node

import { randomUUID } from 'node:crypto';

const required = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_UPLOAD_PRESET',
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing ${key}.`);
    process.exit(1);
  }
}

const supabaseUrl = process.env.SUPABASE_URL.replace(/\/+$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
const cloudinaryFolder = process.env.CLOUDINARY_FOLDER || 'library-student-profiles';
const bucketMarker = '/student-profile-pictures/';
const pageSize = 100;

function supabaseHeaders(extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

function safePathPart(value) {
  return String(value || 'student')
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'student';
}

async function readSupabaseJson(path) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Supabase read failed (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

async function patchStudent(id, profilePictureUrl) {
  const response = await fetch(`${supabaseUrl}/rest/v1/students?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: supabaseHeaders({
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    }),
    body: JSON.stringify({ profile_picture_url: profilePictureUrl }),
  });

  if (!response.ok) {
    throw new Error(`Supabase update failed (${response.status}): ${await response.text()}`);
  }
}

async function uploadToCloudinary(student, blob) {
  const formData = new FormData();
  formData.append('file', blob, `${safePathPart(student.student_id)}-profile.jpg`);
  formData.append('upload_preset', uploadPreset);
  formData.append('folder', cloudinaryFolder);
  formData.append('public_id', `${safePathPart(student.student_id)}-${randomUUID()}`);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Cloudinary upload failed (${response.status}): ${result?.error?.message || response.statusText}`);
  }

  if (!result.secure_url && !result.url) {
    throw new Error('Cloudinary did not return a URL.');
  }

  return result.secure_url || result.url;
}

let migrated = 0;
let skipped = 0;
let failed = 0;

for (let offset = 0; ; offset += pageSize) {
  const query = new URLSearchParams({
    select: 'id,student_id,name,profile_picture_url',
    profile_picture_url: `ilike.*${bucketMarker}*`,
    order: 'created_at.asc',
    offset: String(offset),
    limit: String(pageSize),
  });
  const students = await readSupabaseJson(`/rest/v1/students?${query.toString()}`);

  if (!students.length) break;

  for (const student of students) {
    try {
      const oldUrl = student.profile_picture_url;
      if (!oldUrl || !oldUrl.includes(bucketMarker)) {
        skipped += 1;
        continue;
      }

      console.log(`Migrating ${student.student_id} (${student.name})...`);
      const imageResponse = await fetch(oldUrl);
      if (!imageResponse.ok) {
        throw new Error(`Image download failed (${imageResponse.status}).`);
      }

      const newUrl = await uploadToCloudinary(student, await imageResponse.blob());
      await patchStudent(student.id, newUrl);
      migrated += 1;
    } catch (error) {
      failed += 1;
      console.error(`Failed ${student.student_id}:`, error instanceof Error ? error.message : error);
    }
  }
}

console.log(`Done. Migrated: ${migrated}. Skipped: ${skipped}. Failed: ${failed}.`);
