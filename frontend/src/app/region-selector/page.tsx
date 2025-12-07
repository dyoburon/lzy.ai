"use client";

import Link from "next/link";
import { useState, useRef, useEffect, useCallback } from "react";
import { getPendingClips, clearPendingClips } from "@/lib/clipStore";

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

interface ProcessedClip {
  moment: Clip["moment"];
  original_filename: string;
  processed: {
    success?: boolean;
    video_data?: string;
    file_size?: number;
    dimensions?: { width: number; height: number };
    error?: string;
    captions_applied?: boolean;
    transcription?: string;
    caption_error?: string;
  };
}

interface CaptionOptions {
  enabled: boolean;
  words_per_group: number;
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
  // Clips passed from shorts page
  const [clips, setClips] = useState<Clip[]>([]);
  const [currentClipIndex, setCurrentClipIndex] = useState(0);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);

  // Region selection state
  const [splitRatio, setSplitRatio] = useState(0.6);
  const [topRegionId, setTopRegionId] = useState("content");
  const [regions, setRegions] = useState<Region[]>([
    {
      id: "content",
      label: "Screen Content",
      x: 5,
      y: 5,
      width: 60,
      height: 90,
      color: "#8b5cf6",
    },
    {
      id: "webcam",
      label: "Webcam",
      x: 70,
      y: 60,
      width: 25,
      height: 35,
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
  const [processedClips, setProcessedClips] = useState<ProcessedClip[]>([]);
  const [error, setError] = useState("");

  // Caption options state
  const [captionOptions, setCaptionOptions] = useState<CaptionOptions>({
    enabled: true,
    words_per_group: 3,
    font_size: 56,
    font_name: "Arial Bold",
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
    setProcessedClips([]);

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
        setProcessedClips(data.processed_clips);
        // Clear clips from memory after processing
        clearPendingClips();
      }
    } catch (err) {
      setError("Failed to connect to server. Make sure the backend is running.");
    } finally {
      setProcessing(false);
    }
  };

  const downloadClip = (clip: ProcessedClip) => {
    if (!clip.processed.video_data) return;

    const blob = base64ToBlob(clip.processed.video_data, "video/mp4");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vertical_${clip.original_filename}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAllClips = () => {
    processedClips.forEach((clip, index) => {
      if (clip.processed.success) {
        setTimeout(() => downloadClip(clip), index * 500);
      }
    });
  };

  // If no clips, show empty state
  if (clips.length === 0 && processedClips.length === 0) {
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

  // If clips are processed, show results
  if (processedClips.length > 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
        <header className="border-b border-zinc-700/50">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-2xl font-bold text-white">
                lzy<span className="text-purple-500">.ai</span>
              </Link>
              <span className="text-zinc-600">/</span>
              <span className="text-zinc-400">Processed Shorts</span>
            </div>
            <Link
              href="/shorts"
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Create More Shorts
            </Link>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-6 py-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-3">Your Vertical Shorts</h1>
            <p className="text-zinc-400">
              {processedClips.filter((c) => c.processed.success).length} of {processedClips.length} clips processed successfully
            </p>
          </div>

          {/* Download All Button */}
          <div className="mb-6 flex justify-center">
            <button
              onClick={downloadAllClips}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download All
            </button>
          </div>

          {/* Processed Clips Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {processedClips.map((clip, index) => (
              <div
                key={index}
                className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg"
              >
                {clip.processed.success && clip.processed.video_data ? (
                  <>
                    <div className="aspect-[9/16] bg-black rounded-lg overflow-hidden mb-4">
                      <video
                        src={URL.createObjectURL(base64ToBlob(clip.processed.video_data, "video/mp4"))}
                        className="w-full h-full object-contain"
                        controls
                      />
                    </div>
                    <h3 className="text-white font-medium mb-2 truncate">{clip.moment.title}</h3>
                    <div className="flex items-center justify-between text-sm text-zinc-400 mb-2">
                      <span>{clip.moment.start_time} - {clip.moment.end_time}</span>
                      <span>{(clip.processed.file_size! / 1024 / 1024).toFixed(1)} MB</span>
                    </div>
                    {/* Caption status */}
                    <div className="flex items-center gap-2 text-xs mb-3">
                      {clip.processed.captions_applied ? (
                        <span className="px-2 py-1 bg-green-900/50 text-green-400 rounded">
                          Captions Added
                        </span>
                      ) : clip.processed.caption_error ? (
                        <span className="px-2 py-1 bg-yellow-900/50 text-yellow-400 rounded" title={clip.processed.caption_error}>
                          No Captions (API Error)
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-zinc-700 text-zinc-400 rounded">
                          No Captions
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => downloadClip(clip)}
                      className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download
                    </button>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-red-400 mb-2">Processing failed</p>
                    <p className="text-zinc-500 text-sm">{clip.processed.error || "Unknown error"}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  // Main region selection UI
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
          <Link
            href="/shorts"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Back to Shorts
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-3">
            Select Regions for Your Shorts
          </h1>
          <p className="text-zinc-400">
            {clips.length} clip{clips.length !== 1 ? "s" : ""} ready to process. Draw selection boxes around webcam and content areas.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-center">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Video with Selection Boxes */}
          <div className="lg:col-span-2">
            <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Select Regions</h2>
                {/* Clip selector */}
                {clips.length > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentClipIndex(Math.max(0, currentClipIndex - 1))}
                      disabled={currentClipIndex === 0}
                      className="p-1 text-zinc-400 hover:text-white disabled:text-zinc-600 disabled:cursor-not-allowed"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <span className="text-zinc-400 text-sm">
                      Clip {currentClipIndex + 1} of {clips.length}
                    </span>
                    <button
                      onClick={() => setCurrentClipIndex(Math.min(clips.length - 1, currentClipIndex + 1))}
                      disabled={currentClipIndex === clips.length - 1}
                      className="p-1 text-zinc-400 hover:text-white disabled:text-zinc-600 disabled:cursor-not-allowed"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              <p className="text-sm text-zinc-400 mb-4">
                Drag boxes to reposition. Drag corners/edges to resize.
              </p>

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

              {/* Clip Info */}
              {clips[currentClipIndex] && (
                <div className="mt-4 p-3 bg-zinc-900 rounded-lg">
                  <h3 className="text-white font-medium">{clips[currentClipIndex].moment.title}</h3>
                  <p className="text-zinc-400 text-sm">
                    {clips[currentClipIndex].moment.start_time} - {clips[currentClipIndex].moment.end_time}
                  </p>
                </div>
              )}

              {/* Region Legend */}
              <div className="flex gap-4 mt-4">
                {regions.map((region) => (
                  <div
                    key={region.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${selectedRegion === region.id ? "bg-zinc-700" : "bg-zinc-800 hover:bg-zinc-700"
                      }`}
                    onClick={() => setSelectedRegion(region.id)}
                  >
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: region.color }} />
                    <span className="text-sm text-white">{region.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Preview & Controls */}
          <div className="space-y-6">
            {/* Layout Order */}
            <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
              <h3 className="text-lg font-semibold text-white mb-4">Layout Order</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-zinc-500 text-sm w-16">Top:</span>
                  <div
                    className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{
                      backgroundColor: `${topRegion?.color}22`,
                      border: `1px solid ${topRegion?.color}`,
                    }}
                  >
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: topRegion?.color }} />
                    <span className="text-sm text-white">{topRegion?.label}</span>
                  </div>
                </div>

                <div className="flex justify-center">
                  <button
                    onClick={swapRegions}
                    className="p-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
                    title="Swap positions"
                  >
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-zinc-500 text-sm w-16">Bottom:</span>
                  <div
                    className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{
                      backgroundColor: `${bottomRegion?.color}22`,
                      border: `1px solid ${bottomRegion?.color}`,
                    }}
                  >
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: bottomRegion?.color }} />
                    <span className="text-sm text-white">{bottomRegion?.label}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Split Ratio */}
            <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
              <h3 className="text-lg font-semibold text-white mb-4">Split Ratio</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Top: {Math.round(splitRatio * 100)}%</span>
                  <span className="text-zinc-400">Bottom: {Math.round((1 - splitRatio) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="70"
                  value={splitRatio * 100}
                  onChange={(e) => setSplitRatio(parseInt(e.target.value) / 100)}
                  className="w-full accent-purple-500"
                />
                <div className="flex gap-2">
                  {[50, 60, 70].map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => setSplitRatio(ratio / 100)}
                      className={`flex-1 px-3 py-2 text-sm rounded-lg transition-colors ${Math.round(splitRatio * 100) === ratio
                          ? "bg-purple-600 text-white"
                          : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                        }`}
                    >
                      {ratio}/{100 - ratio}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Animated Captions */}
            <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Animated Captions</h3>
                <button
                  onClick={() => setCaptionOptions(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${captionOptions.enabled ? "bg-purple-600" : "bg-zinc-600"
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${captionOptions.enabled ? "translate-x-6" : "translate-x-1"
                      }`}
                  />
                </button>
              </div>

              {captionOptions.enabled && (
                <div className="space-y-5">
                  {/* Live Caption Preview */}
                  <div className="relative rounded-lg overflow-hidden" style={{ aspectRatio: "9/16", maxHeight: "280px" }}>
                    <div className="absolute inset-0 bg-gradient-to-b from-zinc-800 to-zinc-900">
                      {/* Simulated video background */}
                      <div className="absolute inset-0 opacity-30">
                        <div className="absolute top-0 left-0 right-0" style={{ height: `${splitRatio * 100}%`, backgroundColor: topRegion?.color }} />
                        <div className="absolute bottom-0 left-0 right-0" style={{ height: `${(1 - splitRatio) * 100}%`, backgroundColor: bottomRegion?.color }} />
                      </div>

                      {/* Caption Preview */}
                      <div
                        className="absolute left-0 right-0 flex justify-center px-2"
                        style={{ top: `${captionOptions.position_y}%`, transform: "translateY(-50%)" }}
                      >
                        <div
                          className={`px-3 py-2 rounded-lg ${captionOptions.background_enabled ? '' : ''}`}
                          style={{
                            backgroundColor: captionOptions.background_enabled
                              ? `rgba(0,0,0,${captionOptions.background_opacity / 100})`
                              : 'transparent'
                          }}
                        >
                          <span className="flex gap-1 justify-center flex-wrap">
                            {previewWords.slice(
                              Math.floor(previewWordIndex / captionOptions.words_per_group) * captionOptions.words_per_group,
                              Math.floor(previewWordIndex / captionOptions.words_per_group) * captionOptions.words_per_group + captionOptions.words_per_group
                            ).map((word, idx) => {
                              const isActive = idx === previewWordIndex % captionOptions.words_per_group;
                              const colorMap: Record<string, string> = {
                                white: "#ffffff", yellow: "#fbbf24", cyan: "#22d3ee",
                                green: "#22c55e", orange: "#f97316", pink: "#ec4899",
                                red: "#ef4444", blue: "#3b82f6", purple: "#a855f7"
                              };
                              const textColor = isActive ? colorMap[captionOptions.highlight_color] : colorMap[captionOptions.primary_color];
                              const displayText = captionOptions.text_style === "uppercase" ? word.toUpperCase()
                                : captionOptions.text_style === "capitalize" ? word.charAt(0).toUpperCase() + word.slice(1)
                                  : word;

                              return (
                                <span
                                  key={idx}
                                  className={`transition-all duration-150 ${captionOptions.animation_style === "bounce" && isActive ? "animate-bounce" : ""
                                    }`}
                                  style={{
                                    fontFamily: captionOptions.font_name.includes("Bold") ? "Arial, sans-serif" : captionOptions.font_name,
                                    fontWeight: captionOptions.font_name.includes("Bold") ? "bold" : "normal",
                                    fontSize: `${Math.round(captionOptions.font_size / 4)}px`,
                                    color: textColor,
                                    transform: isActive && (captionOptions.animation_style === "scale" || captionOptions.animation_style === "both")
                                      ? `scale(${captionOptions.highlight_scale})`
                                      : "scale(1)",
                                    textShadow: captionOptions.shadow_enabled
                                      ? `2px 2px 4px ${captionOptions.shadow_color}`
                                      : captionOptions.animation_style === "glow" && isActive
                                        ? `0 0 10px ${textColor}, 0 0 20px ${textColor}`
                                        : "none",
                                    WebkitTextStroke: captionOptions.outline_enabled
                                      ? `${captionOptions.outline_width / 2}px ${captionOptions.outline_color}`
                                      : "none",
                                  }}
                                >
                                  {displayText}
                                </span>
                              );
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="absolute bottom-2 left-2 right-2 text-center">
                      <span className="text-xs text-zinc-500 bg-zinc-900/80 px-2 py-1 rounded">Live Preview</span>
                    </div>
                  </div>

                  {/* Position */}
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">Position</label>
                    <div className="flex gap-2 mb-3">
                      {(["top", "middle", "bottom"] as const).map((pos) => (
                        <button
                          key={pos}
                          onClick={() => {
                            const yPos = pos === "top" ? 15 : pos === "middle" ? 50 : 85;
                            setCaptionOptions(prev => ({ ...prev, position: pos, position_y: yPos }));
                          }}
                          className={`flex-1 px-3 py-2 text-sm rounded-lg transition-colors capitalize ${captionOptions.position === pos
                              ? "bg-purple-600 text-white"
                              : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                            }`}
                        >
                          {pos}
                        </button>
                      ))}
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Fine-tune: {captionOptions.position_y}%</label>
                      <input
                        type="range"
                        min="5"
                        max="95"
                        value={captionOptions.position_y}
                        onChange={(e) => setCaptionOptions(prev => ({ ...prev, position_y: parseInt(e.target.value) }))}
                        className="w-full accent-purple-500"
                      />
                    </div>
                  </div>

                  {/* Font */}
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">Font</label>
                    <select
                      value={captionOptions.font_name}
                      onChange={(e) => setCaptionOptions(prev => ({ ...prev, font_name: e.target.value }))}
                      className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
                    >
                      <option value="Arial Bold">Arial Bold</option>
                      <option value="Arial">Arial</option>
                      <option value="Impact">Impact</option>
                      <option value="Helvetica Bold">Helvetica Bold</option>
                      <option value="Verdana Bold">Verdana Bold</option>
                      <option value="Comic Sans MS">Comic Sans MS</option>
                      <option value="Georgia Bold">Georgia Bold</option>
                      <option value="Times New Roman Bold">Times New Roman Bold</option>
                      <option value="Courier New Bold">Courier New Bold</option>
                    </select>
                  </div>

                  {/* Font Size */}
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">
                      Font Size: {captionOptions.font_size}px
                    </label>
                    <input
                      type="range"
                      min="32"
                      max="96"
                      step="4"
                      value={captionOptions.font_size}
                      onChange={(e) => setCaptionOptions(prev => ({ ...prev, font_size: parseInt(e.target.value) }))}
                      className="w-full accent-purple-500"
                    />
                    <div className="flex justify-between text-xs text-zinc-500 mt-1">
                      <span>Small</span>
                      <span>Medium</span>
                      <span>Large</span>
                    </div>
                  </div>

                  {/* Words per group */}
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">
                      Words at a time: {captionOptions.words_per_group}
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="6"
                      value={captionOptions.words_per_group}
                      onChange={(e) => setCaptionOptions(prev => ({ ...prev, words_per_group: parseInt(e.target.value) }))}
                      className="w-full accent-purple-500"
                    />
                    <div className="flex justify-between text-xs text-zinc-500 mt-1">
                      <span>1</span>
                      <span>3</span>
                      <span>6</span>
                    </div>
                  </div>

                  {/* Text Style */}
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">Text Style</label>
                    <div className="flex gap-2">
                      {([
                        { value: "normal", label: "Normal" },
                        { value: "uppercase", label: "UPPERCASE" },
                        { value: "capitalize", label: "Capitalize" }
                      ] as const).map((style) => (
                        <button
                          key={style.value}
                          onClick={() => setCaptionOptions(prev => ({ ...prev, text_style: style.value }))}
                          className={`flex-1 px-2 py-2 text-xs rounded-lg transition-colors ${captionOptions.text_style === style.value
                              ? "bg-purple-600 text-white"
                              : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                            }`}
                        >
                          {style.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Animation Style */}
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">Highlight Effect</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: "scale", label: "Scale", icon: "↗" },
                        { value: "color", label: "Color Only", icon: "🎨" },
                        { value: "both", label: "Scale + Color", icon: "✨" },
                        { value: "bounce", label: "Bounce", icon: "⬆" },
                        { value: "glow", label: "Glow", icon: "💫" }
                      ] as const).map((anim) => (
                        <button
                          key={anim.value}
                          onClick={() => setCaptionOptions(prev => ({ ...prev, animation_style: anim.value }))}
                          className={`px-2 py-2 text-xs rounded-lg transition-colors flex flex-col items-center gap-1 ${captionOptions.animation_style === anim.value
                              ? "bg-purple-600 text-white"
                              : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                            }`}
                        >
                          <span>{anim.icon}</span>
                          <span>{anim.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Text Color */}
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">Text Color</label>
                    <div className="flex gap-2 flex-wrap">
                      {["white", "yellow", "cyan", "green", "orange", "pink", "red", "blue", "purple"].map((color) => {
                        const colorMap: Record<string, string> = {
                          white: "#ffffff", yellow: "#fbbf24", cyan: "#22d3ee",
                          green: "#22c55e", orange: "#f97316", pink: "#ec4899",
                          red: "#ef4444", blue: "#3b82f6", purple: "#a855f7"
                        };
                        return (
                          <button
                            key={color}
                            onClick={() => setCaptionOptions(prev => ({ ...prev, primary_color: color }))}
                            className={`w-8 h-8 rounded-full border-2 transition-all ${captionOptions.primary_color === color
                                ? "border-purple-500 scale-110"
                                : "border-zinc-600 hover:border-zinc-500"
                              }`}
                            style={{ backgroundColor: colorMap[color] }}
                            title={color}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Highlight Color */}
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">Highlight Color</label>
                    <div className="flex gap-2 flex-wrap">
                      {["yellow", "cyan", "green", "orange", "pink", "red", "blue", "purple", "white"].map((color) => {
                        const colorMap: Record<string, string> = {
                          white: "#ffffff", yellow: "#fbbf24", cyan: "#22d3ee",
                          green: "#22c55e", orange: "#f97316", pink: "#ec4899",
                          red: "#ef4444", blue: "#3b82f6", purple: "#a855f7"
                        };
                        return (
                          <button
                            key={color}
                            onClick={() => setCaptionOptions(prev => ({ ...prev, highlight_color: color }))}
                            className={`w-8 h-8 rounded-full border-2 transition-all ${captionOptions.highlight_color === color
                                ? "border-purple-500 scale-110"
                                : "border-zinc-600 hover:border-zinc-500"
                              }`}
                            style={{ backgroundColor: colorMap[color] }}
                            title={color}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Highlight Scale */}
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">
                      Highlight Size: {Math.round(captionOptions.highlight_scale * 100)}%
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="200"
                      step="5"
                      value={captionOptions.highlight_scale * 100}
                      onChange={(e) => setCaptionOptions(prev => ({ ...prev, highlight_scale: parseInt(e.target.value) / 100 }))}
                      className="w-full accent-purple-500"
                    />
                  </div>

                  {/* Text Effects Section */}
                  <div className="pt-3 border-t border-zinc-700">
                    <h4 className="text-sm font-medium text-white mb-3">Text Effects</h4>

                    {/* Outline */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-zinc-400">Text Outline</span>
                      <button
                        onClick={() => setCaptionOptions(prev => ({ ...prev, outline_enabled: !prev.outline_enabled }))}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${captionOptions.outline_enabled ? "bg-purple-600" : "bg-zinc-600"
                          }`}
                      >
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${captionOptions.outline_enabled ? "translate-x-5" : "translate-x-1"
                          }`} />
                      </button>
                    </div>
                    {captionOptions.outline_enabled && (
                      <div className="ml-4 mb-3 space-y-2">
                        <div className="flex gap-2 items-center">
                          <span className="text-xs text-zinc-500 w-16">Color:</span>
                          <div className="flex gap-1">
                            {["black", "white", "gray"].map((color) => (
                              <button
                                key={color}
                                onClick={() => setCaptionOptions(prev => ({ ...prev, outline_color: color }))}
                                className={`w-6 h-6 rounded border ${captionOptions.outline_color === color ? "border-purple-500" : "border-zinc-600"
                                  }`}
                                style={{ backgroundColor: color === "gray" ? "#6b7280" : color }}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2 items-center">
                          <span className="text-xs text-zinc-500 w-16">Width:</span>
                          <input
                            type="range"
                            min="1"
                            max="6"
                            value={captionOptions.outline_width}
                            onChange={(e) => setCaptionOptions(prev => ({ ...prev, outline_width: parseInt(e.target.value) }))}
                            className="flex-1 accent-purple-500"
                          />
                          <span className="text-xs text-zinc-500 w-6">{captionOptions.outline_width}px</span>
                        </div>
                      </div>
                    )}

                    {/* Shadow */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-zinc-400">Drop Shadow</span>
                      <button
                        onClick={() => setCaptionOptions(prev => ({ ...prev, shadow_enabled: !prev.shadow_enabled }))}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${captionOptions.shadow_enabled ? "bg-purple-600" : "bg-zinc-600"
                          }`}
                      >
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${captionOptions.shadow_enabled ? "translate-x-5" : "translate-x-1"
                          }`} />
                      </button>
                    </div>

                    {/* Background */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-zinc-400">Background Box</span>
                      <button
                        onClick={() => setCaptionOptions(prev => ({ ...prev, background_enabled: !prev.background_enabled }))}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${captionOptions.background_enabled ? "bg-purple-600" : "bg-zinc-600"
                          }`}
                      >
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${captionOptions.background_enabled ? "translate-x-5" : "translate-x-1"
                          }`} />
                      </button>
                    </div>
                    {captionOptions.background_enabled && (
                      <div className="ml-4 space-y-2">
                        <div className="flex gap-2 items-center">
                          <span className="text-xs text-zinc-500 w-16">Opacity:</span>
                          <input
                            type="range"
                            min="20"
                            max="100"
                            value={captionOptions.background_opacity}
                            onChange={(e) => setCaptionOptions(prev => ({ ...prev, background_opacity: parseInt(e.target.value) }))}
                            className="flex-1 accent-purple-500"
                          />
                          <span className="text-xs text-zinc-500 w-10">{captionOptions.background_opacity}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!captionOptions.enabled && (
                <p className="text-sm text-zinc-500">
                  Enable to add animated word-by-word captions that highlight as you speak.
                </p>
              )}
            </div>

            {/* Layout Preview */}
            <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
              <h3 className="text-lg font-semibold text-white mb-4">Layout Preview</h3>
              <div className="flex justify-center">
                <div
                  className="w-32 bg-zinc-900 rounded-lg overflow-hidden border border-zinc-600"
                  style={{ aspectRatio: "9/16" }}
                >
                  <div
                    className="w-full flex items-center justify-center text-xs font-medium text-white"
                    style={{
                      height: `${splitRatio * 100}%`,
                      backgroundColor: `${topRegion?.color}66`,
                      borderBottom: "1px solid rgba(255,255,255,0.2)",
                    }}
                  >
                    {topRegion?.label.split(" ")[0]}
                  </div>
                  <div
                    className="w-full flex items-center justify-center text-xs font-medium text-white"
                    style={{
                      height: `${(1 - splitRatio) * 100}%`,
                      backgroundColor: `${bottomRegion?.color}66`,
                    }}
                  >
                    {bottomRegion?.label.split(" ")[0]}
                  </div>
                </div>
              </div>
              <p className="text-center text-zinc-500 text-xs mt-3">1080x1920 (9:16)</p>
            </div>

            {/* Process Button */}
            <button
              onClick={handleProcessClips}
              disabled={processing}
              className="w-full px-6 py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {processing ? (
                <>
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing {clips.length} clip{clips.length !== 1 ? "s" : ""}...
                </>
              ) : (
                <>
                  Process {clips.length} Clip{clips.length !== 1 ? "s" : ""} to Vertical
                </>
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
