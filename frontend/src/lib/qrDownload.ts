function isMobileBrowser() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Unable to prepare the QR image for download.'));
    }, 'image/png');
  });
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function openImageFallback(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank', 'noopener,noreferrer');

  if (!opened) {
    window.location.href = url;
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function shareOnMobile(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: 'image/png' });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };

  if (!nav.share || !nav.canShare?.({ files: [file] })) return false;

  await nav.share({
    files: [file],
    title: 'Student QR Code',
    text: 'Save or share your library QR code.',
  });
  return true;
}

export async function downloadSvgAsPng(svg: SVGElement | null, filename: string) {
  if (!svg) return;

  const svgData = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();

      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Unable to generate the QR image.'));
      image.src = svgUrl;
    });

    const scale = 3;
    const width = img.naturalWidth || img.width || 360;
    const height = img.naturalHeight || img.height || 360;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) throw new Error('QR download is not available in this browser.');

    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const pngBlob = await canvasToBlob(canvas);

    if (isMobileBrowser()) {
      try {
        const shared = await shareOnMobile(pngBlob, filename);
        if (shared) return;
      } catch {
        // If the user cancels or sharing is unavailable, fall back to opening the image.
      }

      openImageFallback(pngBlob);
      return;
    }

    triggerBrowserDownload(pngBlob, filename);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
