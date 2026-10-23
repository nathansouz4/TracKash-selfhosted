import { useCallback, useEffect, useState } from "react";
import {
  PRIVACY_KEY,
  readPreference,
  THEME_KEY,
  writePreference,
  type ThemePreference,
} from "@/lib/preferences";

export function usePrivacyMode() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(document.documentElement.dataset["privacy"] === "on");
  }, []);

  const toggle = useCallback(() => {
    setHidden((current) => {
      const next = !current;
      if (next) document.documentElement.dataset["privacy"] = "on";
      else delete document.documentElement.dataset["privacy"];
      writePreference(PRIVACY_KEY, next ? "on" : null);
      return next;
    });
  }, []);

  return { hidden, toggle };
}

const THEME_CYCLE: ThemePreference[] = ["system", "dark", "light"];

export function useThemePreference() {
  const [theme, setTheme] = useState<ThemePreference>("system");

  useEffect(() => {
    const stored = readPreference(THEME_KEY);
    setTheme(stored === "light" || stored === "dark" ? stored : "system");
  }, []);

  const cycle = useCallback(() => {
    setTheme((current) => {
      const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length]!;
      if (next === "system") delete document.documentElement.dataset["theme"];
      else document.documentElement.dataset["theme"] = next;
      writePreference(THEME_KEY, next === "system" ? null : next);
      return next;
    });
  }, []);

  return { theme, cycle };
}
