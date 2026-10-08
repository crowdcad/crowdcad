// app/venues/management/page.client.tsx

'use client';

import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useauth';
import { dbService, storageService } from '@/lib/services';
import type { Post, Venue, Equipment, EquipmentStatus, Layer, GeoBounds, Zone } from '@/app/types';
import { isPointWithinRect, pixelToPercent } from '@/lib/markerUtils';
import { hasDuplicateClinicName, isClinicPost } from '@/lib/clinics';
import { hasDuplicateZoneName } from '@/lib/zones';
import { getNextZoneColor } from '@/lib/zoneColors';
import { randomId, stripUndefined } from '@/lib/utils';
import { uploadWithRetry } from '@/lib/uploadUtils';
import { useZoomPan } from '@/hooks/useZoomPan';
import { MAP_CHECKER_BG } from '@/lib/mapStyles';
import NewLayerModal from '@/components/modals/venue/newlayer';
import GeoJsonImportModal from '@/components/modals/venue/geojsonimport';
import LocationEditModal from '@/components/modals/venue/locationedit';
import ZoneEditModal from '@/components/modals/venue/zoneedit';
import EquipmentManagementSection from '@/components/venue-management/EquipmentManagementSection';
import LayerControlBar from '@/components/venue-management/LayerControlBar';
import MarkerModeToggleButton from '@/components/venue-management/MarkerModeToggleButton';
import AreaModeToggleButton from '@/components/venue-management/AreaModeToggleButton';
import PendingMarkerDialog from '@/components/venue-management/PendingMarkerDialog';
import PendingZoneDialog from '@/components/venue-management/PendingZoneDialog';
import VenueMapZones from '@/components/venue-management/VenueMapZones';
import MarkerPlacementInstruction from '@/components/venue-management/MarkerPlacementInstruction';
import VenueMapMarker from '@/components/venue-management/VenueMapMarker';
import MapZoomControls from '@/components/ui/map-zoom-controls';
import MapPanSurface from '@/components/ui/map-pan-surface';
import { VenueMapWithPosts } from '@/components/modals/event/venuemapmodal';
import { WizardShell, StepProgress, ReviewColumns, type WizardStep, type ReviewColumn } from '@/components/wizard';
import {
  Button,
  Input,
  Card,
  ScrollShadow,
  Tooltip,
} from '@heroui/react';
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Plus,
  Upload,
  Trash2,
  Edit2,
  MapPinned,
  CircleHelp,
  HousePlus,
} from 'lucide-react';


// TAK live tracking (optional, in development): the venue's TAK switch and
// alignment step (touchpoint l), compiled out entirely unless NEXT_PUBLIC_TAK
// is exactly "on".
const TakVenueSetting =
  process.env.NEXT_PUBLIC_TAK === 'on' ? lazy(() => import('@/features/tak').then((m) => ({ default: m.TakVenueSetting }))) : null;
const TakVenueAlignStep =
  process.env.NEXT_PUBLIC_TAK === 'on' ? lazy(() => import('@/features/tak').then((m) => ({ default: m.TakVenueAlignStep }))) : null;

// Props: none required for this page

interface EquipmentWithLocation extends Equipment {
  locationId?: string;
}

