import { createFileRoute } from "@tanstack/react-router";

import TrainTradeGoodsPage from "@/features/wiki/TrainTradeGoodsPage";

export const Route = createFileRoute("/wiki/traintrade")({
  component: TrainTradeGoodsPage,
});

