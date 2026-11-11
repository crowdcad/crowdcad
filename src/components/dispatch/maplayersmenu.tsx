'use client';

import React from 'react';
import { Button, Checkbox, Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import { Layers } from 'lucide-react';
import { MAP_LAYER_KINDS, MAP_LAYER_LABELS, setLayerShown, type MapLayerKind } from '@/lib/mapLayers';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';

/**
 * The Map tab's "Layers" menu (#136): checkboxes to show or hide zones,
 * locations, teams, supervisors and equipment. A badge counts what is
 * hidden, so nobody wonders where the markers went.
 */
export default function MapLayersMenu({
  hidden,
  onChange,
}: {
  hidden: readonly MapLayerKind[];
  onChange: (hidden: MapLayerKind[]) => void;
}) {
  const { t } = useDispatchTerms();
  return (
    <Popover placement="bottom-end">
      <PopoverTrigger>
        <Button
          size="sm"
          radius="full"
          variant="flat"
          className="relative shrink-0 bg-surface-deep border border-surface-liner text-surface-light"
          startContent={<Layers className="h-4 w-4" />}
          aria-label={hidden.length ? `Map layers (${hidden.length} hidden)` : 'Map layers'}
          data-testid="map-layers-button"
        >
          {t('Layers')}
          {hidden.length > 0 && (
            <span className="ml-0.5 rounded-full bg-status-orange/25 px-1.5 text-xs text-status-orange" data-testid="map-layers-hidden-count">
              {hidden.length} hidden
            </span>
          )}
        </Button>
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
