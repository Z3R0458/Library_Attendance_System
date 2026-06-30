import { supabase } from './supabase';

export const PROFILE_IMAGE_BUCKET = 'student-profile-pictures';

const MAX_SIDE = 640;
const JPEG_QUALITY = 0.72;
const IMAGE_EXTENSION_PATTERN = /\.(avif|gif|heic|heif|jpe?g|png|webp)$/i;

export function validateProfileImage(file: File): string | null {
  const hasImageType = file.type.startsWith('image/');
  const hasImageExtension = IMAGE_EXTENSION_PATTERN.test(file.name);

  if (!hasImageType && !hasImageExtension) {
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

  if (!canvas.toBlob) {
    const response = await fetch(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    return response.blob();
  }

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

function createUploadId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function createUploadFile(blob: Blob, studentId: string): Blob {
  const filename = `${safePathPart(studentId)}-profile.jpg`;

  try {
    return new File([blob], filename, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    return new Blob([blob], { type: 'image/jpeg' });
  }
}

export function getProfileImageErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === 'Failed to fetch') {
      return 'Unable to upload the profile picture. Please check your internet connection, then make sure the Supabase Storage bucket and deployed Vercel environment variables are configured.';
    }

    if (error.message.includes('Unable to read')) {
      return 'Unable to read this image on your phone. Please choose a JPG, PNG, or WebP photo, or take a new photo with the Camera option.';
    }

    return error.message;
  }

  return 'Unable to upload the selected profile picture.';
}

export async function uploadStudentProfileImage(file: File, studentId: string): Promise<string> {
  const compressed = await resizeProfileImage(file);
  const uploadFile = createUploadFile(compressed, studentId);
  const path = `${safePathPart(studentId)}/${createUploadId()}.jpg`;

  const { error } = await supabase.storage
    .from(PROFILE_IMAGE_BUCKET)
    .upload(path, uploadFile, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage.from(PROFILE_IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
