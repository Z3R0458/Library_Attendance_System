import { useCallback, useEffect, useId, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { parseQrPayload, type ParsedQrPayload } from '../../lib/constants';

interface QRScannerProps {
  onScan: (payload: ParsedQrPayload) => void;
  paused?: boolean;
  label?: string;
}

export function QRScanner({ onScan, paused = false, label = 'student QR code' }: QRScannerProps) {
  const scannerId = `qr-reader-${useId().replace(/:/g, '')}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startTokenRef = useRef(0);
  const lastScanRef = useRef<string>('');
  const lastScanTimeRef = useRef<number>(0);

  const handleScan = useCallback(
    (decodedText: string) => {
      const payload = parseQrPayload(decodedText);
      const dedupeKey = payload?.studentId ?? payload?.qrToken;
      if (!payload || !dedupeKey) return;

      const now = Date.now();
      if (dedupeKey === lastScanRef.current && now - lastScanTimeRef.current < 3000) {
        return;
      }

      lastScanRef.current = dedupeKey;
      lastScanTimeRef.current = now;
      onScan(payload);
    },
    [onScan],
  );

  useEffect(() => {
    let cancelled = false;
    const startToken = startTokenRef.current + 1;
    startTokenRef.current = startToken;

    const stopScanner = async () => {
      const scanner = scannerRef.current;
      scannerRef.current = null;

      if (!scanner) return;

      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
        scanner.clear();
      } catch {
        // The scanner can already be stopped while React is remounting in dev.
      }
    };

    const startScanner = async () => {
      await stopScanner();

      if (paused || cancelled) return;

      const readerEl = document.getElementById(scannerId);
      if (readerEl) readerEl.innerHTML = '';

      const scanner = new Html5Qrcode(scannerId);
      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          handleScan,
          () => {},
        );

        if (cancelled || startTokenRef.current !== startToken) {
          await stopScanner();
        }
      } catch {
        try {
          if (cancelled || startTokenRef.current !== startToken) return;

          await scanner.start(
            { facingMode: 'user' },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            handleScan,
            () => {},
          );

          if (cancelled || startTokenRef.current !== startToken) {
            await stopScanner();
          }
        } catch (err) {
          console.error('Camera access failed:', err);
        }
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      void stopScanner();
    };
  }, [handleScan, paused, scannerId]);

  return (
    <div className="scanner-container">
      <div id={scannerId} className="qr-reader" />
      <p className="scanner-help">
        Point your camera at the {label}. Keep the QR code inside the guide box.
      </p>
    </div>
  );
}
