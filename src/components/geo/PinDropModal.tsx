'use client';
/**
 * Drop a pin for a place that isn't a venue location: click the venue's map, then Use this point. Hands back the
 * point and words for it (describePoint: "80 m from Sather Gate"). Tapping a labeled location picks it by name. Needs a geo layer (an aligned image or a drawn
 * area); callers offer it only when the venue has one (firstGeoLayer).
 */
import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { MapPin } from '@/components/ui/icons';
import type { Layer } from '@/app/types';
import { describePoint } from '@/lib/geo/describePoint';
import { isGeoLayer } from '@/lib/geo/layers';
import { postLatLng } from '@/lib/geo/positions';
import { STATIC_CLOSE_BUTTON_CLASS } from '@/lib/heroStatic';

const GeoLayerMap = dynamic(() => import('./GeoLayerMap'), { ssr: false });

/** The venue's first layer that has coordinates, if any. */
export function firstGeoLayer(layers: Layer[]): Layer | undefined {
  return layers.find((l) => isGeoLayer(l));
}

export interface DroppedPin {
  point: { lat: number; lng: number };
  label: string;
}

export default function PinDropModal({
  isOpen,
  onClose,
  layers,
  initial,
  onPick,
}: {
  isOpen: boolean;
  onClose: () => void;
  layers: Layer[];
  initial?: { lat: number; lng: number };
  onPick: (pin: DroppedPin) => void;
}) {
  const layer = firstGeoLayer(layers);
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(initial ?? null);
  // A labeled location tapped: its own name, not "Near …".
  const [place, setPlace] = useState<string | null>(null);
  useEffect(() => {
    if (isOpen) {
      setPoint(initial ?? null);
      setPlace(null);
    }
  }, [isOpen, initial]);
  const label = place ?? (point ? describePoint({ lat: point.lat, lon: point.lng }, layers) : null);
  const pickPost = (idx: number) => {
    const post = layer?.posts[idx];
    if (!layer || !post || typeof post === 'string') return;
    const at = postLatLng(post, layer);
    if (!at) return;
    setPoint({ lat: at.lat, lng: at.lng });
    setPlace(post.name);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="3xl" className="bg-surface-deep text-surface-light" classNames={{ closeButton: STATIC_CLOSE_BUTTON_CLASS }} data-testid="pin-drop-modal">
      <ModalContent>
        <ModalHeader className="text-surface">Drop a pin</ModalHeader>
        <ModalBody>
          <p className="text-sm text-surface-light/80" data-testid="pin-drop-label">Tap the map where the call is, or a labeled location.{label ? ` Pinned: ${label}.` : ''}</p>
          <div className="relative h-[60vh] min-h-[320px] overflow-hidden rounded-lg">
            {layer && (
              <GeoLayerMap
                className="absolute inset-0"
                layer={layer}
                cursor="crosshair"
                onMapClick={(p) => {
                  setPoint(p);
                  setPlace(null);
                }}
                onPostClick={pickPost}
                selectedPostName={place}
                extraPins={
                  point
                    ? [{ key: 'dropped', lat: point.lat, lng: point.lng, anchor: 'bottom', node: <MapPin className="h-7 w-7 fill-status-red text-surface-light drop-shadow" aria-label="Dropped pin" /> }]
                    : []
                }
              />
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>
            Cancel
          </Button>
          <Button
            color="primary"
            isDisabled={!point}
            onPress={() => {
              if (!point || !label) return;
              onPick({ point, label });
              onClose();
            }}
            data-testid="pin-drop-use"
          >
            Use this point
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
