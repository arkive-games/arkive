import { createFileRoute, Outlet } from "@tanstack/react-router";

import ContentLayout from "@/components/ContentLayout";

export const Route = createFileRoute("/wiki")({
  component: () => (
    <ContentLayout
      className="aion2-wiki-page"
      contentClassName="max-w-6xl md:px-6 md:py-8"
    >
      <Outlet />
    </ContentLayout>
  ),
});
