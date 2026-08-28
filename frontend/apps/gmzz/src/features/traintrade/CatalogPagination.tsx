import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

export default function CatalogPagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useTranslation("wiki");

  if (pageCount <= 1) return null;

  return (
    <nav className="flex items-center justify-center gap-2 border-t border-border pt-4" aria-label={t("catalogPagination.label")}>
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="grid min-h-10 min-w-10 place-items-center rounded-md border border-border text-muted-foreground transition-colors enabled:hover:bg-accent enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={t("catalogPagination.previous")}
        title={t("catalogPagination.previous")}
      >
        <IconChevronLeft className="size-4" stroke={1.8} aria-hidden />
      </button>
      <span className="min-w-24 text-center text-sm tabular-nums text-muted-foreground">
        {t("catalogPagination.status", { page, total: pageCount })}
      </span>
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
        className="grid min-h-10 min-w-10 place-items-center rounded-md border border-border text-muted-foreground transition-colors enabled:hover:bg-accent enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={t("catalogPagination.next")}
        title={t("catalogPagination.next")}
      >
        <IconChevronRight className="size-4" stroke={1.8} aria-hidden />
      </button>
    </nav>
  );
}
