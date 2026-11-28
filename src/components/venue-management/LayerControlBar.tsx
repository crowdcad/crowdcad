"use client";

import React from 'react';
import { Button, Card } from '@heroui/react';
import { ChevronLeft, ChevronRight, Map as MapIcon, MapPinned, Plus, Trash2, Upload } from '@/components/ui/icons';

interface LayerControlBarProps {
  mapFileName: string;
  onReplaceMap: () => void;
  currentLayer: number;
  totalLayers: number;
  currentLayerName: string;
  onPreviousLayer: () => void;
  onNextLayer: () => void;
  onDeleteLayer: () => void;
  onAddLayer: () => void;
  onImportGeoJson: () => void;
}

export default function LayerControlBar({
  mapFileName,
  onReplaceMap,
  currentLayer,
  totalLayers,
  currentLayerName,
  onPreviousLayer,
  onNextLayer,
  onDeleteLayer,
  onAddLayer,
  onImportGeoJson,
}: LayerControlBarProps) {
  return (
    <Card
      radius="none"
      className="rounded-b-sm bg-default/40 w-full px-3 py-2 flex-shrink-0"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MapPinned className="h-4 w-4 text-accent" />
          <span className="text-xs text-surface-light truncate max-w-[120px]">{mapFileName}</span>
          <Button
            size="sm"
            radius="full"
            variant="flat"
            onPress={onReplaceMap}
            startContent={<Upload className="h-3 w-3" />}
            className="ml-2"
          >
            Replace
          </Button>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            isIconOnly
            size="sm"
            radius="full"
            variant="flat"
            isDisabled={currentLayer <= 0}
            onPress={onPreviousLayer}
            aria-label="Previous layer"
            title="Previous layer"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-surface-light min-w-[100px] text-center">{currentLayerName || 'Layer'}</span>
          <Button
            isIconOnly
            size="sm"
            radius="full"
            variant="flat"
            isDisabled={totalLayers <= 1 || currentLayer >= totalLayers - 1}
            onPress={onNextLayer}
            aria-label="Next layer"
            title="Next layer"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            isIconOnly
            size="sm"
            radius="full"
            variant="flat"
            color="danger"
            onPress={onDeleteLayer}
            aria-label="Delete layer"
            title="Delete layer"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            isIconOnly
            size="sm"
            radius="full"
            variant="flat"
            data-testid="add-layer-button"
            onPress={onAddLayer}
            aria-label="Add layer"
            title="Add layer"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            isIconOnly
            size="sm"
            radius="full"
            variant="flat"
            data-testid="import-geojson-layer-button"
            onPress={onImportGeoJson}
            aria-label="Import GIS map"
            title="Import GIS map"
          >
            <MapIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
