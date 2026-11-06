"use client";

import { QRCodeSVG } from "qrcode.react";

/** The download link as a QR (the same qrcode.react /verify uses), black on white with its own quiet zone. */
export function DownloadQr({ value, label }: { value: string; label: string }) {
  return (
    <QRCodeSVG
      value={value}
      level="M"
      marginSize={4}
      size={320}
      bgColor="#FFFFFF"
      fgColor="#000000"
      title={label}
      role="img"
      aria-label={label}
      className="block aspect-square h-auto w-full"
    />
  );
}
