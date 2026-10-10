'use client';

import React, { useEffect, useState } from 'react';
import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { authService, dbService, type ServiceUser } from '@/lib/services';
import HelpTip from '@/components/geo/HelpTip';

const inputClassNames = {
  label: 'text-surface-light font-medium',
  input: 'text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none focus:ring-0 focus-visible:ring-0',
  inputWrapper: 'rounded-large px-4 hover:bg-surface-deep',
} as const;

/** Edits the signed-in user's name and phone number (formerly the /profile/edit page). */
export default function EditProfileModal({
  user,
  isOpen,
  onClose,
  onSaved,
}: {
  user: ServiceUser;
  isOpen: boolean;
  onClose: () => void;
  /** Called with the saved display name, so the page can show it at once. */
  onSaved?: (displayName: string | null) => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from the current values each time the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setDisplayName(user.displayName ?? '');
    setPhone(user.phoneNumber ?? '');
    setError(null);
  }, [isOpen, user]);

  const handleSave = async () => {
    const currentUser = authService.currentUser;
    if (!currentUser) {
      setError('No authenticated user.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const name = displayName.trim() || null;
      await authService.updateProfile({ displayName: name });
      // Phone (and other profile metadata) lives in the users collection.
      await dbService.setDocument('users', currentUser.uid, { phoneNumber: phone.trim() || null }, { merge: true });
      onSaved?.(name);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
      placement="top-center"
      backdrop="opaque"
      hideCloseButton
      radius="lg"
      classNames={{
        base: 'rounded-lg bg-surface-deepest text-surface-light mt-20',
        header: 'pb-0',
        body: 'py-4',
        footer: 'pt-0',
      }}
    >
      <ModalContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <ModalHeader>
            <h2 className="text-2xl font-bold text-surface">Edit Profile</h2>
          </ModalHeader>
          <ModalBody className="space-y-3">
            <Input
              label="Full name"
              labelPlacement="outside"
              size="lg"
              value={displayName}
              onValueChange={setDisplayName}
              placeholder="Your full name"
              classNames={inputClassNames}
              autoFocus
            />
            <Input
              label={
                <span className="inline-flex items-center gap-1">
                  Phone number
                  <HelpTip text="Phone numbers are saved to your profile document." />
                </span>
              }
              labelPlacement="outside"
              size="lg"
              type="tel"
              value={phone}
              onValueChange={setPhone}
              placeholder="+1 555 555 5555"
              classNames={inputClassNames}
            />
            {error && <p className="text-sm text-status-red">{error}</p>}
          </ModalBody>
          <ModalFooter className="flex justify-end gap-2">
            <Button
              type="button"
              onPress={onClose}
              isDisabled={saving}
              className="px-4 py-2 hover:bg-status-red/10 border border-status-red text-status-red"
              variant="bordered"
              radius="lg"
            >
              Cancel
            </Button>
            <Button type="submit" radius="lg" className="px-4 py-2 bg-accent hover:bg-accent/90 text-surface-light" isLoading={saving}>
              Save Changes
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
