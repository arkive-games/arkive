import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArkiveAccountControl } from "@gamemap/auth";
import { ArkiveMapTopBar, getArkiveBrandName, type ShellNavItem } from "@gamemap/map-shell";
import { useTheme } from "@/context/ThemeContext";
import i18n, { changeLanguagePreference, LANGUAGE_LABELS, SUPPORTED_LANGUAGES } from "@/i18n";
import { ARKIVE_HOME_URL } from "@/lib/brand";
import { useSettingsConfig } from "@/lib/settings";
import { isLordOfMysteriesPath } from "@/lib/lordOfMysteries";
import { ComingSoonNotice, useComingSoonNotice } from "@/components/ComingSoonNotice";

export default function TopNavbar() {
  const { t } = useTranslation(["common", "wiki"]);
  const { pathname } = useLocation();
  const { theme, setTheme } = useTheme();
  const currentLng = i18n.resolvedLanguage ?? i18n.language;
  const brandName = getArkiveBrandName(currentLng, t("common:brand.name"));
  const settings = useSettingsConfig();
  const lordOfMysteriesPage = isLordOfMysteriesPath(pathname);
  const { noticeId, showComingSoon } = useComingSoonNotice();
  const navigate = useNavigate();

  const mapItem: ShellNavItem = {
    key: "map",
    label: t("common:routes.map"),
    active: pathname === "/",
  };
  const navItems: ShellNavItem[] = lordOfMysteriesPage
    ? [
        mapItem,
        {
          key: "wiki",
          label: t("wiki:nav.wiki"),
          active: pathname.startsWith("/wiki"),
          children: [
            {
              key: "utopian-theater",
              label: t("wiki:utopianTheater.title"),
              active: pathname === "/wiki/utopian-theater",
            },
            {
              key: "traintrade",
              label: t("wiki:trainTrade.title"),
              active: pathname === "/wiki/traintrade",
            },
          ],
        },
        {
          key: "tools",
          label: t("common:routes.tools"),
          active: pathname.startsWith("/tools"),
          children: [
            {
              key: "traintrade-station-tool",
              label: t("wiki:trainTrade.stationTool.title"),
              active: pathname === "/tools/traintrade-station",
            },
          ],
        },
      ]
    : [
        mapItem,
        {
          key: "wiki",
          label: t("wiki:nav.wiki"),
          active: pathname.startsWith("/wiki"),
          children: [
            { key: "quest", label: t("common:mobileNav.quest") },
            { key: "npc", label: t("common:mobileNav.npc") },
            { key: "item", label: t("common:mobileNav.item") },
          ],
        },
      ];

  return (
    <>
      <ArkiveMapTopBar
      homeUrl={ARKIVE_HOME_URL}
      homeLabel={t("common:brand.name")}
      brandName={brandName}
      brandSlogan={t("common:brand.slogan")}
      nav={{
        items: navItems,
        onDropdownTriggerClick: lordOfMysteriesPage
          ? (item) => {
              if (item.key === "wiki") {
                void navigate({ to: "/wiki/utopian-theater" });
              } else if (item.key === "tools") {
                void navigate({ to: "/tools/traintrade-station" });
              }
            }
          : undefined,
        renderItem: (item, className, labelClassName) => {
          const label = labelClassName ? (
            <span data-slot="nav-item-label" className={labelClassName}>
              {item.label}
            </span>
          ) : (
            item.label
          );
          return item.key === "map" && lordOfMysteriesPage ? (
            <button type="button" className={className} onClick={showComingSoon}>
              {label}
            </button>
          ) : item.key === "map" ? (
            <Link to="/" className={className}>
              {label}
            </Link>
          ) : item.key === "utopian-theater" ? (
            <Link to="/wiki/utopian-theater" className={className}>
              {label}
            </Link>
          ) : item.key === "traintrade-station-tool" ? (
            <Link to="/tools/traintrade-station" className={className}>
              {label}
            </Link>
          ) : item.key === "traintrade" ? (
            <Link to="/wiki/traintrade" className={className}>
              {label}
            </Link>
          ) : (
            <Link
              to="/wiki/$type"
              params={{ type: item.key }}
              className={className}
            >
              {label}
            </Link>
          );
        },
      }}
      languageSwitcher={{
        languages: SUPPORTED_LANGUAGES.map((code) => ({
          code,
          label: LANGUAGE_LABELS[code],
        })),
        current: currentLng,
        onChange: (code) => void changeLanguagePreference(code),
        menuLabel: t("common:menu.switchLanguage"),
        shortLabel: t("common:language.short"),
      }}
      themeSwitcher={{
        labels: {
          auto: t("common:theme.auto"),
          light: t("common:theme.light"),
          dark: t("common:theme.dark"),
        },
        current: theme,
        onChange: setTheme,
        menuLabel: t("common:menu.switchTheme"),
        shortLabel: t("common:theme.label"),
      }}
      loginLabel={t("common:auth.login")}
      accountSlot={<ArkiveAccountControl language={currentLng} settings={settings} />}
      />
      <ComingSoonNotice noticeId={noticeId} />
    </>
  );
}
