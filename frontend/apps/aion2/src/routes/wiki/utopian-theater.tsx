import { createFileRoute } from "@tanstack/react-router";

import UtopianTheaterPage from "@/features/wiki/UtopianTheaterPage";

export const Route = createFileRoute("/wiki/utopian-theater")({
  component: UtopianTheaterPage,
});
