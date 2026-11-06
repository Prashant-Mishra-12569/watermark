import { cx } from "./cx";

export type Role = "user" | "prover" | "relayer" | "business" | "shop";

/** Plain words (DESIGN_V2.md): "You" and "Us" on receipts; no "relayer" or "prover" outside the builders page and Details. */
export const ROLE_LABEL: Record<Role, string> = {
  user: "You",
  prover: "Proof",
  relayer: "Us",
  business: "Business",
  shop: "Shop",
};

// The dot (globals.css --role-*) is ink or grey, and saffron for "You" only: the label word tells roles apart.
// Literal strings for Tailwind.
const ROLE_DOT: Record<Role, string> = {
  user: "bg-role-user",
  prover: "bg-role-prover",
  relayer: "bg-role-relayer",
  business: "bg-role-business",
  shop: "bg-role-shop",
};

// On the night card an ink dot would vanish: ink roles turn white there, grey stays grey, "You" stays saffron.
const ROLE_DOT_NIGHT: Record<Role, string> = {
  user: "bg-role-user",
  prover: "bg-night-muted",
  relayer: "bg-night-text",
  business: "bg-night-text",
  shop: "bg-night-text",
};

/** Who did a step: You, Proof, Us, Business or Shop. `label` replaces the text, e.g. "Phone · You". */
export function RoleChip({
  role,
  label,
  className,
  tone = "light",
}: {
  role: Role;
  label?: string;
  className?: string;
  tone?: "light" | "night";
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5",
        tone === "night" ? "border-night-line bg-white/[0.06] text-night-text" : "border-line bg-white text-ink",
        className,
      )}
    >
      <span aria-hidden="true" className={cx("size-1.5 shrink-0 rounded-full", (tone === "night" ? ROLE_DOT_NIGHT : ROLE_DOT)[role])} />
      {label ?? ROLE_LABEL[role]}
    </span>
  );
}
