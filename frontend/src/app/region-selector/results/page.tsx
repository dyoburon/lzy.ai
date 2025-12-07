"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { getProcessedClips, setProcessedClips } from "@/lib/clipStore";

interface CaptionWord {
  word: string;
  start: number;
  end: number;
}

interface CaptionGroup {
  text: string;
  word_count: number;
  start: number;
  end: number;
  duration: number;
  words: CaptionWord[];
}

interface CaptionDebug {
  settings: {
    words_per_group: number;
    silence_threshold: number;
  };
  words: CaptionWord[];
  groups: CaptionGroup[];
  gaps: {
    after_group: number;
    gap_seconds: number;
    is_silence_break: boolean;
  }[];
}

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
    caption_error?: string;
    caption_debug?: CaptionDebug;
  };
}

interface SeparatedAudio {
  vocalsAudio: string;
  musicAudio: string;
  // Store the original video data before any audio modifications
  originalVideoData: string;
}

interface CustomAudioCache {
  audioData: string;
  audioName: string;
  // Video state before this custom audio was applied (for revert)
  preApplyVideoData?: string;
  preApplyFileSize?: number;
  // Whether this custom audio has been applied to the video
  isApplied: boolean;
}

interface AudioState {
  selectedClipIndex: number | null;
  separating: boolean;
  processing: boolean;
  // Cache separated audio per clip index (includes original video for restoration)
  separatedCache: Record<number, SeparatedAudio>;
  // Cache custom uploaded audio per clip index
  customAudioCache: Record<number, CustomAudioCache>;
  vocalsVolume: number;
  musicVolume: number;
  customVolume: number;
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

function VolumeSlider({
  label,
  value,
  onChange,
  disabled,
  color = "purple",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    purple: "#a855f7",
    green: "#22c55e",
    blue: "#3b82f6",
    orange: "#f97316",
  };
  const activeColor = colorMap[color] || colorMap.purple;

  return (
    <div className={`space-y-2 ${disabled ? "opacity-40" : ""}`}>
      <div className="flex justify-between text-sm">
        <span className="text-zinc-400">{label}</span>
        <span className="text-white font-mono">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min="0"
        max="200"
        value={value * 100}
        onChange={(e) => onChange(parseInt(e.target.value) / 100)}
        disabled={disabled}
        className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-zinc-700"
        style={{
          background: disabled
            ? "#3f3f46"
            : `linear-gradient(to right, ${activeColor} 0%, ${activeColor} ${value * 50}%, #3f3f46 ${value * 50}%, #3f3f46 100%)`,
        }}
      />
    </div>
  );
}

export default function ResultsPage() {
  const [processedClips, setProcessedClipsState] = useState<ProcessedClip[]>([]);
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [demucsAvailable, setDemucsAvailable] = useState<boolean | null>(null);
  const [audio, setAudio] = useState<AudioState>({
    selectedClipIndex: null,
    separating: false,
    processing: false,
    separatedCache: {},
    customAudioCache: {},
    vocalsVolume: 1.0,
    musicVolume: 1.0,
    customVolume: 0.5,
  });
  const audioInputRef = useRef<HTMLInputElement>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5005";

  // Load processed clips from store on mount
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

      // Auto-select first clip if available
      if (clips.length > 0) {
        setAudio((prev) => ({ ...prev, selectedClipIndex: 0 }));
      }
    }

