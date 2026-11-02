"use client";

import { Toaster as SonnerToaster } from "sonner";
import { useTheme } from "@/lib/use-theme";

export function Toaster() {
  const theme = useTheme();

  return (
    <SonnerToaster
      theme={theme}
      position="top-right"
      closeButton
      richColors
      toastOptions={{
        style: {
          background: "rgb(var(--carbon-900))",
          border: "1px solid rgb(var(--carbon-700))",
          color: "rgb(var(--ice-white))",
          fontFamily: "var(--font-inter), sans-serif",
        },
      }}
    />
  );
}
