import React from 'react';
import { Button } from '@heroui/react';
import { MapPin, MousePointer2 } from 'lucide-react';

interface MarkerModeToggleButtonProps {
  isAddMarkerMode: boolean;
  onToggle: () => void;
  className?: string;
}

export default function MarkerModeToggleButton({
  isAddMarkerMode,
  onToggle,
  className = '',
}: MarkerModeToggleButtonProps) {
  return (
    <Button
      size="md"
      variant={isAddMarkerMode ? 'solid' : 'bordered'}
      color={isAddMarkerMode ? 'primary' : 'default'}
      onPress={onToggle}
      startContent={
        isAddMarkerMode ? (
          <MousePointer2 className="h-3.5 w-3.5" />
        ) : (
          <MapPin className="h-3.5 w-3.5" />
        )
      }
      className={`${isAddMarkerMode ? 'bg-accent hover:bg-accent/90' : ''} ${className}`}
    >
      {isAddMarkerMode ? 'Click to Place' : 'Add Markers'}
    </Button>
  );
}