    // Check if Demucs is available
    fetch(`${API_URL}/api/audio/status`)
      .then((res) => res.json())
      .then((data) => setDemucsAvailable(data.available))
      .catch(() => setDemucsAvailable(false));
  }, [API_URL]);

  // Cleanup video URLs on unmount
  useEffect(() => {
    return () => {
      videoUrls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [videoUrls]);

  // Select a different clip - preserve all caches, reset volumes
  const selectClip = (index: number) => {
    setAudio((prev) => ({
      ...prev,
      selectedClipIndex: index,
      separating: false,
      processing: false,
      // Keep the caches, reset volumes to defaults
      vocalsVolume: 1.0,
      musicVolume: 1.0,
      customVolume: 0.5,
    }));
  };

  // Helper to check if current clip has separated audio
  const currentClipHasSeparatedAudio = audio.selectedClipIndex !== null &&
    audio.separatedCache[audio.selectedClipIndex] !== undefined;

  // Get separated audio for current clip
  const currentSeparatedAudio = audio.selectedClipIndex !== null
    ? audio.separatedCache[audio.selectedClipIndex]
    : null;

  // Get custom audio for current clip
  const currentCustomAudio = audio.selectedClipIndex !== null
    ? audio.customAudioCache[audio.selectedClipIndex]
    : null;

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

  const handleSeparateAudio = async () => {
    if (audio.selectedClipIndex === null) return;
    const clip = processedClips[audio.selectedClipIndex];
    if (!clip?.processed.video_data) return;

    setAudio((prev) => ({ ...prev, separating: true }));

    try {
      const response = await fetch(`${API_URL}/api/audio/separate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_data: clip.processed.video_data }),
      });

      const data = await response.json();

      if (data.error) {
        alert(`Separation failed: ${data.error}`);
      } else {
        // Cache the separated audio AND the original video data for this clip
        // This allows us to restore/remix audio without re-separating
        setAudio((prev) => ({
          ...prev,
          separatedCache: {
            ...prev.separatedCache,
            [audio.selectedClipIndex!]: {
              vocalsAudio: data.vocals,
              musicAudio: data.music,
              originalVideoData: clip.processed.video_data!,
            },
          },
        }));
      }
    } catch {
      alert("Failed to separate audio. Make sure the backend is running.");
    } finally {
      setAudio((prev) => ({ ...prev, separating: false }));
    }
  };

  const handleCustomAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || audio.selectedClipIndex === null) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      // Cache the custom audio for this clip (not applied yet)
      setAudio((prev) => ({
        ...prev,
        customAudioCache: {
          ...prev.customAudioCache,
          [audio.selectedClipIndex!]: {
            audioData: base64,
            audioName: file.name,
            isApplied: false,
          },
        },
      }));
    };
    reader.readAsDataURL(file);

    // Reset file input so the same file can be selected again
    e.target.value = "";
  };

  // Revert applied audio (X button) - keeps audio in cache so they can re-apply
  const handleRevertCustomAudio = async () => {
    if (audio.selectedClipIndex === null) return;
    const clipIndex = audio.selectedClipIndex;
    const customAudio = audio.customAudioCache[clipIndex];

    if (!customAudio) return;

    // If the audio was applied, revert the video to pre-apply state
    if (customAudio.isApplied && customAudio.preApplyVideoData) {
      // Revert to the video state before custom audio was applied
      const newClips = [...processedClips];
      newClips[clipIndex] = {
        ...newClips[clipIndex],
        processed: {
          ...newClips[clipIndex].processed,
          video_data: customAudio.preApplyVideoData,
          file_size: customAudio.preApplyFileSize,
        },
      };
      setProcessedClipsState(newClips);
      setProcessedClips(newClips);

      // Update video URL
      const newUrls = [...videoUrls];
      if (newUrls[clipIndex]) {
        URL.revokeObjectURL(newUrls[clipIndex]);
      }
      const blob = base64ToBlob(customAudio.preApplyVideoData, "video/mp4");
      newUrls[clipIndex] = URL.createObjectURL(blob);
      setVideoUrls(newUrls);

      // Mark as not applied, but KEEP the audio data so they can re-apply
      // Clear the preApply data since we've reverted (prevents memory bloat)
      setAudio((prev) => ({
        ...prev,
        customAudioCache: {
          ...prev.customAudioCache,
          [clipIndex]: {
            audioData: customAudio.audioData,
            audioName: customAudio.audioName,
            isApplied: false,
            // Clear pre-apply data since we've reverted
            preApplyVideoData: undefined,
            preApplyFileSize: undefined,
          },
        },
      }));
    } else {
      // Not applied yet, just remove from cache entirely
      setAudio((prev) => {
        const newCache = { ...prev.customAudioCache };
        delete newCache[clipIndex];
        return { ...prev, customAudioCache: newCache };
      });
    }
  };

  // Completely remove custom audio from cache (used when uploading different audio)
  const handleDeleteCustomAudio = () => {
    if (audio.selectedClipIndex === null) return;
    setAudio((prev) => {
      const newCache = { ...prev.customAudioCache };
      delete newCache[audio.selectedClipIndex!];
      return { ...prev, customAudioCache: newCache };
    });
  };

  const handleApplyAudioChanges = async () => {
    if (audio.selectedClipIndex === null) return;
    const clip = processedClips[audio.selectedClipIndex];
    if (!clip?.processed.video_data) return;

    const hasCustomAudio = !!currentCustomAudio;

    if (!currentClipHasSeparatedAudio && !hasCustomAudio) {
      alert("Separate audio first or upload custom audio to apply changes.");
      return;
    }

    setAudio((prev) => ({ ...prev, processing: true }));

    // Store the current video state BEFORE applying changes (for revert)
    const preApplyVideoData = clip.processed.video_data;
    const preApplyFileSize = clip.processed.file_size;

    try {
      // Use the ORIGINAL video data from cache (before any audio modifications)
      // This ensures we can always restore/remix from the pristine source
      const videoDataToUse = currentSeparatedAudio?.originalVideoData || clip.processed.video_data;

      const response = await fetch(`${API_URL}/api/audio/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_data: videoDataToUse,
          audio_options: {
            separate: currentClipHasSeparatedAudio,
            use_vocals: audio.vocalsVolume > 0,
            use_music: audio.musicVolume > 0,
            vocals_volume: audio.vocalsVolume,
            music_volume: audio.musicVolume,
            // Pass cached separated audio so backend doesn't need to re-separate
            vocals_audio: currentSeparatedAudio?.vocalsAudio,
            music_audio: currentSeparatedAudio?.musicAudio,
            // Use cached custom audio for this clip
            custom_audio: currentCustomAudio?.audioData,
            custom_audio_volume: audio.customVolume,
          },
        }),
      });

      const data = await response.json();

      if (data.error) {
        alert(`Processing failed: ${data.error}`);
      } else {
        // Update the clip with new video data
        const newClips = [...processedClips];
        newClips[audio.selectedClipIndex] = {
          ...newClips[audio.selectedClipIndex],
          processed: {
            ...newClips[audio.selectedClipIndex].processed,
            video_data: data.video_data,
            file_size: data.file_size,
          },
        };
        setProcessedClipsState(newClips);
        setProcessedClips(newClips);

        // Update video URL
        const newUrls = [...videoUrls];
        if (newUrls[audio.selectedClipIndex]) {
          URL.revokeObjectURL(newUrls[audio.selectedClipIndex]);
        }
        const blob = base64ToBlob(data.video_data, "video/mp4");
        newUrls[audio.selectedClipIndex] = URL.createObjectURL(blob);
        setVideoUrls(newUrls);

        // Update custom audio cache to mark as applied and store pre-apply state
        if (hasCustomAudio) {
          setAudio((prev) => ({
            ...prev,
            vocalsVolume: 1.0,
            musicVolume: 1.0,
            customVolume: 0.5,
            customAudioCache: {
              ...prev.customAudioCache,
              [audio.selectedClipIndex!]: {
                ...prev.customAudioCache[audio.selectedClipIndex!],
                isApplied: true,
                preApplyVideoData: preApplyVideoData,
                preApplyFileSize: preApplyFileSize,
              },
            },
          }));
        } else {
          // Reset volumes but keep all caches
          setAudio((prev) => ({
            ...prev,
            vocalsVolume: 1.0,
            musicVolume: 1.0,
            customVolume: 0.5,
          }));
        }
      }
    } catch {
      alert("Failed to process audio. Make sure the backend is running.");
    } finally {
      setAudio((prev) => ({ ...prev, processing: false }));
    }
  };

  // No clips
  if (processedClips.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
        <header className="border-b border-zinc-700/50">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-2xl font-bold text-white">
                lzy<span className="text-purple-500">.ai</span>
              </Link>
              <span className="text-zinc-600">/</span>
              <span className="text-zinc-400">Results</span>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-6 py-20 text-center">
          <div className="p-8 bg-zinc-800/50 border border-zinc-700 rounded-lg">
            <h2 className="text-2xl font-bold text-white mb-4">No Processed Clips</h2>
            <p className="text-zinc-400 mb-6">
              Process some clips first to see the results here.
            </p>
            <Link
              href="/region-selector"
              className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
            >
              Go to Region Selector
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const selectedClip = audio.selectedClipIndex !== null ? processedClips[audio.selectedClipIndex] : null;

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

        {/* Action Buttons */}
        <div className="mb-6 flex justify-center gap-4">
          <Link
            href="/region-selector"
            className="px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
            </svg>
            Back to Edit
          </Link>
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
        <div className={`grid gap-6 mb-12 ${
          processedClips.length === 1
            ? "max-w-sm mx-auto"
            : processedClips.length === 2
              ? "md:grid-cols-2 max-w-2xl mx-auto"
              : "md:grid-cols-2 lg:grid-cols-3"
        }`}>
          {processedClips.map((clip, index) => (
            <div
              key={index}
              className={`p-4 bg-zinc-800/50 border rounded-lg cursor-pointer transition-all ${
                audio.selectedClipIndex === index
                  ? "border-purple-500 ring-2 ring-purple-500/20"
                  : "border-zinc-700 hover:border-zinc-600"
              }`}
              onClick={() => selectClip(index)}
            >
              {clip.processed.success && videoUrls[index] ? (
                <>
                  <div className="aspect-[9/16] bg-black rounded-lg overflow-hidden mb-4">
                    <video
                      src={videoUrls[index]}
                      className="w-full h-full object-contain"
                      controls
                    />
                  </div>
                  <h3 className="text-white font-medium mb-2 truncate">{clip.moment.title}</h3>
                  <div className="flex items-center justify-between text-sm text-zinc-400 mb-2">
                    <span>{clip.moment.start_time} - {clip.moment.end_time}</span>
                    <span>{(clip.processed.file_size! / 1024 / 1024).toFixed(1)} MB</span>
                  </div>
                  <div className="flex items-center flex-wrap gap-2 text-xs mb-3">
                    {clip.processed.captions_applied && (
                      <span className="px-2 py-1 bg-green-900/50 text-green-400 rounded">Captions</span>
                    )}
                    {audio.customAudioCache[index]?.isApplied && (
                      <span className="px-2 py-1 bg-orange-900/50 text-orange-400 rounded">Custom Audio</span>
                    )}
                    {audio.selectedClipIndex === index && (
                      <span className="px-2 py-1 bg-purple-900/50 text-purple-400 rounded">Selected</span>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadClip(clip);
                    }}
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

        {/* Audio Controls Section */}
        <div className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-xl">
          <div className="flex items-center gap-3 mb-6">
            <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <h2 className="text-xl font-bold text-white">Audio Controls</h2>
            {selectedClip && (
              <span className="text-zinc-500 text-sm">
                — {selectedClip.moment.title}
              </span>
            )}
          </div>

          {audio.selectedClipIndex === null ? (
            <p className="text-zinc-500 text-center py-8">Select a clip above to edit its audio</p>
          ) : (
            <div className="grid md:grid-cols-2 gap-8">
              {/* Left Column: Separation & Volume Controls */}
              <div className="space-y-6">
                {/* AI Separation */}
                <div>
                  <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                    <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    AI Audio Separation
                  </h3>

                  {!demucsAvailable ? (
                    <div className="p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg text-amber-400 text-sm">
                      Demucs not installed. Run: <code className="bg-zinc-800 px-1 rounded">pip install demucs</code>
                    </div>
                  ) : currentClipHasSeparatedAudio ? (
                    <div className="space-y-3">
                      <div className="p-3 bg-green-900/30 border border-green-700/50 rounded-lg text-green-400 text-sm flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Audio separated! Adjust volumes below.
                      </div>

                      {/* DEBUG: Preview players */}
                      <div className="p-3 bg-zinc-900/50 rounded-lg space-y-2">
                        <p className="text-xs text-zinc-500 mb-2">Preview separated audio:</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-green-400 w-16">Vocals:</span>
                          {currentSeparatedAudio?.vocalsAudio && (
                            <audio controls className="h-7 flex-1" src={`data:audio/mp3;base64,${currentSeparatedAudio.vocalsAudio}`} />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-blue-400 w-16">Music:</span>
                          {currentSeparatedAudio?.musicAudio && (
                            <audio controls className="h-7 flex-1" src={`data:audio/mp3;base64,${currentSeparatedAudio.musicAudio}`} />
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={handleSeparateAudio}
                      disabled={audio.separating}
                      className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {audio.separating ? (
                        <>
                          <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Separating... (this takes ~1 min)
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                          </svg>
                          Separate Vocals &amp; Music
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Volume Controls */}
                <div className="space-y-4">
                  <h3 className="text-white font-medium flex items-center gap-2">
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                    Volume Levels
                  </h3>

                  <div className="p-4 bg-zinc-900/50 rounded-lg space-y-5">
                    <VolumeSlider
                      label="Vocals / Speech"
                      value={audio.vocalsVolume}
                      onChange={(v) => setAudio((prev) => ({ ...prev, vocalsVolume: v }))}
                      disabled={!currentClipHasSeparatedAudio}
                      color="green"
                    />
                    <VolumeSlider
                      label="Background Music"
                      value={audio.musicVolume}
                      onChange={(v) => setAudio((prev) => ({ ...prev, musicVolume: v }))}
                      disabled={!currentClipHasSeparatedAudio}
                      color="blue"
                    />
                    {!currentClipHasSeparatedAudio && (
                      <p className="text-xs text-zinc-500 text-center">
                        Separate audio first to adjust individual volumes
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Custom Audio & Apply */}
              <div className="space-y-6">
                {/* Custom Audio Upload */}
                <div>
                  <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                    <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Add Custom Audio
                  </h3>

                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={handleCustomAudioUpload}
                    className="hidden"
                  />

                  {currentCustomAudio ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <svg className="w-5 h-5 text-orange-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                          </svg>
                          <span className="text-white text-sm truncate">{currentCustomAudio.audioName}</span>
                          {currentCustomAudio.isApplied && (
                            <span className="px-1.5 py-0.5 bg-green-900/50 text-green-400 text-xs rounded flex-shrink-0">
                              Applied
                            </span>
                          )}
                        </div>
                        <button
                          onClick={handleRevertCustomAudio}
                          className="p-1 text-zinc-400 hover:text-red-400 transition-colors flex-shrink-0"
                          title={currentCustomAudio.isApplied ? "Remove from short (keeps audio for re-apply)" : "Remove audio"}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      {/* Audio preview player */}
                      <div className="p-3 bg-zinc-900/50 rounded-lg">
                        <p className="text-xs text-zinc-500 mb-2">Preview:</p>
                        <audio
                          controls
                          className="w-full h-8"
                          src={`data:audio/mp3;base64,${currentCustomAudio.audioData}`}
                        />
                      </div>

                      <div className="p-4 bg-zinc-900/50 rounded-lg">
                        <VolumeSlider
                          label="Custom Audio Volume"
                          value={audio.customVolume}
                          onChange={(v) => setAudio((prev) => ({ ...prev, customVolume: v }))}
                          color="orange"
                        />
                      </div>

                      {/* Upload different button - this replaces the audio entirely */}
                      <button
                        onClick={() => {
                          // If applied, revert first before allowing new upload
                          if (currentCustomAudio.isApplied) {
                            handleRevertCustomAudio();
                          }
                          audioInputRef.current?.click();
                        }}
                        className="w-full px-3 py-2 border border-zinc-600 hover:border-orange-500 text-zinc-400 hover:text-orange-400 rounded-lg transition-colors text-sm"
                      >
                        Upload Different Audio
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => audioInputRef.current?.click()}
                      className="w-full px-4 py-8 border-2 border-dashed border-zinc-600 hover:border-orange-500 text-zinc-400 hover:text-orange-400 rounded-lg transition-colors flex flex-col items-center justify-center gap-2"
                    >
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span>Upload background music</span>
                    </button>
                  )}
                </div>

                {/* Apply Button */}
                <button
                  onClick={handleApplyAudioChanges}
                  disabled={audio.processing || audio.separating || (!currentClipHasSeparatedAudio && !currentCustomAudio)}
                  className="w-full px-6 py-4 bg-green-600 hover:bg-green-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-lg"
                >
                  {audio.processing ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Applying Changes...
                    </>
                  ) : currentCustomAudio?.isApplied ? (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Re-apply with New Settings
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Apply Audio Changes
                    </>
                  )}
                </button>

                {!currentClipHasSeparatedAudio && !currentCustomAudio && (
                  <p className="text-xs text-zinc-500 text-center">
                    Separate audio or upload custom audio to enable this button
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Caption Debug Section */}
        {selectedClip?.processed.caption_debug && (
          <details className="mt-8 bg-zinc-800/50 border border-zinc-700 rounded-xl">
            <summary className="p-4 cursor-pointer hover:bg-zinc-700/30 rounded-xl transition-colors">
              <div className="inline-flex items-center gap-3">
                <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                <span className="text-sm font-medium text-zinc-400">Debug Captioning</span>
              </div>
            </summary>
            <div className="p-6 pt-2">
            {(() => {
              const debug = selectedClip.processed.caption_debug!;
              return (
                <div className="space-y-6">
                  {/* Settings Used */}
                  <div className="p-4 bg-zinc-900/50 rounded-lg">
                    <h3 className="text-sm font-medium text-zinc-400 mb-2">Settings Used</h3>
                    <div className="flex gap-6 text-sm">
                      <div>
                        <span className="text-zinc-500">Max Words per Group:</span>{" "}
                        <span className="text-white font-mono">{debug.settings.words_per_group}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Silence Threshold:</span>{" "}
                        <span className="text-white font-mono">{debug.settings.silence_threshold}s</span>{" "}
                        <span className="text-zinc-600">({debug.settings.silence_threshold * 1000}ms)</span>
                      </div>
                    </div>
                  </div>

                  {/* Summary Stats */}
                  <div className="p-4 bg-zinc-900/50 rounded-lg">
                    <h3 className="text-sm font-medium text-zinc-400 mb-2">Summary</h3>
                    <div className="flex gap-6 text-sm">
                      <div>
                        <span className="text-zinc-500">Total Words:</span>{" "}
                        <span className="text-white font-mono">{debug.words.length}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Caption Groups:</span>{" "}
                        <span className="text-white font-mono">{debug.groups.length}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Silence Breaks Detected:</span>{" "}
                        <span className="text-yellow-400 font-mono">
                          {debug.gaps.filter(g => g.is_silence_break).length}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Caption Groups Timeline */}
                  <div>
                    <h3 className="text-sm font-medium text-zinc-400 mb-3">Caption Groups (what appears on screen)</h3>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {debug.groups.map((group, idx) => {
                        const gapAfter = debug.gaps.find(g => g.after_group === idx);
                        return (
                          <div key={idx}>
                            <div className={`p-3 rounded-lg border ${
                              group.word_count < debug.settings.words_per_group
                                ? "bg-yellow-900/20 border-yellow-700/50"
                                : "bg-zinc-900/50 border-zinc-700/50"
                            }`}>
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs text-zinc-500">Group {idx + 1}</span>
                                    {group.word_count < debug.settings.words_per_group && (
                                      <span className="px-1.5 py-0.5 bg-yellow-900/50 text-yellow-400 text-xs rounded">
                                        {group.word_count} word{group.word_count > 1 ? "s" : ""} (silence break)
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-white font-medium">&quot;{group.text}&quot;</p>
                                </div>
                                <div className="text-right text-xs">
                                  <div className="text-zinc-400">
                                    {group.start.toFixed(2)}s - {group.end.toFixed(2)}s
                                  </div>
                                  <div className="text-zinc-500">
                                    ({group.duration.toFixed(2)}s)
                                  </div>
                                </div>
                              </div>
                              {/* Word-level timing */}
                              <div className="mt-2 flex flex-wrap gap-1">
                                {group.words.map((word, wIdx) => (
                                  <span
                                    key={wIdx}
                                    className="px-2 py-0.5 bg-zinc-800 text-zinc-300 text-xs rounded"
                                    title={`${word.start.toFixed(2)}s - ${word.end.toFixed(2)}s`}
                                  >
                                    {word.word}
                                    <span className="text-zinc-600 ml-1">
                                      {word.start.toFixed(1)}s
                                    </span>
                                  </span>
                                ))}
                              </div>
                            </div>
                            {/* Gap indicator */}
                            {gapAfter && (
                              <div className={`my-1 px-3 py-1 text-xs flex items-center gap-2 ${
                                gapAfter.is_silence_break
                                  ? "text-yellow-400"
                                  : "text-zinc-600"
                              }`}>
                                <div className={`flex-1 border-t ${
                                  gapAfter.is_silence_break
                                    ? "border-yellow-700 border-dashed"
                                    : "border-zinc-700"
                                }`} />
                                <span>
                                  {gapAfter.gap_seconds > 0 ? `+${gapAfter.gap_seconds.toFixed(3)}s gap` : "no gap"}
                                  {gapAfter.is_silence_break && " (BREAK)"}
                                </span>
                                <div className={`flex-1 border-t ${
                                  gapAfter.is_silence_break
                                    ? "border-yellow-700 border-dashed"
                                    : "border-zinc-700"
                                }`} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Raw Word Timestamps (collapsible) */}
                  <details className="p-4 bg-zinc-900/50 rounded-lg">
                    <summary className="text-sm font-medium text-zinc-400 cursor-pointer hover:text-zinc-300">
                      Raw Word Timestamps ({debug.words.length} words)
                    </summary>
                    <div className="mt-3 max-h-48 overflow-y-auto">
                      <div className="flex flex-wrap gap-1">
                        {debug.words.map((word, idx) => {
                          // Check if there's a big gap before this word
                          const prevWord = idx > 0 ? debug.words[idx - 1] : null;
                          const gapBefore = prevWord ? word.start - prevWord.end : 0;
                          const isSilenceBreak = gapBefore > debug.settings.silence_threshold;

                          return (
                            <span key={idx} className="flex items-center">
                              {isSilenceBreak && (
                                <span className="text-yellow-500 mx-1">|</span>
                              )}
                              <span
                                className={`px-1.5 py-0.5 text-xs rounded ${
                                  isSilenceBreak
                                    ? "bg-yellow-900/30 text-yellow-300"
                                    : "bg-zinc-800 text-zinc-400"
                                }`}
                                title={`${word.start.toFixed(3)}s - ${word.end.toFixed(3)}s${
                                  isSilenceBreak ? ` (${gapBefore.toFixed(3)}s gap before)` : ""
                                }`}
                              >
                                {word.word}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </details>
                </div>
              );
            })()}
            </div>
          </details>
        )}
      </main>
    </div>
  );
}
