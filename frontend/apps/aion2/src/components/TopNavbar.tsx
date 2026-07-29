import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ShellTopBar } from "@gamemap/map-shell";
import {
  BuildInfo,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@gamemap/ui";
import { useTheme, type Theme } from "@/context/ThemeContext";
import i18n, { SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from "@/i18n";
import GlobalSearchWidget from "@/components/GlobalSearchWidget";
import SiteInfo from "@/components/SiteInfo";
import { SITE_VERSION } from "@/lib/siteVersion";

// "abyss" is disabled for now — kept in the Theme type + CSS for easy re-enable,
// but not offered in the switcher.
const THEME_OPTIONS: Theme[] = ["auto", "light", "dark"];

// Old-version archive entry, shown while the new version is being rebuilt
// (the nav tabs 首页/职业BD/… are hidden until those pages are ported).
const ARCHIVE_URL = "https://archive.tc-imba.com/";

export default function TopNavbar() {
  const { t } = useTranslation(["common", "wiki"]);
  const { theme, setTheme } = useTheme();
  const currentLng = i18n.resolvedLanguage ?? i18n.language;

  return (
    <ShellTopBar
      classNames={{
        // Below md this bar overflowed the viewport (518px of content in 390px),
        // pushing the language, theme and contact buttons off-screen with no way
        // to reach them. BottomTabBar's More sheet carries them on phones, so
        // the desktop bar simply does not render there. `md:flex` restores
        // ShellTopBar's own base `flex` at desktop widths.
        root: "hidden bg-topnavbar text-foreground md:flex",
        right: "text-[#3D3D3D] dark:text-white/85",
      }}
      leftSlot={
        <div data-testid="desktop-topbar" className="flex items-center gap-6">
          <Link
            to="/"
            className="text-lg font-bold tracking-tight text-[#2E97FF] select-none"
          >
            AION2
          </Link>
          <Link
            to="/wiki"
            className="text-sm text-foreground/80 hover:text-foreground"
          >
            {t("wiki:nav.wiki")}
          </Link>
          <div className="text-sm text-[#3D3D3D] dark:text-white/80">
            已更新第四赛季新地图，全新版本重制中，旧版入口：
            <a
              href={ARCHIVE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#2E97FF] hover:underline"
            >
              {ARCHIVE_URL}
            </a>
          </div>
        </div>
      }
      search={<GlobalSearchWidget />}
      languageSwitcher={{
        languages: SUPPORTED_LANGUAGES.map((lng) => ({
          code: lng,
          label: LANGUAGE_LABELS[lng],
        })),
        current: currentLng,
        onChange: (code) => void i18n.changeLanguage(code),
        menuLabel: t("common:menu.switchLanguage", "Switch language"),
      }}
      themeSwitcher={{
        options: THEME_OPTIONS.map((value) => ({
          value,
          label: t(`common:theme.${value}`),
        })),
        current: theme,
        onChange: (value) => setTheme(value as Theme),
        menuLabel: t("common:menu.switchTheme", "Switch theme"),
      }}
      rightExtras={
        <>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-testid="contact-menu"
                // The panel leads with "About this site" and carries contact as
                // its second section, so it's labelled for what it opens —
                // matching palworld's trigger. The testid keeps its historical
                // name so existing specs and selectors still resolve.
                aria-label={t("common:siteInfo.tab", "About")}
                title={t("common:siteInfo.tab", "About")}
              >
                <Info className="size-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="max-h-[70vh] w-[300px] overflow-y-auto"
            >
              <SiteInfo />
            </PopoverContent>
          </Popover>
          <BuildInfo
            commit={__BUILD_GIT_COMMIT__}
            buildTime={__BUILD_TIME__}
            dev={import.meta.env.DEV}
            gameVersion={import.meta.env.VITE_GAME_VERSION}
            siteVersion={<Link to="/changelog">v{SITE_VERSION}</Link>}
            labels={{ siteVersion: t("common:changelog.title") }}
          />
        </>
      }
    />
  );
}
