'use client';

import React, { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ModalHeader, ModalBody, ModalFooter, Button } from '@heroui/react';
import { BriefcaseMedical } from 'lucide-react';
import { MCI_CANCEL_BUTTON, MciModal } from './mciparts';
import type { Layer, Zone } from '@/app/types';
import { isGeoLayer } from '@/lib/geo/layers';
import { isPointWithinRect, pixelToPercent } from '@/lib/markerUtils';
import type { LatLng } from '@/lib/geo/positions';
import { mciShapeId, type MciShape } from '@/lib/mci';
import VenueMapZones from '@/components/venue-management/VenueMapZones';
import AreaVertex, { MIN_AREA_POINTS } from '@/components/geo/AreaVertex';
import { usePolygonDraft } from '@/hooks/usePolygonDraft';
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
  /** The zone to draw or treatment location to place (a point); null keeps the dialog closed. */
  target: MciDrawTarget | null;
  /** Layers that have a map, from `mciMapLayers`. */
  layers: Layer[];
  /** Where it is now, when it is already on the map (the dialog then replaces it): a zone's shape, a location's layer. */
  existing?: { layer: Layer; zone?: Zone };
  onSave: (shape: MciShape) => void | Promise<void>;
  /** Close without saving: a skipped prompt, or a cancelled edit. */
  onClose: () => void;
};

const ZONE_COLOR = '#ef4444';
const AREA_COLOR = '#3b82f6';

