import type { ReactNode } from "react";
import { IconArrowLeft } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { getStaticUrl } from "@/lib/url";
import type { ItemGrade } from "@/types/wiki";

const GRADE_CLASS: Record<ItemGrade, string> = {
  common: "text-grade-common",
  rare: "text-grade-rare",
  legend: "text-grade-legend",
  unique: "text-grade-unique",
  epic: "text-grade-epic",
  mythic: "text-grade-mythic",
  special: "text-grade-special",
};

export type BreadcrumbItem = {
  label: string;
  to?: string;
  params?: Record<string, string>;
  hash?: string;
};

export function WikiBackLink({
  to,
  params,
  hash,
  destination,
  className = "",
}: {
  to: string;
  params?: Record<string, string>;
  hash?: string;
  destination?: string;
  className?: string;
}) {
  const { t } = useTranslation(["wiki"]);
  return (
    <Link
      to={to}
      params={params}
      hash={hash}
      className={`inline-flex min-h-11 items-center gap-2 rounded-md border border-[color:var(--arkive-nav-active)] bg-[color:var(--arkive-filter-active)] px-3 text-sm font-semibold text-[color:var(--arkive-nav-active)] shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-9 ${className}`}
      data-testid="wiki-back"
    >
      <IconArrowLeft className="size-4" stroke={1.8} aria-hidden />
      {destination
        ? t("wiki:workspace.backTo", { destination })
        : t("wiki:workspace.back")}
    </Link>
  );
}

export function WikiCard({
  title,
  children,
  testId,
}: {
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section
      className="border-t border-border pt-4 text-foreground first:border-t-0 first:pt-0"
      data-testid={testId}
    >
      <h2 className="mb-3 text-base font-semibold text-[color:var(--arkive-nav-active)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function InfoRows({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-border/60 text-sm">{children}</dl>;
}

export function InfoRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-2 first:pt-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium break-words">{value}</dd>
    </div>
  );
}

export function BreadcrumbSeparator() {
  return <span aria-hidden="true">{"\u203a"}</span>;
}

export function GradeText({
  grade,
  children,
  className = "",
}: {
  grade: ItemGrade;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`${GRADE_CLASS[grade] ?? ""} ${className}`}>
      {children}
    </span>
  );
}

export function ItemIcon({
  icon,
  alt = "",
  size = 32,
}: {
  icon: string | null;
  alt?: string;
  size?: number;
}) {
  if (!icon) {
    return (
      <span
        className="inline-block shrink-0 rounded bg-secondary"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <img
      src={getStaticUrl(icon)}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0 rounded bg-secondary/50 object-contain"
    />
  );
}

export function WikiLoading() {
  const { t } = useTranslation(["wiki"]);
  return (
    <div
      className="space-y-4"
      role="status"
      aria-label={t("wiki:common.loading")}
    >
      <div className="h-7 w-56 animate-pulse rounded bg-secondary" />
      <div className="h-4 w-full max-w-xl animate-pulse rounded bg-secondary" />
      <div className="h-4 w-2/3 max-w-md animate-pulse rounded bg-secondary" />
      <div className="h-64 w-full animate-pulse rounded-md bg-secondary" />
    </div>
  );
}

export function WikiNotFound({ id }: { id: string }) {
  const { t } = useTranslation(["wiki"]);
  return (
    <p className="text-muted-foreground">
      {t("wiki:common.notFound", { id })}
    </p>
  );
}

export function Breadcrumb({
  items,
}: {
  items: BreadcrumbItem[];
}) {
  const { t } = useTranslation(["wiki"]);
  return (
    <nav
      aria-label={t("wiki:quest.breadcrumb")}
      className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
    >
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <BreadcrumbSeparator />}
          {item.to ? (
            <Link
              to={item.to}
              params={item.params}
              hash={item.hash}
              className="hover:text-foreground hover:underline"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
