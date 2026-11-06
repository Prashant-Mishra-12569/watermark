"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { headerModeFor } from "@/lib/site.ts";
import { SiteHeader, SiteHeaderPlaceholder } from "./site-header";

const clean = (pathname: string): string => pathname.replace(/\/+$/, "") || "/";

/** Routes whose header depends on ?next=pass: the drop's steps. */
function readsQuery(pathname: string): boolean {
  const p = clean(pathname);
  return p === "/verify" || p === "/pay";
}

function QueryHeader({ pathname }: { pathname: string }) {
  const next = useSearchParams()?.get("next") ?? null;
  const h = headerModeFor(pathname, next);
  // Keyed on the route: a navigation remounts the header, so the mobile <details> menu closes.
  return <SiteHeader key={`${pathname}?${next ?? ""}`} {...h} current={pathname} />;
}

/**
 * The header for the current route (root layout). SITE_FINAL.md: both pages, the builders page (/) and the Genesis
 * Drop (/pass), get the site nav; only the drop's steps get the flow header ("Genesis Drop · Step n of 3" and Exit),
 * open or not: ?next=pass on /verify (step 1) and /pay (step 2). The query string is only read on those two routes,
 * inside Suspense (a logo-only bar until it is read), so every other page's header is prerendered.
 */
export function RouteHeader() {
  const pathname = usePathname() ?? "/";

  if (readsQuery(pathname)) {
    return (
      <Suspense fallback={<SiteHeaderPlaceholder />}>
        <QueryHeader pathname={pathname} />
      </Suspense>
    );
  }
  return <SiteHeader key={pathname} mode="site" current={pathname} />;
}
