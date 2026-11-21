// components/modals/venue/zoneedit.tsx
"use client";

import * as React from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
} from "@heroui/react";
import DispatchZoneCheckbox from "@/components/venue-management/DispatchZoneCheckbox";
import { ZONE_COLOR_PALETTE } from "@/lib/zoneColors";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, color: string, isDispatchZone: boolean) => void;
  initialName: string;
  initialColor: string;
  initialIsDispatchZone?: boolean;
};

export default function ZoneEditModal({
  isOpen,
  onClose,
  onSubmit,
  initialName,
  initialColor,
  initialIsDispatchZone = false,
}: Props) {
  const [name, setName] = React.useState(initialName);
  const [color, setColor] = React.useState(initialColor);
  const [isDispatchZone, setIsDispatchZone] = React.useState(initialIsDispatchZone);

  React.useEffect(() => {
    setName(initialName);
    setColor(initialColor);
    setIsDispatchZone(initialIsDispatchZone);
  }, [initialName, initialColor, initialIsDispatchZone]);

  const inputClassNames = {
    label: "text-surface-light mb-1",
    inputWrapper: "rounded-large px-4 hover:bg-surface-deep",
    input:
      "text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none",
  } as const;

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit(name.trim(), color, isDispatchZone);
    onClose();
  };

  const handleClose = () => {
    onClose();
    setName(initialName);
    setColor(initialColor);
    setIsDispatchZone(initialIsDispatchZone);
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={handleClose}
      placement="center"
      backdrop="opaque"
      hideCloseButton
      radius="lg"
      classNames={{
        base: "rounded-lg bg-surface-deepest text-surface-light",
        header: "pb-0",
        body: "py-4",
        footer: "pt-0",
      }}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="text-2xl font-bold text-surface">
              Edit Area
            </ModalHeader>

            <ModalBody>
              <Input
                label="Area name"
                labelPlacement="outside"
                variant="flat"
                color="default"
                size="lg"
                radius="lg"
                classNames={inputClassNames}
                value={name}
                onValueChange={setName}
                aria-label="Area name"
              />

              <div>
                <p className="mb-1 text-sm text-surface-light">Color</p>
                <div className="flex flex-wrap gap-2">
                  {ZONE_COLOR_PALETTE.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      aria-label={`Use color ${swatch}`}
                      onClick={() => setColor(swatch)}
                      className={`h-6 w-6 rounded-full transition ${color === swatch ? 'ring-2 ring-offset-2 ring-offset-surface-deepest ring-surface-light' : ''}`}
                      style={{ backgroundColor: swatch }}
                    />
                  ))}
                </div>
              </div>

              <DispatchZoneCheckbox isSelected={isDispatchZone} onValueChange={setIsDispatchZone} labelClassName="text-surface-light text-sm" />
            </ModalBody>

            <ModalFooter>
              <Button
                variant="flat"
                onPress={handleClose}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onPress={handleSubmit}
                className="flex-1 bg-accent hover:bg-accent/90 text-surface-light"
                isDisabled={!name.trim()}
              >
                Save
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
