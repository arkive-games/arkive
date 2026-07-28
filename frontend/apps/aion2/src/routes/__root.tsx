import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "@/context/ThemeContext";
import { GameMapProvider } from "@/context/GameMapContext";
import { MarkersProvider } from "@/context/MarkersContext";
import { GameDataProvider } from "@/context/GameDataContext";
import { ThemeMapBridge } from "@/context/ThemeMapBridge";
import BottomTabBar from "@/components/BottomTabBar";

export const Route = createRootRoute({
  component: () => (
    <ThemeProvider>
      <GameMapProvider>
        <ThemeMapBridge />
        <MarkersProvider>
          <GameDataProvider>
            <Outlet />
            {/* Mobile-only (md:hidden inside). Mounted here so one instance
                serves every route — map and wiki alike. */}
            <BottomTabBar />
          </GameDataProvider>
        </MarkersProvider>
      </GameMapProvider>
    </ThemeProvider>
  ),
});
