function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Unable to prepare the QR image for download.'));
    }, 'image/png');
  });
}

export async function createSvgPngBlob(svg: SVGElement | null): Promise<Blob | null> {
  if (!svg) return null;

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

    return canvasToBlob(canvas);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export async function createSvgPngObjectUrl(svg: SVGElement | null): Promise<string | null> {
  const blob = await createSvgPngBlob(svg);
  return blob ? URL.createObjectURL(blob) : null;
}

export async function downloadSvgAsPng(svg: SVGElement | null, filename: string) {
  const blob = await createSvgPngBlob(svg);
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
