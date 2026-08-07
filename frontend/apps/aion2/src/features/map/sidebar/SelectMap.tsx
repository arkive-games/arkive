import { useTranslation } from "react-i18next";
import { ShellMapSelect } from "@gamemap/map-shell";
import { useGameMap } from "@/context/GameMapContext";

export default function SelectMap() {
  const { maps, selectedMap, setSelectedMap } = useGameMap();
  const { t } = useTranslation(["maps", "common"]);

  return (
    <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-2 border-b border-border px-3 py-3 max-md:pr-8">
      <span className="text-sm font-bold text-foreground">
        {t("common:menu.mapRegion", "Map region")}
      </span>
      <ShellMapSelect
        classNames={{
          trigger:
            "min-h-11 rounded-lg border-border bg-card px-3 text-base font-semibold shadow-none hover:border-primary/40 hover:bg-card data-[state=open]:bg-card",
          content: "border-border bg-popover",
        }}
        maps={maps.map((map) => ({
          id: map.name,
          label: t(`maps:${map.name}.name`, map.name),
        }))}
        activeMapId={selectedMap?.name ?? ""}
        onSelectMap={(id) => setSelectedMap(maps.find((map) => map.name === id))}
        placeholder={t("common:menu.selectMap", "Select a map")}
      />
    </div>
  );
}
