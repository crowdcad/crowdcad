'use client';

import { useEffect, useState } from 'react';
import { Button, Card, CardBody } from '@heroui/react';
import type { ServiceUser } from '@/lib/services';
import EditProfileModal from './edit-profile-modal';
import { PROFILE_ACTION_BUTTON } from './buttonStyles';

export default function ProfileInfoSection({ user }: { user: ServiceUser }) {
  const [editing, setEditing] = useState(false);
  // The saved name, shown before the auth state catches up.
  const [savedName, setSavedName] = useState<string | null | undefined>(undefined);
  const displayName = savedName !== undefined ? savedName : user.displayName;

  // Old /profile/edit links land here with ?edit=1 and open the modal.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('edit') !== '1') return;
    setEditing(true);
    params.delete('edit');
    const rest = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
  }, []);

  return (
    <Card isBlurred className="w-full border border-default-200 bg-surface-deep/40">
      <CardBody className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-lg font-medium">{displayName || 'No display name'}</p>
              <p className="text-surface-light/70">{user.email}</p>
            </div>
          </div>
          <Button variant="bordered" size="md" radius="lg" className={PROFILE_ACTION_BUTTON} onPress={() => setEditing(true)}>
            Edit Profile
          </Button>
        </div>
      </CardBody>
      <EditProfileModal user={user} isOpen={editing} onClose={() => setEditing(false)} onSaved={setSavedName} />
    </Card>
  );
}
