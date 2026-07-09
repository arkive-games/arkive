import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SiteFooter } from "@gamemap/ui";

import TopNavbar from "@/components/TopNavbar";

export const Route = createFileRoute("/wiki")({
  component: () => (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <TopNavbar />
      <main className="flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col">
          <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
            <Outlet />
          </div>
          <SiteFooter
            homeUrl={import.meta.env.VITE_HOME_URL}
            githubUrl={import.meta.env.VITE_GITHUB_URL}
            icpBeian={import.meta.env.VITE_ICP_BEIAN}
          />
        </div>
      </main>
    </div>
  ),
});