export default function VenueManagementPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const venueId = searchParams.get('venueId');
  // Firebase
  const { user } = useAuth();
  const userId = user?.uid;


  // Local state
  const [venueData, setVenueData] = useState<{
    name: string;
    equipment: EquipmentWithLocation[];
    layers: Layer[];
    takEnabled?: boolean;
  }>({
    name: '',
    equipment: [],
    layers: [{ id: randomId(), name: 'Floor 1', posts: [], mapUrl: undefined }],
  });

  const [currentLayer, setCurrentLayer] = useState(0);

  const [isUploading, setIsUploading] = useState(false);

  // Marker placement mode
  const [isAddMarkerMode, setIsAddMarkerMode] = useState(false);

  // Active marker being named
  const [pendingMarker, setPendingMarker] = useState<{
    x: number;
    y: number;
    layerIdx: number;
    postIdx: number;
  } | null>(null);
  const [markerNameInput, setMarkerNameInput] = useState('');
  const [markerIsClinicInput, setMarkerIsClinicInput] = useState(false);

  // Area (zone) placement mode
  const [isAddAreaMode, setIsAddAreaMode] = useState(false);

  // Zone currently being drawn — points accumulate on each map click while
  // isDrawing is true; closing the loop flips isDrawing false and opens the
  // naming dialog, mirroring pendingMarker's place-then-name flow.
  const [pendingZone, setPendingZone] = useState<{
    points: { x: number; y: number }[];
    layerIdx: number;
    isDrawing: boolean;
  } | null>(null);
  const [zoneNameInput, setZoneNameInput] = useState('');
  const [zoneColorInput, setZoneColorInput] = useState('');
  const [zoneIsDispatchZoneInput, setZoneIsDispatchZoneInput] = useState(false);
  const [hoverZoneId, setHoverZoneId] = useState<string | null>(null);

  // Inputs
  const [equipmentInput, setEquipmentInput] = useState('');
  const [locationInput, setLocationInput] = useState('');

  // File upload (optional map)
  const [mapFile, setMapFile] = useState<File | null>(null);

  // Image preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Refs for image geometry
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgContainerRef = useRef<HTMLDivElement | null>(null);
  const markerInputRef = useRef<HTMLInputElement | null>(null);
  const zoneNameInputRef = useRef<HTMLInputElement | null>(null);

  // Hidden file input for map upload/replace
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    scale,
    position,
    isPanning,
    setScale,
    setPosition,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useZoomPan({
    // Was 1 — the same as the initial fit-to-width scale, so there was no
    // room to zoom out at all once a map image loaded. 0.5 matches the
    // dispatch board's own Map tab (VenueMapTab), letting this map zoom out
    // past its initial fit the same way that one does.
    minScale: 0.5,
    maxScale: 5,
    disablePan: () => isAddMarkerMode || isAddAreaMode || draggingIdx !== null,
  });

  // Separate pan/zoom state for the read-only map panel shown on the
  // Equipment and Review steps (mirrors the event creation page's own map
  // panel exactly, including its "simple unclamped pan" behavior) — kept
  // independent of the interactive editing map's own zoom/pan above so
  // switching steps never carries marker-placement mode or drag state into
  // a plain reference view.
  const readOnlyImgRef = useRef<HTMLImageElement | null>(null);
  const [readOnlyScale, setReadOnlyScale] = useState(1);
  const [readOnlyPosition, setReadOnlyPosition] = useState({ x: 0, y: 0 });
  const [readOnlyIsPanning, setReadOnlyIsPanning] = useState(false);
  const [readOnlyPanStart, setReadOnlyPanStart] = useState({ x: 0, y: 0 });
  const handleReadOnlyZoomIn = () => setReadOnlyScale((prev) => Math.min(prev + 0.25, 3));
  const handleReadOnlyZoomOut = () => setReadOnlyScale((prev) => Math.max(prev - 0.25, 0.5));
  const handleReadOnlyResetZoom = () => {
    setReadOnlyScale(1);
    setReadOnlyPosition({ x: 0, y: 0 });
  };
  const handleReadOnlyWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
  };
  const handleReadOnlyMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setReadOnlyIsPanning(true);
    setReadOnlyPanStart({ x: e.clientX - readOnlyPosition.x, y: e.clientY - readOnlyPosition.y });
  };
  const handleReadOnlyMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!readOnlyIsPanning) return;
    setReadOnlyPosition({ x: e.clientX - readOnlyPanStart.x, y: e.clientY - readOnlyPanStart.y });
  };
  const handleReadOnlyMouseUp = () => setReadOnlyIsPanning(false);

  // Drag/hover
  const [pendingLayer, setPendingLayer] = useState<number | null>(null);

  // Drag/hover
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);

  // Image aspect ratio
  const [, setAspectRatio] = useState(1);

  // New layer modal
  const [isNewLayerModalOpen, setIsNewLayerModalOpen] = useState(false);

  // GIS (GeoJSON) import modal
  const [isGeoJsonImportModalOpen, setIsGeoJsonImportModalOpen] = useState(false);

  // Location edit modal
  const [isLocationEditModalOpen, setIsLocationEditModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<{ layerIdx: number; postIdx: number } | null>(null);

  // Zone (area) edit modal
  const [isZoneEditModalOpen, setIsZoneEditModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<{ layerIdx: number; zoneIdx: number } | null>(null);

  // Equipment editing state
  const [editingEquipmentIndex, setEditingEquipmentIndex] = useState<number | null>(null);
  const [equipmentEditInput, setEquipmentEditInput] = useState('');

  // TAK (optional): its alignment step follows Map when the venue turns TAK on.
  const takStep = process.env.NEXT_PUBLIC_TAK === 'on' && !!TakVenueAlignStep && !!venueData.takEnabled;
  const STEP_ORDER: string[] = ['basics', 'map', ...(takStep ? ['tak'] : []), 'locations', 'equipment', 'review'];
  const [currentStepId, setCurrentStepId] = useState<string>('basics');


  // Update preview when a new map file is selected
  useEffect(() => {
    if (mapFile && pendingLayer === currentLayer) {
      const url = URL.createObjectURL(mapFile);
      setPreviewUrl(url);
      // Reset zoom/pan when new image loads
      setScale(1);
      setPosition({ x: 0, y: 0 });
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(venueData.layers[currentLayer]?.mapUrl || null);
    }
  }, [mapFile, pendingLayer, currentLayer, venueData.layers, setPosition, setScale]);

  // Auto-focus marker name input when pending marker is set
  useEffect(() => {
    if (pendingMarker && markerInputRef.current) {
      markerInputRef.current.focus();
    }
  }, [pendingMarker]);

  // Auto-focus zone name input once its polygon is closed and awaiting a name
  useEffect(() => {
    if (pendingZone && !pendingZone.isDrawing && zoneNameInputRef.current) {
      zoneNameInputRef.current.focus();
    }
  }, [pendingZone]);

  // Escape cancels an in-progress area drawing (or a closed one still
  // awaiting a name) the same way it already cancels the naming dialog's
  // own input via PendingZoneDialog's onKeyDown — this covers Escape
  // pressed anywhere while drawing, not just while the input is focused.
  useEffect(() => {
    if (!pendingZone) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPendingZone(null);
        setZoneNameInput('');
        setZoneColorInput('');
        setZoneIsDispatchZoneInput(false);
      } else if (e.key === 'Enter' && pendingZone.isDrawing && pendingZone.points.length >= 3) {
        setPendingZone((prev) => (prev ? { ...prev, isDrawing: false } : prev));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pendingZone]);

  // Load venue data if editing
  useEffect(() => {
    if (venueId && userId) {
      const loadVenue = async () => {
        try {
          const venueDoc = await dbService.getDocument<Venue & { layers?: Layer[] }>('venues', venueId);
          if (venueDoc.exists && venueDoc.data) {
            const venue = venueDoc.data;
            let layers: Layer[];
            if (venue.layers && venue.layers.length > 0) {
              layers = venue.layers;
            } else {
              // Backward compatibility: create single layer from old format
              layers = [{
                id: randomId(),
                name: 'Main',
                posts: venue.posts || [],
                mapUrl: venue.mapUrl,
              }];
            }
            setVenueData({
              name: venue.name,
              equipment: venue.equipment || [],
              layers,
              takEnabled: venue.takEnabled,
            });
            setCurrentLayer(0);
          }
        } catch (error) {
          console.error('Error loading venue:', error);
          alert('Failed to load venue data');
        }
      };
      loadVenue();
    }
  }, [venueId, userId]);

  // File name from mapFile or mapUrl
  const mapFileName = useMemo(() => {
    if (mapFile?.name && pendingLayer === currentLayer) return mapFile.name;
    const currentMapUrl = venueData.layers[currentLayer]?.mapUrl;
    if (currentMapUrl) {
      try {
        const u = new URL(currentMapUrl);
        const filename = u.pathname.split('/').pop() || '';
        const parts = filename.split('_');
        if (parts.length > 1) {
          return decodeURIComponent(parts.slice(1).join('_'));
        } else {
          return decodeURIComponent(filename);
        }
      } catch {
        const s = currentMapUrl.split('?')[0];
        const filename = s.substring(s.lastIndexOf('/') + 1);
        const parts = filename.split('_');
        if (parts.length > 1) {
          return decodeURIComponent(parts.slice(1).join('_'));
        } else {
          return decodeURIComponent(filename);
        }
      }
    }
    return '';
  }, [mapFile, pendingLayer, currentLayer, venueData.layers]);

  // Controlled input change
  const handleChange = (value: string) => {
    setVenueData((prev) => ({ ...prev, name: value }));
  };

  // All posts from all layers
  const allPosts = venueData.layers.flatMap((layer, layerIdx) =>
    layer.posts.map((post, postIdx) => ({ post, layerIdx, postIdx, layerName: layer.name }))
  );

  // All zones from all layers
  const allZones = venueData.layers.flatMap((layer, layerIdx) =>
    (layer.zones || []).map((zone, zoneIdx) => ({ zone, layerIdx, zoneIdx, layerName: layer.name }))
  );

  // Location names offered as an equipment item's default location — the
  // same location the event builder pre-fills from when that item is added
  // to an event, and can still be adjusted from there.
  const locationOptions = Array.from(
    new Set(allPosts.map((item) => (typeof item.post === 'string' ? item.post : item.post.name)).filter(Boolean))
  );

  // Equipment
  const addEquipment = () => {
    const name = equipmentInput.trim();
    if (!name) return;
    const newItem: EquipmentWithLocation = {
      id: randomId(),
      name,
      status: 'Available' as EquipmentStatus,
    };
    setVenueData((prev) => ({ ...prev, equipment: [...prev.equipment, newItem] }));
    setEquipmentInput('');
  };

  const removeEquipment = (index: number) => {
    setVenueData((prev) => ({
      ...prev,
      equipment: prev.equipment.filter((_, i) => i !== index),
    }));
  };

  const startEditEquipment = (index: number) => {
    setEditingEquipmentIndex(index);
    setEquipmentEditInput(venueData.equipment[index].name);
  };

  const saveEquipmentEdit = () => {
    if (editingEquipmentIndex === null) return;
    const newName = equipmentEditInput.trim();
    if (!newName) return;
    setVenueData((prev) => {
      const updated = [...prev.equipment];
      updated[editingEquipmentIndex] = { ...updated[editingEquipmentIndex], name: newName };
      return { ...prev, equipment: updated };
    });
    setEditingEquipmentIndex(null);
    setEquipmentEditInput('');
  };

  const cancelEquipmentEdit = () => {
    setEditingEquipmentIndex(null);
    setEquipmentEditInput('');
  };

  const setEquipmentLocation = (index: number, location: string | undefined) => {
    setVenueData((prev) => {
      const updated = [...prev.equipment];
      updated[index] = { ...updated[index], location };
      return { ...prev, equipment: updated };
    });
  };

  // Add location without map
  const addTextLocation = () => {
    const val = locationInput.trim();
    if (!val) return;
    const newPost: Post = {
      name: val,
      x: null,
      y: null,
    };
    setVenueData((prev) => {
      const newLayers = [...prev.layers];
      newLayers[currentLayer] = {
        ...newLayers[currentLayer],
        posts: [...newLayers[currentLayer].posts, newPost],
      };
      return { ...prev, layers: newLayers };
    });
    setLocationInput('');
  };

  // Distance (in percent units) below which a click while drawing an area is
  // treated as "close the loop" rather than "place another vertex" — chosen
  // to be forgiving at typical zoom levels without triggering on a vertex
  // placed deliberately near, but not on, the start point.
  const ZONE_CLOSE_THRESHOLD_PERCENT = 2.5;

  // Handle map click for area (zone) drawing — routes here instead of
  // handleImageClick's marker-placement branch whenever area mode is active.
  const handleAreaImageClick = (evt: React.MouseEvent<HTMLDivElement>) => {
    const img = imgRef.current;
    if (!img) return;

    const rect = img.getBoundingClientRect();
    if (!isPointWithinRect(evt.clientX, evt.clientY, rect)) return;

    const { x, y } = pixelToPercent(evt.clientX, evt.clientY, rect);

    if (!pendingZone) {
      // Assigned now, not at closing, so the in-progress dots can render in
      // this zone's actual color instead of a placeholder.
      setZoneColorInput(getNextZoneColor(venueData.layers[currentLayer]?.zones || []));
      setPendingZone({ points: [{ x, y }], layerIdx: currentLayer, isDrawing: true });
      return;
    }

    if (!pendingZone.isDrawing) return;

    if (pendingZone.points.length >= 3) {
      const first = pendingZone.points[0];
      const distance = Math.hypot(x - first.x, y - first.y);
      if (distance <= ZONE_CLOSE_THRESHOLD_PERCENT) {
        setPendingZone({ ...pendingZone, isDrawing: false });
        return;
      }
    }

    setPendingZone({ ...pendingZone, points: [...pendingZone.points, { x, y }] });
  };

  // Double-clicking while drawing closes the loop immediately, same
  // "click near the start point" outcome as handleAreaImageClick's own
  // distance check, for anyone who'd rather not click back on the start.
  const handleAreaImageDoubleClick = () => {
    if (!pendingZone || !pendingZone.isDrawing || pendingZone.points.length < 3) return;
    setPendingZone({ ...pendingZone, isDrawing: false });
  };

  // Confirm the pending zone's name/color/dispatch-zone flag
  const confirmZoneName = () => {
    if (!pendingZone) return;

    const name = zoneNameInput.trim();
    if (!name || pendingZone.points.length < 3) {
      cancelZoneDrawing();
      return;
    }

    if (zoneIsDispatchZoneInput && hasDuplicateZoneName(name, allZones)) {
      alert('Another dispatch zone already uses this name. Give each dispatch zone a unique name.');
      return;
    }

    const newZone: Zone = {
      id: randomId(),
      name,
      color: zoneColorInput || getNextZoneColor(venueData.layers[pendingZone.layerIdx]?.zones || []),
      points: pendingZone.points,
      isDispatchZone: zoneIsDispatchZoneInput,
    };

    setVenueData((prev) => {
      const newLayers = [...prev.layers];
      const layer = newLayers[pendingZone.layerIdx];
      newLayers[pendingZone.layerIdx] = { ...layer, zones: [...(layer.zones || []), newZone] };
      return { ...prev, layers: newLayers };
    });

    setPendingZone(null);
    setZoneNameInput('');
    setZoneColorInput('');
    setZoneIsDispatchZoneInput(false);
  };

  // Cancel area drawing/naming without saving anything
  const cancelZoneDrawing = () => {
    setPendingZone(null);
    setZoneNameInput('');
    setZoneColorInput('');
    setZoneIsDispatchZoneInput(false);
  };

  const removeZone = (layerIdx: number, zoneIdx: number) => {
    setVenueData((prev) => {
      const newLayers = [...prev.layers];
      newLayers[layerIdx] = {
        ...newLayers[layerIdx],
        zones: (newLayers[layerIdx].zones || []).filter((_, i) => i !== zoneIdx),
      };
      return { ...prev, layers: newLayers };
    });
  };

  const renameZone = (layerIdx: number, zoneIdx: number) => {
    setEditingZone({ layerIdx, zoneIdx });
    setIsZoneEditModalOpen(true);
  };

  const handleEditZone = (name: string, color: string, isDispatchZone: boolean) => {
    if (!editingZone) return;
    const { layerIdx, zoneIdx } = editingZone;

    if (isDispatchZone && hasDuplicateZoneName(name, allZones, { layerIdx, zoneIdx })) {
      alert('Another dispatch zone already uses this name. Give each dispatch zone a unique name.');
      return;
    }

    setVenueData((prev) => {
      const newLayers = [...prev.layers];
      const zones = [...(newLayers[layerIdx].zones || [])];
      zones[zoneIdx] = { ...zones[zoneIdx], name, color, isDispatchZone };
      newLayers[layerIdx] = { ...newLayers[layerIdx], zones };
      return { ...prev, layers: newLayers };
    });
    setEditingZone(null);
  };

  // Handle map click for marker placement
  const handleImageClick = (evt: React.MouseEvent<HTMLDivElement>) => {
    if (isAddAreaMode) {
      handleAreaImageClick(evt);
      return;
    }
    if (!isAddMarkerMode || isPanning) return;

    const img = imgRef.current;
    if (!img) return;

    const rect = img.getBoundingClientRect();

    if (!isPointWithinRect(evt.clientX, evt.clientY, rect)) {
      return;
    }

    const { x, y } = pixelToPercent(evt.clientX, evt.clientY, rect);

    // Create temporary marker
    const newPost: Post = {
      name: '',
      x,
      y,
    };

    setVenueData((prev) => {
      const newLayers = [...prev.layers];
      newLayers[currentLayer] = {
        ...newLayers[currentLayer],
        posts: [...newLayers[currentLayer].posts, newPost],
      };
      return { ...prev, layers: newLayers };
    });
    setPendingMarker({ x, y, layerIdx: currentLayer, postIdx: venueData.layers[currentLayer].posts.length });
    setMarkerNameInput('');
    setMarkerIsClinicInput(false);
  };

  // Confirm marker name
  const confirmMarkerName = () => {
    if (!pendingMarker) return;

    const name = markerNameInput.trim();
    if (!name) {
      // Remove the marker if no name provided
      removePost(pendingMarker.layerIdx, pendingMarker.postIdx);
      setPendingMarker(null);
      setMarkerNameInput('');
      setMarkerIsClinicInput(false);
      return;
    }

    if (markerIsClinicInput && hasDuplicateClinicName(name, allPosts, { layerIdx: pendingMarker.layerIdx, postIdx: pendingMarker.postIdx })) {
      alert('Another clinic already uses this name. Give each clinic a unique name.');
      return;
    }

    setVenueData((prev) => {
      const newLayers = [...prev.layers];
      const copy = [...newLayers[pendingMarker.layerIdx].posts];
      const currentPost = copy[pendingMarker.postIdx];
      if (typeof currentPost !== 'string') {
        const clinicId = markerIsClinicInput ? (currentPost.clinicId || randomId()) : currentPost.clinicId;
        copy[pendingMarker.postIdx] = {
          ...currentPost,
          name,
          isClinic: markerIsClinicInput,
          ...(clinicId ? { clinicId } : {}),
        };
      }
      newLayers[pendingMarker.layerIdx] = { ...newLayers[pendingMarker.layerIdx], posts: copy };
      return { ...prev, layers: newLayers };
    });

    setPendingMarker(null);
    setMarkerNameInput('');
    setMarkerIsClinicInput(false);
  };

  // Cancel marker placement
  const cancelMarkerName = () => {
    if (pendingMarker) {
      removePost(pendingMarker.layerIdx, pendingMarker.postIdx);
    }
    setPendingMarker(null);
    setMarkerNameInput('');
    setMarkerIsClinicInput(false);
  };

  const removePost = (layerIdx: number, postIdx: number) => {
    setVenueData((prev) => {
      const newLayers = [...prev.layers];
      newLayers[layerIdx] = {
        ...newLayers[layerIdx],
        posts: newLayers[layerIdx].posts.filter((_, i) => i !== postIdx),
      };
      return { ...prev, layers: newLayers };
    });
  };

  const renamePost = (layerIdx: number, postIdx: number) => {
    setEditingLocation({ layerIdx, postIdx });
    setIsLocationEditModalOpen(true);
  };

  const handleEditLocation = (name: string, newLayerIdx: number, isClinic: boolean) => {
    if (!editingLocation) return;
    const { layerIdx, postIdx } = editingLocation;

    if (isClinic && hasDuplicateClinicName(name, allPosts, { layerIdx, postIdx })) {
      alert('Another clinic already uses this name. Give each clinic a unique name.');
      return;
    }

    setVenueData((prev) => {
      const newLayers = [...prev.layers];
      const post = newLayers[layerIdx].posts[postIdx];
      if (typeof post === 'string') return prev;
      const clinicId = isClinic ? (post.clinicId || randomId()) : post.clinicId;
      const clinicIdField = clinicId ? { clinicId } : {};
      if (newLayerIdx !== layerIdx) {
        // Move to new layer
        const newPost = { ...post, name, isClinic, ...clinicIdField };
        newLayers[layerIdx].posts.splice(postIdx, 1);
        newLayers[newLayerIdx].posts.push(newPost);
      } else {
        // Same layer, just rename
        newLayers[layerIdx].posts[postIdx] = { ...post, name, isClinic, ...clinicIdField };
      }
      return { ...prev, layers: newLayers };
    });
    setEditingLocation(null);
  };

  const updateLayerName = (name: string) => {
    setVenueData(prev => {
      const newLayers = [...prev.layers];
      newLayers[currentLayer] = { ...newLayers[currentLayer], name };
      return { ...prev, layers: newLayers };
    });
  };

  // Drag markers
  const onMarkerMouseDown =
    (idx: number) => (evt: React.MouseEvent<HTMLDivElement>) => {
      if (pendingMarker) return;

      evt.preventDefault();
      evt.stopPropagation();
      setDraggingIdx(idx);

      const img = imgRef.current;
      if (!img) return;

      const rect = img.getBoundingClientRect();

      const onMove = (e: MouseEvent) => {
        const { x, y } = pixelToPercent(e.clientX, e.clientY, rect);

        setVenueData((prev) => {
          const newLayers = [...prev.layers];
          const copy = [...newLayers[currentLayer].posts];
          const cur = copy[idx];
          if (typeof cur === 'string') return prev;
          copy[idx] = { ...cur, x, y };
          newLayers[currentLayer] = { ...newLayers[currentLayer], posts: copy };
          return { ...prev, layers: newLayers };
        });
      };

      const onUp = () => {
        setDraggingIdx(null);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };

  const renderMarkers = () => {
    type CoordinatedPost = {
      name: string;
      x: number;
      y: number;
      isClinic?: boolean;
    };

    return venueData.layers[currentLayer].posts
      .filter((post): post is CoordinatedPost =>
        typeof post === 'object' &&
        post !== null &&
        'name' in post &&
        typeof post.x === 'number' &&
        typeof post.y === 'number' &&
        post.x !== null &&
        post.y !== null
      )
      .map((post, idx) => {
        const isHover = hoverId === idx;
        const isPending = pendingMarker?.layerIdx === currentLayer && pendingMarker?.postIdx === idx;

        return (
          <VenueMapMarker
            key={idx}
            x={post.x}
            y={post.y}
            name={post.name}
            isClinic={post.isClinic}
            isHover={isHover}
            isPending={isPending}
            isDragging={draggingIdx === idx}
            scale={scale}
            onMouseEnter={() => setHoverId(idx)}
            onMouseLeave={() => setHoverId((cur) => (cur === idx ? null : cur))}
            onMouseDown={onMarkerMouseDown(idx)}
            onClick={(e) => {
              if (isPending) return;
              e.preventDefault();
              e.stopPropagation();
              renamePost(currentLayer, idx);
            }}
          />
        );
      });
  };

  // Create venue
  const handleSubmit = async (e?: React.FormEvent, options?: { createEvent?: boolean }) => {
    e?.preventDefault();

    if (!userId) {
      alert('You must be logged in to save the venue');
      return;
    }

    if (!venueData.name.trim()) {
      alert('Please enter a venue name');
      return;
    }

    if (pendingMarker) {
      alert('Please finish naming the marker or cancel it before saving');
      return;
    }

    setIsUploading(true);
    try {
      let newMapUrl: string | undefined;

      if (mapFile && mapFile.size > 0) {
        newMapUrl = await storageService.uploadFile(`venue_maps/${Date.now()}_${mapFile.name}`, mapFile);
      }

      const equipmentToSave = venueData.equipment.map(({ ...rest }) => rest);

      // Update current layer's mapUrl if new map uploaded
      const updatedLayers = venueData.layers.map((layer, idx) => {
        let layerData = idx === (pendingLayer ?? currentLayer) && newMapUrl ? { ...layer, mapUrl: newMapUrl } : layer;
        // A TAK alignment made against the new image's local preview follows it to its uploaded URL.
        if (layerData !== layer && layer.takAlignment && layer.takAlignment.mapUrl === previewUrl) {
          layerData = { ...layerData, takAlignment: { ...layer.takAlignment, mapUrl: newMapUrl! } };
        }
        // Remove undefined properties from each layer
        const filteredLayer: Record<string, unknown> = {};
        Object.entries(layerData).forEach(([key, value]) => {
          if (value !== undefined) {
            filteredLayer[key] = value;
          }
        });
        return filteredLayer;
      });

      const dataToSave: Record<string, unknown> = {
        name: venueData.name.trim(),
        equipment: equipmentToSave,
        layers: updatedLayers,
        posts: allPosts.map(item => item.post),
        userId,
      };

      // TAK (optional): saved only once the venue has turned it on or off.
      if (venueData.takEnabled !== undefined) {
        dataToSave.takEnabled = venueData.takEnabled;
      }

      // Only add mapUrl if it exists
      if (venueData.layers?.[0]?.mapUrl) {
        dataToSave.mapUrl = venueData.layers[0].mapUrl;
      }

      const sanitizedDataToSave = stripUndefined(dataToSave);

      let savedVenueId: string;
      if (venueId) {
        await dbService.updateDocument('venues', venueId, sanitizedDataToSave);
        savedVenueId = venueId;
      } else {
        savedVenueId = await dbService.addDocument('venues', sanitizedDataToSave);
      }

      if (options?.createEvent) {
        const savedVenue = { id: savedVenueId, ...sanitizedDataToSave } as Venue;
        const newEvent = {
          name: '',
          date: new Date(),
          venue: savedVenue,
          postingTimes: [],
          staff: [],
          supervisor: [],
          userId,
          calls: [],
          eventPosts: [],
          eventEquipment: [],
          status: 'draft',
          createdAt: new Date().toISOString(),
        };
        const newEventId = await dbService.addDocument('events', stripUndefined(newEvent));
        router.push(`/events/${newEventId}/create`);
      } else {
        router.push('/venues/selection');
      }
    } catch (error: unknown) {
      console.error('Error saving venue:', error);
      const message =
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message
          : 'Unknown error';
      alert(
        message.includes('storage/unauthorized')
          ? 'Save failed: Check storage permissions'
          : `Save failed: ${message}`
      );
    } finally {
      setIsUploading(false);
      setMapFile(null);
      setPendingLayer(null);
    }
  };

  // Handle adding new layer
  const handleAddLayer = async (name: string, file: File) => {
    setIsUploading(true);
    try {
      const mapUrl = await storageService.uploadFile(`venue_maps/${Date.now()}_${file.name}`, file);
      const newLayer: Layer = {
        id: randomId(),
        name,
        mapUrl,
        posts: [],
      };
      const newLayers = [...venueData.layers, newLayer];
      setVenueData(prev => ({
        ...prev,
        layers: newLayers,
      }));
      setCurrentLayer(newLayers.length - 1);
    } catch (error) {
      console.error('Error adding layer:', error);
      alert('Failed to add layer');
    } finally {
      setIsUploading(false);
    }
    setIsNewLayerModalOpen(false);
  };

  // Handle importing a GIS-derived layer (pre-flattened background image +
  // GeoJSON points and/or polygon areas). isClinic posts get a clinicId
  // assigned immediately — same as the manual marker-add flow — since
  // syncClinicsFromVenue only surfaces clinic-flagged posts that already
  // carry one. Zones already carry a stable id from geoJsonToZones, so no
  // equivalent backfill is needed for isDispatchZone zones.
  const handleImportGeoJsonLayer = async (
    name: string,
    imageFile: File,
    posts: Post[],
    zones: Zone[],
    geoBounds: GeoBounds
  ) => {
    // This handler is reachable from two places with different meanings:
    // the empty-map prompt (current layer has no map yet — e.g. the
    // venue's initial "Floor 1" — where the import should fill that layer
    // in place, same as picking a plain image there would) and the
    // LayerControlBar button (current layer already has a map, where it
    // should add a new layer, like Add Layer does). Deciding by whether
    // the current layer already has a mapUrl covers both without a prop.
    const isFillingEmptyLayer = !venueData.layers[currentLayer]?.mapUrl;

    setIsUploading(true);
    try {
      const mapUrl = await storageService.uploadFile(`venue_maps/${Date.now()}_${imageFile.name}`, imageFile);
      const postsWithClinicIds = posts.map((post) =>
        isClinicPost(post) ? { ...post, clinicId: randomId() } : post
      );
      const newLayer: Layer = {
        id: randomId(),
        name,
        mapUrl,
        posts: postsWithClinicIds,
        zones,
        geoBounds,
      };
      if (isFillingEmptyLayer) {
        setVenueData(prev => {
          const newLayers = [...prev.layers];
          newLayers[currentLayer] = newLayer;
          return { ...prev, layers: newLayers };
        });
      } else {
        const newLayers = [...venueData.layers, newLayer];
        setVenueData(prev => ({
          ...prev,
          layers: newLayers,
        }));
        setCurrentLayer(newLayers.length - 1);
      }
    } catch (error) {
      console.error('Error importing GIS layer:', error);
      alert('Failed to import GIS layer');
    } finally {
      setIsUploading(false);
    }
    setIsGeoJsonImportModalOpen(false);
  };

  // Handle deleting layer — a venue always needs at least one layer, so
  // deleting the only one just clears its map (and any pending unsaved
  // upload) instead of removing the layer itself.
  const deleteLayer = () => {
    if (venueData.layers.length <= 1) {
      const confirmReset = window.confirm('This is the only floor. Remove its map and start over?');
      if (!confirmReset) return;
      setVenueData(prev => {
        const newLayers = [...prev.layers];
        newLayers[currentLayer] = { ...newLayers[currentLayer], mapUrl: undefined };
        return { ...prev, layers: newLayers };
      });
      setMapFile(null);
      setPendingLayer(null);
      return;
    }
    const confirmDelete = window.confirm('Are you sure you want to delete this layer?');
    if (!confirmDelete) return;
    setVenueData(prev => {
      const newLayers = prev.layers.filter((_, i) => i !== currentLayer);
      return { ...prev, layers: newLayers };
    });
    setCurrentLayer(Math.max(0, currentLayer - 1));
  };

  const hasMapForStep = Boolean(previewUrl);
  // A just-uploaded map isn't in venueData.layers yet — it only becomes a
  // real mapUrl there once the venue is saved (handleSubmit uploads it and
  // patches this layer in). The interactive map already shows it via
  // previewUrl (a local object URL); the read-only panel reads mapUrl
  // straight off the layers array, so without this override it would show
  // nothing for the current layer until the venue is actually saved.
  const layersForMapDisplay = previewUrl
    ? venueData.layers.map((layer, idx) => (idx === currentLayer ? { ...layer, mapUrl: previewUrl } : layer))
    : venueData.layers;
  // The Map step always renders full-width (header + its own interactive
  // map), never the half-split every other map-showing step uses.
  const showMapPanel = currentStepId !== 'basics' && currentStepId !== 'map' && currentStepId !== 'tak' && currentStepId !== 'review';
  const showMapColumn = showMapPanel && hasMapForStep;
  // The interactive editor (place/drag markers) only applies to Locations
  // (placing a location directly on the map); Equipment and Review just
  // need a plain reference view, matching event creation's read-only map
  // panel exactly. The Map step renders its own dedicated interactive map
  // below, outside this left/right split entirely.

  // The map/floor-controls header for the Map step: floor name top-left,
  // Add Markers top-right.
  const mapStepHeader = (
    <div className="mb-3 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-surface-light">
          Venue Map
        </label>
        <Input
          value={venueData.layers[currentLayer].name}
          onValueChange={updateLayerName}
          variant="flat"
          size="md"
          classNames={{
            input: 'text-surface-light text-sm outline-none focus:outline-none data-[focus=true]:outline-none',
            inputWrapper: 'rounded-large px-4 pr-6 hover:bg-surface-deep',
          }}
          placeholder="Layer name"
        />
      </div>
      {previewUrl && (
        <div className="flex gap-2">
          <MarkerModeToggleButton
            isAddMarkerMode={isAddMarkerMode}
            onToggle={() => {
              if (!isAddMarkerMode) cancelZoneDrawing();
              setIsAddAreaMode(false);
              setIsAddMarkerMode(!isAddMarkerMode);
            }}
          />
          <AreaModeToggleButton
            isAddAreaMode={isAddAreaMode}
            onToggle={() => {
              if (!isAddAreaMode) {
                if (pendingMarker) cancelMarkerName();
                setIsAddMarkerMode(false);
              } else {
                cancelZoneDrawing();
              }
              setIsAddAreaMode(!isAddAreaMode);
            }}
          />
        </div>
      )}
    </div>
  );

  // Upload prompt shown full-width whenever the current step would show a
  // map but none exists yet for this layer.
  const mapUploadPrompt = (
    <div className="rounded-sm relative flex flex-col items-center justify-start w-full h-full">
      <Card className="rounded-sm bg-default/40 w-full h-full px-3 py-2">
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-sm">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-3 text-surface-light/70 transition hover:text-status-blue"
          >
            <Upload className="h-12 w-12" />
            <div className="text-center">
              <p className="text-sm font-medium">Upload Venue Map</p>
              <p className="mt-1 text-xs text-surface-light/50">
                Optional - Click to select an image
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setIsGeoJsonImportModalOpen(true)}
            className="text-xs text-surface-light/60 underline transition hover:text-status-blue"
          >
            Or import a GIS map with pre-placed points and areas
          </button>
        </div>
      </Card>
    </div>
  );

  // Simple read-only layer indicator + prev/next nav — used everywhere
  // except the Map step itself, which is the only place layers can be
  // added, replaced, or deleted (via the richer LayerControlBar below).
  const simpleLayerBar = (
    <Card radius="none" className="rounded-b-sm bg-default/40 w-full px-3 py-2 flex-shrink-0">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-surface-light">
          {venueData.layers?.[currentLayer]?.name || 'Main Floor'}
        </span>
        {venueData.layers.length > 1 && (
          <div className="flex items-center gap-2">
            <Button
              isIconOnly
              size="sm"
              radius="full"
              variant="flat"
              onPress={() => setCurrentLayer((prev) => Math.max(0, prev - 1))}
              isDisabled={currentLayer === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-surface-light">
              {currentLayer + 1} / {venueData.layers.length}
            </span>
            <Button
              isIconOnly
              size="sm"
              radius="full"
              variant="flat"
              onPress={() => setCurrentLayer((prev) => Math.min(venueData.layers.length - 1, prev + 1))}
              isDisabled={currentLayer === venueData.layers.length - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </Card>
  );

  // Interactive map area (place/drag markers), shared by the Map and
  // Locations steps — same checkerboard/sharp-corner treatment as the
  // read-only panel below, so both read as the same surface. Only the
  // bottom bar differs between the two (see interactiveMapPanel /
  // locationsMapPanel below).
  const interactiveMapTop = (
      <div className="relative w-full flex-1 min-h-0 overflow-hidden rounded-t-sm" style={MAP_CHECKER_BG}>
        <MapPanSurface
          containerRef={imgContainerRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            cursor: isAddMarkerMode || isAddAreaMode ? 'crosshair' : isPanning ? 'grabbing' : 'grab',
            height: '100%',
          }}
        >
          <div
            className="relative inline-block"
            onClick={handleImageClick}
            onDoubleClick={handleAreaImageDoubleClick}
            style={{
              transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
              transformOrigin: 'left top',
              transition: isPanning ? 'none' : 'transform 0.1s',
            }}
          >
            <Image
              ref={(node) => {
                if (node) {
                  const img = node as unknown as HTMLImageElement;
                  imgRef.current = img;
                }
              }}
              src={previewUrl || ''}
              alt="Venue map"
              width={1200}
              height={900}
              className="block"
              style={{
                display: 'block',
                width: 'auto',
                height: 'auto',
                maxWidth: '100%'
              }}
              unoptimized
              onLoad={(e) => {
                const ratio = e.currentTarget.naturalWidth / e.currentTarget.naturalHeight;
                setAspectRatio(ratio);
              }}
            />
            <VenueMapZones
              zones={venueData.layers[currentLayer].zones || []}
              hoverZoneId={hoverZoneId}
              onZoneMouseEnter={(zone) => setHoverZoneId(zone.id)}
              onZoneMouseLeave={() => setHoverZoneId(null)}
            />
            {pendingZone && pendingZone.points.length > 0 && (
              <>
                {/* Lines/fill only: an SVG stretched to the image's own (usually
                    non-square) aspect ratio is the right way to draw these, since
                    it's the same percent-of-image space the points were captured
                    in. A <circle> in that same stretched space would come out
                    elliptical, not round, which is why the point dots below are
                    plain HTML circles instead. */}
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ pointerEvents: 'none' }}>
                  {pendingZone.points.length >= 2 && (
                    <polyline
                      points={pendingZone.points.map((p) => `${p.x},${p.y}`).join(' ') + (!pendingZone.isDrawing ? ` ${pendingZone.points[0].x},${pendingZone.points[0].y}` : '')}
                      fill={pendingZone.isDrawing ? 'none' : (zoneColorInput || '#3b82f6')}
                      fillOpacity={0.25}
                      stroke={zoneColorInput || '#3b82f6'}
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  {/* Dashed guide from the last placed point back to the first: this is the connection still missing before the area registers. */}
                  {pendingZone.isDrawing && pendingZone.points.length >= 2 && (
                    <line
                      x1={pendingZone.points[pendingZone.points.length - 1].x}
                      y1={pendingZone.points[pendingZone.points.length - 1].y}
                      x2={pendingZone.points[0].x}
                      y2={pendingZone.points[0].y}
                      stroke={zoneColorInput || '#3b82f6'}
                      strokeOpacity={0.6}
                      strokeDasharray="3"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </svg>
                {/* Point dots: plain HTML circles positioned by percent (like
                    VenueMapMarker's pins), sized in real pixels so they stay
                    round no matter how the underlying image is stretched. */}
                <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
                  {pendingZone.points.map((p, i) => {
                    const isFirst = i === 0;
                    const canClose = isFirst && pendingZone.isDrawing && pendingZone.points.length >= 3;
                    return (
                      <div key={i} style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -50%)' }}>
                        {canClose && (
                          <div
                            style={{
                              position: 'absolute',
                              left: '50%',
                              top: '50%',
                              transform: 'translate(-50%, -50%)',
                              width: 28,
                              height: 28,
                              borderRadius: '9999px',
                              border: `2px solid ${zoneColorInput || '#3b82f6'}`,
                              opacity: 0.7,
                            }}
                          />
                        )}
                        <div
                          style={{
                            width: isFirst ? 16 : 12,
                            height: isFirst ? 16 : 12,
                            borderRadius: '9999px',
                            backgroundColor: zoneColorInput || '#3b82f6',
                            border: '2px solid white',
                            boxShadow: '0 1px 3px rgb(0 0 0 / 0.6)',
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            <div className="absolute inset-0 pointer-events-none">
              <div className="relative w-full h-full pointer-events-auto">
                {renderMarkers()}
              </div>
            </div>
          </div>
        </MapPanSurface>

        {pendingMarker && (
          <PendingMarkerDialog
            markerNameInput={markerNameInput}
            markerInputRef={markerInputRef}
            setMarkerNameInput={setMarkerNameInput}
            markerIsClinicInput={markerIsClinicInput}
            setMarkerIsClinicInput={setMarkerIsClinicInput}
            onConfirm={confirmMarkerName}
            onCancel={cancelMarkerName}
          />
        )}

        {pendingZone && !pendingZone.isDrawing && (
          <PendingZoneDialog
            zoneNameInput={zoneNameInput}
            zoneNameInputRef={zoneNameInputRef}
            setZoneNameInput={setZoneNameInput}
            zoneColorInput={zoneColorInput}
            setZoneColorInput={setZoneColorInput}
            zoneIsDispatchZoneInput={zoneIsDispatchZoneInput}
            setZoneIsDispatchZoneInput={setZoneIsDispatchZoneInput}
            onConfirm={confirmZoneName}
            onCancel={cancelZoneDrawing}
          />
        )}

        {/* Zoom Controls - Top Right */}
        <MapZoomControls
          onZoomIn={() => zoomIn(0.5)}
          onZoomOut={() => zoomOut(0.5)}
          onReset={resetZoom}
          buttonClassName="bg-surface-deepest/95"
          resetButtonClassName="bg-surface-deepest/95 text-xs px-2"
        />

        {/* Instructions overlay - Top Left */}
        {isAddMarkerMode && !pendingMarker && <MarkerPlacementInstruction />}
        {isAddAreaMode && !pendingZone && (
          <MarkerPlacementInstruction message="Click on the map to start placing points. The area only registers once you connect the dots back to the first point." />
        )}
        {isAddAreaMode && pendingZone?.isDrawing && pendingZone.points.length < 3 && (
          <MarkerPlacementInstruction message={`${pendingZone.points.length} point${pendingZone.points.length === 1 ? '' : 's'} placed. Add at least ${3 - pendingZone.points.length} more, then connect back to the first point to finish.`} />
        )}
        {isAddAreaMode && pendingZone?.isDrawing && pendingZone.points.length >= 3 && (
          <MarkerPlacementInstruction message={`${pendingZone.points.length} points placed. Click the highlighted first point (or double-click) to connect the dots and complete the area.`} />
        )}
      </div>
  );

  // Map step: the only place layers can be added, replaced, or deleted.
  const interactiveMapPanel = (
    <div className="flex flex-col h-full">
      {interactiveMapTop}
      <LayerControlBar
        mapFileName={mapFileName}
        onReplaceMap={() => fileInputRef.current?.click()}
        currentLayer={currentLayer}
        totalLayers={venueData.layers.length}
        currentLayerName={venueData.layers?.[currentLayer]?.name || 'Layer'}
        onPreviousLayer={() => setCurrentLayer(currentLayer - 1)}
        onNextLayer={() => setCurrentLayer(currentLayer + 1)}
        onDeleteLayer={deleteLayer}
        onAddLayer={() => setIsNewLayerModalOpen(true)}
        onImportGeoJson={() => setIsGeoJsonImportModalOpen(true)}
      />
    </div>
  );

  // Locations step: same interactive map (placing a location directly on
  // it), but only the simple read-only layer bar — adding/replacing/
  // deleting a layer is Map-step-only.
  const locationsMapPanel = (
    <div className="flex flex-col h-full">
      {interactiveMapTop}
      {simpleLayerBar}
    </div>
  );

  // Read-only map panel for the Equipment and Review steps — same
  // VenueMapWithPosts rendering (proper post/equipment icons) and pan/zoom
  // behavior as the event creation page's own map panel.
  const readOnlyMapPanel = (
    <div className="flex flex-col h-full">
      <div className="relative w-full flex-1 min-h-0 overflow-hidden rounded-t-sm" style={MAP_CHECKER_BG}>
        <VenueMapWithPosts
          layers={layersForMapDisplay}
          currentLayer={currentLayer}
          staff={[]}
          equipment={venueData.equipment}
          teamTimers={{}}
          scale={readOnlyScale}
          position={readOnlyPosition}
          isPanning={readOnlyIsPanning}
          onMouseDown={handleReadOnlyMouseDown}
          onMouseMove={handleReadOnlyMouseMove}
          onMouseUp={handleReadOnlyMouseUp}
          onWheel={handleReadOnlyWheel}
          imgRef={readOnlyImgRef}
          imageRadiusClassName="rounded-none"
        />
        <MapZoomControls
          onZoomIn={handleReadOnlyZoomIn}
          onZoomOut={handleReadOnlyZoomOut}
          onReset={handleReadOnlyResetZoom}
          buttonClassName="bg-surface-deepest/90 backdrop-blur"
          resetButtonClassName="bg-surface-deepest/90 backdrop-blur"
        />
      </div>
      {simpleLayerBar}
    </div>
  );

  const rightPanelContent = currentStepId === 'locations' ? locationsMapPanel : readOnlyMapPanel;

  const basicsStep = (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-md">
        <Input
          label="Venue Name"
          placeholder="e.g., Convention Center Hall A"
          value={venueData.name}
          onValueChange={handleChange}
          isRequired
          labelPlacement="outside"
          variant="flat"
          classNames={{
            label: 'text-surface-light font-medium',
            inputWrapper: 'rounded-large px-4 hover:bg-surface-deep',
            input: 'text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none',
          }}
        />
        {TakVenueSetting && userId && (
          <Suspense fallback={null}>
            <div className="mt-6">
              <TakVenueSetting
                uid={userId}
                enabled={!!venueData.takEnabled}
                onChange={(enabled) => setVenueData((prev) => ({ ...prev, takEnabled: enabled }))}
              />
            </div>
          </Suspense>
        )}
      </div>
    </div>
  );

  const mapFloorsStep = (
    <div className="flex flex-col h-full">
      {mapStepHeader}
      <div className="flex-1 min-h-0">{hasMapForStep ? interactiveMapPanel : mapUploadPrompt}</div>
    </div>
  );

  const locationsStep = (
    <div className="flex flex-col h-full">
      <h3 className="mb-2 flex-shrink-0 text-surface-light font-semibold text-xl inline-flex items-center gap-1.5">
        Locations
        <Tooltip content="Posts or areas teams can be assigned to and dispatched between during an event (e.g., Main Entrance, First Aid Tent). Pin them on the map, or add by name below." placement="top">
          <CircleHelp className="w-3.5 h-3.5 text-surface-faint" />
        </Tooltip>
      </h3>
      <div className="flex gap-2 flex-shrink-0">
        <Input
          placeholder="e.g., Main Entrance"
          value={locationInput}
          onValueChange={setLocationInput}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTextLocation();
            }
          }}
          variant="flat"
          classNames={{
            input: 'text-surface-light text-sm outline-none focus:outline-none data-[focus=true]:outline-none',
            inputWrapper: 'rounded-large px-4 hover:bg-surface-deep',
          }}
        />
        <Button
          isIconOnly
          onPress={addTextLocation}
          className="flex-shrink-0 bg-accent hover:bg-accent/90 text-surface-light"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {allPosts.length > 0 && (
        <ScrollShadow className="mt-3 space-y-2 pr-2 flex-1 min-h-0 scrollbar-hide">
          {allPosts.map((item, idx) => {
            const post = item.post;
            const label = typeof post === 'string' ? post : post.name;
            const hasCoordinates = typeof post === 'object' && post.x !== null && post.y !== null;
            const isPending = pendingMarker?.layerIdx === item.layerIdx && pendingMarker?.postIdx === item.postIdx;

            return (
              <div key={idx} data-testid="location-row" className="rounded-sm bg-default/40">
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {isClinicPost(post) ? (
                      <HousePlus className="h-4 w-4 flex-shrink-0 text-accent" />
                    ) : hasCoordinates ? (
                      <MapPinned className="h-4 w-4 flex-shrink-0 text-accent" />
                    ) : (
                      <MapPin className="h-4 w-4 flex-shrink-0 text-surface-light" />
                    )}
                    <span className={`text-sm truncate ${isPending ? 'text-status-blue italic' : 'text-surface-light'}`}>
                      {label}
                    </span>
                    {item.layerName && (
                      <span className="text-xs text-surface-light">({item.layerName})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {typeof post !== 'string' && (
                      <Button
                        isIconOnly
                        size="sm"
                        radius="full"
                        variant="light"
                        onPress={() => renamePost(item.layerIdx, item.postIdx)}
                        className="min-w-6 w-6 h-6"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      isIconOnly
                      size="sm"
                      radius="full"
                      variant="light"
                      color="danger"
                      onPress={() => removePost(item.layerIdx, item.postIdx)}
                      className="min-w-6 w-6 h-6"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </ScrollShadow>
      )}

      {allZones.length > 0 && (
        <>
          <h4 className="mt-4 mb-2 flex-shrink-0 text-surface-light font-medium text-sm">Areas</h4>
          <ScrollShadow className="space-y-2 pr-2 max-h-48 scrollbar-hide">
            {allZones.map((item) => (
              <div
                key={item.zone.id}
                data-testid="zone-row"
                className={`rounded-sm bg-default/40 ${hoverZoneId === item.zone.id ? 'ring-1 ring-accent' : ''}`}
                onMouseEnter={() => setHoverZoneId(item.zone.id)}
                onMouseLeave={() => setHoverZoneId((cur) => (cur === item.zone.id ? null : cur))}
              >
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span
                      className="h-3.5 w-3.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: item.zone.color }}
                    />
                    <span className="text-sm truncate text-surface-light">{item.zone.name}</span>
                    {item.zone.isDispatchZone && (
                      <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-medium text-accent flex-shrink-0">
                        Dispatch Zone
                      </span>
                    )}
                    {item.layerName && (
                      <span className="text-xs text-surface-light">({item.layerName})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      isIconOnly
                      size="sm"
                      radius="full"
                      variant="light"
                      onPress={() => renameZone(item.layerIdx, item.zoneIdx)}
                      className="min-w-6 w-6 h-6"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      isIconOnly
                      size="sm"
                      radius="full"
                      variant="light"
                      color="danger"
                      onPress={() => removeZone(item.layerIdx, item.zoneIdx)}
                      className="min-w-6 w-6 h-6"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </ScrollShadow>
        </>
      )}
    </div>
  );

  const equipmentStep = (
    <div className="h-full flex flex-col">
      <EquipmentManagementSection
        equipmentInput={equipmentInput}
        setEquipmentInput={setEquipmentInput}
        addEquipment={addEquipment}
        equipment={venueData.equipment}
        editingEquipmentIndex={editingEquipmentIndex}
        equipmentEditInput={equipmentEditInput}
        setEquipmentEditInput={setEquipmentEditInput}
        saveEquipmentEdit={saveEquipmentEdit}
        cancelEquipmentEdit={cancelEquipmentEdit}
        startEditEquipment={startEditEquipment}
        removeEquipment={removeEquipment}
        locationOptions={locationOptions}
        onSetLocation={setEquipmentLocation}
      />
    </div>
  );

  const floorsWithMap = venueData.layers.filter((l) => !!l.mapUrl).length + (mapFile ? 1 : 0);
  const reviewColumns: ReviewColumn[] = [
    {
      id: 'basics',
      label: 'Venue Configuration',
      fields: [{ label: 'Venue name', value: venueData.name.trim() || '(untitled)' }],
    },
    {
      id: 'map',
      label: 'Map',
      fields: [
        {
          label: 'Floors',
          value: `${venueData.layers.length} floor${venueData.layers.length === 1 ? '' : 's'}${floorsWithMap > 0 ? ` · ${floorsWithMap} with a map` : ''}`,
        },
      ],
    },
    {
      id: 'locations',
      label: 'Locations',
      fields: [{ label: 'Locations', value: `${allPosts.length} location${allPosts.length === 1 ? '' : 's'}` }],
    },
    {
      id: 'equipment',
      label: 'Equipment',
      fields: [{ label: 'Equipment', value: `${venueData.equipment.length} item${venueData.equipment.length === 1 ? '' : 's'}` }],
    },
  ];
  const reviewStep = (
    <div className="h-full overflow-y-auto space-y-4">
      <h3 className="text-surface-light font-semibold text-xl mb-1">Review</h3>
      <ReviewColumns columns={reviewColumns} />
    </div>
  );

  const hasName = !!venueData.name.trim();
  const steps: WizardStep[] = [
    { id: 'basics', label: 'Venue Configuration', component: basicsStep, isComplete: hasName },
    { id: 'map', label: 'Map', component: mapFloorsStep, isComplete: hasName },
    ...(TakVenueAlignStep && takStep && userId
      ? [
          {
            id: 'tak',
            label: 'TAK alignment',
            component: (
              <Suspense fallback={null}>
                <TakVenueAlignStep
                  uid={userId}
                  layers={layersForMapDisplay}
                  onAlignmentChange={(layerId, alignment) =>
                    setVenueData((prev) => ({
                      ...prev,
                      layers: prev.layers.map((l) => {
                        if (l.id !== layerId) return l;
                        if (alignment) return { ...l, takAlignment: alignment };
                        const rest = { ...l };
                        delete rest.takAlignment;
                        return rest;
                      }),
                    }))
                  }
                />
              </Suspense>
            ),
            isComplete: hasName,
          },
        ]
      : []),
    { id: 'locations', label: 'Locations', component: locationsStep, isComplete: hasName },
    { id: 'equipment', label: 'Equipment', component: equipmentStep, isComplete: hasName },
    { id: 'review', label: 'Review', component: reviewStep, isComplete: hasName },
  ];

  const stepIdx = STEP_ORDER.indexOf(currentStepId);
  const isFirstStep = stepIdx <= 0;
  const isLastStep = stepIdx === STEP_ORDER.length - 1;
  const goNext = () => {
    if (stepIdx >= 0 && stepIdx < STEP_ORDER.length - 1) setCurrentStepId(STEP_ORDER[stepIdx + 1]);
  };
  const goBack = () => {
    if (stepIdx > 0) setCurrentStepId(STEP_ORDER[stepIdx - 1]);
  };

  // Bottom-left slot: Cancel only ever shows on the first step; every other
  // step gets Back in that same corner instead.
  const leftFooterButton = isFirstStep ? (
    <Button variant="bordered" size="md" onPress={() => router.push('/venues/selection')} className="px-6">
      Cancel
    </Button>
  ) : (
    <Button variant="flat" size="md" onPress={goBack} className="px-6">
      Back
    </Button>
  );

  // Bottom-right slot: Continue on every step but the last, where it
  // becomes the save actions instead.
  const rightFooterButtons = !isLastStep ? (
    <Button
      size="md"
      onPress={goNext}
      isDisabled={currentStepId === 'basics' && !hasName}
      className="px-6 bg-accent hover:bg-accent/90 text-surface-light"
    >
      Continue
    </Button>
  ) : (
    <div className="flex gap-2">
      <Button
        onPress={() => handleSubmit(undefined, { createEvent: true })}
        isLoading={isUploading}
        isDisabled={!hasName}
        variant="bordered"
        size="md"
        className="px-6"
      >
        Save & Start Event
      </Button>
      <Button
        onPress={() => handleSubmit()}
        isLoading={isUploading}
        isDisabled={!hasName}
        size="md"
        className="px-6 bg-accent hover:bg-accent/90 text-surface-light"
      >
        {isUploading ? (venueId ? 'Updating...' : 'Creating...') : (venueId ? 'Update Venue' : 'Create Venue')}
      </Button>
    </div>
  );

  const leftPanelContent = (
    <div className="flex flex-col h-full relative overflow-hidden">
      <div className={`flex-1 flex flex-col overflow-hidden pt-2 pb-4 pl-6 ${showMapColumn ? 'pr-3' : 'pr-6'}`}>
        <WizardShell
          steps={steps}
          currentStepId={currentStepId}
          onStepChange={setCurrentStepId}
          hideProgress
          className="flex-1 min-h-0"
        />
      </div>

      {showMapColumn ? (
        <div className="flex pl-6 pr-3 pt-4 pb-4 flex-shrink-0">{leftFooterButton}</div>
      ) : (
        <div className="flex items-center justify-between px-6 pt-4 pb-4 flex-shrink-0">
          <div>{leftFooterButton}</div>
          <div>{rightFooterButtons}</div>
        </div>
      )}
    </div>
  );

  const rightPanel = (
    <div className="flex flex-col h-full relative pl-3 pr-6 pt-4 pb-4 overflow-hidden">
      <div className="flex-1 min-h-0">{rightPanelContent}</div>
      <div className="flex justify-end pt-4 flex-shrink-0">{rightFooterButtons}</div>
    </div>
  );

  return (
    <main className="relative bg-surface-deepest text-surface-light h-[calc(100dvh-3.5rem)] flex flex-col overflow-hidden">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="map-file-input"
        onChange={(e) => {
          setMapFile(e.target.files?.[0] ?? null);
          setPendingLayer(currentLayer);
        }}
      />

      <div className="relative z-10 max-w-[1200px] mx-auto h-full overflow-hidden flex flex-col w-full">
        <div className="px-6 pt-4 flex-shrink-0">
          <StepProgress steps={steps} currentStepId={currentStepId} onStepChange={setCurrentStepId} />
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="flex h-full overflow-hidden">
            {showMapColumn ? (
              <>
                <div className="w-1/3 h-full flex-shrink-0 overflow-hidden">{leftPanelContent}</div>
                <div className="w-2/3 h-full flex-shrink-0 overflow-hidden">{rightPanel}</div>
              </>
            ) : (
              <div className="w-full h-full overflow-hidden">{leftPanelContent}</div>
            )}
          </div>
        </div>
      </div>

      <NewLayerModal
        isOpen={isNewLayerModalOpen}
        onClose={() => setIsNewLayerModalOpen(false)}
        onSubmit={handleAddLayer}
      />

      <GeoJsonImportModal
        isOpen={isGeoJsonImportModalOpen}
        onClose={() => setIsGeoJsonImportModalOpen(false)}
        onSubmit={handleImportGeoJsonLayer}
      />

      <LocationEditModal
        isOpen={isLocationEditModalOpen}
        onClose={() => setIsLocationEditModalOpen(false)}
        onSubmit={handleEditLocation}
        initialName={
          editingLocation
            ? (() => {
                const p = venueData.layers[editingLocation.layerIdx].posts[editingLocation.postIdx];
                return typeof p === 'string' ? p : (p && 'name' in p ? p.name : '');
              })()
            : ''
        }
        initialLayerIdx={editingLocation?.layerIdx || 0}
        initialIsClinic={
          editingLocation
            ? (() => {
                const p = venueData.layers[editingLocation.layerIdx].posts[editingLocation.postIdx];
                return typeof p === 'string' ? false : !!p?.isClinic;
              })()
            : false
        }
        layers={venueData.layers}
      />

      <ZoneEditModal
        isOpen={isZoneEditModalOpen}
        onClose={() => setIsZoneEditModalOpen(false)}
        onSubmit={handleEditZone}
        initialName={
          editingZone ? venueData.layers[editingZone.layerIdx]?.zones?.[editingZone.zoneIdx]?.name ?? '' : ''
        }
        initialColor={
          editingZone ? venueData.layers[editingZone.layerIdx]?.zones?.[editingZone.zoneIdx]?.color ?? '' : ''
        }
        initialIsDispatchZone={
          editingZone ? !!venueData.layers[editingZone.layerIdx]?.zones?.[editingZone.zoneIdx]?.isDispatchZone : false
        }
      />
    </main>
  );
}
