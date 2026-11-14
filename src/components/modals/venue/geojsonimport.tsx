// components/modals/venue/geojsonimport.tsx
"use client";

import * as React from "react";
import Image from "next/image";
import { AlertTriangle, MapPin, Shapes, Trash2, Upload } from "lucide-react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
} from "@heroui/react";
import type { GeoBounds, Post, Zone } from "@/app/types";
import {
  deriveGeoBounds,
  geoJsonToPosts,
  geoJsonToZones,
  isGeoJsonFeatureCollection,
  mergeFeatureCollections,
  type GeoJsonFeatureCollection,
} from "@/lib/markerUtils";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, imageFile: File, posts: Post[], zones: Zone[], geoBounds: GeoBounds) => void;
};

type CoordinatedPost = { name: string; x: number; y: number };

function isCoordinatedPost(post: Post): post is CoordinatedPost {
  return typeof post === "object" && post !== null && post.x !== null && post.y !== null;
}

export default function GeoJsonImportModal({ isOpen, onClose, onSubmit }: Props) {
  const [name, setName] = React.useState("");
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = React.useState<string | null>(null);

  // Points and polygon zones are two independent, optional GeoJSON files —
  // ArcGIS (and most GIS tools) export one geometry type per layer, so a
  // "venue map" export is typically a point layer and a polygon layer as
  // separate files. Either can be omitted; a single combined FeatureCollection
  // (mixed Point + Polygon features) also works by uploading it as either file.
  const [pointsFile, setPointsFile] = React.useState<File | null>(null);
  const [pointsCollection, setPointsCollection] = React.useState<GeoJsonFeatureCollection | null>(null);
  const [zonesFile, setZonesFile] = React.useState<File | null>(null);
  const [zonesCollection, setZonesCollection] = React.useState<GeoJsonFeatureCollection | null>(null);

  const [parseError, setParseError] = React.useState<string | null>(null);

  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const pointsInputRef = React.useRef<HTMLInputElement>(null);
  const zonesInputRef = React.useRef<HTMLInputElement>(null);

  const inputClassNames = {
    label: "text-surface-light mb-1",
    inputWrapper: "rounded-2xl px-4 hover:bg-surface-deep",
    input:
      "text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none",
  } as const;

  React.useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // A single shared bounds is derived across both files (rather than each
  // computing its own) so points and zones from separate exports land in
  // the same geographic frame instead of drifting apart on the image.
  const geoBounds = React.useMemo(() => {
    if (!pointsCollection && !zonesCollection) return null;
    return deriveGeoBounds(mergeFeatureCollections([pointsCollection, zonesCollection]));
  }, [pointsCollection, zonesCollection]);

  const { posts: parsedPosts, skipped: skippedPosts } = React.useMemo(() => {
    if (!pointsCollection || !geoBounds) return { posts: [] as Post[], skipped: 0 };
    try {
      return geoJsonToPosts(pointsCollection, geoBounds);
    } catch {
      return { posts: [] as Post[], skipped: 0 };
    }
  }, [pointsCollection, geoBounds]);

  const { zones: parsedZones, skipped: skippedZones } = React.useMemo(() => {
    if (!zonesCollection || !geoBounds) return { zones: [] as Zone[], skipped: 0 };
    try {
      return geoJsonToZones(zonesCollection, geoBounds);
    } catch {
      return { zones: [] as Zone[], skipped: 0 };
    }
  }, [zonesCollection, geoBounds]);

  const parseGeoJsonFile = async (file: File): Promise<GeoJsonFeatureCollection> => {
    const text = await file.text();
    const json = JSON.parse(text);
    if (!isGeoJsonFeatureCollection(json)) {
      throw new Error("File is not a valid GeoJSON FeatureCollection");
    }
    return json;
  };

  const handlePointsFile = async (file: File | null) => {
    setPointsFile(file);
    setPointsCollection(null);
    setParseError(null);
    if (!file) return;
    try {
      setPointsCollection(await parseGeoJsonFile(file));
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Failed to parse GeoJSON file");
    }
  };

  const handleZonesFile = async (file: File | null) => {
    setZonesFile(file);
    setZonesCollection(null);
    setParseError(null);
    if (!file) return;
    try {
      setZonesCollection(await parseGeoJsonFile(file));
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Failed to parse GeoJSON file");
    }
  };

  const reset = () => {
    setName("");
    setImageFile(null);
    setPointsFile(null);
    setPointsCollection(null);
    setZonesFile(null);
    setZonesCollection(null);
    setParseError(null);
  };

  const handleClose = () => {
    onClose();
    reset();
  };

  const canSubmit = !!name.trim() && !!imageFile && !!geoBounds && (parsedPosts.length > 0 || parsedZones.length > 0);

  const handleSubmit = () => {
    if (!name.trim() || !imageFile || !geoBounds) return;
    if (parsedPosts.length === 0 && parsedZones.length === 0) return;
    onSubmit(name.trim(), imageFile, parsedPosts, parsedZones, geoBounds);
    onClose();
    reset();
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={handleClose}
      placement="center"
      backdrop="opaque"
      hideCloseButton
      radius="lg"
      size="2xl"
      classNames={{
        base: "rounded-2xl bg-surface-deepest text-surface-light",
        header: "pb-0",
        body: "py-4",
        footer: "pt-0",
      }}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="text-2xl font-bold text-surface">
              Import GIS Map
            </ModalHeader>

            <ModalBody>
              <Input
                label="Layer name"
                labelPlacement="outside-top"
                variant="bordered"
                size="lg"
                radius="lg"
                classNames={inputClassNames}
                value={name}
                onValueChange={setName}
                aria-label="Layer name"
              />

              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                data-testid="geojson-import-image-input"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              />
              <input
                ref={pointsInputRef}
                type="file"
                accept=".geojson,.json,application/geo+json,application/json"
                className="hidden"
                data-testid="geojson-import-points-input"
                onChange={(e) => handlePointsFile(e.target.files?.[0] ?? null)}
              />
              <input
                ref={zonesInputRef}
                type="file"
                accept=".geojson,.json,application/geo+json,application/json"
                className="hidden"
                data-testid="geojson-import-zones-input"
                onChange={(e) => handleZonesFile(e.target.files?.[0] ?? null)}
              />

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-surface-light">
                    Background Image
                  </label>
                  {imageFile ? (
                    <div className="flex items-center gap-2 rounded-xl border border-default bg-surface-deep p-2">
                      <Upload className="ml-2 h-5 w-5 flex-shrink-0 text-accent" />
                      <span className="truncate text-sm text-surface-light">{imageFile.name}</span>
                      <Button
                        size="sm"
                        variant="light"
                        color="danger"
                        onPress={() => setImageFile(null)}
                        className="ml-auto h-10 w-10 min-w-10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="flex h-24 w-full flex-col items-center justify-center gap-2 rounded-xl border border-default text-surface-light/70 transition hover:border-status-blue/50 hover:text-status-blue"
                    >
                      <Upload className="h-8 w-8" />
                      <p className="text-xs font-medium">Flattened map image</p>
                    </button>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-surface-light">
                    Points (.geojson)
                  </label>
                  {pointsFile ? (
                    <div className="flex items-center gap-2 rounded-xl border border-default bg-surface-deep p-2">
                      <MapPin className="ml-2 h-5 w-5 flex-shrink-0 text-accent" />
                      <span className="truncate text-sm text-surface-light">{pointsFile.name}</span>
                      <Button
                        size="sm"
                        variant="light"
                        color="danger"
                        onPress={() => handlePointsFile(null)}
                        className="ml-auto h-10 w-10 min-w-10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => pointsInputRef.current?.click()}
                      className="flex h-24 w-full flex-col items-center justify-center gap-2 rounded-xl border border-default text-surface-light/70 transition hover:border-status-blue/50 hover:text-status-blue"
                    >
                      <MapPin className="h-8 w-8" />
                      <p className="text-xs font-medium">Point features</p>
                    </button>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-surface-light">
                    Areas (.geojson)
                  </label>
                  {zonesFile ? (
                    <div className="flex items-center gap-2 rounded-xl border border-default bg-surface-deep p-2">
                      <Shapes className="ml-2 h-5 w-5 flex-shrink-0 text-accent" />
                      <span className="truncate text-sm text-surface-light">{zonesFile.name}</span>
                      <Button
                        size="sm"
                        variant="light"
                        color="danger"
                        onPress={() => handleZonesFile(null)}
                        className="ml-auto h-10 w-10 min-w-10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => zonesInputRef.current?.click()}
                      className="flex h-24 w-full flex-col items-center justify-center gap-2 rounded-xl border border-default text-surface-light/70 transition hover:border-status-blue/50 hover:text-status-blue"
                    >
                      <Shapes className="h-8 w-8" />
                      <p className="text-xs font-medium">Polygon features</p>
                    </button>
                  )}
                </div>
              </div>

              <p className="text-xs text-surface-light/50">
                A single combined GeoJSON file (mixed point + polygon features) also works, uploaded as
                either Points or Areas. See <code>docs/examples/venue-map-import.geojson</code> for the
                expected attribute fields per geometry type.
              </p>

              {parseError && (
                <div className="flex items-start gap-2 rounded-xl border border-status-red/40 bg-status-red/10 px-3 py-2 text-xs text-status-red">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}

              {(pointsCollection || zonesCollection) && !geoBounds && (
                <div className="flex items-start gap-2 rounded-xl border border-status-red/40 bg-status-red/10 px-3 py-2 text-xs text-status-red">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>Could not determine geographic bounds. The file(s) have no bbox and no usable features.</span>
                </div>
              )}

              {geoBounds && (parsedPosts.length > 0 || parsedZones.length > 0) && (
                <div className="space-y-2">
                  <p className="text-xs text-surface-light/70">
                    {parsedPosts.length} point{parsedPosts.length === 1 ? "" : "s"} placed
                    {skippedPosts > 0 ? ` · ${skippedPosts} point feature${skippedPosts === 1 ? "" : "s"} skipped` : ""}
                    {" · "}
                    {parsedZones.length} area{parsedZones.length === 1 ? "" : "s"} placed
                    {skippedZones > 0 ? ` · ${skippedZones} polygon feature${skippedZones === 1 ? "" : "s"} skipped` : ""}
                  </p>
                  {imagePreviewUrl && (
                    <div className="max-h-72 overflow-y-auto rounded-xl border border-default bg-surface-deep">
                      <div className="relative inline-block w-full">
                        <Image
                          src={imagePreviewUrl}
                          alt="Background map preview"
                          width={1200}
                          height={900}
                          unoptimized
                          className="block"
                          style={{ display: "block", width: "100%", height: "auto" }}
                        />
                        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                          {parsedZones.map((zone) => (
                            <polygon
                              key={zone.id}
                              points={zone.points.map((p) => `${p.x},${p.y}`).join(" ")}
                              fill={zone.color}
                              fillOpacity={0.28}
                              stroke={zone.color}
                              strokeWidth={2}
                              vectorEffect="non-scaling-stroke"
                            />
                          ))}
                        </svg>
                        <div className="pointer-events-none absolute inset-0">
                          {parsedPosts.filter(isCoordinatedPost).map((post, idx) => (
                            <div
                              key={idx}
                              title={post.name}
                              style={{ left: `calc(${post.x}% - 8px)`, top: `calc(${post.y}% - 8px)` }}
                              className="absolute flex h-4 w-4 items-center justify-center rounded-circle border-2 border-accent bg-accent/30"
                            >
                              <MapPin className="h-2.5 w-2.5 text-accent" strokeWidth={3} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-surface-light/50">
                    Check that markers and areas line up with their real locations before importing. If
                    they look off, the GeoJSON&apos;s bbox likely doesn&apos;t match this image&apos;s extent.
                  </p>
                </div>
              )}
            </ModalBody>

            <ModalFooter>
              <Button variant="flat" onPress={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button
                onPress={handleSubmit}
                className="flex-1 bg-accent hover:bg-accent/90 text-surface-light"
                isDisabled={!canSubmit}
              >
                Import Layer
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
