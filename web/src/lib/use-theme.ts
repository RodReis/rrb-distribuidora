"use client";

import { useSyncExternalStore } from "react";
import { THEME_EVENT, THEME_STORAGE_KEY, readAppliedTheme, type Theme } from "./theme";

function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    // Outra aba trocou o tema: acompanha.
    if (event.key === THEME_STORAGE_KEY) {
      const light = event.newValue === "light";
      document.documentElement.classList.toggle("light", light);
      document.documentElement.classList.toggle("dark", !light);
      callback();
    }
  };
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

/** Tema aplicado ao <html>. Renderiza "dark" no servidor e corrige no cliente. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readAppliedTheme, () => "dark" as Theme);
}
