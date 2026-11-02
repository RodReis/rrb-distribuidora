export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "metalagents-theme";
export const THEME_EVENT = "metalagents:theme";

/**
 * Roda no <head>, antes da pintura, para o tema salvo valer já no primeiro quadro e a tela não
 * piscar escura antes de ficar clara. O padrão (escuro) vem do HTML do servidor.
 */
export const THEME_INIT_SCRIPT = `(function(){try{if(localStorage.getItem("${THEME_STORAGE_KEY}")==="light"){var r=document.documentElement;r.classList.remove("dark");r.classList.add("light");}}catch(e){}})();`;

export function parseTheme(value: string | null | undefined): Theme {
  return value === "light" ? "light" : "dark";
}

/** Lê o tema aplicado ao <html>. No servidor devolve o padrão. */
export function readAppliedTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("light", theme === "light");
  root.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Armazenamento bloqueado: o tema vale só nesta sessão.
  }
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}

/**
 * Cor de um token do tema em formato aceito por bibliotecas que não leem CSS (ex.: gráficos).
 * Lê a variável do tema ativo; `alpha` opcional.
 */
export function themeColor(token: string, alpha = 1): string {
  if (typeof document === "undefined") return "rgb(0, 0, 0)";
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim();
  const [r, g, b] = raw.split(/\s+/);
  return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
