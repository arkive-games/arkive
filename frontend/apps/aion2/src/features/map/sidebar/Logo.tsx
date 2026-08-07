import { ShellGameHeader } from "@gamemap/map-shell";
import { useTranslation } from "react-i18next";
import { getStaticUrl } from "@/lib/url";

export default function Logo() {
  const { t } = useTranslation(["common"]);
  const logoUrl = getStaticUrl("images/Logo.webp");
  const backgroundUrl = getStaticUrl("images/Aion2HomeBackground.jpg");

  return (
    <ShellGameHeader
      backgroundUrl={backgroundUrl}
      backgroundPosition="center 35%"
      shadeClassName="bg-[linear-gradient(180deg,rgba(5,31,42,0.12),rgba(5,31,42,0.9))]"
      logo={
        <img
          src={logoUrl}
          alt="AION2"
          className="max-h-12 w-auto max-w-52 object-contain object-left drop-shadow-md"
        />
      }
      gameName="AION2"
      subtitle={t("common:mapSubtitle", "Interactive Map")}
    />
  );
}
