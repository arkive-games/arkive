import { useEffect, useState } from "react";
import { IconHammer } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

export function useComingSoonNotice() {
  const [noticeId, setNoticeId] = useState(0);

  useEffect(() => {
    if (!noticeId) return;
    const timeout = window.setTimeout(() => setNoticeId(0), 4200);
    return () => window.clearTimeout(timeout);
  }, [noticeId]);

  return {
    noticeId,
    showComingSoon: () => setNoticeId((value) => value + 1),
  };
}

export function ComingSoonNotice({ noticeId }: { noticeId: number }) {
  const { t } = useTranslation("common");
  if (!noticeId) return null;

  return (
    <div
      key={noticeId}
      className="fixed inset-x-4 top-1/2 z-[var(--arkive-layer-toast)] mx-auto flex max-w-sm -translate-y-1/2 items-center gap-3 rounded-lg border border-border bg-card p-4 text-foreground shadow-lg"
      role="status"
      aria-live="polite"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)]">
        <IconHammer className="size-5" stroke={1.8} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <strong className="text-sm font-semibold">{t("comingSoon.title")}</strong>
        <small className="text-xs leading-5 text-muted-foreground">
          {t("comingSoon.description")}
        </small>
      </span>
    </div>
  );
}
