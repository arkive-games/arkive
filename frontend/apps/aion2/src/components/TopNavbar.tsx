import { IconUserCircle, IconVolume } from "@tabler/icons-react";
import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ShellTopBar, type ShellNavItem } from "@gamemap/map-shell";
import { Button } from "@gamemap/ui";
import { useTheme, type Theme } from "@/context/ThemeContext";
import i18n, { LANGUAGE_LABELS, SUPPORTED_LANGUAGES } from "@/i18n";

const THEME_OPTIONS: Theme[] = ["light", "dark"];

function ArkiveMark() {
  return (
    <svg viewBox="0 0 320 285" className="size-9" aria-hidden="true">
      <path
        fill="currentColor"
        d="M160 24C95 24 47 70 47 136c0 30 10 54 31 71 55 16 109 16 164 0 21-18 31-41 31-71 0-66-48-112-113-112Z"
      />
      <path fill="currentColor" d="M63 207c35-13 68-13 97 0 30 13 63 13 99-1-28 29-61 37-99 25-38-11-70-19-97-24Z" />
      <path fill="currentColor" d="M75 235c33-10 61-10 85 1 24 11 53 9 87-4-24 32-53 41-87 27-34-12-62-20-85-24Z" />
      <path
        fill="var(--arkive-mark-cutout, #f7faf7)"
        d="M73 72c10-13 24-20 41-20h92c17 0 31 7 41 20l14 37c7 18 4 25-10 29l-22-13c-7-4-13-5-19-4l-10 56c-3 14-9 23-19 28h-42c-10-5-16-14-19-28l-10-56c-6-1-12 0-19 4l-22 13c-14-4-17-11-10-29l14-37Z"
      />
      <path fill="currentColor" d="M92 105h12V93h12v12h12v12h-12v12h-12v-12H92Z" />
      <circle fill="currentColor" cx="205" cy="101" r="7" />
      <circle fill="currentColor" cx="222" cy="117" r="7" />
      <path fill="currentColor" d="m160 91 35 98h-35ZM154 82h12v119h-12Z" />
    </svg>
  );
}

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
    <ShellTopBar
      classNames={{
        root: "aion2-topbar hidden h-14 border-b border-border bg-card text-foreground md:flex",
        left: "gap-4",
        right: "gap-2",
        trigger:
          "h-9 gap-2 rounded-lg border border-border bg-card px-3 text-foreground shadow-none hover:bg-accent",
        menu: "rounded-lg border-border bg-popover text-popover-foreground shadow-lg",
      }}
      leftSlot={
        <a
          href="https://tc-imba.com/"
          className="flex shrink-0 items-center gap-2.5 pr-4 text-[color:var(--arkive-nav-active)]"
          aria-label={t("common:brand.name")}
        >
          <ArkiveMark />
          <span className="flex flex-col leading-none">
            <strong className="text-base font-bold tracking-tight">{t("common:brand.name")}</strong>
            <small className="mt-1 text-xs font-semibold text-[color:var(--arkive-nav-accent)]">
              {t("common:brand.slogan")}
            </small>
          </span>
        </a>
      }
      nav={{
        items: navItems,
        classNames: {
          item:
            "group relative inline-flex h-10 items-center rounded-sm px-1 text-sm font-semibold text-foreground/70 hover:text-[color:var(--arkive-nav-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]",
          itemActive:
            "group relative inline-flex h-10 items-center rounded-sm px-1 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]",
          label: "relative inline-flex h-full items-center",
          labelActive:
            "after:pointer-events-none after:absolute after:bottom-0 after:left-1/2 after:h-0.5 after:w-4 after:-translate-x-1/2 after:rounded-full after:bg-[color:var(--arkive-nav-accent)] after:content-['']",
        },
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
        icon: <IconVolume className="size-5" stroke={1.8} />,
      }}
      themeSwitcher={{
        options: THEME_OPTIONS.map((value) => ({
          value,
          label: t(`common:theme.${value}`),
        })),
        current: theme,
        onChange: (value) => setTheme(value as Theme),
        menuLabel: t("common:menu.switchTheme"),
        shortLabel: t("common:theme.label"),
      }}
      rightExtras={
        <Button
          type="button"
          className="h-9 gap-2 rounded-lg bg-[color:var(--arkive-nav-active)] px-4 text-[color:var(--arkive-nav-on-active)] hover:brightness-95"
          aria-label={t("common:auth.login")}
        >
          <IconUserCircle className="size-5" stroke={1.8} />
          <span className="text-sm font-semibold">{t("common:auth.login")}</span>
        </Button>
      }
    />
  );
}
