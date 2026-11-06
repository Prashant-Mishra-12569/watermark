import type { Metadata } from "next";
import { PayClient } from "./pay-client";

export const metadata: Metadata = {
  title: "Pay · Watermark",
  description: "Pay a shop in USDT from your verified wallet. The relayer pays the gas, not you.",
};

export default function PayPage() {
  return <PayClient />;
}
