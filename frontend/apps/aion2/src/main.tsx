import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createHashHistory, createRouter } from "@tanstack/react-router";
import { AuthProvider } from "@gamemap/auth";
import { initBaiduAnalytics, trackPageview } from "@gamemap/map-shell";
import { AUTH_CONFIG } from "@/lib/auth";
import "./index.css";
import "leaflet/dist/leaflet.css";
// Static styles for the engine-rendered map chrome (zoom control, status bar,
// context menu) — the engine itself is Tailwind-free.
import "@gamemap/map-engine/engine.css";
import "./i18n";
import { routeTree } from "./routeTree.gen";

// Toy builds (VITE_TOY, see scripts/toy-build.mjs) are served under
// https://www.bilibili.com/toy/<slug>/ where only index.html exists as a real
// file — deep links must live in the hash or refreshes 404.
const router = import.meta.env.VITE_TOY
  ? createRouter({ routeTree, history: createHashHistory(), basepath: "/" })
  : createRouter({ basepath: import.meta.env.BASE_URL, routeTree });
declare module "@tanstack/react-router" {
  interface Register { router: typeof router; }
}

// Baidu Tongji counts the entry page only, so the router reports every
// client-side navigation after it.
initBaiduAnalytics({
  dev: import.meta.env.DEV,
  toy: Boolean(import.meta.env.VITE_TOY),
});
router.subscribe("onResolved", () => trackPageview());

const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      {/* Mounted unconditionally, with `enabled` doing the gating: mounting the
          provider conditionally would change hook order between the Toy build
          and the normal one. */}
      <AuthProvider
        baseUrl={AUTH_CONFIG.baseUrl}
        transport={AUTH_CONFIG.transport}
        enabled={AUTH_CONFIG.enabled}
      >
        <RouterProvider router={router} />
      </AuthProvider>
    </React.StrictMode>,
  );
}
