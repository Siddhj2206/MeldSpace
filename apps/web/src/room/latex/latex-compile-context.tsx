import { createContext, useContext, type ReactNode } from "react";

import { useLatexCompile, type LatexCompile } from "./use-latex-compile";

const LatexCompileContext = createContext<LatexCompile | null>(null);

/**
 * Owns the room's compile state so the header Recompile button and the
 * preview panel share one engine, one warm-up, and one blob URL.
 */
export function LatexCompileProvider({ children }: { children: ReactNode }) {
  const value = useLatexCompile();
  return <LatexCompileContext.Provider value={value}>{children}</LatexCompileContext.Provider>;
}

export function useLatexCompileContext(): LatexCompile {
  const value = useContext(LatexCompileContext);
  if (!value) {
    throw new Error("useLatexCompileContext must be used within a LatexCompileProvider");
  }
  return value;
}
