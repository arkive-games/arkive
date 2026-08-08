import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
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
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  // Exactly ONE of the two bars is mounted, rather than CSS-hiding one: both
  // contain a GlobalSearchWidget, and two of those in the DOM means two
  // elements share `data-testid="global-search-button"` — which breaks strict
  // locators in this app's existing e2e specs.
  const isMobile = useIsMobile();
  const { t, i18n } = useTranslation("common");
  const currentLng = i18n.resolvedLanguage ?? i18n.language;
  const brandName = getArkiveBrandName(currentLng, t("brand.name"));

  return (
    <div
      className={cn(
        "flex h-dvh w-screen flex-col overflow-hidden bg-background text-foreground",
        className,
      )}
    >
      {isMobile ? (
        /* Compact utility bar. Deliberately NOT a page title: every wiki page
           already renders its own <h1>, so a title here would duplicate it and
           would have to be threaded through the router. */
        <ArkiveMobileHeader
          homeUrl={ARKIVE_HOME_URL}
          homeLabel={t("brand.name")}
          brandName={brandName}
          pageTitle="AION2"
          loginLabel={t("auth.login")}
          locale={currentLng}
          actions={<GlobalSearchWidget />}
        />
      ) : (
        <TopNavbar />
      )}
      <main className="flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col">
          <div
            className={cn(
              "mx-auto w-full max-w-5xl flex-1 px-4 py-6",
              contentClassName,
            )}
          >
            {children}
          </div>
          {/* Last element in the scroll column, so its bottom padding is what
              lifts content clear of the fixed bottom tab bar + safe area. */}
          <SiteFooter
            className="pb-[calc(env(safe-area-inset-bottom)+4rem)] md:pb-4"
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
