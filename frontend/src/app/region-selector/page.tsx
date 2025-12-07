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

  // Region selection state
  const [splitRatio, setSplitRatio] = useState(0.6);
  const [topRegionId, setTopRegionId] = useState("content");
  // Default regions sized to match 9:16 output with 60/40 split
  // For 60% top: output AR is 9:(16*0.6)=9:9.6. In 16:9 source, width ~53%, height ~100%
  // For 40% bottom: output AR is 9:(16*0.4)=9:6.4. In 16:9 source, width ~80%, height ~57%
  const [regions, setRegions] = useState<Region[]>([
    {
      id: "content",
      label: "Screen Content",
      x: 2,
      y: 0,
      width: 53,
      height: 100,
      color: "#8b5cf6",
    },
    {
      id: "webcam",
      label: "Webcam",
      x: 58,
      y: 22,
      width: 40,
      height: 56,
      color: "#22c55e",
    },
  ]);

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
    primary_color: "white",
    highlight_color: "yellow",
    highlight_scale: 1.3,
    position: "bottom",
    position_y: 85,
    text_style: "normal",
    animation_style: "both",
    outline_enabled: true,
    outline_color: "black",
    outline_width: 3,
    shadow_enabled: true,
    shadow_color: "black",
    background_enabled: false,
    background_color: "black",
    background_opacity: 50,
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

            return { ...region, x: newX, y: newY, width: newWidth, height: newHeight };
          }

          return region;
        })
      );
    },
    [dragState, getMousePosition]
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
            regions: regions.map((r) => ({
              id: r.id,
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
            })),
            layout: {
              topRegionId,
              splitRatio,
            },
            caption_options: captionOptions,
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

                {/* Caption Preview Overlay - Shows when captions enabled */}
                {captionOptions.enabled && (
                  <div
                    className="absolute left-0 right-0 flex justify-center px-4 pointer-events-none z-10"
                    style={{ top: `${captionOptions.position_y}%`, transform: "translateY(-50%)" }}
                  >
                    <div
                      className="px-3 py-1.5 rounded"
                      style={{
                        backgroundColor: captionOptions.background_enabled ? `rgba(0,0,0,${captionOptions.background_opacity / 100})` : 'transparent'
                      }}
                    >
                      <span className="flex justify-center flex-wrap" style={{ gap: `${captionOptions.word_spacing}px` }}>
                        {(() => {
                          const colorMap: Record<string, string> = {
                            white: "#ffffff", yellow: "#fbbf24", cyan: "#22d3ee",
                            green: "#22c55e", orange: "#f97316", pink: "#ec4899"
                          };
                          const fontMap: Record<string, string> = {
                            // System fonts
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
                            // Google Fonts (Open License)
                            "Roboto": "Roboto, sans-serif",
                            "Roboto Black": "'Roboto Black', Roboto, sans-serif",
                            "Open Sans": "'Open Sans', sans-serif",
                            "Lato": "Lato, sans-serif",
                            "Montserrat": "Montserrat, sans-serif",
                            "Oswald": "Oswald, sans-serif",
                            "Poppins": "Poppins, sans-serif",
                            "Raleway": "Raleway, sans-serif",
                            "Inter": "Inter, sans-serif",
                            "Nunito": "Nunito, sans-serif",
                            "Bebas Neue": "'Bebas Neue', sans-serif",
                            "Anton": "Anton, sans-serif",
                            "Bangers": "Bangers, cursive",
                            "Permanent Marker": "'Permanent Marker', cursive",
                            "Lobster": "Lobster, cursive",
                            "Pacifico": "Pacifico, cursive",
                            "Dancing Script": "'Dancing Script', cursive",
                            "Caveat": "Caveat, cursive",
                            "Merriweather": "Merriweather, serif",
                            "Playfair Display": "'Playfair Display', serif",
                            "Lora": "Lora, serif",
                            "Source Code Pro": "'Source Code Pro', monospace",
                            "Fira Code": "'Fira Code', monospace",
                          };
                          const startIdx = Math.floor(previewWordIndex / captionOptions.words_per_group) * captionOptions.words_per_group;
                          return previewWords.slice(startIdx, startIdx + captionOptions.words_per_group).map((word, idx) => {
                            const isActive = idx === previewWordIndex % captionOptions.words_per_group;
                            const textColor = isActive ? colorMap[captionOptions.highlight_color] : colorMap[captionOptions.primary_color];
                            const displayText = captionOptions.text_style === "uppercase" ? word.toUpperCase() : word;
                            return (
                              <span
                                key={idx}
                                className="transition-all duration-150"
                                style={{
                                  fontFamily: fontMap[captionOptions.font_name] || "Arial, sans-serif",
                                  fontWeight: "bold",
                                  fontSize: `${Math.round(captionOptions.font_size / 3)}px`,
                                  color: textColor,
                                  transform: isActive && (captionOptions.animation_style === "scale" || captionOptions.animation_style === "both") ? `scale(${captionOptions.highlight_scale})` : "scale(1)",
                                  textShadow: captionOptions.shadow_enabled ? "2px 2px 4px rgba(0,0,0,0.8)" : captionOptions.animation_style === "glow" && isActive ? `0 0 10px ${textColor}, 0 0 20px ${textColor}` : "none",
                                  WebkitTextStroke: captionOptions.outline_enabled ? `${captionOptions.outline_width / 2}px ${captionOptions.outline_color}` : "0",
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
                        className="absolute -top-6 left-0 px-2 py-0.5 text-xs font-medium text-white rounded"
                        style={{ backgroundColor: region.color }}
                      >
                        {region.label}
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
                    <button
                      key={region.id}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm cursor-pointer transition-colors ${selectedRegion === region.id ? "bg-zinc-600" : "bg-zinc-800 hover:bg-zinc-700"}`}
                      onClick={() => setSelectedRegion(region.id)}
                    >
                      <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: region.color }} />
                      <span className="text-white">{region.label}</span>
                    </button>
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
            {/* Layout Order + Split Ratio + Preview Combined */}
            <div className="p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-white">Layout</h3>
                <button
                  onClick={swapRegions}
                  className="p-1 bg-zinc-700 hover:bg-zinc-600 rounded transition-colors"
                  title="Swap positions"
                >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              {/* Layout Preview - Centered */}
              <div className="flex flex-col items-center pt-3 mt-3 border-t border-zinc-700">
                <div
                  className="w-16 bg-zinc-900 rounded overflow-hidden border border-zinc-600"
                  style={{ aspectRatio: "9/16" }}
                >
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
                        <optgroup label="System Fonts">
                          <option value="Arial">Arial</option>
                          <option value="Arial Black">Arial Black</option>
                          <option value="Verdana">Verdana</option>
                          <option value="Tahoma">Tahoma</option>
                          <option value="Trebuchet MS">Trebuchet MS</option>
                          <option value="Georgia">Georgia</option>
                          <option value="Times New Roman">Times New Roman</option>
                          <option value="Courier New">Courier New</option>
                          <option value="Impact">Impact</option>
                          <option value="Comic Sans MS">Comic Sans MS</option>
                        </optgroup>
                        <optgroup label="Google Fonts - Sans">
                          <option value="Roboto">Roboto</option>
                          <option value="Roboto Black">Roboto Black</option>
                          <option value="Open Sans">Open Sans</option>
                          <option value="Lato">Lato</option>
                          <option value="Montserrat">Montserrat</option>
                          <option value="Poppins">Poppins</option>
                          <option value="Raleway">Raleway</option>
                          <option value="Inter">Inter</option>
                          <option value="Nunito">Nunito</option>
                        </optgroup>
                        <optgroup label="Google Fonts - Display">
                          <option value="Oswald">Oswald</option>
                          <option value="Bebas Neue">Bebas Neue</option>
                          <option value="Anton">Anton</option>
                          <option value="Bangers">Bangers</option>
                          <option value="Permanent Marker">Permanent Marker</option>
                          <option value="Lobster">Lobster</option>
                        </optgroup>
                        <optgroup label="Google Fonts - Script">
                          <option value="Pacifico">Pacifico</option>
                          <option value="Dancing Script">Dancing Script</option>
                          <option value="Caveat">Caveat</option>
                        </optgroup>
                        <optgroup label="Google Fonts - Serif">
                          <option value="Merriweather">Merriweather</option>
                          <option value="Playfair Display">Playfair Display</option>
                          <option value="Lora">Lora</option>
                        </optgroup>
                        <optgroup label="Google Fonts - Mono">
                          <option value="Source Code Pro">Source Code Pro</option>
                          <option value="Fira Code">Fira Code</option>
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
                    {(["scale", "color", "both", "glow"] as const).map((anim) => (
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
                  <div className="flex gap-2 items-center">
                    <span className="text-xs text-zinc-500">Text:</span>
                    {["white", "yellow", "cyan"].map((color) => {
                      const colorMap: Record<string, string> = { white: "#fff", yellow: "#fbbf24", cyan: "#22d3ee" };
                      return (
                        <button key={color} onClick={() => setCaptionOptions(prev => ({ ...prev, primary_color: color }))}
                          className={`w-4 h-4 rounded-full border-2 ${captionOptions.primary_color === color ? "border-purple-500 scale-110" : "border-zinc-600"}`}
                          style={{ backgroundColor: colorMap[color] }} />
                      );
                    })}
                    <span className="text-xs text-zinc-500 ml-1">Highlight:</span>
                    {["yellow", "cyan", "green", "pink"].map((color) => {
                      const colorMap: Record<string, string> = { yellow: "#fbbf24", cyan: "#22d3ee", green: "#22c55e", pink: "#ec4899" };
                      return (
                        <button key={color} onClick={() => setCaptionOptions(prev => ({ ...prev, highlight_color: color }))}
                          className={`w-4 h-4 rounded-full border-2 ${captionOptions.highlight_color === color ? "border-purple-500 scale-110" : "border-zinc-600"}`}
                          style={{ backgroundColor: colorMap[color] }} />
                      );
                    })}
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
          </div>
        </div>
      </main>
    </div>
  );
}
