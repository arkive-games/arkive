import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookOpen,
  Map as MapIcon,
  Menu,
  Package,
  ScrollText,
  Users,
} from "lucide-react";
import {
  cn,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  useIsMobile,
} from "@gamemap/ui";
import { useTheme, type Theme } from "@/context/ThemeContext";
import i18n, { SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from "@/i18n";

// Same archive entry the desktop top bar links to; on mobile that notice is not
// rendered, so the link lives in the More sheet instead.
const ARCHIVE_URL = "https://archive.tc-imba.com/";
// "abyss" is intentionally absent, matching TopNavbar.
const THEME_OPTIONS: Theme[] = ["auto", "light", "dark"];

/** The three wiki type slugs, in tab order. Confirmed against data/wiki/taxonomy.json. */
const WIKI_TABS = [
  { type: "quest", labelKey: "common:mobileNav.quest", icon: ScrollText },
  { type: "npc", labelKey: "common:mobileNav.npc", icon: Users },
  { type: "item", labelKey: "common:mobileNav.item", icon: Package },
] as const;

type ActiveTab = "map" | "quest" | "npc" | "item" | "more";

/**
 * Which tab owns the current path. Bare `/wiki` and any wiki path that is not
 * one of the three typed tabs resolve to "more", because Wiki home lives in the
 * More sheet — that keeps exactly one tab highlighted at all times.
 *
 * `pathname` comes from the router with the basepath already stripped, so these
 * comparisons stay correct when the app is served under a sub-path.
 */
export function activeTab(pathname: string): ActiveTab {
  // Whole-segment matching, not a bare prefix: `startsWith("/wiki/quest")`
  // would also claim `/wiki/quests` and `/wiki/quest-log`, both of which the
  // `$type` route param happily accepts.
  for (const { type } of WIKI_TABS) {
    if (pathname === `/wiki/${type}` || pathname.startsWith(`/wiki/${type}/`)) {
      return type;
    }
  }
  if (pathname === "/wiki" || pathname.startsWith("/wiki/")) return "more";
  return "map";
}

export default function BottomTabBar() {
  const { t } = useTranslation(["common"]);
  const { theme, setTheme } = useTheme();
  const { pathname } = useLocation();
  const active = activeTab(pathname);
  const isMobile = useIsMobile();
  const [moreOpen, setMoreOpen] = useState(false);
  const currentLng = i18n.resolvedLanguage ?? i18n.language;

  // A tap that navigates must not leave the sheet covering the destination.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // The <nav> is md:hidden, but the sheet portals to <body> and is therefore
  // NOT hidden by that class. Without this, an open More sheet stays draped
  // over the desktop layout after a rotation past 768px.
  useEffect(() => {
    if (!isMobile) setMoreOpen(false);
  }, [isMobile]);

  const itemCls = (isActive: boolean) =>
    cn(
      "flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-xs font-medium transition-colors",
      isActive ? "text-primary" : "text-muted-foreground",
    );

  return (
    <nav
      data-testid="bottom-tab-bar"
      className="fixed inset-x-0 bottom-0 z-[2500] flex border-t border-border bg-card text-card-foreground md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <Link
        to="/"
        data-testid="tab-map"
        data-active={active === "map"}
        className={itemCls(active === "map")}
      >
        <MapIcon className="size-5" />
        <span className="max-w-full truncate px-0.5">
          {t("common:mobileNav.map")}
        </span>
      </Link>

      {WIKI_TABS.map(({ type, labelKey, icon: Icon }) => (
        <Link
          key={type}
          to="/wiki/$type"
          params={{ type }}
          data-testid={`tab-${type}`}
          data-active={active === type}
          className={itemCls(active === type)}
        >
          <Icon className="size-5" />
          <span className="max-w-full truncate px-0.5">{t(labelKey)}</span>
        </Link>
      ))}

      {/* SheetTrigger rather than a bare button: Radix then knows the trigger
          and returns focus to it when the sheet closes via Escape or the X. */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            data-testid="tab-more"
            data-active={active === "more"}
            aria-label={t("common:mobileNav.more")}
            className={itemCls(active === "more")}
          >
            <Menu className="size-5" />
            <span className="px-0.5">{t("common:mobileNav.more")}</span>
          </button>
        </SheetTrigger>

        <SheetContent
          side="bottom"
          data-testid="more-sheet"
          className="max-h-[85dvh] overflow-y-auto"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          <SheetHeader>
            <SheetTitle>{t("common:mobileNav.more")}</SheetTitle>
          </SheetHeader>

          <Link
            to="/wiki"
            data-testid="more-wiki"
            onClick={() => setMoreOpen(false)}
            className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm font-medium"
          >
            <BookOpen className="size-5" />
            {t("common:mobileNav.wiki")}
          </Link>

          <div className="mt-3 border-t border-border pt-3">
            <div className="mb-1 text-xs font-semibold text-muted-foreground">
              {t("common:menu.switchLanguage", "Switch language")}
            </div>
            <div className="flex flex-wrap gap-1">
              {SUPPORTED_LANGUAGES.map((code) => (
                <button
                  key={code}
                  type="button"
                  data-testid={`more-lang-${code}`}
                  onClick={() => void i18n.changeLanguage(code)}
                  className={cn(
                    "min-h-9 rounded px-3 py-1.5 text-sm",
                    currentLng === code
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground",
                  )}
                >
                  {LANGUAGE_LABELS[code]}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <div className="mb-1 text-xs font-semibold text-muted-foreground">
              {t("common:menu.switchTheme", "Switch theme")}
            </div>
            <div className="flex flex-wrap gap-1">
              {THEME_OPTIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  data-testid={`more-theme-${value}`}
                  onClick={() => setTheme(value)}
                  className={cn(
                    "min-h-9 rounded px-3 py-1.5 text-sm",
                    theme === value
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground",
                  )}
                >
                  {t(`common:theme.${value}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <div className="mb-1 text-xs font-semibold text-muted-foreground">
              {t("common:siteInfo.contact.title", "Communication & Contact")}
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none break-words text-sm [&_a]:text-primary">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {t("common:siteInfo.contact.content")}
              </ReactMarkdown>
            </div>
            <a
              href={ARCHIVE_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="more-archive"
              className="mt-2 inline-block text-sm text-primary hover:underline"
            >
              {ARCHIVE_URL}
            </a>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
