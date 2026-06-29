// BackgroundMesh — fixed, full-viewport, behind everything. The actual
// animation lives in styles.css (60s linear keyframe). The CSS layer
// already honours `prefers-reduced-motion: reduce` by disabling the
// animation; we add a JS-layer short-circuit in case a user toggles the
// OS setting mid-session.

import { useEffect, useState } from "react";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function BackgroundMesh() {
  const [reduced, setReduced] = useState<boolean>(() => prefersReducedMotion());

  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return <div aria-hidden="true" className="cb-mesh" style={reduced ? { animation: "none" } : undefined} />;
}
