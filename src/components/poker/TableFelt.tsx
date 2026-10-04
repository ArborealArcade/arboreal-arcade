"use client";

import type { ReactNode } from "react";
import { CARD_ART_BASE_URL } from "./CardView";

// Felt/table backdrop. The tree-table art may 404 until it is uploaded to the
// arcade-card-art bucket, so it is layered over a dark green radial gradient
// that carries the look on its own.
export function TableFelt({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        backgroundImage: `url("${CARD_ART_BASE_URL}/tree-table.jpg"), radial-gradient(ellipse at center, #1e5f3a 0%, #14432a 55%, #0a2a18 100%)`,
        backgroundSize: "cover, cover",
        backgroundPosition: "center, center",
      }}
    >
      {children}
    </div>
  );
}
