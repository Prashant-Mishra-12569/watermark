import type { Metadata } from "next";
import { VerifyClient } from "./verify-client";

export const metadata: Metadata = {
  title: "Verify · Watermark",
  description: "Scan the QR code with your Android phone and tap your bank card.",
};

export default function VerifyPage() {
  return <VerifyClient />;
}
