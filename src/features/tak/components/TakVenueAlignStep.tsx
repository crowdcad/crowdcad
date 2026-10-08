'use client';

import React, { useState } from 'react';
import { Button } from '@heroui/react';
import { CheckCircle2, Circle } from 'lucide-react';
import type { Layer } from '@/app/types';
import { alignmentFor } from '../data/alignmentStore';
import { TAK_MODULE_MARKER } from '../marker';
import type { TakMapAlignment } from '../types';
import AlignMap from './AlignMap';

/**
 * Venue setup's TAK alignment step (touchpoint l, D61), after Map. Each map
 * image is aligned here and the result kept on its layer, so it is saved
 * with the venue and copied into every event created from it.
 */
export interface TakVenueAlignStepProps {
  uid: string;
  /** The venue's layers, with a just-chosen image shown by its preview URL. */
  layers: Layer[];
  onAlignmentChange: (layerId: string, alignment: TakMapAlignment | null) => void;
}

export default function TakVenueAlignStep({ uid, layers, onAlignmentChange }: TakVenueAlignStepProps) {
  const mapLayers = layers.filter((l) => l.mapUrl);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const layer = mapLayers.find((l) => l.id === selectedId) ?? mapLayers[0];

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pb-2 text-surface-light" data-tak-module={TAK_MODULE_MARKER}>
      <div>
        <h3 className="text-xl font-semibold">TAK alignment</h3>
        <p className="text-sm text-surface-faint">
          Match each map to real-world positions so TAK devices appear in the right place. Alignments are saved with the
          venue when you create or update it, and events created afterwards use them.
        </p>
      </div>

      {mapLayers.length === 0 ? (
        <p className="text-sm text-surface-faint">Add a map image in the Map step first.</p>
      ) : (
        <>
          {mapLayers.length > 1 && (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Maps">
              {mapLayers.map((l) => {
                const done = !!alignmentFor(l);
                const current = l.id === layer!.id;
                return (
                  <Button
                    key={l.id}
                    size="sm"
                    role="tab"
                    aria-selected={current}
                    variant={current ? 'solid' : 'flat'}
                    className={current ? 'bg-accent text-surface-light' : undefined}
                    startContent={done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                    onPress={() => {
                      setSelectedId(l.id);
                      setSavedId(null);
                    }}
                  >
                    {l.name}
                  </Button>
                );
              })}
            </div>
          )}

          {layer && (
            <>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {layer.name}:{' '}
                  <span className="text-surface-faint">
                    {savedId === layer.id
                      ? 'alignment kept; it is saved with the venue'
                      : alignmentFor(layer)
                        ? 'aligned'
                        : layer.takAlignment
                          ? 'the image changed since it was aligned; align it again'
                          : 'not aligned yet'}
                  </span>
                </span>
                {layer.takAlignment && (
                  <Button
                    size="sm"
                    variant="light"
                    onPress={() => {
                      onAlignmentChange(layer.id, null);
                      setSavedId(null);
                    }}
                  >
                    Remove alignment
                  </Button>
                )}
              </div>
              <AlignMap
                key={`${layer.id}:${layer.mapUrl}`}
                layer={{ id: layer.id, name: layer.name, mapUrl: layer.mapUrl! }}
                ownerUid={uid}
                initial={layer.takAlignment}
                saveLabel="Keep this alignment"
                onSave={(a) => {
                  onAlignmentChange(layer.id, a);
                  setSavedId(layer.id);
                }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
