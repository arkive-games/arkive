import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArkiveAccountControl } from "@gamemap/auth";
import { ArkiveMapTopBar, getArkiveBrandName, type ShellNavItem } from "@gamemap/map-shell";
import { useTheme } from "@/context/ThemeContext";
import i18n, { changeLanguagePreference, LANGUAGE_LABELS, SUPPORTED_LANGUAGES } from "@/i18n";
import { ARKIVE_HOME_URL } from "@/lib/brand";
import { useSettingsConfig } from "@/lib/settings";

export default function TopNavbar() {
  const { t } = useTranslation(["common", "wiki"]);
  const { pathname } = useLocation();
  const { theme, setTheme } = useTheme();
  const currentLng = i18n.resolvedLanguage ?? i18n.language;
  const brandName = getArkiveBrandName(currentLng, t("common:brand.name"));
  const settings = useSettingsConfig();

  const navItems: ShellNavItem[] = [
    {
      key: "map",
      label: t("common:routes.map"),
      active: pathname === "/",
    },
    {
      key: "wiki",
      label: t("wiki:nav.wiki"),
      active: pathname.startsWith("/wiki"),
      children: [
        { key: "quest", label: t("common:mobileNav.quest") },
        { key: "npc", label: t("common:mobileNav.npc") },
        { key: "item", label: t("common:mobileNav.item") },
        { key: "utopian-theater", label: t("wiki:utopianTheater.title") },
      ],
    },
  ];

  return (
    <ArkiveMapTopBar
      homeUrl={ARKIVE_HOME_URL}
      homeLabel={t("common:brand.name")}
      brandName={brandName}
      brandSlogan={t("common:brand.slogan")}
      nav={{
        items: navItems,
        renderItem: (item, className, labelClassName) => {
          const label = labelClassName ? (
            <span data-slot="nav-item-label" className={labelClassName}>
              {item.label}
            </span>
          ) : (
            item.label
          );
          return item.key === "map" ? (
            <Link to="/" className={className}>
              {label}
            </Link>
          ) : item.key === "utopian-theater" ? (
            <Link to="/wiki/utopian-theater" className={className}>
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
  );
}
