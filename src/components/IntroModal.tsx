// src/components/IntroModal.tsx
import React from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from "@heroui/react";
import { useTranslation } from "react-i18next";

type IntroModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const IntroModal: React.FC<IntroModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation("common");

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="md"
      backdrop="blur"
      placement="center"
      scrollBehavior="inside"
      classNames={{
        wrapper: "z-[20000]", // stay above map & tooltips
        // base: "bg-transparent shadow-none",
      }}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              {t("introModal.title")}
            </ModalHeader>
            <ModalBody>
              <p className="text-sm text-default-600 whitespace-pre-line">
                {t(
                  "introModal.body",
                )}
              </p>
              <p className="text-xs text-default-500 whitespace-pre-line">
                {t(
                  "introModal.hint"
                )}
              </p>
            </ModalBody>
            <ModalFooter>
              <Button color="primary" variant="solid" size="sm" onPress={onClose}>
                {t("ui.confirm")}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default IntroModal;
