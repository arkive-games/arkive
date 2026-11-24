import { createFileRoute, Outlet } from "@tanstack/react-router";

import ContentLayout from "@/components/ContentLayout";
import WikiWorkspace from "@/features/wiki/WikiWorkspace";

export const Route = createFileRoute("/wiki")({
  component: () => (
    <ContentLayout
      className="aion2-wiki-page"
      contentClassName="max-w-[var(--arkive-content-wide-data)] max-lg:p-0"
    >
      <WikiWorkspace>
        <Outlet />
      </WikiWorkspace>
    </ContentLayout>
  ),
});
