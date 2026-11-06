import type { Metadata } from "next";
import { VerifyClient } from "./verify-client";

export const metadata: Metadata = {
  title: "Verify with your card · Watermark Genesis Drop",
  description:
    "Step 1 of the Watermark Genesis Drop: tap your bank card on the Watermark phone app, once. Your card number never goes on-chain. You never pay a fee.",
};

export default function VerifyPage() {
  return <VerifyClient />;
}
