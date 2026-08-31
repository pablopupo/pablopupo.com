export const THEME_STORAGE_KEY = "pablo-color-theme";
export const THEME_CHANGE_EVENT = "pablo-theme-change";

export type SiteTheme = "light" | "dark";

export function storedTheme(value: unknown): SiteTheme | null {
  return value === "light" || value === "dark" ? value : null;
}

export function nextTheme(
  saved: unknown,
  systemPrefersDark: boolean
): SiteTheme {
  const current =
    storedTheme(saved) ?? (systemPrefersDark ? "dark" : "light");
  return current === "dark" ? "light" : "dark";
}

export const themeBootstrapScript = `try{var theme=localStorage.getItem("${THEME_STORAGE_KEY}");if(theme==="light"||theme==="dark"){document.documentElement.setAttribute("data-theme",theme)}}catch{}`;
