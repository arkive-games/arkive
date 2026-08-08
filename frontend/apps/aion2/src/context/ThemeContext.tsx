import { type ReactNode } from "react";
import {
  createArkiveThemeStorage,
  ThemeProvider as SharedThemeProvider,
  useTheme,
  type Theme,
} from "@gamemap/map-shell";

const themeStorage = createArkiveThemeStorage({ legacyKeys: ["aion2.theme"] });

export type { Theme };
export { useTheme };

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <SharedThemeProvider defaultTheme="auto" storage={themeStorage}>
      {children}
    </SharedThemeProvider>
  );
}
