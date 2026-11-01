"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      theme="dark"
      position="top-right"
      closeButton
      richColors
      toastOptions={{
        style: {
          background: "#11141A",
          border: "1px solid #222733",
          color: "#F8FAFC",
          fontFamily: "var(--font-inter), sans-serif",
        },
      }}
    />
  );
}
