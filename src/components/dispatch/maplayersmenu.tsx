'use client';

import React from 'react';
import { Button, Checkbox, Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import { Layers } from 'lucide-react';
import { MAP_LAYER_KINDS, MAP_LAYER_LABELS, setLayerShown, type MapLayerKind } from '@/lib/mapLayers';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';

/**
 * The map's layers button (#136): checkboxes to show or hide zones,
 * locations, teams, supervisors and equipment. It sits on the map beside the
 * zoom buttons and takes their look: a round icon button on an image layer
 * (`zoom`, next to MapZoomControls), or a square MapLibre-style control on a
 * real-map layer (`maplibre`, beside MapLibre's own +/-).
 */
export default function MapLayersMenu({
  hidden,
  onChange,
  variant = 'zoom',
}: {
  hidden: readonly MapLayerKind[];
  onChange: (hidden: MapLayerKind[]) => void;
  variant?: 'zoom' | 'maplibre';
}) {
  const { t } = useDispatchTerms();
  return (
    <Popover placement="bottom-end">
      <PopoverTrigger>
        {variant === 'zoom' ? (
          <Button isIconOnly size="sm" radius="full" variant="flat" className="bg-surface-deepest/95" aria-label="Map layers" title="Map layers" data-testid="map-layers-button">
            <Layers className="h-4 w-4" />
          </Button>
        ) : (
          <button
            type="button"
            aria-label="Map layers"
            title="Map layers"
            data-testid="map-layers-button"
            className="flex h-[29px] w-[29px] items-center justify-center rounded-[4px] bg-white/[0.92] text-[#1f2328] shadow-[0_0_0_2px_rgba(0,0,0,0.1)] hover:bg-[#f2f2f2] dark:bg-[rgb(24_26_31/0.92)] dark:text-[#e6e8eb] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.12)] dark:hover:bg-[rgb(40_42_47/0.92)]"
          >
            <Layers className="h-4 w-4" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="bg-surface-deepest border border-surface-liner p-3 text-surface-light">
        <div className="flex min-w-[180px] flex-col gap-2" data-testid="map-layers-menu">
          <p className="text-xs text-surface-faint">Show on map</p>
          {MAP_LAYER_KINDS.map((kind) => (
            <Checkbox
              key={kind}
              size="sm"
              isSelected={!hidden.includes(kind)}
              onValueChange={(shown) => onChange(setLayerShown(hidden, kind, shown))}
              data-testid={`map-layer-${kind}`}
            >
              {t(MAP_LAYER_LABELS[kind])}
            </Checkbox>
          ))}
          <div className="flex justify-between gap-2 pt-1">
            <Button size="sm" variant="light" onPress={() => onChange([])} isDisabled={!hidden.length}>
              Show all
            </Button>
            <Button size="sm" variant="light" onPress={() => onChange([...MAP_LAYER_KINDS])} isDisabled={hidden.length === MAP_LAYER_KINDS.length}>
              Hide all
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
