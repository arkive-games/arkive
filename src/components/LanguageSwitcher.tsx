import React from "react";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Button,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLanguage } from "@fortawesome/free-solid-svg-icons";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "../i18n";

const LanguageSwitcher: React.FC = () => {
  const { t, i18n } = useTranslation("common");

  return (
    <Dropdown>
      <DropdownTrigger>
        <Button isIconOnly variant="light">
          <FontAwesomeIcon icon={faLanguage} className="text-lg" />
        </Button>
      </DropdownTrigger>

      <DropdownMenu aria-label="Language Selection">
        {SUPPORTED_LANGUAGES.map((code) => (
          <DropdownItem key={code} onPress={() => i18n.changeLanguage(code)}>
            {t(`language.${code}`)}
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  );
};

export default LanguageSwitcher;