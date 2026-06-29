// GlassCard — translucent surface primitive that lives on top of the
// ambient BackgroundMesh. See design.md §2.3 for the contract.
//
// Two variants:
//   - default (`.cb-glass`)        — light frosted layer for content panels
//   - strong  (`.cb-glass-strong`) — denser layer for hero / server-status
//
// Both fall back to `var(--color-panel-solid)` on browsers without
// `backdrop-filter` support (Firefox ESR, Safari < 18) — see styles.css.

import { Box } from "@radix-ui/themes";
import type { ComponentProps, ReactNode } from "react";

type RadixBoxProps = ComponentProps<typeof Box>;

export interface GlassCardProps extends Omit<RadixBoxProps, "className"> {
  /** Use the stronger (denser) variant. */
  strong?: boolean;
  /** Removes default padding — useful when the consumer wants full control. */
  bare?: boolean;
  children?: ReactNode;
  /** Optional className to layer on top of the glass class. */
  className?: string;
}

export function GlassCard({ strong, bare, className, children, ...rest }: GlassCardProps) {
  const classes = [strong ? "cb-glass-strong" : "cb-glass", className].filter(Boolean).join(" ");
  return (
    <Box
      {...rest}
      className={classes}
      {...(bare ? {} : { p: (rest as any).p ?? "4" })}
    >
      {children}
    </Box>
  );
}
