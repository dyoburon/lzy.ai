"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";
import { getPendingClips, setProcessedClips as storeProcessedClips } from "@/lib/clipStore";

interface Region {
  id: string;
  label: string;
  x: number; // percentage
  y: number; // percentage
  width: number; // percentage
  height: number; // percentage
  color: string;
  aspectLocked: boolean; // whether to maintain aspect ratio during resize
}

interface DragState {
  isDragging: boolean;
  isResizing: boolean;
  regionId: string | null;
  startX: number;
  startY: number;
  startRegionX: number;
  startRegionY: number;
  startRegionWidth: number;
  startRegionHeight: number;
  resizeHandle: string | null;
}

interface Clip {
  moment: {
    start_time: string;
    end_time: string;
    title: string;
    reason: string;
    viral_score: number;
  };
  clip_result: {
    success?: boolean;
    video_data?: string;
    filename?: string;
    duration_seconds?: number;
    file_size?: number;
    error?: string;
  };
}

interface CaptionOptions {
  enabled: boolean;
  words_per_group: number;
  silence_threshold: number; // gap in seconds that forces new caption segment
  word_spacing: number; // spacing between words in pixels
  font_size: number;
  font_name: string;
  primary_color: string;
  highlight_color: string;
  highlight_scale: number;
  position: 'top' | 'middle' | 'bottom';
  position_y: number; // 0-100 percentage from top
  text_style: 'normal' | 'uppercase' | 'capitalize';
  animation_style: 'scale' | 'color' | 'both' | 'bounce' | 'glow';
  outline_enabled: boolean;
  outline_color: string;
  outline_width: number;
  shadow_enabled: boolean;
  shadow_color: string;
  background_enabled: boolean;
  background_color: string;
  background_opacity: number;
}

