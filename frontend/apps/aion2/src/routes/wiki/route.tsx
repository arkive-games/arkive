import { createFileRoute, Outlet } from "@tanstack/react-router";

import ContentLayout from "@/components/ContentLayout";
import WikiWorkspace from "@/features/wiki/WikiWorkspace";

export const Route = createFileRoute("/wiki")({
  component: () => (
    <ContentLayout
      className="aion2-wiki-page"
      contentClassName="max-w-[96rem] p-0 md:p-0"
    >
      <WikiWorkspace>
        <Outlet />
      </WikiWorkspace>
    </ContentLayout>
  ),
});
