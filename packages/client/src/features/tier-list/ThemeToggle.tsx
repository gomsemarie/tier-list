import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

const KEY = "tier-list:theme";
type Theme = "light" | "dark";

function getInitial(): Theme {
  if (typeof localStorage !== "undefined") {
    const v = localStorage.getItem(KEY);
    if (v === "dark" || v === "light") return v;
  }
  return "light"; // white is the default
}

/** Light/dark theme switch. Applies `.dark` on <html> and persists the choice. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitial);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  return (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label="테마 전환"
      title={theme === "dark" ? "라이트 모드로" : "다크 모드로"}
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}
