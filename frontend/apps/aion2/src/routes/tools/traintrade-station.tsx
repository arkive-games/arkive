import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import ContentLayout from "@/components/ContentLayout";
import TrainTradeStationToolPage from "@/features/wiki/TrainTradeStationToolPage";

export const Route = createFileRoute("/tools/traintrade-station")({
  component: TrainTradeStationRoute,
});

function TrainTradeStationRoute() {
  const { t } = useTranslation("wiki");

  return (
    <ContentLayout pageTitle={t("trainTrade.stationTool.title")}>
      <TrainTradeStationToolPage />
    </ContentLayout>
  );
}
