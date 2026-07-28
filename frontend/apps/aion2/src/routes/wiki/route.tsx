import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { SiteFooter, useIsMobile } from "@gamemap/ui";

import TopNavbar from "@/components/TopNavbar";
import GlobalSearchWidget from "@/components/GlobalSearchWidget";

function WikiLayout() {
  // Exactly ONE of the two bars is mounted, rather than CSS-hiding one: both
  // contain a GlobalSearchWidget, and two of those in the DOM means two
  // elements share `data-testid="global-search-button"` — which breaks strict
  // locators in this app's existing e2e specs.
  const isMobile = useIsMobile();

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-background text-foreground">
      {isMobile ? (
        /* Compact utility bar. Deliberately NOT a page title: every wiki page
           already renders its own <h1>, so a title here would duplicate it and
           would have to be threaded through the router. */
        <header
          data-testid="wiki-mobile-header"
          className="flex min-h-12 shrink-0 items-center justify-between border-b border-border bg-topnavbar px-4"
          /* viewport-fit=cover lets content sit under a notch / status bar in
             standalone mode, so pad the top by the inset (0 in a normal
             browser, where the chrome already occupies that space). */
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <Link
            to="/"
            className="text-lg font-bold tracking-tight text-[#2E97FF] select-none"
          >
            AION2
          </Link>
          <GlobalSearchWidget />
        </header>
      ) : (
        <TopNavbar />
      )}
      <main className="flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col">
          <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
            <Outlet />
          </div>
          {/* Last element in the scroll column, so its bottom padding is what
              lifts content clear of the fixed bottom tab bar + safe area. */}
          <SiteFooter
            className="pb-[calc(env(safe-area-inset-bottom)+4rem)] md:pb-4"
            homeUrl={import.meta.env.VITE_HOME_URL}
            githubUrl={import.meta.env.VITE_GITHUB_URL}
            icpBeian={import.meta.env.VITE_ICP_BEIAN}
          />
        </div>
      </main>
    </div>
  );
}

export const Route = createFileRoute("/wiki")({
  component: WikiLayout,
});
