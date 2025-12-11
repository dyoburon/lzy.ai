"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { getProcessedClips, setProcessedClips } from "@/lib/clipStore";

interface ProcessedClip {
  moment: {
    start_time: string;
    end_time: string;
    title: string;
    reason: string;
    viral_score: number;
  };
  original_filename: string;
  processed: {
    success: boolean;
    video_data?: string;
    file_size?: number;
    dimensions?: { width: number; height: number };
    error?: string;
    captions_applied?: boolean;
  };
}

interface CaptionOptions {
  enabled: boolean;
  words_per_group: number;
  silence_threshold: number;
  word_spacing: number;
  font_size: number;
  font_name: string;
  primary_color: string;
  highlight_color: string;
  highlight_scale: number;
  position_y: number;
  text_style: "normal" | "uppercase";
  animation_style: "scale" | "color" | "both";
  outline_enabled: boolean;
  outline_color: string;
  outline_width: number;
  shadow_enabled: boolean;
  shadow_color: string;
  background_enabled: boolean;
  background_color: string;
  background_opacity: number;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

export default function ResultsPage() {
  const [processedClips, setProcessedClipsState] = useState<ProcessedClip[]>([]);
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [selectedClipIndex, setSelectedClipIndex] = useState<number>(0);
  const [applyingCaptions, setApplyingCaptions] = useState(false);
  const [previewWordIndex, setPreviewWordIndex] = useState(0);
  const previewWords = ["This", "is", "how", "captions", "look"];

  const [captionOptions, setCaptionOptions] = useState<CaptionOptions>({
    enabled: true,
    words_per_group: 3,
    silence_threshold: 0.5,
    word_spacing: 8,
    font_size: 56,
    font_name: "Arial Black",
    primary_color: "#ffffff",
    highlight_color: "#fbbf24",
    highlight_scale: 1.3,
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

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5005";

  // Load processed clips
  useEffect(() => {
    const clips = getProcessedClips();
    if (clips) {
      setProcessedClipsState(clips);
      const urls = clips.map((clip) => {
        if (clip.processed.success && clip.processed.video_data) {
          const blob = base64ToBlob(clip.processed.video_data, "video/mp4");
          return URL.createObjectURL(blob);
        }
        return "";
      });
      setVideoUrls(urls);
    }
  }, []);

  // Cleanup URLs
  useEffect(() => {
    return () => {
      videoUrls.forEach((url) => url && URL.revokeObjectURL(url));
    };
  }, [videoUrls]);

  // Animate preview
  useEffect(() => {
    const interval = setInterval(() => {
      setPreviewWordIndex((prev) => (prev + 1) % previewWords.length);
    }, 500);
    return () => clearInterval(interval);
  }, [previewWords.length]);

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
    processedClips.forEach((clip, i) => {
      if (clip.processed.success) setTimeout(() => downloadClip(clip), i * 300);
    });
  };

  const handleApplyCaptions = async () => {
    if (!captionOptions.enabled) return;
    setApplyingCaptions(true);

    try {
      const newClips = [...processedClips];
      const newUrls = [...videoUrls];

      for (let i = 0; i < newClips.length; i++) {
        const clip = newClips[i];
        if (!clip.processed.success || !clip.processed.video_data) continue;

        const response = await fetch(`${API_URL}/api/captions/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video_data: clip.processed.video_data,
            caption_options: captionOptions,
          }),
        });

        const data = await response.json();

        if (data.success && data.video_data) {
          newClips[i] = {
            ...clip,
            processed: {
              ...clip.processed,
              video_data: data.video_data,
              file_size: data.file_size,
              captions_applied: true,
            },
          };

          if (newUrls[i]) URL.revokeObjectURL(newUrls[i]);
          const blob = base64ToBlob(data.video_data, "video/mp4");
          newUrls[i] = URL.createObjectURL(blob);
        }
      }

      setProcessedClipsState(newClips);
      setProcessedClips(newClips);
      setVideoUrls(newUrls);
    } catch (err) {
      console.error("Failed to apply captions:", err);
    } finally {
      setApplyingCaptions(false);
    }
  };

  // Empty state
  if (processedClips.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center">
        <div className="text-center p-8">
          <h2 className="text-xl font-bold text-white mb-4">No Processed Clips</h2>
          <Link href="/region-selector" className="px-4 py-2 bg-purple-600 text-white rounded-lg">
            Go to Region Selector
          </Link>
        </div>
      </div>
    );
  }

  const fontMap: Record<string, string> = {
    Arial: "Arial, sans-serif",
    "Arial Black": "'Arial Black', sans-serif",
    Helvetica: "Helvetica, Arial, sans-serif",
    Verdana: "Verdana, sans-serif",
    Impact: "Impact, sans-serif",
    Georgia: "Georgia, serif",
    "Times New Roman": "'Times New Roman', serif",
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
      {/* Compact Header */}
      <header className="border-b border-zinc-700/50 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="text-lg font-bold text-white">
              lzy<span className="text-purple-500">.ai</span>
            </Link>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400 text-sm">Results</span>
          </div>
          <div className="flex gap-2">
            <Link href="/region-selector" className="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
              </svg>
              Edit
            </Link>
            <button onClick={downloadAllClips} className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download All
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4">
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Left: Video Grid */}
          <div className="lg:col-span-2">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {processedClips.map((clip, index) => (
                <div
                  key={index}
                  onClick={() => setSelectedClipIndex(index)}
                  className={`relative bg-zinc-800 rounded-lg overflow-hidden cursor-pointer transition-all ${
                    selectedClipIndex === index ? "ring-2 ring-purple-500" : "hover:ring-1 hover:ring-zinc-600"
                  }`}
                >
                  {clip.processed.success && videoUrls[index] ? (
                    <>
                      <div className="aspect-[9/16]">
                        <video src={videoUrls[index]} className="w-full h-full object-cover" muted loop />
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                        <p className="text-white text-xs truncate">{clip.moment.title}</p>
                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span>{clip.moment.start_time}</span>
                          {clip.processed.captions_applied && (
                            <span className="px-1 py-0.5 bg-green-600/50 rounded text-green-300">CC</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); downloadClip(clip); }}
                        className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-purple-600 rounded-full transition-colors"
                      >
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <div className="aspect-[9/16] flex items-center justify-center text-red-400 text-xs p-2 text-center">
                      Failed
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right: Controls */}
          <div className="space-y-3">
            {/* Selected Video Preview */}
            {videoUrls[selectedClipIndex] && (
              <div className="bg-zinc-800 rounded-lg p-3">
                <div className="aspect-[9/16] max-h-[280px] mx-auto rounded-lg overflow-hidden bg-black">
                  <video
                    key={videoUrls[selectedClipIndex]}
                    src={videoUrls[selectedClipIndex]}
                    className="w-full h-full object-contain"
                    controls
                    autoPlay
                    muted
                    loop
                  />
                </div>
                <p className="text-center text-xs text-zinc-400 mt-2">
                  {processedClips[selectedClipIndex]?.moment.title}
                </p>
              </div>
            )}

            {/* Caption Controls */}
            <div className="bg-zinc-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                  Captions
                </h3>
                <button
                  onClick={() => setCaptionOptions((p) => ({ ...p, enabled: !p.enabled }))}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${captionOptions.enabled ? "bg-purple-600" : "bg-zinc-600"}`}
                >
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${captionOptions.enabled ? "translate-x-5" : "translate-x-1"}`} />
                </button>
              </div>

              {captionOptions.enabled && (
                <div className="space-y-3">
                  {/* Preview */}
                  <div className="flex justify-center">
                    <div className="relative w-20 bg-zinc-900 rounded border border-zinc-700" style={{ aspectRatio: "9/16" }}>
                      <div
                        className="absolute left-0 right-0 flex justify-center px-1"
                        style={{ top: `${captionOptions.position_y}%`, transform: "translateY(-50%)" }}
                      >
                        <span className="flex gap-0.5">
                          {previewWords.slice(0, captionOptions.words_per_group).map((word, idx) => {
                            const isActive = idx === previewWordIndex % captionOptions.words_per_group;
                            return (
                              <span
                                key={idx}
                                className="transition-all duration-150"
                                style={{
                                  fontFamily: fontMap[captionOptions.font_name] || "Arial",
                                  fontWeight: "bold",
                                  fontSize: "6px",
                                  color: isActive ? captionOptions.highlight_color : captionOptions.primary_color,
                                  transform: isActive && captionOptions.animation_style !== "color" ? "scale(1.2)" : "scale(1)",
                                }}
                              >
                                {captionOptions.text_style === "uppercase" ? word.toUpperCase() : word}
                              </span>
                            );
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Compact Controls */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-zinc-500 text-[10px]">Font</label>
                      <select
                        value={captionOptions.font_name}
                        onChange={(e) => setCaptionOptions((p) => ({ ...p, font_name: e.target.value }))}
                        className="w-full px-2 py-1 bg-zinc-700 rounded text-white text-xs"
                      >
                        {["Arial Black", "Arial", "Helvetica", "Impact", "Verdana"].map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-zinc-500 text-[10px]">Size: {captionOptions.font_size}px</label>
                      <input
                        type="range" min="32" max="96" step="4" value={captionOptions.font_size}
                        onChange={(e) => setCaptionOptions((p) => ({ ...p, font_size: parseInt(e.target.value) }))}
                        className="w-full accent-purple-500 h-1"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-500 text-[10px]">Position: {captionOptions.position_y}%</label>
                      <input
                        type="range" min="10" max="90" value={captionOptions.position_y}
                        onChange={(e) => setCaptionOptions((p) => ({ ...p, position_y: parseInt(e.target.value) }))}
                        className="w-full accent-purple-500 h-1"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-500 text-[10px]">Words: {captionOptions.words_per_group}</label>
                      <input
                        type="range" min="1" max="5" value={captionOptions.words_per_group}
                        onChange={(e) => setCaptionOptions((p) => ({ ...p, words_per_group: parseInt(e.target.value) }))}
                        className="w-full accent-purple-500 h-1"
                      />
                    </div>
                  </div>

                  {/* Colors */}
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-zinc-500 text-[10px]">Text</label>
                      <div className="flex gap-1">
                        <input
                          type="color" value={captionOptions.primary_color}
                          onChange={(e) => setCaptionOptions((p) => ({ ...p, primary_color: e.target.value }))}
                          className="w-6 h-6 rounded cursor-pointer border border-zinc-600"
                        />
                        {["#FFFFFF", "#FBBF24", "#22D3EE"].map((c) => (
                          <button
                            key={c}
                            onClick={() => setCaptionOptions((p) => ({ ...p, primary_color: c }))}
                            className={`w-5 h-5 rounded-full border ${captionOptions.primary_color === c ? "border-purple-500" : "border-zinc-600"}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="text-zinc-500 text-[10px]">Highlight</label>
                      <div className="flex gap-1">
                        <input
                          type="color" value={captionOptions.highlight_color}
                          onChange={(e) => setCaptionOptions((p) => ({ ...p, highlight_color: e.target.value }))}
                          className="w-6 h-6 rounded cursor-pointer border border-zinc-600"
                        />
                        {["#FBBF24", "#22C55E", "#EC4899"].map((c) => (
                          <button
                            key={c}
                            onClick={() => setCaptionOptions((p) => ({ ...p, highlight_color: c }))}
                            className={`w-5 h-5 rounded-full border ${captionOptions.highlight_color === c ? "border-purple-500" : "border-zinc-600"}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Style toggles */}
                  <div className="flex gap-1 flex-wrap">
                    <button
                      onClick={() => setCaptionOptions((p) => ({ ...p, text_style: p.text_style === "uppercase" ? "normal" : "uppercase" }))}
                      className={`px-2 py-1 text-[10px] rounded ${captionOptions.text_style === "uppercase" ? "bg-purple-600 text-white" : "bg-zinc-700 text-zinc-400"}`}
                    >
                      AA
                    </button>
                    {(["scale", "color", "both"] as const).map((a) => (
                      <button
                        key={a}
                        onClick={() => setCaptionOptions((p) => ({ ...p, animation_style: a }))}
                        className={`px-2 py-1 text-[10px] rounded ${captionOptions.animation_style === a ? "bg-purple-600 text-white" : "bg-zinc-700 text-zinc-400"}`}
                      >
                        {a.charAt(0).toUpperCase() + a.slice(1)}
                      </button>
                    ))}
                    <button
                      onClick={() => setCaptionOptions((p) => ({ ...p, outline_enabled: !p.outline_enabled }))}
                      className={`px-2 py-1 text-[10px] rounded ${captionOptions.outline_enabled ? "bg-purple-600 text-white" : "bg-zinc-700 text-zinc-400"}`}
                    >
                      Outline
                    </button>
                    <button
                      onClick={() => setCaptionOptions((p) => ({ ...p, shadow_enabled: !p.shadow_enabled }))}
                      className={`px-2 py-1 text-[10px] rounded ${captionOptions.shadow_enabled ? "bg-purple-600 text-white" : "bg-zinc-700 text-zinc-400"}`}
                    >
                      Shadow
                    </button>
                  </div>

                  {/* Apply Button */}
                  <button
                    onClick={handleApplyCaptions}
                    disabled={applyingCaptions}
                    className="w-full py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-zinc-600 text-black font-semibold rounded-lg text-sm flex items-center justify-center gap-2"
                  >
                    {applyingCaptions ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Applying to all clips...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Apply Captions to All
                      </>
                    )}
                  </button>
                </div>
              )}

              {!captionOptions.enabled && (
                <p className="text-xs text-zinc-500 text-center py-2">Enable to add animated captions</p>
              )}
            </div>

            {/* Info */}
            <div className="text-center text-xs text-zinc-500">
              {processedClips.filter((c) => c.processed.success).length} clips ready
              {processedClips.some((c) => c.processed.captions_applied) && (
                <span className="text-green-400"> (captions applied)</span>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
