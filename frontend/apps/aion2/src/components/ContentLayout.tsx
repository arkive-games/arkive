import type { ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArkiveAccountControl } from "@gamemap/auth";
import { cn, SiteFooter, useIsMobile } from "@gamemap/ui";
import { ArkiveMobileHeader, getArkiveBrandName } from "@gamemap/map-shell";

import TopNavbar from "@/components/TopNavbar";
import GlobalSearchWidget from "@/components/GlobalSearchWidget";
import { ARKIVE_HOME_URL } from "@/lib/brand";
import { SITE_VERSION } from "@/lib/siteVersion";

/**
 * Shared chrome for every non-map page (wiki + changelog): desktop top bar or a
 * compact mobile utility bar, a max-width scroll column, and the site footer.
 */
export default function ContentLayout({
  children,
  className,
  contentClassName,
  pageTitle,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  pageTitle?: ReactNode;
}) {
  // Exactly ONE of the two bars is mounted, rather than CSS-hiding one: both
  // contain a GlobalSearchWidget, and two of those in the DOM means two
  // elements share `data-testid="global-search-button"` — which breaks strict
  // locators in this app's existing e2e specs.
  const isMobile = useIsMobile();
  const { t, i18n } = useTranslation("common");
  const { pathname } = useLocation();
  const currentLng = i18n.resolvedLanguage ?? i18n.language;
  const brandName = getArkiveBrandName(currentLng, t("brand.name"));
  const wikiType = pathname.match(/^\/wiki\/(quest|npc|item)(?:\/|$)/)?.[1];
  const mobileTitle = pageTitle ?? (wikiType
    ? t(`mobileNav.${wikiType}`)
    : t("mobileNav.wiki"));

  return (
    <div
      className={cn(
        "flex h-dvh w-screen flex-col overflow-hidden bg-background text-foreground",
        className,
      )}
    >
      {isMobile ? (
        <ArkiveMobileHeader
          homeUrl={ARKIVE_HOME_URL}
          homeLabel={t("brand.name")}
          brandName={brandName}
          pageTitle={mobileTitle}
          loginLabel={t("auth.login")}
          accountControl={<ArkiveAccountControl language={currentLng} variant="mobileHeader" />}
          actions={<GlobalSearchWidget />}
        />
      ) : (
        <TopNavbar />
      )}
      <main className="flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col">
          <div
            className={cn(
              "arkive-content-page mx-auto w-full max-w-5xl flex-1 px-4 pb-6",
              contentClassName,
            )}
          >
            {children}
          </div>
          {/* Last element in the scroll column, so its bottom padding is what
              lifts content clear of the fixed bottom tab bar + safe area. */}
          <SiteFooter
            className="pb-[calc(env(safe-area-inset-bottom)+4.5rem)] md:pb-4"
            homeUrl={ARKIVE_HOME_URL}
            githubUrl={import.meta.env.VITE_GITHUB_URL}
            icpBeian={import.meta.env.VITE_ICP_BEIAN}
            versionLink={<Link to="/changelog">v{SITE_VERSION}</Link>}
          />
        </div>
      </main>
    </div>
  );
}
