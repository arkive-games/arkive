import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

import ContentLayout from "@/components/ContentLayout";
import WikiWorkspace from "@/features/wiki/WikiWorkspace";
import { isLordOfMysteriesPath } from "@/lib/lordOfMysteries";

export const Route = createFileRoute("/wiki")({
  component: WikiRoute,
});

function WikiRoute() {
  const { pathname } = useLocation();
  const lordOfMysteriesPage = isLordOfMysteriesPath(pathname);

  return (
    <ContentLayout
      className="aion2-wiki-page"
      contentClassName={lordOfMysteriesPage
        ? "max-w-[var(--arkive-content-wide-data)] p-4 md:p-6 2xl:p-8"
        : "max-w-[96rem] p-0 md:p-0"}
    >
      {lordOfMysteriesPage ? (
        <Outlet />
      ) : (
        <WikiWorkspace>
          <Outlet />
        </WikiWorkspace>
      )}
    </ContentLayout>
  );
}
