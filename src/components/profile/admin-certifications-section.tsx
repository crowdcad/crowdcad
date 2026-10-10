'use client';

import { useState } from 'react';
import { Button, Card, CardBody, Chip, Input, Spinner } from '@heroui/react';
import { useCertifications } from '@/hooks/useCertifications';
import { DEFAULT_CERTIFICATIONS } from '@/lib/certificationsService';
import { PROFILE_ACTION_BUTTON } from './buttonStyles';

export default function AdminCertificationsSection() {
  const { certifications, loading, save } = useCertifications();
  const [newCert, setNewCert] = useState('');
  const [saving, setSaving] = useState(false);

  const handleDelete = async (cert: string) => {
    setSaving(true);
    try {
      await save(certifications.filter((c) => c !== cert));
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    const trimmed = newCert.trim();
    if (!trimmed || certifications.includes(trimmed)) return;
    setSaving(true);
    try {
      await save([...certifications, trimmed]);
      setNewCert('');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await save(DEFAULT_CERTIFICATIONS);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card isBlurred className="w-full border border-default-200 bg-surface-deep/40">
      <CardBody className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">Certifications</h3>
          <Button size="md" radius="lg" variant="bordered" className={PROFILE_ACTION_BUTTON} onPress={handleReset} isDisabled={loading || saving}>
            Reset to defaults
          </Button>
        </div>
        <p className="text-sm text-surface-light/70 mb-4">
          Certifications available when adding team members to an event.
        </p>

        {loading ? (
          <Spinner size="sm" classNames={{ circle1: 'border-b-accent', circle2: 'border-b-accent' }} />
        ) : (
          <div className="flex flex-wrap gap-2 mb-4">
            {certifications.map((cert) => (
              <Chip
                key={cert}
                variant="flat"
                className="bg-accent/20 text-accent"
                onClose={() => handleDelete(cert)}
              >
                {cert}
              </Chip>
            ))}
            {certifications.length === 0 && (
              <p className="text-sm text-surface-light/50">No certifications configured.</p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={newCert}
            onChange={(e) => setNewCert(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="Add certification"
            classNames={{
              inputWrapper: 'rounded-large px-4 hover:bg-surface-deep',
              input: 'text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none',
            }}
          />
          <Button onPress={handleAdd} isDisabled={saving || !newCert.trim()} className="bg-accent">
            Add
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
