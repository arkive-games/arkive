import { useTranslation } from "react-i18next";
import { getStaticUrl } from "@/lib/url";

export default function Logo() {
  const { t } = useTranslation(["common"]);
  const logoUrl = getStaticUrl("images/Logo.webp");
  const backgroundUrl = getStaticUrl("images/Aion2HomeBackground.jpg");

  return (
    <div
      className="relative flex min-h-20 w-full select-none items-center overflow-hidden bg-cover px-3 text-white"
      style={{
        backgroundImage: `url(${backgroundUrl})`,
        backgroundPosition: "center 5%",
      }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,38,46,0.78),rgba(10,60,70,0.34),rgba(11,34,48,0.68))]" />
      <div className="relative flex min-w-0 items-center gap-2.5">
        <img
          src={logoUrl}
          alt="AION2 Logo"
          className="size-12 shrink-0 object-contain drop-shadow-md"
        />
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold drop-shadow-sm">
          <strong className="text-base font-bold tracking-wide">AION2</strong>
          <span className="h-4 w-px bg-white/55" aria-hidden="true" />
          <span className="truncate">{t("common:mapSubtitle", "Interactive Map")}</span>
        </div>
      </div>
    </div>
  );
}
