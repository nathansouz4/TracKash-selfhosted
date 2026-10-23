// Per-browser display preferences. They live in localStorage (nothing sensitive)
// and are applied to <html> by an inline script before first paint, so hidden
// values never flash and the theme never flickers.

export type ThemePreference = "system" | "light" | "dark";

export const PRIVACY_KEY = "trackash:privacy";
export const THEME_KEY = "trackash:theme";

/** Runs before hydration (see __root.tsx). Must stay self-contained. */
export const PREFERENCES_BOOT_SCRIPT = `(function(){try{var d=document.documentElement;var p=localStorage.getItem(${JSON.stringify(
  PRIVACY_KEY,
)});if(p==="on")d.dataset.privacy="on";var t=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)});if(t==="light"||t==="dark")d.dataset.theme=t;}catch(e){}})()`;

export function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode / blocked storage: the toggle still works for this page view.
  }
}
