"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
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
    caption_error?: string;
  };
}

interface AudioMixState {
  isOpen: boolean;
  clipIndex: number | null;
  separating: boolean;
  processing: boolean;
  hasSeparated: boolean;
  vocalsAudio: string | null;
  musicAudio: string | null;
  customAudio: string | null;
  customAudioName: string | null;
  // Mix settings
  useVocals: boolean;
  useMusic: boolean;
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
  const colorClasses = {
    purple: "bg-purple-500",
    green: "bg-green-500",
    blue: "bg-blue-500",
    orange: "bg-orange-500",
  };

  return (
    <div className="space-y-2">
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
        className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${
          disabled ? "bg-zinc-700 opacity-50" : "bg-zinc-700"
        }`}
        style={{
          background: disabled
            ? undefined
            : `linear-gradient(to right, ${
                color === "purple"
                  ? "#a855f7"
                  : color === "green"
                  ? "#22c55e"
                  : color === "blue"
                  ? "#3b82f6"
                  : "#f97316"
              } 0%, ${
                color === "purple"
                  ? "#a855f7"
                  : color === "green"
                  ? "#22c55e"
                  : color === "blue"
                  ? "#3b82f6"
                  : "#f97316"
              } ${value * 50}%, #3f3f46 ${value * 50}%, #3f3f46 100%)`,
        }}
      />
    </div>
  );
}

