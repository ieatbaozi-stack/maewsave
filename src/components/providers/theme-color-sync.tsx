"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

const LIGHT_CANVAS_HEX = "#F8F9FA";
const DARK_CANVAS_HEX = "#0D0F12";

export function ThemeColorSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!resolvedTheme) {
      return;
    }

    const targetColor = resolvedTheme === "dark" ? DARK_CANVAS_HEX : LIGHT_CANVAS_HEX;
    const existingTags = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');

    if (existingTags.length === 0) {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = targetColor;
      document.head.appendChild(meta);
      return;
    }

    existingTags.forEach((tag) => {
      tag.removeAttribute("media");
      tag.setAttribute("content", targetColor);
    });
  }, [resolvedTheme]);

  return null;
}