function DrawForm({ target, layers, existing, onSave, onClose }: Omit<Props, 'target'> & { target: MciDrawTarget }) {
  const { t } = useDispatchTerms();
  const shapeId = mciShapeId(target);
  const color = existing?.zone?.color ?? (target.kind === 'zone' ? ZONE_COLOR : AREA_COLOR);
  // A treatment location is one point; a click places it, another click moves it.
  const pointMode = target.kind === 'area';
  const [pin, setPin] = useState<{ x: number; y: number } | LatLng | null>(null);
  const startLayer = Math.max(0, existing ? layers.findIndex((l) => l.id === existing.layer.id) : 0);
  const [layerIdx, setLayerIdx] = useState(startLayer);
  // Image points or live-map coordinates, by the layer's kind; undo, redo and point removal via usePolygonDraft.
  const draft = usePolygonDraft<{ x: number; y: number } | LatLng>();
  const closed = pointMode ? !!pin : draft.closed;
  const placing = pointMode || !closed;
  const [saving, setSaving] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const layer = layers[layerIdx] ?? layers[0];
  if (!layer) return null;
  const geo = isGeoLayer(layer);
  // What is being replaced is not drawn beneath the new one; a placed point shows as the post it will be.
  const keptPosts = (layer.posts || []).filter((p) => typeof p === 'string' || p.mciAreaId !== target.id);
  const pinPost = pointMode && pin && 'lat' in pin ? [{ name: target.name, x: null, y: null, lat: pin.lat, lng: pin.lng, mciAreaId: target.id }] : [];
  const shownLayer: Layer = { ...layer, zones: (layer.zones || []).filter((z) => z.id !== shapeId), posts: [...keptPosts, ...pinPost] };
  const imagePin = pointMode && pin && 'x' in pin ? pin : null;
  const points = geo ? [] : (draft.points as { x: number; y: number }[]);
  const coords = geo ? (draft.points as LatLng[]) : [];
  const count = draft.points.length;

  const reset = () => {
    draft.reset();
    setPin(null);
  };
  const complete = draft.close;

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!placing || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    if (!isPointWithinRect(e.clientX, e.clientY, rect)) return;
    const p = pixelToPercent(e.clientX, e.clientY, rect);
    if (pointMode) setPin(p);
    else draft.add(p);
  };
  const handleGeoClick = (p: LatLng) => {
    if (pointMode) setPin(p);
    else if (!closed) draft.add(p);
  };

  const save = async () => {
    if (!closed || saving) return;
    setSaving(true);
    try {
      if (pointMode && pin) await onSave('lat' in pin ? { layerId: layer.id, points: [], coords: [pin] } : { layerId: layer.id, points: [pin] });
      else await onSave({ layerId: layer.id, points: geo ? [] : points, ...(geo ? { coords } : {}) });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const hint = pointMode
    ? pin
      ? 'Looks right? Save it, or click somewhere else to move it.'
      : 'Click on the map where this treatment location is.'
    : closed
    ? 'Looks right? Save it, or start over.'
    : count === 0
      ? 'Click on the map to place the first point.'
      : count < MIN_AREA_POINTS
        ? `${count} point${count === 1 ? '' : 's'} placed. Add at least ${MIN_AREA_POINTS - count} more.`
        : `${count} points placed. Click the open circle at the first point, or press Finish.`;
  const shortcutHint = !pointMode && count > 0 && !closed ? ' Ctrl+Z undoes; click a point and press Delete to remove it.' : '';

  return (
    <>
      <ModalHeader className="flex flex-col items-start gap-0.5 text-xl font-bold text-surface">
        <span>
          {pointMode ? 'Place on map' : t('Draw on map')}: {target.name}
        </span>
        <span className="text-sm font-normal text-surface-faint">
          {existing ? (pointMode ? 'Place it again to move it.' : 'Redraw to replace the current shape.') : `You can skip this and ${pointMode ? 'place' : 'draw'} it later from the card.`}
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
          {shortcutHint}
        </p>

        {geo ? (
          <div className="relative h-[55vh] min-h-[320px] w-full overflow-hidden rounded-lg" data-testid="mci-draw-geo">
            <GeoLayerMap
              className="absolute inset-0"
              layer={shownLayer}
              onMapClick={placing ? handleGeoClick : undefined}
              cursor={placing ? 'crosshair' : 'grab'}
              showPosts
              draftZone={coords.length ? { coords, color, closed, onClose: complete, selected: draft.selected, onSelect: draft.select } : null}
            />
          </div>
        ) : (
          <div className="minimal-scrollbar flex max-h-[60vh] justify-center overflow-auto rounded-lg bg-surface-deep">
            <div className={`relative inline-block max-w-full ${placing ? 'cursor-crosshair' : 'cursor-default'}`} onClick={handleImageClick} data-testid="mci-draw-image">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={imgRef} src={layer.mapUrl} alt={`${layer.name || 'Venue'} map`} className="block max-h-[56vh] w-auto max-w-full select-none" draggable={false} />
              <VenueMapZones zones={shownLayer.zones || []} opacity={0.2} />
              {imagePin && (
                <div className="pointer-events-none absolute flex flex-col items-center" style={{ left: `${imagePin.x}%`, top: `${imagePin.y}%`, transform: 'translate(-50%, -100%)' }} data-testid="mci-draw-pin">
                  <span className="whitespace-nowrap rounded bg-surface-deepest px-1 text-[11px] font-medium text-surface-light shadow">{target.name}</span>
                  <BriefcaseMedical className="h-6 w-6 text-accent drop-shadow" aria-hidden />
                </div>
              )}
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
                          <AreaVertex
                            color={color}
                            first={i === 0}
                            onClose={i === 0 && points.length >= MIN_AREA_POINTS ? complete : undefined}
                            onSelect={() => draft.select(i)}
                            selected={draft.selected === i}
                          />
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
          {!pointMode && (
            <Button size="sm" variant="flat" radius="lg" onPress={draft.undo} isDisabled={!draft.canUndo} data-testid="mci-draw-undo" title="Undo (Ctrl+Z)">
              Undo
            </Button>
          )}
          {!pointMode && draft.selected !== null && !closed && (
            <Button size="sm" variant="flat" radius="lg" onPress={() => draft.remove()} data-testid="mci-draw-delete-point">
              Delete point
            </Button>
          )}
          <Button size="sm" variant="flat" radius="lg" onPress={reset} isDisabled={count === 0 && !pin} data-testid="mci-draw-reset">
            Start over
          </Button>
          {!pointMode && !closed && (
            <Button size="sm" variant="flat" radius="lg" onPress={complete} isDisabled={count < MIN_AREA_POINTS} data-testid="mci-draw-finish">
              Finish
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button onPress={onClose} variant="flat" radius="lg" className={MCI_CANCEL_BUTTON} data-testid="mci-draw-skip">
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

/** Draw a zone, or place a treatment location, on the venue map. Only offered when the venue has a map. */
export default function MciDrawZoneModal({ target, layers, existing, onSave, onClose }: Props) {
  return (
    <MciModal isOpen={!!target && layers.length > 0} onClose={onClose} testId="mci-draw-modal" size="4xl" topClass="mt-10">
      {() => (target ? <DrawForm key={`${target.kind}:${target.id}`} target={target} layers={layers} existing={existing} onSave={onSave} onClose={onClose} /> : null)}
    </MciModal>
  );
}
