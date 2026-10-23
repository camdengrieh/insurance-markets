import { useEffect, useMemo, useRef } from "react";
import { encode } from "uqr";

// The WalletConnect pairing link as a QR code for a phone wallet's scanner. uqr computes the module matrix; the page
// paints it on a canvas itself (no SVG string, no markup). Always dark modules on a light ground with a quiet zone,
// whatever the theme, because scanners need that contrast. The canvas is an image with a text name; the same link is
// printed beside it as text, so nothing is only in the picture.

const QUIET_ZONE = 4;
const MODULE_PX = 4;

// The module matrix, true for a dark module, including the quiet zone.
export function qrModules(text: string): boolean[][] {
  return encode(text, { ecc: "M", border: QUIET_ZONE }).data;
}

export function PairingQr({ uri }: { readonly uri: string }) {
  const modules = useMemo(() => qrModules(uri), [uri]);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const size = modules.length * MODULE_PX;

  useEffect(() => {
    const context = canvas.current?.getContext("2d") ?? null;
    if (context === null) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    context.fillStyle = "#000000";
    modules.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) context.fillRect(x * MODULE_PX, y * MODULE_PX, MODULE_PX, MODULE_PX);
      });
    });
  }, [modules, size]);

  return <canvas ref={canvas} className="wl-qr" width={size} height={size} role="img" aria-label="QR code of the pairing link, for a phone wallet's scanner" data-modules={modules.length} />;
}