export default function ResultsPage() {
  const [processedClips, setProcessedClipsState] = useState<ProcessedClip[]>([]);
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [demucsAvailable, setDemucsAvailable] = useState<boolean | null>(null);
  const [audioMix, setAudioMix] = useState<AudioMixState>({
    isOpen: false,
    clipIndex: null,
    separating: false,
    processing: false,
    hasSeparated: false,
    vocalsAudio: null,
    musicAudio: null,
    customAudio: null,
    customAudioName: null,
    useVocals: true,
    useMusic: true,
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
      // Create blob URLs for videos
      const urls = clips.map((clip) => {
        if (clip.processed.success && clip.processed.video_data) {
          const blob = base64ToBlob(clip.processed.video_data, "video/mp4");
          return URL.createObjectURL(blob);
        }
        return "";
      });
      setVideoUrls(urls);
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

  const openAudioMixer = (index: number) => {
    setAudioMix({
      isOpen: true,
      clipIndex: index,
      separating: false,
      processing: false,
      hasSeparated: false,
      vocalsAudio: null,
      musicAudio: null,
      customAudio: null,
      customAudioName: null,
      useVocals: true,
      useMusic: true,
      vocalsVolume: 1.0,
      musicVolume: 1.0,
      customVolume: 0.5,
    });
  };

  const closeAudioMixer = () => {
    setAudioMix((prev) => ({ ...prev, isOpen: false, clipIndex: null }));
  };

  const handleSeparateAudio = async () => {
    if (audioMix.clipIndex === null) return;
    const clip = processedClips[audioMix.clipIndex];
    if (!clip?.processed.video_data) return;

    setAudioMix((prev) => ({ ...prev, separating: true }));

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
        setAudioMix((prev) => ({
          ...prev,
          hasSeparated: true,
          vocalsAudio: data.vocals,
          musicAudio: data.music,
        }));
      }
    } catch {
      alert("Failed to separate audio. Make sure the backend is running.");
    } finally {
      setAudioMix((prev) => ({ ...prev, separating: false }));
    }
  };

  const handleCustomAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      setAudioMix((prev) => ({
        ...prev,
        customAudio: base64,
        customAudioName: file.name,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleApplyAudioMix = async () => {
    if (audioMix.clipIndex === null) return;
    const clip = processedClips[audioMix.clipIndex];
    if (!clip?.processed.video_data) return;

    setAudioMix((prev) => ({ ...prev, processing: true }));

    try {
      const response = await fetch(`${API_URL}/api/audio/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_data: clip.processed.video_data,
          audio_options: {
            separate: audioMix.hasSeparated,
            use_vocals: audioMix.useVocals,
            use_music: audioMix.useMusic,
            vocals_volume: audioMix.vocalsVolume,
            music_volume: audioMix.musicVolume,
            custom_audio: audioMix.customAudio,
            custom_audio_volume: audioMix.customVolume,
          },
        }),
      });

      const data = await response.json();

      if (data.error) {
        alert(`Processing failed: ${data.error}`);
      } else {
        // Update the clip with new video data
        const newClips = [...processedClips];
        newClips[audioMix.clipIndex] = {
          ...newClips[audioMix.clipIndex],
          processed: {
            ...newClips[audioMix.clipIndex].processed,
            video_data: data.video_data,
            file_size: data.file_size,
          },
        };
        setProcessedClipsState(newClips);
        setProcessedClips(newClips); // Update store

        // Update video URL
        const newUrls = [...videoUrls];
        if (newUrls[audioMix.clipIndex]) {
          URL.revokeObjectURL(newUrls[audioMix.clipIndex]);
        }
        const blob = base64ToBlob(data.video_data, "video/mp4");
        newUrls[audioMix.clipIndex] = URL.createObjectURL(blob);
        setVideoUrls(newUrls);

        closeAudioMixer();
      }
    } catch {
      alert("Failed to process audio. Make sure the backend is running.");
    } finally {
      setAudioMix((prev) => ({ ...prev, processing: false }));
    }
  };

  // No clips - redirect to region selector
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
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {processedClips.map((clip, index) => (
            <div
              key={index}
              className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg"
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
                  {/* Action buttons */}
                  <div className="space-y-2">
                    <button
                      onClick={() => openAudioMixer(index)}
                      className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                      Audio Mixer
                    </button>
                    <button
                      onClick={() => downloadClip(clip)}
                      className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download
                    </button>
                  </div>
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

      {/* Audio Mixer Modal */}
      {audioMix.isOpen && audioMix.clipIndex !== null && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-4 border-b border-zinc-700 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                Audio Mixer
              </h2>
              <button
                onClick={closeAudioMixer}
                className="p-2 text-zinc-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* AI Separation Section */}
              <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  AI Audio Separation
                </h3>
                <p className="text-zinc-400 text-sm mb-4">
                  Use AI to separate vocals from music, so you can adjust them independently.
                </p>

                {!demucsAvailable ? (
                  <div className="p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg text-amber-400 text-sm">
                    Demucs not installed. Run: <code className="bg-zinc-800 px-1 rounded">pip install demucs</code>
                  </div>
                ) : audioMix.hasSeparated ? (
                  <div className="p-3 bg-green-900/30 border border-green-700/50 rounded-lg text-green-400 text-sm flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Audio separated! Adjust vocals and music below.
                  </div>
                ) : (
                  <button
                    onClick={handleSeparateAudio}
                    disabled={audioMix.separating}
                    className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {audioMix.separating ? (
                      <>
                        <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Separating Audio... (this may take a minute)
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
                  Volume Controls
                </h3>

                {/* Vocals */}
                <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={audioMix.useVocals}
                        onChange={(e) => setAudioMix((prev) => ({ ...prev, useVocals: e.target.checked }))}
                        className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-green-500 focus:ring-green-500"
                      />
                      <span className="text-white">Vocals / Speech</span>
                    </label>
                    {!audioMix.hasSeparated && (
                      <span className="text-xs text-zinc-500">(Original audio)</span>
                    )}
                  </div>
                  <VolumeSlider
                    label="Volume"
                    value={audioMix.vocalsVolume}
                    onChange={(v) => setAudioMix((prev) => ({ ...prev, vocalsVolume: v }))}
                    disabled={!audioMix.useVocals}
                    color="green"
                  />
                </div>

                {/* Music */}
                <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={audioMix.useMusic}
                        onChange={(e) => setAudioMix((prev) => ({ ...prev, useMusic: e.target.checked }))}
                        className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-white">Background Music</span>
                    </label>
                    {!audioMix.hasSeparated && (
                      <span className="text-xs text-zinc-500">(Separate first)</span>
                    )}
                  </div>
                  <VolumeSlider
                    label="Volume"
                    value={audioMix.musicVolume}
                    onChange={(v) => setAudioMix((prev) => ({ ...prev, musicVolume: v }))}
                    disabled={!audioMix.useMusic || !audioMix.hasSeparated}
                    color="blue"
                  />
                </div>
              </div>

              {/* Custom Audio Upload */}
              <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Custom Audio
                </h3>
                <p className="text-zinc-400 text-sm mb-4">
                  Upload your own background music or sound effects to mix in.
                </p>

                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleCustomAudioUpload}
                  className="hidden"
                />

                {audioMix.customAudio ? (
                  <div className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                      <span className="text-white text-sm truncate max-w-[200px]">
                        {audioMix.customAudioName}
                      </span>
                    </div>
                    <button
                      onClick={() => setAudioMix((prev) => ({ ...prev, customAudio: null, customAudioName: null }))}
                      className="p-1 text-zinc-400 hover:text-red-400 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => audioInputRef.current?.click()}
                    className="w-full px-4 py-3 border-2 border-dashed border-zinc-600 hover:border-orange-500 text-zinc-400 hover:text-orange-400 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Upload Audio File
                  </button>
                )}

                {audioMix.customAudio && (
                  <div className="mt-4">
                    <VolumeSlider
                      label="Custom Audio Volume"
                      value={audioMix.customVolume}
                      onChange={(v) => setAudioMix((prev) => ({ ...prev, customVolume: v }))}
                      color="orange"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-zinc-700 flex gap-3">
              <button
                onClick={closeAudioMixer}
                className="flex-1 px-4 py-3 bg-zinc-700 hover:bg-zinc-600 text-white font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyAudioMix}
                disabled={audioMix.processing || audioMix.separating}
                className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {audioMix.processing ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Processing...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Apply Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
