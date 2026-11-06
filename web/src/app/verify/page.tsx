import type { Metadata } from "next";
import { VerifyClient } from "./verify-client";

export const metadata: Metadata = {
  title: "Tap your card · Watermark Genesis Drop",
  description:
    "Step 1 of the Watermark Genesis Drop: tap your bank card on the Watermark phone app. Your card number never goes on-chain. You pay no fees.",
};

export default function VerifyPage() {
  return <VerifyClient />;
}