export default function RegionSelectorPage() {
  const router = useRouter();

  // Clips passed from shorts page
  const [clips, setClips] = useState<Clip[]>([]);
  const [currentClipIndex, setCurrentClipIndex] = useState(0);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);

  // Layout mode state
  const [layoutMode, setLayoutMode] = useState<"stack" | "pip">("stack");

  // Stack mode settings
  const [splitRatio, setSplitRatio] = useState(0.6);
  const [topRegionId, setTopRegionId] = useState("content");

  // PiP mode settings
  const [pipSettings, setPipSettings] = useState({
    backgroundRegionId: "content", // Which region fills the background
    overlayRegionId: "webcam",     // Which region is the overlay
    position: "bottom-right" as "top-left" | "top-right" | "bottom-left" | "bottom-right",
    size: 25, // Percentage of width (10-40%)
    shape: "rounded" as "rounded" | "circle",
    margin: 5, // Percentage margin from edges
  });

  // Calculate the correct aspect ratio for a region based on its split portion
  // Output is 9:16 (1080x1920), source is 16:9
  // For a region taking X% of the output height, its output AR is 9:(16*X)
  // We need to find what dimensions in the 16:9 source match this AR
  const getTargetAspectRatio = useCallback((regionId: string) => {
    const isTop = regionId === topRegionId;
    const portion = isTop ? splitRatio : (1 - splitRatio);
    // Output dimensions for this region: 1080 x (1920 * portion)
    // Output aspect ratio = 1080 / (1920 * portion) = 9 / (16 * portion)
    const outputAR = 9 / (16 * portion);
    // In the source (16:9), we want width:height to match outputAR
    // If source is 1920x1080, and we select W x H pixels:
    // W/H should equal outputAR
    // As percentages of source: (W%/100 * 1920) / (H%/100 * 1080) = outputAR
    // W% * 1920 / (H% * 1080) = outputAR
    // W% / H% = outputAR * 1080 / 1920 = outputAR * 0.5625
    // So in percentage terms: widthPct / heightPct = outputAR * 9/16
    return outputAR * (9 / 16);
  }, [topRegionId, splitRatio]);

  // Calculate initial dimensions for a region to match the output aspect ratio
  const getCorrectDimensions = useCallback((regionId: string, preferHeight: boolean = true) => {
    const targetRatio = getTargetAspectRatio(regionId);
    if (preferHeight) {
      // Start with 100% height, calculate width
      const height = 100;
      const width = Math.min(100, height * targetRatio);
      return { width, height };
    } else {
      // Start with 80% width, calculate height
      const width = 80;
      const height = Math.min(100, width / targetRatio);
      return { width, height };
    }
  }, [getTargetAspectRatio]);

  // Default region template
  const getDefaultRegions = (): Region[] => [
    {
      id: "content",
      label: "Screen Content",
      x: 2,
      y: 0,
      width: 53,
      height: 100,
      color: "#8b5cf6",
      aspectLocked: true,
    },
    {
      id: "webcam",
      label: "Webcam",
      x: 55,
      y: 22,
      width: 44,
      height: 56,
      color: "#22c55e",
      aspectLocked: true,
    },
  ];

  // Per-clip regions - each clip can have different region positions
  const [allClipRegions, setAllClipRegions] = useState<Region[][]>([]);

  // Current clip's regions (derived from allClipRegions)
  const regions = allClipRegions[currentClipIndex] || getDefaultRegions();

  // Update regions for the current clip
  const setRegions = (newRegions: Region[] | ((prev: Region[]) => Region[])) => {
    setAllClipRegions(prev => {
      const updated = [...prev];
      const currentRegions = updated[currentClipIndex] || getDefaultRegions();
      updated[currentClipIndex] = typeof newRegions === 'function'
        ? newRegions(currentRegions)
        : newRegions;
      return updated;
    });
  };

  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    isResizing: false,
    regionId: null,
    startX: 0,
    startY: 0,
    startRegionX: 0,
    startRegionY: 0,
    startRegionWidth: 0,
    startRegionHeight: 0,
    resizeHandle: null,
  });

  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Processing state
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  // Caption options state
  const [captionOptions, setCaptionOptions] = useState<CaptionOptions>({
    enabled: true,
    words_per_group: 3,
    silence_threshold: 0.5, // 500ms gap forces new caption segment
    word_spacing: 8,
    font_size: 56,
    font_name: "Arial Black",
    primary_color: "#ffffff",
    highlight_color: "#fbbf24",
    highlight_scale: 1.3,
    position: "bottom",
    position_y: 85,
    text_style: "normal",
    animation_style: "both",
    outline_enabled: true,
    outline_color: "#000000",
    outline_width: 3,
    shadow_enabled: true,
    shadow_color: "#000000",
    background_enabled: false,
    background_color: "#000000",
    background_opacity: 50,
  });

  // Silence removal options state
  const [silenceRemoval, setSilenceRemoval] = useState({
    enabled: false,
    min_gap_duration: 0.4, // minimum gap in seconds to remove
    padding: 0.05, // padding to keep around speech segments
  });

  // For caption preview animation
  const [previewWordIndex, setPreviewWordIndex] = useState(0);
  const previewWords = ["This", "is", "how", "your", "captions", "will", "look"];

  // Animate preview words
  useEffect(() => {
    if (!captionOptions.enabled) return;
    const interval = setInterval(() => {
      setPreviewWordIndex((prev) => (prev + 1) % previewWords.length);
    }, 600);
    return () => clearInterval(interval);
  }, [captionOptions.enabled, previewWords.length]);

  // Load clips from in-memory store on mount
  useEffect(() => {
    const pendingClips = getPendingClips();
    if (pendingClips && pendingClips.length > 0) {
      setClips(pendingClips);
      // Initialize per-clip regions with defaults for each clip
      setAllClipRegions(pendingClips.map(() => getDefaultRegions()));
      // Create preview URL for first clip
      if (pendingClips[0].clip_result?.video_data) {
        const blob = base64ToBlob(pendingClips[0].clip_result.video_data, "video/mp4");
        setVideoPreviewUrl(URL.createObjectURL(blob));
      }
    }
  }, []);

  // Update preview when clip index changes
  useEffect(() => {
    if (clips[currentClipIndex]?.clip_result?.video_data) {
      const blob = base64ToBlob(clips[currentClipIndex].clip_result.video_data, "video/mp4");
      const url = URL.createObjectURL(blob);
      setVideoPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [currentClipIndex, clips]);

  const base64ToBlob = (base64: string, mimeType: string): Blob => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  };

  const getMousePosition = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, regionId: string, handle?: string) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = getMousePosition(e);
      const region = regions.find((r) => r.id === regionId);
      if (!region) return;

      setSelectedRegion(regionId);

      if (handle) {
        setDragState({
          isDragging: false,
          isResizing: true,
          regionId,
          startX: pos.x,
          startY: pos.y,
          startRegionX: region.x,
          startRegionY: region.y,
          startRegionWidth: region.width,
          startRegionHeight: region.height,
          resizeHandle: handle,
        });
      } else {
        setDragState({
          isDragging: true,
          isResizing: false,
          regionId,
          startX: pos.x,
          startY: pos.y,
          startRegionX: region.x,
          startRegionY: region.y,
          startRegionWidth: region.width,
          startRegionHeight: region.height,
          resizeHandle: null,
        });
      }
    },
    [regions, getMousePosition]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragState.isDragging && !dragState.isResizing) return;
      if (!dragState.regionId) return;

      const pos = getMousePosition(e);
      const deltaX = pos.x - dragState.startX;
      const deltaY = pos.y - dragState.startY;

      setRegions((prev) =>
        prev.map((region) => {
          if (region.id !== dragState.regionId) return region;

          if (dragState.isDragging) {
            let newX = dragState.startRegionX + deltaX;
            let newY = dragState.startRegionY + deltaY;
            newX = Math.max(0, Math.min(100 - region.width, newX));
            newY = Math.max(0, Math.min(100 - region.height, newY));
            return { ...region, x: newX, y: newY };
          } else if (dragState.isResizing && dragState.resizeHandle) {
            let newX = region.x;
            let newY = region.y;
            let newWidth = region.width;
            let newHeight = region.height;

            const handle = dragState.resizeHandle;
            const targetRatio = getTargetAspectRatio(region.id);

            // First calculate the unconstrained new dimensions
            if (handle.includes("e")) {
              newWidth = Math.max(10, Math.min(100 - dragState.startRegionX, dragState.startRegionWidth + deltaX));
            }
            if (handle.includes("w")) {
              const widthDelta = -deltaX;
              newWidth = Math.max(10, dragState.startRegionWidth + widthDelta);
              newX = dragState.startRegionX - (newWidth - dragState.startRegionWidth);
              newX = Math.max(0, newX);
            }
            if (handle.includes("s")) {
              newHeight = Math.max(10, Math.min(100 - dragState.startRegionY, dragState.startRegionHeight + deltaY));
            }
            if (handle.includes("n")) {
              const heightDelta = -deltaY;
              newHeight = Math.max(10, dragState.startRegionHeight + heightDelta);
              newY = dragState.startRegionY - (newHeight - dragState.startRegionHeight);
              newY = Math.max(0, newY);
            }

            // If aspect locked, constrain dimensions
            if (region.aspectLocked) {
              const isCorner = handle.length === 2;
              const isHorizontal = handle === "e" || handle === "w";
              const isVertical = handle === "n" || handle === "s";

              if (isCorner) {
                // For corners, use the larger delta to determine size
                const widthFromHeight = newHeight * targetRatio;
                const heightFromWidth = newWidth / targetRatio;

                if (Math.abs(deltaX) > Math.abs(deltaY)) {
                  // Width is primary, adjust height
                  newHeight = Math.min(100, heightFromWidth);
                  newWidth = newHeight * targetRatio;
                } else {
                  // Height is primary, adjust width
                  newWidth = Math.min(100, widthFromHeight);
                  newHeight = newWidth / targetRatio;
                }
              } else if (isHorizontal) {
                // Width changed, adjust height
                newHeight = newWidth / targetRatio;
                newHeight = Math.min(100, Math.max(10, newHeight));
                newWidth = newHeight * targetRatio;
              } else if (isVertical) {
                // Height changed, adjust width
                newWidth = newHeight * targetRatio;
                newWidth = Math.min(100, Math.max(10, newWidth));
                newHeight = newWidth / targetRatio;
              }

              // Recalculate position for handles that move the origin
              if (handle.includes("w")) {
                newX = dragState.startRegionX + dragState.startRegionWidth - newWidth;
                newX = Math.max(0, newX);
              }
              if (handle.includes("n")) {
                newY = dragState.startRegionY + dragState.startRegionHeight - newHeight;
                newY = Math.max(0, newY);
              }
            }

            // Ensure we stay within bounds
            newWidth = Math.min(100 - newX, newWidth);
            newHeight = Math.min(100 - newY, newHeight);

            return { ...region, x: newX, y: newY, width: newWidth, height: newHeight };
          }

          return region;
        })
      );
    },
    [dragState, getMousePosition, getTargetAspectRatio]
  );

  const handleMouseUp = useCallback(() => {
    setDragState({
      isDragging: false,
      isResizing: false,
      regionId: null,
      startX: 0,
      startY: 0,
      startRegionX: 0,
      startRegionY: 0,
      startRegionWidth: 0,
      startRegionHeight: 0,
      resizeHandle: null,
    });
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const swapRegions = () => {
    setTopRegionId((prev) => (prev === "content" ? "webcam" : "content"));
  };

  // Recalculate locked region dimensions when split ratio or top region changes
  const recalculateLockedRegions = useCallback(() => {
    setRegions(prev => prev.map(region => {
      if (!region.aspectLocked) return region;
      const targetRatio = getTargetAspectRatio(region.id);
      // Keep the same height, adjust width to match target ratio
      const newWidth = Math.min(100, region.height * targetRatio);
      return { ...region, width: newWidth };
    }));
  }, [getTargetAspectRatio]);

  // Effect to update locked regions when split ratio changes
  useEffect(() => {
    recalculateLockedRegions();
  }, [splitRatio, topRegionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const topRegion = regions.find((r) => r.id === topRegionId);
  const bottomRegion = regions.find((r) => r.id !== topRegionId);

  const handleProcessClips = async () => {
    if (clips.length === 0) {
      setError("No clips to process");
      return;
    }

    setProcessing(true);
    setError("");

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5005"}/api/shorts/process-vertical`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clips: clips,
            // Send per-clip regions - each clip gets its own region positions
            all_clip_regions: allClipRegions.map((clipRegions) =>
              clipRegions.map((r) => ({
                id: r.id,
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
              }))
            ),
            layout_mode: layoutMode,
            layout: {
              topRegionId,
              splitRatio,
            },
            pip_settings: layoutMode === "pip" ? pipSettings : undefined,
            caption_options: captionOptions,
            silence_removal: silenceRemoval,
          }),
        }
      );

      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else if (data.processed_clips) {
        // Store processed clips in memory and navigate to results page
        storeProcessedClips(data.processed_clips);
        router.push("/region-selector/results");
      }
    } catch (err) {
      setError("Failed to connect to server. Make sure the backend is running.");
    } finally {
      setProcessing(false);
    }
  };

  // If no clips, show empty state
  if (clips.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
        <header className="border-b border-zinc-700/50">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-2xl font-bold text-white">
                lzy<span className="text-purple-500">.ai</span>
              </Link>
              <span className="text-zinc-600">/</span>
              <span className="text-zinc-400">Region Selector</span>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-6 py-20 text-center">
          <div className="p-8 bg-zinc-800/50 border border-zinc-700 rounded-lg">
            <h2 className="text-2xl font-bold text-white mb-4">No Clips to Process</h2>
            <p className="text-zinc-400 mb-6">
              First, use the Shorts Clipper to detect and clip interesting moments from your video.
            </p>
            <Link
              href="/shorts"
              className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
            >
              Go to Shorts Clipper
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // Main region selection UI
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
      <header className="border-b border-zinc-700/50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-xl font-bold text-white">
              lzy<span className="text-purple-500">.ai</span>
            </Link>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400">Region Selector</span>
          </div>
          <Link
            href="/shorts"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Back to Shorts
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-5">
        {error && (
          <div className="mb-4 p-2 bg-red-900/30 border border-red-700 rounded text-red-400 text-center text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Video with Selection Boxes */}
          <div className="lg:col-span-2">
            <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-semibold text-white">Select Regions</h2>
                  <span className="text-xs text-zinc-500">Drag to move, corners to resize</span>
                </div>
                {/* Clip selector */}
                {clips.length > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentClipIndex(Math.max(0, currentClipIndex - 1))}
                      disabled={currentClipIndex === 0}
                      className="p-0.5 text-zinc-400 hover:text-white disabled:text-zinc-600 disabled:cursor-not-allowed"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <span className="text-zinc-400 text-xs">
                      {currentClipIndex + 1}/{clips.length}
                    </span>
                    <button
                      onClick={() => setCurrentClipIndex(Math.min(clips.length - 1, currentClipIndex + 1))}
                      disabled={currentClipIndex === clips.length - 1}
                      className="p-0.5 text-zinc-400 hover:text-white disabled:text-zinc-600 disabled:cursor-not-allowed"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* Video Container with Selection Overlay */}
              <div
                ref={containerRef}
                className="relative aspect-video bg-black rounded-lg overflow-hidden select-none"
              >
                {/* Video Preview */}
                {videoPreviewUrl && (
                  <video
                    src={videoPreviewUrl}
                    className="absolute inset-0 w-full h-full object-contain"
                    controls={false}
                    muted
                    loop
                    autoPlay
                  />
                )}

                {/* Selection Boxes Overlay */}
                <div className="absolute inset-0">
                  {regions.map((region) => (
                    <div
                      key={region.id}
                      className={`absolute cursor-move ${selectedRegion === region.id
                        ? "ring-2 ring-white ring-offset-2 ring-offset-transparent"
                        : ""
                        }`}
                      style={{
                        left: `${region.x}%`,
                        top: `${region.y}%`,
                        width: `${region.width}%`,
                        height: `${region.height}%`,
                        backgroundColor: `${region.color}33`,
                        border: `2px solid ${region.color}`,
                      }}
                      onMouseDown={(e) => handleMouseDown(e, region.id)}
                    >
                      <div
                        className="absolute -top-6 left-0 px-2 py-0.5 text-xs font-medium text-white rounded flex items-center gap-1"
                        style={{ backgroundColor: region.color }}
                      >
                        {region.label}
                        {!region.aspectLocked && (
                          <span className="text-[10px] opacity-75" title="Will stretch to fit">↔</span>
                        )}
                      </div>

                      {selectedRegion === region.id && (
                        <>
                          <div className="absolute -top-1 -left-1 w-3 h-3 bg-white rounded-full cursor-nw-resize" onMouseDown={(e) => handleMouseDown(e, region.id, "nw")} />
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full cursor-ne-resize" onMouseDown={(e) => handleMouseDown(e, region.id, "ne")} />
                          <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-white rounded-full cursor-sw-resize" onMouseDown={(e) => handleMouseDown(e, region.id, "sw")} />
                          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-white rounded-full cursor-se-resize" onMouseDown={(e) => handleMouseDown(e, region.id, "se")} />
                          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full cursor-n-resize" onMouseDown={(e) => handleMouseDown(e, region.id, "n")} />
                          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full cursor-s-resize" onMouseDown={(e) => handleMouseDown(e, region.id, "s")} />
                          <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-3 h-3 bg-white rounded-full cursor-w-resize" onMouseDown={(e) => handleMouseDown(e, region.id, "w")} />
                          <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-3 h-3 bg-white rounded-full cursor-e-resize" onMouseDown={(e) => handleMouseDown(e, region.id, "e")} />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Clip Info + Region Legend Row */}
              <div className="flex items-center justify-between mt-3">
                {clips[currentClipIndex] && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-white font-medium truncate max-w-[250px]">{clips[currentClipIndex].moment.title}</span>
                    <span className="text-zinc-500 text-xs">
                      {clips[currentClipIndex].moment.start_time} - {clips[currentClipIndex].moment.end_time}
                    </span>
                  </div>
                )}
                <div className="flex gap-2">
                  {regions.map((region) => (
                    <div key={region.id} className="flex items-center gap-1">
                      <button
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-l text-sm cursor-pointer transition-colors ${selectedRegion === region.id ? "bg-zinc-600" : "bg-zinc-800 hover:bg-zinc-700"}`}
                        onClick={() => setSelectedRegion(region.id)}
                      >
                        <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: region.color }} />
                        <span className="text-white">{region.label}</span>
                      </button>
                      <button
                        onClick={() => setRegions(prev => prev.map(r => r.id === region.id ? { ...r, aspectLocked: !r.aspectLocked } : r))}
                        className={`px-2 py-1.5 rounded-r text-sm transition-colors ${region.aspectLocked ? "bg-purple-600 text-white" : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"}`}
                        title={region.aspectLocked ? "Aspect ratio locked (no stretching)" : "Aspect ratio unlocked (will stretch to fit)"}
                      >
                        {region.aspectLocked ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Process Button - Full Width */}
              <button
                onClick={handleProcessClips}
                disabled={processing}
                className="w-full mt-3 px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {processing ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Processing {clips.length} clip{clips.length !== 1 ? "s" : ""}...
                  </>
                ) : (
                  <>Create {clips.length} Vertical Short{clips.length !== 1 ? "s" : ""}</>
                )}
              </button>
            </div>
          </div>

          {/* Preview & Controls */}
          <div className="space-y-3">
            {/* Layout Mode + Controls + Preview */}
            <div className="p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-white">Layout</h3>
              </div>

              {/* Mode Selector */}
              <div className="flex gap-1.5 mb-3">
                <button
                  onClick={() => setLayoutMode("stack")}
                  className={`flex-1 px-2 py-1.5 text-xs rounded transition-colors ${
                    layoutMode === "stack"
                      ? "bg-purple-600 text-white"
                      : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                  }`}
                >
                  Stack
                </button>
                <button
                  onClick={() => setLayoutMode("pip")}
                  className={`flex-1 px-2 py-1.5 text-xs rounded transition-colors ${
                    layoutMode === "pip"
                      ? "bg-purple-600 text-white"
                      : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                  }`}
                >
                  Picture-in-Picture
                </button>
              </div>

              {/* Stack Mode Controls */}
              {layoutMode === "stack" && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-zinc-400">Regions</span>
                    <button
                      onClick={swapRegions}
                      className="p-1 bg-zinc-700 hover:bg-zinc-600 rounded transition-colors"
                      title="Swap positions"
                    >
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex gap-2 mb-2">
                    <div
                      className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded text-xs"
                      style={{ backgroundColor: `${topRegion?.color}22`, border: `1px solid ${topRegion?.color}` }}
                    >
                      <div className="w-2 h-2 rounded" style={{ backgroundColor: topRegion?.color }} />
                      <span className="text-white">{topRegion?.label}</span>
                      <span className="text-zinc-400 ml-auto">{Math.round(splitRatio * 100)}%</span>
                    </div>
                    <div
                      className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded text-xs"
                      style={{ backgroundColor: `${bottomRegion?.color}22`, border: `1px solid ${bottomRegion?.color}` }}
                    >
                      <div className="w-2 h-2 rounded" style={{ backgroundColor: bottomRegion?.color }} />
                      <span className="text-white">{bottomRegion?.label}</span>
                      <span className="text-zinc-400 ml-auto">{Math.round((1 - splitRatio) * 100)}%</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {[50, 60, 70].map((ratio) => (
                      <button
                        key={ratio}
                        onClick={() => setSplitRatio(ratio / 100)}
                        className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${Math.round(splitRatio * 100) === ratio
                          ? "bg-purple-600 text-white"
                          : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                          }`}
                      >
                        {ratio}/{100 - ratio}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* PiP Mode Controls */}
              {layoutMode === "pip" && (
                <div className="space-y-3">
                  {/* Background/Overlay Selection */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400 w-16">Background</span>
                      <div
                        className="flex-1 flex items-center gap-1.5 px-2 py-1 rounded text-xs"
                        style={{
                          backgroundColor: `${regions.find(r => r.id === pipSettings.backgroundRegionId)?.color}22`,
                          border: `1px solid ${regions.find(r => r.id === pipSettings.backgroundRegionId)?.color}`
                        }}
                      >
                        <div className="w-2 h-2 rounded" style={{ backgroundColor: regions.find(r => r.id === pipSettings.backgroundRegionId)?.color }} />
                        <span className="text-white">{regions.find(r => r.id === pipSettings.backgroundRegionId)?.label}</span>
                      </div>
                      <button
                        onClick={() => setPipSettings(prev => ({
                          ...prev,
                          backgroundRegionId: prev.overlayRegionId,
                          overlayRegionId: prev.backgroundRegionId
                        }))}
                        className="p-1 bg-zinc-700 hover:bg-zinc-600 rounded transition-colors"
                        title="Swap"
                      >
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                        </svg>
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400 w-16">Overlay</span>
                      <div
                        className="flex-1 flex items-center gap-1.5 px-2 py-1 rounded text-xs"
                        style={{
                          backgroundColor: `${regions.find(r => r.id === pipSettings.overlayRegionId)?.color}22`,
                          border: `1px solid ${regions.find(r => r.id === pipSettings.overlayRegionId)?.color}`
                        }}
                      >
                        <div className="w-2 h-2 rounded" style={{ backgroundColor: regions.find(r => r.id === pipSettings.overlayRegionId)?.color }} />
                        <span className="text-white">{regions.find(r => r.id === pipSettings.overlayRegionId)?.label}</span>
                      </div>
                    </div>
                  </div>

                  {/* Corner Position */}
                  <div>
                    <span className="text-xs text-zinc-400">Position</span>
                    <div className="grid grid-cols-2 gap-1.5 mt-1">
                      {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map((pos) => (
                        <button
                          key={pos}
                          onClick={() => setPipSettings(prev => ({ ...prev, position: pos }))}
                          className={`px-2 py-1 text-xs rounded transition-colors ${
                            pipSettings.position === pos
                              ? "bg-purple-600 text-white"
                              : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                          }`}
                        >
                          {pos.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Size Slider */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-400">Overlay Size</span>
                      <span className="text-xs text-purple-400 font-mono">{pipSettings.size}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="40"
                      step="5"
                      value={pipSettings.size}
                      onChange={(e) => setPipSettings(prev => ({ ...prev, size: parseInt(e.target.value) }))}
                      className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>

                  {/* Shape */}
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setPipSettings(prev => ({ ...prev, shape: "rounded" }))}
                      className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                        pipSettings.shape === "rounded"
                          ? "bg-purple-600 text-white"
                          : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                      }`}
                    >
                      Rounded
                    </button>
                    <button
                      onClick={() => setPipSettings(prev => ({ ...prev, shape: "circle" }))}
                      className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                        pipSettings.shape === "circle"
                          ? "bg-purple-600 text-white"
                          : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                      }`}
                    >
                      Circle
                    </button>
                  </div>
                </div>
              )}

              {/* Layout Preview - Centered */}
              <div className="flex flex-col items-center pt-3 mt-3 border-t border-zinc-700">
                <div
                  className="relative w-16 bg-zinc-900 rounded overflow-hidden border border-zinc-600"
                  style={{ aspectRatio: "9/16" }}
                >
                  {layoutMode === "stack" ? (
                    <>
                      <div
                        className="w-full flex items-center justify-center text-[10px] text-white"
                        style={{
                          height: `${splitRatio * 100}%`,
                          backgroundColor: `${topRegion?.color}66`,
                          borderBottom: "1px solid rgba(255,255,255,0.2)",
                        }}
                      >
                        {topRegion?.label.split(" ")[0]}
                      </div>
                      <div
                        className="w-full flex items-center justify-center text-[10px] text-white"
                        style={{
                          height: `${(1 - splitRatio) * 100}%`,
                          backgroundColor: `${bottomRegion?.color}66`,
                        }}
                      >
                        {bottomRegion?.label.split(" ")[0]}
                      </div>
                    </>
                  ) : (
                    <>
                      {/* PiP Preview */}
                      <div
                        className="absolute inset-0 flex items-center justify-center text-[8px] text-white"
                        style={{ backgroundColor: `${regions.find(r => r.id === pipSettings.backgroundRegionId)?.color}66` }}
                      >
                        {regions.find(r => r.id === pipSettings.backgroundRegionId)?.label.split(" ")[0]}
                      </div>
                      <div
                        className={`absolute flex items-center justify-center text-[6px] text-white ${
                          pipSettings.shape === "circle" ? "rounded-full" : "rounded"
                        }`}
                        style={{
                          width: `${pipSettings.size}%`,
                          aspectRatio: pipSettings.shape === "circle" ? "1/1" : "4/3",
                          backgroundColor: `${regions.find(r => r.id === pipSettings.overlayRegionId)?.color}`,
                          border: "1px solid rgba(255,255,255,0.3)",
                          ...(pipSettings.position === "top-left" && { top: "4px", left: "4px" }),
                          ...(pipSettings.position === "top-right" && { top: "4px", right: "4px" }),
                          ...(pipSettings.position === "bottom-left" && { bottom: "4px", left: "4px" }),
                          ...(pipSettings.position === "bottom-right" && { bottom: "4px", right: "4px" }),
                        }}
                      >
                      </div>
                    </>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-2">1080×1920</p>
              </div>
            </div>

            {/* Animated Captions */}
            <div className="p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-white">Captions</h3>
                <button
                  onClick={() => setCaptionOptions(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${captionOptions.enabled ? "bg-purple-600" : "bg-zinc-600"}`}
                >
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${captionOptions.enabled ? "translate-x-5" : "translate-x-1"}`} />
                </button>
              </div>

              {captionOptions.enabled && (
                <div className="space-y-2">
                  {/* Caption Preview - Phone mockup */}
                  {/* Output is 1080x1920, preview is 120px wide = 9x scale factor */}
                  <div className="flex justify-center mb-3">
                    <div
                      className="relative bg-zinc-900 rounded-lg overflow-hidden border border-zinc-600"
                      style={{ width: "120px", aspectRatio: "9/16" }}
                    >
                      {/* Phone content area with caption */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-full h-full bg-gradient-to-b from-zinc-800 to-zinc-900" />
                      </div>
                      {/* Caption overlay at position */}
                      <div
                        className="absolute left-0 right-0 flex justify-center px-1 pointer-events-none"
                        style={{ top: `${captionOptions.position_y}%`, transform: "translateY(-50%)" }}
                      >
                        <div
                          className="px-1 py-0.5 rounded"
                          style={{
                            backgroundColor: captionOptions.background_enabled
                              ? (() => {
                                  // Parse hex color to rgba
                                  const hex = captionOptions.background_color.replace('#', '');
                                  const r = parseInt(hex.substring(0, 2), 16);
                                  const g = parseInt(hex.substring(2, 4), 16);
                                  const b = parseInt(hex.substring(4, 6), 16);
                                  return `rgba(${r},${g},${b},${captionOptions.background_opacity / 100})`;
                                })()
                              : 'transparent'
                          }}
                        >
                          {/* Scale factor: 1080/120 = 9, so divide all pixel values by 9 */}
                          <span className="flex justify-center flex-wrap" style={{ gap: `${Math.max(1, Math.round(captionOptions.word_spacing / 9))}px` }}>
                            {(() => {
                              const SCALE = 9; // 1080px output / 120px preview
                              const fontMap: Record<string, string> = {
                                "Arial": "Arial, sans-serif",
                                "Arial Black": "'Arial Black', sans-serif",
                                "Verdana": "Verdana, sans-serif",
                                "Tahoma": "Tahoma, sans-serif",
                                "Trebuchet MS": "'Trebuchet MS', sans-serif",
                                "Georgia": "Georgia, serif",
                                "Times New Roman": "'Times New Roman', serif",
                                "Courier New": "'Courier New', monospace",
                                "Impact": "Impact, sans-serif",
                                "Comic Sans MS": "'Comic Sans MS', cursive",
                                "Helvetica": "Helvetica, Arial, sans-serif",
                                "Palatino": "'Palatino Linotype', Palatino, serif",
                                "Lucida Console": "'Lucida Console', Monaco, monospace",
                                "Lucida Sans": "'Lucida Sans Unicode', 'Lucida Grande', sans-serif",
                                "Garamond": "Garamond, serif",
                                "Bookman": "'Bookman Old Style', serif",
                                "Avant Garde": "'Century Gothic', 'Avant Garde', sans-serif",
                              };
                              const startIdx = Math.floor(previewWordIndex / captionOptions.words_per_group) * captionOptions.words_per_group;
                              return previewWords.slice(startIdx, startIdx + captionOptions.words_per_group).map((word, idx) => {
                                const isActive = idx === previewWordIndex % captionOptions.words_per_group;
                                const textColor = isActive ? captionOptions.highlight_color : captionOptions.primary_color;
                                const displayText = captionOptions.text_style === "uppercase" ? word.toUpperCase() : word;
                                // Scale font size for preview
                                const previewFontSize = Math.max(6, Math.round(captionOptions.font_size / SCALE));
                                const previewOutlineWidth = Math.max(0.3, captionOptions.outline_width / SCALE);
                                return (
                                  <span
                                    key={idx}
                                    className="transition-all duration-150"
                                    style={{
                                      fontFamily: fontMap[captionOptions.font_name] || "Arial, sans-serif",
                                      fontWeight: "bold",
                                      fontSize: `${previewFontSize}px`,
                                      color: textColor,
                                      transform: isActive && (captionOptions.animation_style === "scale" || captionOptions.animation_style === "both") ? `scale(${captionOptions.highlight_scale})` : "scale(1)",
                                      textShadow: captionOptions.shadow_enabled
                                        ? `1px 1px 1px ${captionOptions.shadow_color}`
                                        : captionOptions.animation_style === "glow" && isActive
                                          ? `0 0 3px ${textColor}, 0 0 6px ${textColor}`
                                          : "none",
                                      WebkitTextStroke: captionOptions.outline_enabled ? `${previewOutlineWidth}px ${captionOptions.outline_color}` : "0",
                                    }}
                                  >
                                    {displayText}
                                  </span>
                                );
                              });
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Controls Grid */}
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                    {/* Font */}
                    <div>
                      <label className="block text-xs text-zinc-500 mb-0.5">Font</label>
                      <select
                        value={captionOptions.font_name}
                        onChange={(e) => setCaptionOptions(prev => ({ ...prev, font_name: e.target.value }))}
                        className="w-full px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-white text-xs focus:outline-none"
                      >
                        <optgroup label="Sans-Serif">
                          <option value="Arial">Arial</option>
                          <option value="Arial Black">Arial Black</option>
                          <option value="Helvetica">Helvetica</option>
                          <option value="Verdana">Verdana</option>
                          <option value="Tahoma">Tahoma</option>
                          <option value="Trebuchet MS">Trebuchet MS</option>
                          <option value="Lucida Sans">Lucida Sans</option>
                          <option value="Avant Garde">Avant Garde</option>
                        </optgroup>
                        <optgroup label="Serif">
                          <option value="Georgia">Georgia</option>
                          <option value="Times New Roman">Times New Roman</option>
                          <option value="Palatino">Palatino</option>
                          <option value="Garamond">Garamond</option>
                          <option value="Bookman">Bookman</option>
                        </optgroup>
                        <optgroup label="Display">
                          <option value="Impact">Impact</option>
                        </optgroup>
                        <optgroup label="Monospace">
                          <option value="Courier New">Courier New</option>
                          <option value="Lucida Console">Lucida Console</option>
                        </optgroup>
                        <optgroup label="Other">
                          <option value="Comic Sans MS">Comic Sans MS</option>
                        </optgroup>
                      </select>
                    </div>
                    {/* Size */}
                    <div>
                      <label className="block text-xs text-zinc-500 mb-0.5">Size: {captionOptions.font_size}px</label>
                      <input type="range" min="32" max="96" step="4" value={captionOptions.font_size}
                        onChange={(e) => setCaptionOptions(prev => ({ ...prev, font_size: parseInt(e.target.value) }))}
                        className="w-full accent-purple-500 h-1.5" />
                    </div>
                    {/* Position */}
                    <div>
                      <label className="block text-xs text-zinc-500 mb-0.5">Position: {captionOptions.position_y}%</label>
                      <input type="range" min="10" max="90" value={captionOptions.position_y}
                        onChange={(e) => setCaptionOptions(prev => ({ ...prev, position_y: parseInt(e.target.value) }))}
                        className="w-full accent-purple-500 h-1.5" />
                    </div>
                    {/* Words */}
                    <div>
                      <label className="block text-xs text-zinc-500 mb-0.5">Words: {captionOptions.words_per_group}</label>
                      <input type="range" min="1" max="5" value={captionOptions.words_per_group}
                        onChange={(e) => setCaptionOptions(prev => ({ ...prev, words_per_group: parseInt(e.target.value) }))}
                        className="w-full accent-purple-500 h-1.5" />
                    </div>
                    {/* Word Spacing */}
                    <div className="col-span-2">
                      <label className="block text-xs text-zinc-500 mb-0.5">Word Spacing: {captionOptions.word_spacing}px</label>
                      <input type="range" min="0" max="60" value={captionOptions.word_spacing}
                        onChange={(e) => setCaptionOptions(prev => ({ ...prev, word_spacing: parseInt(e.target.value) }))}
                        className="w-full accent-purple-500 h-1.5" />
                    </div>
                  </div>

                  {/* Style + Effect Row */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {(["normal", "uppercase"] as const).map((style) => (
                      <button
                        key={style}
                        onClick={() => setCaptionOptions(prev => ({ ...prev, text_style: style }))}
                        className={`px-2 py-1 text-xs rounded transition-colors ${captionOptions.text_style === style ? "bg-purple-600 text-white" : "bg-zinc-700 text-zinc-400"}`}
                      >
                        {style === "normal" ? "Aa" : "AA"}
                      </button>
                    ))}
                    <span className="text-zinc-600 mx-1">|</span>
                    {(["scale", "color", "both"] as const).map((anim) => (
                      <button
                        key={anim}
                        onClick={() => setCaptionOptions(prev => ({ ...prev, animation_style: anim }))}
                        className={`px-1.5 py-1 text-xs rounded transition-colors ${captionOptions.animation_style === anim ? "bg-purple-600 text-white" : "bg-zinc-700 text-zinc-400"}`}
                      >
                        {anim.charAt(0).toUpperCase() + anim.slice(1)}
                      </button>
                    ))}
                  </div>

                  {/* Colors Row */}
                  <div className="grid grid-cols-2 gap-2">
                    {/* Text Color */}
                    <div className="relative">
                      <label className="block text-xs text-zinc-500 mb-1">Text Color</label>
                      <div className="flex items-center gap-1">
                        <div className="relative">
                          <input
                            type="color"
                            value={captionOptions.primary_color}
                            onChange={(e) => setCaptionOptions(prev => ({ ...prev, primary_color: e.target.value }))}
                            className="w-8 h-8 rounded cursor-pointer border-2 border-zinc-600 bg-transparent"
                          />
                        </div>
                        <input
                          type="text"
                          value={captionOptions.primary_color.toUpperCase()}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                              setCaptionOptions(prev => ({ ...prev, primary_color: val }));
                            }
                          }}
                          className="flex-1 px-1.5 py-1 bg-zinc-700 border border-zinc-600 rounded text-white text-xs font-mono focus:outline-none focus:border-purple-500 w-16"
                          maxLength={7}
                        />
                      </div>
                      {/* Quick presets */}
                      <div className="flex gap-1 mt-1">
                        {["#FFFFFF", "#FBBF24", "#22D3EE", "#22C55E", "#EC4899"].map((color) => (
                          <button
                            key={color}
                            onClick={() => setCaptionOptions(prev => ({ ...prev, primary_color: color }))}
                            className={`w-4 h-4 rounded-full border ${captionOptions.primary_color.toUpperCase() === color ? "border-purple-500 scale-110" : "border-zinc-600"}`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                    {/* Highlight Color */}
                    <div className="relative">
                      <label className="block text-xs text-zinc-500 mb-1">Highlight Color</label>
                      <div className="flex items-center gap-1">
                        <div className="relative">
                          <input
                            type="color"
                            value={captionOptions.highlight_color}
                            onChange={(e) => setCaptionOptions(prev => ({ ...prev, highlight_color: e.target.value }))}
                            className="w-8 h-8 rounded cursor-pointer border-2 border-zinc-600 bg-transparent"
                          />
                        </div>
                        <input
                          type="text"
                          value={captionOptions.highlight_color.toUpperCase()}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                              setCaptionOptions(prev => ({ ...prev, highlight_color: val }));
                            }
                          }}
                          className="flex-1 px-1.5 py-1 bg-zinc-700 border border-zinc-600 rounded text-white text-xs font-mono focus:outline-none focus:border-purple-500 w-16"
                          maxLength={7}
                        />
                      </div>
                      {/* Quick presets */}
                      <div className="flex gap-1 mt-1">
                        {["#FBBF24", "#22D3EE", "#22C55E", "#EC4899", "#EF4444"].map((color) => (
                          <button
                            key={color}
                            onClick={() => setCaptionOptions(prev => ({ ...prev, highlight_color: color }))}
                            className={`w-4 h-4 rounded-full border ${captionOptions.highlight_color.toUpperCase() === color ? "border-purple-500 scale-110" : "border-zinc-600"}`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Effects Toggles */}
                  <div className="flex gap-1.5">
                    {[
                      { key: "outline_enabled", label: "Outline" },
                      { key: "shadow_enabled", label: "Shadow" },
                      { key: "background_enabled", label: "BG Box" }
                    ].map((effect) => (
                      <button
                        key={effect.key}
                        onClick={() => setCaptionOptions(prev => ({ ...prev, [effect.key]: !prev[effect.key as keyof CaptionOptions] }))}
                        className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${captionOptions[effect.key as keyof CaptionOptions] ? "bg-purple-600 text-white" : "bg-zinc-700 text-zinc-400"}`}
                      >
                        {effect.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!captionOptions.enabled && (
                <p className="text-xs text-zinc-500">Enable to add animated captions.</p>
              )}
            </div>

            {/* Silence Removal / Jump Cuts */}
            <div className="p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-white">Remove Gaps</h3>
                <button
                  onClick={() => setSilenceRemoval(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${silenceRemoval.enabled ? "bg-purple-600" : "bg-zinc-600"}`}
                >
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${silenceRemoval.enabled ? "translate-x-5" : "translate-x-1"}`} />
                </button>
              </div>

              {silenceRemoval.enabled ? (
                <div className="space-y-3">
                  <p className="text-xs text-zinc-400">
                    Automatically removes pauses and gaps between speech using AI transcription.
                  </p>

                  {/* Min Gap Duration Slider */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-zinc-400">Minimum Gap</label>
                      <span className="text-xs text-purple-400 font-mono">{silenceRemoval.min_gap_duration.toFixed(1)}s</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1.5"
                      step="0.1"
                      value={silenceRemoval.min_gap_duration}
                      onChange={(e) => setSilenceRemoval(prev => ({ ...prev, min_gap_duration: parseFloat(e.target.value) }))}
                      className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                    <div className="flex justify-between text-[10px] text-zinc-600">
                      <span>Aggressive</span>
                      <span>Conservative</span>
                    </div>
                  </div>

                  <p className="text-[10px] text-zinc-500">
                    Gaps longer than {silenceRemoval.min_gap_duration}s will be cut out.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-zinc-500">Enable to create jump cuts by removing silent gaps.</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
