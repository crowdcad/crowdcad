'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { CheckCircle2, Circle } from 'lucide-react';
import type { Layer } from '@/app/types';
import { alignmentFromBounds, layerAlignment, layerArea } from '@/lib/geo/layers';
import type { MapAlignment } from '@/lib/geo/types';
import AlignMap from '@/components/geo/AlignMap';
import HelpTip from '@/components/geo/HelpTip';

/**
 * Venue setup's Map alignment step, after Map (P8, D64). Each map image can
 * be matched to real-world positions here; the result is kept on its layer
 * (`Layer.alignment`), saved with the venue and copied into every event
 * created from it. Optional: an unaligned layer stays an image layer.
 */
export interface MapAlignmentStepProps {
  uid: string;
  /** The venue's layers, with a just-chosen image shown by its preview URL. */
  layers: Layer[];
  onAlignmentChange: (layerId: string, alignment: MapAlignment | null) => void;
}

export default function MapAlignmentStep({ uid, layers, onAlignmentChange }: MapAlignmentStepProps) {
  const imageLayers = layers.filter((l) => l.mapUrl);
  const areaLayers = layers.filter((l) => layerArea(l));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [keptId, setKeptId] = useState<string | null>(null);
  const layer = imageLayers.find((l) => l.id === selectedId) ?? imageLayers[0];
  const current = (l: Layer) => l.alignment ?? l.takAlignment;

  // A GIS-imported image already knows where its edges are: align it from its bounds once its size is known.
  const changeRef = useRef(onAlignmentChange);
  changeRef.current = onAlignmentChange;
  const fromBounds = useRef(new Set<string>());
  useEffect(() => {
    for (const l of imageLayers) {
      const key = `${l.id}:${l.mapUrl}`;
      if (!l.geoBounds || layerAlignment(l) || fromBounds.current.has(key)) continue;
      fromBounds.current.add(key);
      const img = new Image();
      img.onload = () => {
        const a = alignmentFromBounds(l.geoBounds!, { mapUrl: l.mapUrl!, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight }, uid);
        if (a) changeRef.current(l.id, a);
      };
      img.src = l.mapUrl!;
    }
  });

  return (
    <div className="minimal-scrollbar flex h-full flex-col gap-3 overflow-y-auto pb-2 text-surface-light">
      <div>
        <h3 className="inline-flex items-center gap-1.5 text-xl font-semibold">
          Map alignment
          <HelpTip text="Optional. Match your map image to the real map so posts and areas can be placed anywhere, including outside the image, and the event's map shows streets around it. Points are kept as you add them and saved with the venue. Skip it to keep using the image on its own." />
        </h3>
      </div>

      {imageLayers.length === 0 ? (
        <p className="text-sm text-surface-faint">
          {areaLayers.length > 0
            ? 'Your map is a drawn area, so it is already on the real map. Nothing to align.'
            : 'Add a map image or draw an area in the Map step first.'}
        </p>
      ) : (
        <>
          {imageLayers.length > 1 && (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Maps">
              {imageLayers.map((l) => {
                const done = !!layerAlignment(l);
                const selected = l.id === layer!.id;
                return (
                  <Button
                    key={l.id}
                    size="sm"
                    role="tab"
                    aria-selected={selected}
                    variant={selected ? 'solid' : 'flat'}
                    className={selected ? 'bg-accent text-surface-light' : undefined}
                    startContent={done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                    onPress={() => {
                      setSelectedId(l.id);
                      setKeptId(null);
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
                    {keptId === layer.id
                      ? 'aligned; saved with the venue when you create or update it'
                      : layerAlignment(layer)
                        ? 'aligned'
                        : current(layer)
                          ? 'the image changed since it was aligned; align it again'
                          : 'not aligned'}
                  </span>
                </span>
                {current(layer) && (
                  <Button
                    size="sm"
                    variant="light"
                    onPress={() => {
                      onAlignmentChange(layer.id, null);
                      setKeptId(null);
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
                initial={current(layer)}
                onChange={(a) => {
                  onAlignmentChange(layer.id, a);
                  setKeptId(a ? layer.id : null);
                }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
