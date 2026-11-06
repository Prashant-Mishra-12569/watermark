import type { Metadata } from "next";
import { PayClient } from "./pay-client";

export const metadata: Metadata = {
  title: "Pay with no fees · Watermark Genesis Drop",
  description:
    "Step 2 of the Watermark Genesis Drop: sign one test USDT payment. We pay the fee. You pay $0.",
};

export default function PayPage() {
  return <PayClient />;
}
