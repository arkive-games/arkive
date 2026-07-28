import { createFileRoute, Outlet } from "@tanstack/react-router";

import ContentLayout from "@/components/ContentLayout";

export const Route = createFileRoute("/wiki")({
  component: () => (
    <ContentLayout>
      <Outlet />
    </ContentLayout>
  ),
});
