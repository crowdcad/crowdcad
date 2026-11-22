// components/modals/NewLayerModal.tsx
"use client";

import { LABELED_FIELD_CLASSNAMES } from '@/components/ui/fieldClassNames';
import * as React from "react";
import { Upload, Trash2 } from "lucide-react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
} from "@heroui/react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, file: File) => void;
};

export default function NewLayerModal({ isOpen, onClose, onSubmit }: Props) {
  const [name, setName] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const inputClassNames = LABELED_FIELD_CLASSNAMES;

  const handleSubmit = () => {
    if (!name.trim() || !file) return;
    onSubmit(name.trim(), file);
    onClose();
    setName('');
    setFile(null);
  };

  const handleClose = () => {
    onClose();
    setName('');
    setFile(null);
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
              Add New Layer
            </ModalHeader>

            <ModalBody>
              {/* Layer name */}
              <Input
                label="Layer name"
                labelPlacement="outside-top"
                variant="flat"
                color="default"
                size="lg"
                radius="lg"
                classNames={inputClassNames}
                value={name}
                onValueChange={setName}
                aria-label="Layer name"
              />

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                data-testid="layer-file-input"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />

              {/* Map Upload Section */}
              <div>
                <label className="mb-2 block text-sm font-medium text-surface-light">
                  Layer Map
                </label>
                {file ? (
                  <div className="flex items-center gap-2 rounded-xl border border-default bg-surface-deep p-2">
                    <Upload className="ml-2 h-6 w-6 text-accent" />
                    <span className="text-sm text-surface-light truncate">{file.name}</span>
                    <Button
                      size="sm"
                      radius="full"
                      variant="light"
                      color="danger"
                      onPress={() => setFile(null)}
                      className="ml-auto min-w-10 w-10 h-10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-32 w-full flex-col items-center justify-center gap-3 text-surface-light/70 transition hover:border-status-blue/50 hover:text-status-blue border border-default rounded-xl"
                  >
                    <Upload className="h-12 w-12" />
                    <div className="text-center">
                      <p className="text-sm font-medium">Upload Layer Map</p>
                      <p className="mt-1 text-xs text-surface-light/50">
                        Required - Click to select an image
                      </p>
                    </div>
                  </button>
                )}
              </div>
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
                isDisabled={!name.trim() || !file}
              >
                Add Layer
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}