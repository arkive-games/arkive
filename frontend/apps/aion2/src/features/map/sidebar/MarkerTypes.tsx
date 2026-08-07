import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FilterPanel, type FilterCategory, type FilterControl } from "@gamemap/map-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@gamemap/ui";
import { useGameMap } from "@/context/GameMapContext";
import { useGameData } from "@/context/GameDataContext";
import { useMarkers } from "@/context/MarkersContext";
import { parseIconUrl } from "@/lib/url";

// Quiet neutral rows keep the dense filter list readable; selected rows use
// the same warm-orange rail and tinted surface as the map marker treatment.
const BUTTON_SKIN =
  "h-auto min-h-9 rounded-md border border-transparent bg-transparent px-2 text-xs font-medium text-muted-foreground opacity-65 hover:border-[color:var(--arkive-divider)] hover:bg-card hover:text-foreground hover:opacity-100";
const BUTTON_SKIN_ACTIVE =
  "border-primary/20 bg-[color:var(--arkive-filter-active)] font-semibold text-foreground opacity-100 shadow-[inset_0.18rem_0_0_var(--arkive-orange)]";
const CONTROL_SKIN =
  "h-9 min-h-9 justify-center rounded-md border border-[color:var(--arkive-divider)] bg-card px-2 text-xs font-semibold text-muted-foreground shadow-none hover:border-primary/35 hover:bg-[color:var(--arkive-filter-hover)] hover:text-foreground";
const CONTROL_SKIN_ACTIVE =
  "border-primary/40 bg-[color:var(--arkive-filter-active)] text-primary shadow-none hover:bg-[color:var(--arkive-filter-active)]";

export default function MarkerTypes() {
  const { types, selectedMap } = useGameMap();
  const {
    handleShowAllSubtypes,
    handleHideAllSubtypes,
    visibleSubtypes,
    handleToggleSubtype,
    showBorders,
    handleToggleBorders,
    lodEnabled,
    setLodEnabled,
  } = useGameData();
  const { clearMarkerCompleted, showLabels, setShowLabels, subtypeCounts, completedCounts } =
    useMarkers();
  const { t } = useTranslation(["common", "types"]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Categories that have at least one subtype with a non-zero count.
  const renderableCategories = types.filter((category) =>
    category.subtypes.some((s) => (subtypeCounts[s.name] ?? 0) > 0),
  );

  const filterCategories: FilterCategory[] = renderableCategories.map((category) => {
    return {
      id: category.name,
      label: t(`types:categories.${category.name}.name`, category.name),
      subtypes: category.subtypes
        .filter((sub) => (subtypeCounts[sub.name] ?? 0) > 0)
        .map((sub) => {
          const total = subtypeCounts[sub.name] ?? 0;
          const completed = completedCounts[sub.name] ?? 0;
          const iconName = sub.icon || category.icon || "";
          const iconSize = (sub.iconScale || 1.0) * 20;
          return {
            id: sub.name,
            label: t(`types:subtypes.${sub.name}.name`, sub.name),
            active: visibleSubtypes?.has(sub.name) ?? false,
            badge: sub.canComplete === true ? `${completed}/${total}` : String(total),
            icon:
              iconName && selectedMap ? (
                <div className="relative flex h-5 w-5 items-center justify-center overflow-visible">
                  <img
                    src={parseIconUrl(iconName, selectedMap)}
                    alt=""
                    className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 object-contain"
                    style={{ width: iconSize, height: iconSize }}
                  />
                </div>
              ) : undefined,
          };
        }),
    };
  });

  const onSetCategory = (categoryId: string, visible: boolean) => {
    const category = types.find((c) => c.name === categoryId);
    if (!category) return;
    const subtypeKeys = category.subtypes
      .map((s) => s.name)
      .filter((k) => (subtypeCounts[k] ?? 0) > 0);
    for (const k of subtypeKeys) {
      const isVisible = visibleSubtypes?.has(k) ?? false;
      if (visible && !isVisible) handleToggleSubtype(k);
      if (!visible && isVisible) handleToggleSubtype(k);
    }
  };

  const controls: FilterControl[] = [
    {
      id: "show-all",
      label: t("common:menu.showAllMarkers", "Show all"),
      onClick: handleShowAllSubtypes,
    },
    {
      id: "hide-all",
      label: t("common:menu.hideAllMarkers", "Hide all"),
      onClick: handleHideAllSubtypes,
    },
    {
      id: "show-names",
      label: t("common:menu.showMarkerNames", "Show marker names"),
      onClick: () => setShowLabels(!showLabels),
      active: showLabels,
      testId: "show-names-toggle",
    },
    {
      id: "clear-completed",
      label: t("common:menu.clearMarkerCompleted", "Clear completed"),
      onClick: () => setConfirmOpen(true),
    },
    {
      id: "borders",
      label: t("common:menu.showBorders", "Show region borders"),
      onClick: handleToggleBorders,
      active: showBorders,
    },
    {
      id: "lod",
      label: t("common:menu.lodToggle", "Auto detail by zoom"),
      onClick: () => setLodEnabled(!lodEnabled),
      active: lodEnabled,
      testId: "lod-toggle",
    },
  ];

  return (
    <div className="flex w-full flex-col px-3 pb-4">
      <FilterPanel
        categories={filterCategories}
        onToggleSubtype={handleToggleSubtype}
        onSetCategory={onSetCategory}
        categoryToggleLabels={{
          show: t("common:menu.showCategory", "Show all in this category"),
          hide: t("common:menu.hideCategory", "Hide all in this category"),
        }}
        controls={controls}
        classNames={{
          controls: "mb-2 grid-cols-2 gap-2",
          controlButton: CONTROL_SKIN,
          controlButtonActive: CONTROL_SKIN_ACTIVE,
          subtypeButton: BUTTON_SKIN,
          subtypeButtonActive: BUTTON_SKIN_ACTIVE,
          category:
            "border-b border-[color:var(--arkive-divider)] py-1.5 last:border-b-0",
          categoryHeader:
            "min-h-10 pt-0 pb-0 text-foreground [&>svg]:size-5 [&>svg]:text-foreground/55",
          categoryEyeToggle:
            "text-foreground/55 hover:bg-[color:var(--arkive-filter-hover)] hover:text-primary",
          subtypeGrid: "gap-x-2 gap-y-1.5 pb-2",
        }}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("common:menu.clearMarkerCompleted", "Clear completed")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "common:menu.clearMarkerCompletedBody",
                "Do you want to clear all completed marker in this map?",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:ui.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => clearMarkerCompleted()}>
              {t("common:ui.confirm", "Confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
