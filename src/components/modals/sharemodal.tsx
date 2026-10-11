'use client';

import React, { useState } from 'react';
import { dbService, arrayUnion, arrayRemove } from '@/lib/services';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Chip
} from "@heroui/react";
import { Users, Plus } from "lucide-react";
import { STATIC_CLOSE_BUTTON_CLASS } from "@/lib/heroStatic";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceId: string;
  collectionName: 'venues' | 'events';
  resourceName: string;
  currentSharedWith?: string[];
  onUpdate: () => void; // Callback to refresh parent data
}

export default function ShareModal({
  isOpen,
  onClose,
  resourceId,
  collectionName,
  resourceName,
  currentSharedWith = [],
  onUpdate
}: ShareModalProps) {
  const [emailInput, setEmailInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleAddUser = async () => {
    if (!emailInput.trim() || !emailInput.includes('@')) {
      alert('Please enter a valid email');
      return;
    }

    setIsLoading(true);
    try {
      await dbService.updateDocument(collectionName, resourceId, {
        sharedWith: arrayUnion(emailInput.trim().toLowerCase()),
      });
      setEmailInput('');
      onUpdate();
    } catch (error) {
      console.error('Error sharing resource:', error);
      alert('Failed to share resource');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveUser = async (email: string) => {
    if (!confirm(`Remove access for ${email}?`)) return;
    
    setIsLoading(true);
    try {
      await dbService.updateDocument(collectionName, resourceId, {
        sharedWith: arrayRemove(email),
      });
      onUpdate();
    } catch (error) {
      console.error('Error removing user:', error);
      alert('Failed to remove user');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} classNames={{ closeButton: STATIC_CLOSE_BUTTON_CLASS }}>
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          Share &quot;{resourceName}&quot;
        </ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter user email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddUser()}
                startContent={<Users className="w-4 h-4 text-default-400" />}
                classNames={{
                  input: "outline-none focus:outline-none data-[focus=true]:outline-none"
                }}
              />
              <Button 
                color="primary" 
                isIconOnly
                isLoading={isLoading}
                onPress={handleAddUser}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-small text-default-500">Currently shared with:</p>
              <div className="flex flex-wrap gap-2 min-h-[50px] p-2 bg-default-100 rounded-medium">
                {currentSharedWith.length === 0 ? (
                  <span className="text-small text-default-400 italic p-1">
                    Not shared with anyone
                  </span>
                ) : (
                  currentSharedWith.map((email) => (
                    <Chip
                      key={email}
                      onClose={() => handleRemoveUser(email)}
                      variant="flat"
                      color="default"
                    >
                      {email}
                    </Chip>
                  ))
                )}
              </div>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button color="danger" variant="bordered" onPress={onClose}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}