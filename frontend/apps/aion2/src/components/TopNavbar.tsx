import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArkiveMapTopBar, type ShellNavItem } from "@gamemap/map-shell";
import { useTheme } from "@/context/ThemeContext";
import i18n, { LANGUAGE_LABELS, SUPPORTED_LANGUAGES } from "@/i18n";
import { ARKIVE_HOME_URL } from "@/lib/brand";

export default function TopNavbar() {
  const { t } = useTranslation(["common", "wiki"]);
  const { pathname } = useLocation();
  const { theme, setTheme } = useTheme();
  const currentLng = i18n.resolvedLanguage ?? i18n.language;

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
      ],
    },
  ];

  return (
    <ArkiveMapTopBar
      homeUrl={ARKIVE_HOME_URL}
      homeLabel={t("common:brand.name")}
      brandName={t("common:brand.name")}
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
        onChange: (code) => void i18n.changeLanguage(code),
        menuLabel: t("common:menu.switchLanguage"),
        shortLabel: t("common:language.short"),
      }}
      themeSwitcher={{
        labels: {
          auto: t("common:theme.auto"),
          light: t("common:theme.light"),
          dark: t("common:theme.dark"),
        },
        current: theme === "abyss" ? "auto" : theme,
        onChange: setTheme,
        menuLabel: t("common:menu.switchTheme"),
        shortLabel: t("common:theme.label"),
      }}
      loginLabel={t("common:auth.login")}
    />
  );
}
