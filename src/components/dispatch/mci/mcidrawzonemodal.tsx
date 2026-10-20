'use client';

import React, { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from '@heroui/react';
import type { Layer, Zone } from '@/app/types';
import { isGeoLayer } from '@/lib/geo/layers';
import { isPointWithinRect, pixelToPercent } from '@/lib/markerUtils';
import type { LatLng } from '@/lib/geo/positions';
import { mciShapeId, type MciShape } from '@/lib/mci';
import VenueMapZones from '@/components/venue-management/VenueMapZones';
import AreaVertex, { MIN_AREA_POINTS } from '@/components/geo/AreaVertex';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';

// The live map is loaded only when a venue has one.
const GeoLayerMap = dynamic(() => import('@/components/geo/GeoLayerMap'), { ssr: false });

export interface MciDrawTarget {
  kind: 'zone' | 'area';
  id: string;
  name: string;
  venueZoneId?: string;
}

type Props = {
  /** The zone or treatment location to draw; null keeps the dialog closed. */
  target: MciDrawTarget | null;
  /** Layers that have a map, from `mciMapLayers`. */
  layers: Layer[];
  /** Its current shape, when it already has one (the dialog then edits it by redrawing). */
  existing?: { layer: Layer; zone: Zone };
  onSave: (shape: MciShape) => void | Promise<void>;
  /** Close without saving: a skipped prompt, or a cancelled edit. */
  onClose: () => void;
};

const ZONE_COLOR = '#ef4444';
const AREA_COLOR = '#3b82f6';

function DrawForm({ target, layers, existing, onSave, onClose }: Omit<Props, 'target'> & { target: MciDrawTarget }) {
  const { t } = useDispatchTerms();
  const shapeId = mciShapeId(target);
  const color = existing?.zone.color ?? (target.kind === 'zone' ? ZONE_COLOR : AREA_COLOR);
  const startLayer = Math.max(0, existing ? layers.findIndex((l) => l.id === existing.layer.id) : 0);
  const [layerIdx, setLayerIdx] = useState(startLayer);
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const [coords, setCoords] = useState<LatLng[]>([]);
  const [closed, setClosed] = useState(false);
  const [saving, setSaving] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const layer = layers[layerIdx] ?? layers[0];
  if (!layer) return null;
  const geo = isGeoLayer(layer);
  // The shape being replaced is not drawn beneath the new one.
  const shownLayer: Layer = { ...layer, zones: (layer.zones || []).filter((z) => z.id !== shapeId) };
  const count = geo ? coords.length : points.length;

  const reset = () => {
    setPoints([]);
    setCoords([]);
    setClosed(false);
  };
  const undoPoint = () => {
    if (closed) return;
    setPoints((p) => p.slice(0, -1));
    setCoords((c) => c.slice(0, -1));
  };
  const complete = () => setClosed((was) => was || count >= MIN_AREA_POINTS);

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (closed || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    if (!isPointWithinRect(e.clientX, e.clientY, rect)) return;
    setPoints((p) => [...p, pixelToPercent(e.clientX, e.clientY, rect)]);
  };
  const handleGeoClick = (p: LatLng) => {
    if (!closed) setCoords((c) => [...c, p]);
  };

  const save = async () => {
    if (!closed || saving) return;
    setSaving(true);
    try {
      await onSave({ layerId: layer.id, points: geo ? [] : points, ...(geo ? { coords } : {}) });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const hint = closed
    ? 'Looks right? Save it, or start over.'
    : count === 0
      ? 'Click on the map to place the first point.'
      : count < MIN_AREA_POINTS
        ? `${count} point${count === 1 ? '' : 's'} placed. Add at least ${MIN_AREA_POINTS - count} more.`
        : `${count} points placed. Click the open circle at the first point, or press Finish.`;

  return (
    <>
      <ModalHeader className="flex flex-col items-start gap-0.5 text-xl font-bold text-surface">
        <span>
          {t('Draw on map')}: {target.name}
        </span>
        <span className="text-sm font-normal text-surface-faint">
          {existing ? 'Redraw to replace the current shape.' : 'You can skip this and draw it later from the card.'}
        </span>
      </ModalHeader>
      <ModalBody className="gap-3 py-4">
        {layers.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Map layer">
            {layers.map((l, i) => (
              <Button
                key={l.id}
                size="sm"
                radius="lg"
                variant={i === layerIdx ? 'solid' : 'flat'}
                className={i === layerIdx ? 'bg-accent text-surface-light' : ''}
                onPress={() => {
                  setLayerIdx(i);
                  reset();
                }}
              >
                {l.name || `Layer ${i + 1}`}
              </Button>
            ))}
          </div>
        )}

        <p className="text-sm text-surface-faint" data-testid="mci-draw-hint">
          {hint}
        </p>

        {geo ? (
          <div className="relative h-[55vh] min-h-[320px] w-full overflow-hidden rounded-lg" data-testid="mci-draw-geo">
            <GeoLayerMap
              className="absolute inset-0"
              layer={shownLayer}
              onMapClick={closed ? undefined : handleGeoClick}
              cursor={closed ? 'grab' : 'crosshair'}
              showPosts
              draftZone={coords.length ? { coords, color, closed, onClose: complete } : null}
            />
          </div>
        ) : (
          <div className="minimal-scrollbar flex max-h-[60vh] justify-center overflow-auto rounded-lg bg-surface-deep">
            <div className={`relative inline-block max-w-full ${closed ? 'cursor-default' : 'cursor-crosshair'}`} onClick={handleImageClick} data-testid="mci-draw-image">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={imgRef} src={layer.mapUrl} alt={`${layer.name || 'Venue'} map`} className="block max-h-[56vh] w-auto max-w-full select-none" draggable={false} />
              <VenueMapZones zones={shownLayer.zones || []} opacity={0.2} />
              {points.length > 0 && (
                <>
                  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ pointerEvents: 'none' }}>
                    {points.length >= 2 && (
                      <polyline
                        points={points.map((p) => `${p.x},${p.y}`).join(' ') + (closed ? ` ${points[0].x},${points[0].y}` : '')}
                        fill={closed ? color : 'none'}
                        fillOpacity={0.25}
                        stroke={color}
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    {!closed && points.length >= 2 && (
                      <line
                        x1={points[points.length - 1].x}
                        y1={points[points.length - 1].y}
                        x2={points[0].x}
                        y2={points[0].y}
                        stroke={color}
                        strokeOpacity={0.6}
                        strokeDasharray="3"
                        strokeWidth={1.5}
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                  </svg>
                  <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
                    {!closed &&
                      points.map((p, i) => (
                        <div key={i} style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -50%)', zIndex: i === 0 ? 1 : undefined }}>
                          <AreaVertex color={color} first={i === 0} onClose={i === 0 && points.length >= MIN_AREA_POINTS ? complete : undefined} />
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </ModalBody>
      <ModalFooter className="flex flex-wrap justify-between gap-2">
        <div className="flex gap-2">
          <Button size="sm" variant="flat" radius="lg" onPress={undoPoint} isDisabled={closed || count === 0} data-testid="mci-draw-undo">
            Undo point
          </Button>
          <Button size="sm" variant="flat" radius="lg" onPress={reset} isDisabled={count === 0} data-testid="mci-draw-reset">
            Start over
          </Button>
          {!closed && (
            <Button size="sm" variant="flat" radius="lg" onPress={complete} isDisabled={count < MIN_AREA_POINTS} data-testid="mci-draw-finish">
              Finish
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button onPress={onClose} variant="flat" radius="lg" className="bg-status-red/20 px-4 py-2 text-status-red hover:bg-status-red/30" data-testid="mci-draw-skip">
            {existing ? t('Cancel') : 'Skip for now'}
          </Button>
          <Button radius="lg" className="bg-accent px-4 py-2 text-surface-light" isDisabled={!closed || saving} onPress={save} data-testid="mci-draw-save">
            Save
          </Button>
        </div>
      </ModalFooter>
    </>
  );
}

/** Draw a zone or treatment location on the venue map. Only offered when the venue has a map. */
export default function MciDrawZoneModal({ target, layers, existing, onSave, onClose }: Props) {
  return (
    <Modal
      isOpen={!!target && layers.length > 0}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="top-center"
      backdrop="opaque"
      hideCloseButton
      radius="lg"
      size="4xl"
      scrollBehavior="inside"
      classNames={{ base: 'mt-10 rounded-lg bg-surface-deepest text-surface-light', header: 'pb-0', footer: 'pt-0', body: 'minimal-scrollbar' }}
    >
      <ModalContent data-testid="mci-draw-modal">
        {() => (target ? <DrawForm key={`${target.kind}:${target.id}`} target={target} layers={layers} existing={existing} onSave={onSave} onClose={onClose} /> : null)}
      </ModalContent>
    </Modal>
  );
}
