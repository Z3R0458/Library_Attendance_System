import { supabase } from './supabase';

export const PROFILE_IMAGE_BUCKET = 'student-profile-pictures';

const MAX_SIDE = 720;
const JPEG_QUALITY = 0.78;

export function validateProfileImage(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return 'Please upload a valid image file.';
  }

  if (file.size > 8 * 1024 * 1024) {
    return 'Profile picture must be 8 MB or smaller before compression.';
  }

  return null;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unable to read the selected profile picture.'));
    };

    image.src = url;
  });
}

export async function resizeProfileImage(file: File): Promise<Blob> {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Image compression is not available in this browser.');
  }

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(image, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Unable to compress the selected profile picture.'));
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

function safePathPart(value: string): string {
  return value.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'student';
}

export async function uploadStudentProfileImage(file: File, studentId: string): Promise<string> {
  const compressed = await resizeProfileImage(file);
  const path = `${safePathPart(studentId)}/${Date.now()}-${crypto.randomUUID()}.jpg`;

  const { error } = await supabase.storage
    .from(PROFILE_IMAGE_BUCKET)
    .upload(path, compressed, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage.from(PROFILE_IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
