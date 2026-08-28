import { useTranslation } from "react-i18next";
import { Link, useLocation } from "@tanstack/react-router";
import {
  BookOpen,
  Map as MapIcon,
  Menu,
  Package,
  ScrollText,
  Users,
  Wrench,
} from "lucide-react";
import { ShellBottomNav } from "@gamemap/map-shell";
import { useTheme, type Theme } from "@/context/ThemeContext";
import i18n, { changeLanguagePreference, SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from "@/i18n";
import SiteInfo from "@/components/SiteInfo";
import { useSettingsConfig } from "@/lib/settings";
import { isLordOfMysteriesPath } from "@/lib/lordOfMysteries";
import { ComingSoonNotice, useComingSoonNotice } from "@/components/ComingSoonNotice";

const THEME_OPTIONS: Theme[] = ["auto", "light", "dark"];

/** The three wiki type slugs, in tab order. Confirmed against data/wiki/taxonomy.json. */
const WIKI_TABS = [
  { type: "quest", labelKey: "common:mobileNav.quest", icon: ScrollText },
  { type: "npc", labelKey: "common:mobileNav.npc", icon: Users },
  { type: "item", labelKey: "common:mobileNav.item", icon: Package },
] as const;

const LORD_OF_MYSTERIES_WIKI_TABS = [
  {
    type: "utopian-theater",
    labelKey: "wiki:utopianTheater.title",
    icon: BookOpen,
  },
  {
    type: "traintrade",
    labelKey: "wiki:trainTrade.title",
    icon: Package,
  },
] as const;

type ActiveTab =
  | "map"
  | "quest"
  | "npc"
  | "item"
  | "utopian-theater"
  | "traintrade"
  | "more";

/**
 * Which tab owns the current path. Bare `/wiki` and any wiki path that is not
 * one of the three typed tabs resolve to "more", because Wiki home lives in the
 * More sheet — that keeps exactly one tab highlighted at all times.
 *
 * `pathname` comes from the router with the basepath already stripped, so these
 * comparisons stay correct when the app is served under a sub-path.
 */
export function activeTab(pathname: string): ActiveTab {
  if (pathname === "/wiki/utopian-theater") return "utopian-theater";
  if (pathname === "/wiki/traintrade") return "traintrade";
  // Whole-segment matching, not a bare prefix: `startsWith("/wiki/quest")`
  // would also claim `/wiki/quests` and `/wiki/quest-log`, both of which the
  // `$type` route param happily accepts.
  for (const { type } of WIKI_TABS) {
    if (pathname === `/wiki/${type}` || pathname.startsWith(`/wiki/${type}/`)) {
      return type;
    }
  }
  if (pathname === "/wiki" || pathname.startsWith("/wiki/")) return "more";
  if (pathname.startsWith("/tools/")) return "more";
  return "map";
}

export default function BottomTabBar() {
  const { t } = useTranslation(["common", "wiki"]);
  const { theme, setTheme } = useTheme();
  const settings = useSettingsConfig();
  const { pathname } = useLocation();
  const active = activeTab(pathname);
  const currentLng = i18n.resolvedLanguage ?? i18n.language;
  const lordOfMysteriesPage = isLordOfMysteriesPath(pathname);
  const { noticeId, showComingSoon } = useComingSoonNotice();
  const primaryWikiTabs = lordOfMysteriesPage
    ? LORD_OF_MYSTERIES_WIKI_TABS
    : WIKI_TABS;

  return (
    <>
      <ShellBottomNav
      pathname={pathname}
      tabs={[
        {
          key: "map",
          label: t("common:mobileNav.map"),
          icon: <MapIcon className="size-5" />,
          active: active === "map",
        },
        ...primaryWikiTabs.map(({ type, labelKey, icon: Icon }) => ({
          key: type,
          label: t(labelKey),
          icon: <Icon className="size-5" />,
          active: active === type,
        })),
      ]}
      renderTab={(tab, className) =>
        tab.key === "map" && lordOfMysteriesPage ? (
          <button
            type="button"
            data-testid="tab-map"
            data-active={tab.active}
            className={className}
            onClick={showComingSoon}
          >
            {tab.icon}
            <span className="max-w-full truncate px-0.5">{tab.label}</span>
          </button>
        ) : tab.key === "map" ? (
          <Link
            to="/"
            data-testid="tab-map"
            data-active={tab.active}
            aria-current={tab.active ? "page" : undefined}
            className={className}
          >
            {tab.icon}
            <span className="max-w-full truncate px-0.5">{tab.label}</span>
          </Link>
        ) : tab.key === "utopian-theater" ? (
          <Link
            to="/wiki/utopian-theater"
            data-testid="tab-utopian-theater"
            data-active={tab.active}
            aria-current={tab.active ? "page" : undefined}
            className={className}
          >
            {tab.icon}
            <span className="max-w-full truncate px-0.5">{tab.label}</span>
          </Link>
        ) : tab.key === "traintrade" ? (
          <Link
            to="/wiki/traintrade"
            data-testid="tab-traintrade"
            data-active={tab.active}
            aria-current={tab.active ? "page" : undefined}
            className={className}
          >
            {tab.icon}
            <span className="max-w-full truncate px-0.5">{tab.label}</span>
          </Link>
        ) : (
          <Link
            to="/wiki/$type"
            params={{ type: tab.key }}
            data-testid={`tab-${tab.key}`}
            data-active={tab.active}
            aria-current={tab.active ? "page" : undefined}
            className={className}
          >
            {tab.icon}
            <span className="max-w-full truncate px-0.5">{tab.label}</span>
          </Link>
        )
      }
      more={{
        label: t("common:mobileNav.more"),
        icon: <Menu className="size-5" />,
        active: active === "more",
        title: t("common:mobileNav.more"),
      }}
      grid={{
        items: lordOfMysteriesPage
          ? [
              {
                key: "tools",
                label: t("common:routes.tools"),
                icon: <Wrench className="size-5" />,
                active: pathname.startsWith("/tools/"),
              },
            ]
          : [
              {
                key: "wiki",
                label: t("common:mobileNav.wiki"),
                icon: <BookOpen className="size-5" />,
                active: pathname === "/wiki" || pathname.startsWith("/wiki/"),
              },
            ],
        renderItem: (item, className) => item.key === "tools" ? (
            <Link to="/tools/traintrade-station" data-testid="more-tools" className={className}>
              {item.icon}
              <span className="text-center leading-tight">{item.label}</span>
            </Link>
          ) : (
            <Link to="/wiki" data-testid="more-wiki" className={className}>
              {item.icon}
              <span className="text-center leading-tight">{item.label}</span>
            </Link>
          ),
      }}
      language={{
        languages: SUPPORTED_LANGUAGES.map((code) => ({ code, label: LANGUAGE_LABELS[code] })),
        current: currentLng,
        onChange: (code) => void changeLanguagePreference(code),
        rowLabel: t("common:menu.switchLanguage", "Switch language"),
        backLabel: t("common:settings.back", "Back"),
      }}
      theme={{
        // The terse labels, not the flavoured ones the desktop dropdown uses:
        // "Auto (Change with Map)" / "Day Mode (Elyos)" overflowed the
        // segmented control and truncated to ambiguity at phone width.
        options: THEME_OPTIONS.map((value) => ({
          value,
          label: t(`common:theme.short.${value}`),
        })),
        current: theme,
        onChange: (value) => setTheme(value as Theme),
        rowLabel: t("common:menu.switchTheme", "Switch theme"),
      }}
      settings={{
        backLabel: t("common:settings.back", "Back"),
        config: settings,
      }}
      footer={<SiteInfo />}
      />
      <ComingSoonNotice noticeId={noticeId} />
    </>
  );
}
