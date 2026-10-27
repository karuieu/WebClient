"use client";

import * as React from "react";
import { encode } from "uqr";
import { cx } from "@/lib/ui/cx";

/** Keep QR codes black on white in every theme because many authenticator scanners cannot read inverted codes. */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { path, size } = React.useMemo(() => {
    const { data, size } = encode(value, { ecc: "M", border: 2 });
    let d = "";
    data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { path: d, size };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={cx("rounded-2xl bg-white text-black", className)}
    >
      <path d={path} fill="currentColor" />
    </svg>
  );
}
