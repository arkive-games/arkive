import { useTranslation } from "react-i18next";
import { Link, useLocation, useSearch } from "@tanstack/react-router";
import {
  BookOpen,
  Map as MapIcon,
  Menu,
  Package,
  ScrollText,
  Users,
} from "lucide-react";
import { ShellBottomNav } from "@gamemap/map-shell";
import { useTheme, type Theme } from "@/context/ThemeContext";
import i18n, { SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from "@/i18n";
import SiteInfo from "@/components/SiteInfo";
import {
  MAP_ENGINE_CHOICES,
  MAP_ENGINE_LABELS,
  resolveMapEngine,
  useChooseMapEngine,
  useStoredMapEngine,
  type MapEngineChoice,
} from "@/lib/mapEngineChoice";

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
  const currentLng = i18n.resolvedLanguage ?? i18n.language;

  // The renderer switcher lives here because the mobile layout renders no top
  // bar at all — without it a phone could not leave the WebGL default. Reading
  // `?engine=` with the same precedence MapRoute uses keeps the highlighted
  // choice matching what is actually on screen. `strict: false` because this bar
  // is mounted from the root route, which does not declare the param.
  const engineParam = useSearch({ strict: false, select: (s) => (s as { engine?: unknown }).engine });
  const activeEngine = resolveMapEngine(engineParam, useStoredMapEngine());
  const chooseEngine = useChooseMapEngine();

  return (
    <ShellBottomNav
      pathname={pathname}
      tabs={[
        {
          key: "map",
          label: t("common:mobileNav.map"),
          icon: <MapIcon className="size-5" />,
          active: active === "map",
        },
        ...WIKI_TABS.map(({ type, labelKey, icon: Icon }) => ({
          key: type,
          label: t(labelKey),
          icon: <Icon className="size-5" />,
          active: active === type,
        })),
      ]}
      renderTab={(tab, className) =>
        tab.key === "map" ? (
          <Link to="/" data-testid="tab-map" data-active={tab.active} className={className}>
            {tab.icon}
            <span className="max-w-full truncate px-0.5">{tab.label}</span>
          </Link>
        ) : (
          <Link
            to="/wiki/$type"
            params={{ type: tab.key }}
            data-testid={`tab-${tab.key}`}
            data-active={tab.active}
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
        items: [
          {
            key: "wiki",
            label: t("common:mobileNav.wiki"),
            icon: <BookOpen className="size-5" />,
            active: active === "more",
          },
        ],
        renderItem: (item, className) => (
          <Link key={item.key} to="/wiki" data-testid="more-wiki" className={className}>
            {item.icon}
            <span className="text-center leading-tight">{item.label}</span>
          </Link>
        ),
      }}
      language={{
        languages: SUPPORTED_LANGUAGES.map((code) => ({ code, label: LANGUAGE_LABELS[code] })),
        current: currentLng,
        onChange: (code) => void i18n.changeLanguage(code),
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
      engine={{
        choices: MAP_ENGINE_CHOICES.map((choice) => ({
          value: choice,
          label: MAP_ENGINE_LABELS[choice].short,
        })),
        current: activeEngine,
        onChange: (value) => chooseEngine(value as MapEngineChoice),
        rowLabel: t("common:menu.switchEngine", "Map renderer"),
      }}
      extra={
        <a
          href={ARCHIVE_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="more-archive"
          className="inline-block text-sm text-primary hover:underline"
        >
          {ARCHIVE_URL}
        </a>
      }
      footer={<SiteInfo />}
    />
  );
}
