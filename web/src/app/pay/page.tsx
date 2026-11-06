import type { Metadata } from "next";
import { PayClient } from "./pay-client";

export const metadata: Metadata = {
  title: "One free test payment · Watermark Genesis Drop",
  description:
    "Step 2 of the Watermark Genesis Drop: sign one payment in test USDT. We pay the network fee, so you pay $0 in fees.",
};

export default function PayPage() {
  return <PayClient />;
}
