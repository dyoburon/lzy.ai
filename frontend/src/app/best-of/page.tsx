"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";

interface Moment {
  start_time: string;
  end_time: string;
  title: string;
  reason: string;
  order: number;
}

interface CompilationResult {
  success: boolean;
  video_data: string;
  file_size: number;
  total_duration_seconds: number;
  num_clips: number;
  clips_used: {
    order: number;
    title: string;
    start_time: string;
    end_time: string;
  }[];
  error?: string;
}

interface CaptionOptions {
  enabled: boolean;
  words_per_group: number;
  silence_threshold: number;
  font_size: number;
  font_name: string;
  primary_color: string;
  highlight_color: string;
  highlight_scale: number;
  position_y: number;
}

interface SeparatedAudio {
  vocalsAudio: string;
  musicAudio: string;
  originalVideoData: string;
}

interface CustomAudioCache {
  audioData: string;
  audioName: string;
  preApplyVideoData?: string;
  preApplyFileSize?: number;
  isApplied: boolean;
}

interface AudioState {
  separating: boolean;
  processing: boolean;
  separatedCache: SeparatedAudio | null;
  customAudioCache: CustomAudioCache | null;
  vocalsVolume: number;
  musicVolume: number;
  customVolume: number;
}

const colorMap: Record<string, string> = {
  white: "#FFFFFF",
  yellow: "#FFFF00",
  cyan: "#00FFFF",
  green: "#00FF00",
  red: "#FF0000",
  blue: "#0000FF",
  orange: "#FF8000",
  pink: "#FF00FF",
};

const fontMap: Record<string, string> = {
  "Arial": "Arial, sans-serif",
  "Arial Bold": "Arial, sans-serif",
  "Impact": "Impact, sans-serif",
  "Helvetica": "Helvetica, Arial, sans-serif",
  "Verdana": "Verdana, sans-serif",
  "Georgia": "Georgia, serif",
  "Comic Sans MS": "'Comic Sans MS', cursive",
  "Bebas Neue": "'Bebas Neue', Impact, sans-serif",
  "Oswald": "Oswald, Impact, sans-serif",
  "Montserrat": "Montserrat, Arial, sans-serif",
};

function MissingEnvMessage({ missingVar }: { missingVar: string }) {
  return (
    <div className="p-6 bg-amber-900/20 border border-amber-700/50 rounded-lg">
      <h3 className="text-lg font-semibold text-amber-400 mb-3">
        Setup Required
      </h3>
      <p className="text-zinc-300 mb-4">
        The following environment variable needs to be configured in your{" "}
        <code className="px-1 bg-zinc-800 rounded">.env</code> file:
      </p>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-amber-400">•</span>
        <code className="text-purple-400">{missingVar}</code>
      </div>
      <Link
        href={`/instructions#${missingVar.toLowerCase().replace(/_/g, "-")}`}
        className="inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 transition-colors"
      >
        View setup instructions
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
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
  const sliderColorMap: Record<string, string> = {
    purple: "#a855f7",
    green: "#22c55e",
    blue: "#3b82f6",
    orange: "#f97316",
  };
  const activeColor = sliderColorMap[color] || sliderColorMap.purple;

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

export default function BestOfPage() {
  // Step state: 'upload' | 'settings' | 'results'
  const [step, setStep] = useState<'upload' | 'settings' | 'results'>('upload');

  // Upload state
  const [transcriptMode, setTranscriptMode] = useState<"youtube" | "custom">("youtube");
  const [url, setUrl] = useState("");
  const [customTranscript, setCustomTranscript] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploadedVideoPath, setUploadedVideoPath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Settings state
  const [numClips, setNumClips] = useState(5);
  const [avgClipLength, setAvgClipLength] = useState(60);
  const [customPrompt, setCustomPrompt] = useState("");
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const [useCrossfade, setUseCrossfade] = useState(false);
  const [crossfadeDuration, setCrossfadeDuration] = useState(0.5);

  // Caption options
  const [captionOptions, setCaptionOptions] = useState<CaptionOptions>({
    enabled: false,
    words_per_group: 3,
    silence_threshold: 0.5,
    font_size: 56,
    font_name: "Arial Bold",
    primary_color: "white",
    highlight_color: "yellow",
    highlight_scale: 1.3,
    position_y: 85,
  });

  // Caption preview animation
  const [previewWordIndex, setPreviewWordIndex] = useState(0);
  const previewWords = ["These", "are", "sample", "captions"];

  // Processing state
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [moments, setMoments] = useState<Moment[]>([]);
  const [compilation, setCompilation] = useState<CompilationResult | null>(null);
  const [compilationUrl, setCompilationUrl] = useState("");

  const [error, setError] = useState("");
  const [missingEnv, setMissingEnv] = useState<string | null>(null);

  // Audio mixer state
  const [audio, setAudio] = useState<AudioState>({
    separating: false,
    processing: false,
    separatedCache: null,
    customAudioCache: null,
    vocalsVolume: 1.0,
    musicVolume: 1.0,
    customVolume: 0.5,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5005";

  const estimatedDuration = numClips * avgClipLength;

  // Caption preview animation
  useEffect(() => {
    if (!captionOptions.enabled) return;
    const interval = setInterval(() => {
      setPreviewWordIndex((prev) => (prev + 1) % previewWords.length);
    }, 500);
    return () => clearInterval(interval);
  }, [captionOptions.enabled, previewWords.length]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (compilationUrl) URL.revokeObjectURL(compilationUrl);
    };
  }, [compilationUrl]);

  // Check config on mount
  useEffect(() => {
    const checkConfig = async () => {
      try {
        const response = await fetch(`${API_URL}/api/config`);
        const data = await response.json();

        if (!data.GEMINI_API_KEY?.configured) {
          setMissingEnv("GEMINI_API_KEY");
        }
      } catch {
        // Server not running, will show error on submit
      }
    };
    checkConfig();

  }, [API_URL]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVideoFile(file);
    setUploading(true);
    setUploadProgress(0);
    setError("");

    try {
      const formData = new FormData();
      formData.append("video", file);

      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText);
          setUploadedVideoPath(data.video_path);
        } else {
          const data = JSON.parse(xhr.responseText);
          setError(data.error || "Upload failed");
          setVideoFile(null);
        }
        setUploading(false);
      };

      xhr.onerror = () => {
        setError("Upload failed. Make sure the backend is running.");
        setVideoFile(null);
        setUploading(false);
      };

      xhr.open("POST", `${API_URL}/api/bestof/upload`);
      xhr.send(formData);
    } catch {
      setError("Failed to upload video");
      setVideoFile(null);
      setUploading(false);
    }

    e.target.value = "";
  };

  const base64ToBlob = (base64: string, mimeType: string = "video/mp4"): Blob => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  };

  const handleProcess = async () => {
    setLoading(true);
    setError("");
    setMoments([]);
    setCompilation(null);
    if (compilationUrl) {
      URL.revokeObjectURL(compilationUrl);
      setCompilationUrl("");
    }

    try {
      // Step 1: Detect highlight moments
      setLoadingStep("Analyzing transcript for highlights...");

      const detectBody = transcriptMode === "youtube"
        ? {
            url,
            num_clips: numClips,
            target_duration_minutes: Math.round(estimatedDuration / 60),
            avg_clip_length_seconds: avgClipLength,
            custom_prompt: customPrompt || undefined,
          }
        : {
            custom_transcript: customTranscript,
            num_clips: numClips,
            target_duration_minutes: Math.round(estimatedDuration / 60),
            avg_clip_length_seconds: avgClipLength,
            custom_prompt: customPrompt || undefined,
          };

      const detectResponse = await fetch(`${API_URL}/api/bestof/detect-moments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(detectBody),
      });

      const detectData = await detectResponse.json();

      if (detectData.missing_env) {
        setMissingEnv(detectData.missing_env);
        setLoading(false);
        return;
      }

      if (detectData.error) {
        setError(detectData.error);
        setLoading(false);
        return;
      }

      setMoments(detectData.moments);

      // Step 2: Create compilation
      setLoadingStep("Creating compilation video...");

      const compileResponse = await fetch(`${API_URL}/api/bestof/compile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_path: uploadedVideoPath,
          moments: detectData.moments,
          use_crossfade: useCrossfade,
          crossfade_duration: crossfadeDuration,
        }),
      });

      const compileData = await compileResponse.json();

      if (compileData.error) {
        setError(compileData.error);
        setLoading(false);
        return;
      }

      let finalVideoData = compileData.video_data;
      let finalFileSize = compileData.file_size;

      // Step 3: Add captions if enabled
      if (captionOptions.enabled) {
        setLoadingStep("Adding captions...");

        const captionResponse = await fetch(`${API_URL}/api/captions/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video_data: finalVideoData,
            caption_options: captionOptions,
          }),
        });

        const captionData = await captionResponse.json();

        if (captionData.missing_env) {
          setMissingEnv(captionData.missing_env);
          setLoading(false);
          return;
        }

        if (captionData.error) {
          // Don't fail completely, just note the error
          console.error("Caption error:", captionData.error);
        } else if (captionData.captions_applied) {
          finalVideoData = captionData.video_data;
          finalFileSize = captionData.file_size;
        }
      }

      setCompilation({
        ...compileData,
        video_data: finalVideoData,
        file_size: finalFileSize,
      });

      // Create blob URL for video preview
      const blob = base64ToBlob(finalVideoData);
      const blobUrl = URL.createObjectURL(blob);
      setCompilationUrl(blobUrl);

      setStep('results');
    } catch {
      setError("Failed to connect to the server. Make sure the backend is running.");
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  const handleDownload = () => {
    if (!compilationUrl) return;

    const a = document.createElement("a");
    a.href = compilationUrl;
    a.download = "best_of_compilation.mp4";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Audio mixer handlers
  const handleSeparateAudio = async () => {
    if (!compilation?.video_data) return;

    setAudio((prev) => ({ ...prev, separating: true }));

    try {
      const response = await fetch(`${API_URL}/api/audio/separate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_data: compilation.video_data }),
      });

      const data = await response.json();

      if (data.error) {
        alert(`Separation failed: ${data.error}`);
      } else {
        setAudio((prev) => ({
          ...prev,
          separatedCache: {
            vocalsAudio: data.vocals,
            musicAudio: data.music,
            originalVideoData: compilation.video_data,
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
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      setAudio((prev) => ({
        ...prev,
        customAudioCache: {
          audioData: base64,
          audioName: file.name,
          isApplied: false,
        },
      }));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRevertCustomAudio = () => {
    const customAudio = audio.customAudioCache;
    if (!customAudio) return;

    if (customAudio.isApplied && customAudio.preApplyVideoData && compilation) {
      // Revert video to pre-apply state
      const newCompilation = {
        ...compilation,
        video_data: customAudio.preApplyVideoData,
        file_size: customAudio.preApplyFileSize || compilation.file_size,
      };
      setCompilation(newCompilation);

      // Update video URL
      if (compilationUrl) URL.revokeObjectURL(compilationUrl);
      const blob = base64ToBlob(customAudio.preApplyVideoData);
      setCompilationUrl(URL.createObjectURL(blob));

      // Mark as not applied but keep audio
      setAudio((prev) => ({
        ...prev,
        customAudioCache: {
          audioData: customAudio.audioData,
          audioName: customAudio.audioName,
          isApplied: false,
        },
      }));
    } else {
      // Not applied, just remove from cache
      setAudio((prev) => ({ ...prev, customAudioCache: null }));
    }
  };

  const handleApplyAudioChanges = async () => {
    if (!compilation?.video_data) return;

    const hasCustomAudio = !!audio.customAudioCache;
    const hasSeparatedAudio = !!audio.separatedCache;

    if (!hasSeparatedAudio && !hasCustomAudio) {
      alert("Separate audio first or upload custom audio to apply changes.");
      return;
    }

    setAudio((prev) => ({ ...prev, processing: true }));

    const preApplyVideoData = compilation.video_data;
    const preApplyFileSize = compilation.file_size;

    try {
      const videoDataToUse = audio.separatedCache?.originalVideoData || compilation.video_data;

      const response = await fetch(`${API_URL}/api/audio/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_data: videoDataToUse,
          audio_options: {
            separate: hasSeparatedAudio,
            use_vocals: audio.vocalsVolume > 0,
            use_music: audio.musicVolume > 0,
            vocals_volume: audio.vocalsVolume,
            music_volume: audio.musicVolume,
            vocals_audio: audio.separatedCache?.vocalsAudio,
            music_audio: audio.separatedCache?.musicAudio,
            custom_audio: audio.customAudioCache?.audioData,
            custom_audio_volume: audio.customVolume,
          },
        }),
      });

      const data = await response.json();

      if (data.error) {
        alert(`Processing failed: ${data.error}`);
      } else {
        // Update compilation with new video
        setCompilation((prev) => prev ? {
          ...prev,
          video_data: data.video_data,
          file_size: data.file_size,
        } : null);

        // Update video URL
        if (compilationUrl) URL.revokeObjectURL(compilationUrl);
        const blob = base64ToBlob(data.video_data);
        setCompilationUrl(URL.createObjectURL(blob));

        // Update cache state
        if (hasCustomAudio) {
          setAudio((prev) => ({
            ...prev,
            vocalsVolume: 1.0,
            musicVolume: 1.0,
            customVolume: 0.5,
            customAudioCache: prev.customAudioCache ? {
              ...prev.customAudioCache,
              isApplied: true,
              preApplyVideoData: preApplyVideoData,
              preApplyFileSize: preApplyFileSize,
            } : null,
          }));
        } else {
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

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const canProceedToSettings = uploadedVideoPath && !uploading && (
    transcriptMode === "youtube" ? url : customTranscript.trim()
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
      {/* Header */}
      <header className="border-b border-zinc-700/50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-2xl font-bold text-white">
              lzy<span className="text-purple-500">.ai</span>
            </Link>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400">Best-Of Compiler</span>
          </div>
          <Link
            href="/instructions"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Setup Guide
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white mb-4">Best-Of Compiler</h1>
          <p className="text-zinc-400">
            Turn your livestream or long video into a highlight compilation.
          </p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-4 mb-10">
          {['upload', 'settings', 'results'].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                step === s ? 'bg-purple-600 text-white' :
                ['upload', 'settings', 'results'].indexOf(step) > i ? 'bg-green-600 text-white' :
                'bg-zinc-700 text-zinc-400'
              }`}>
                {['upload', 'settings', 'results'].indexOf(step) > i ? '✓' : i + 1}
              </div>
              <span className={`text-sm ${step === s ? 'text-white' : 'text-zinc-500'}`}>
                {s === 'upload' ? 'Upload' : s === 'settings' ? 'Settings' : 'Results'}
              </span>
              {i < 2 && <div className="w-12 h-0.5 bg-zinc-700" />}
            </div>
          ))}
        </div>

        {/* Missing Environment Variables */}
        {missingEnv ? (
          <MissingEnvMessage missingVar={missingEnv} />
        ) : (
          <>
            {/* Step 1: Upload */}
            {step === 'upload' && (
              <div className="space-y-6">
                {/* Video Upload */}
                <div className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                  <label className="block text-sm font-medium text-white mb-2">
                    Upload Video
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={uploading}
                  />
                  <div
                    onClick={() => !uploading && fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                      uploading
                        ? "border-zinc-700 cursor-not-allowed"
                        : "border-zinc-600 cursor-pointer hover:border-purple-500"
                    }`}
                  >
                    {uploading ? (
                      <div>
                        <div className="text-purple-400 mb-2">
                          Uploading... {uploadProgress}%
                        </div>
                        <div className="w-full bg-zinc-700 rounded-full h-2">
                          <div
                            className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    ) : videoFile ? (
                      <div>
                        <div className="text-green-400 mb-1">Video uploaded</div>
                        <div className="text-zinc-500 text-sm">{videoFile.name}</div>
                      </div>
                    ) : (
                      <div>
                        <svg
                          className="w-12 h-12 mx-auto mb-3 text-zinc-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                          />
                        </svg>
                        <div className="text-zinc-400">
                          Click to upload your livestream/video
                        </div>
                        <div className="text-zinc-600 text-sm mt-1">
                          MP4, MOV, or other video formats
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Transcript Source */}
                <div className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                  <label className="block text-sm font-medium text-white mb-3">
                    Transcript Source
                  </label>

                  {/* Mode Toggle */}
                  <div className="flex gap-2 mb-4">
                    <button
                      type="button"
                      onClick={() => setTranscriptMode("youtube")}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        transcriptMode === "youtube"
                          ? "bg-purple-600 text-white"
                          : "bg-zinc-700 text-zinc-400 hover:text-white"
                      }`}
                    >
                      YouTube URL
                    </button>
                    <button
                      type="button"
                      onClick={() => setTranscriptMode("custom")}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        transcriptMode === "custom"
                          ? "bg-purple-600 text-white"
                          : "bg-zinc-700 text-zinc-400 hover:text-white"
                      }`}
                    >
                      Paste Transcript
                    </button>
                  </div>

                  {transcriptMode === "youtube" ? (
                    <>
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                      />
                      <p className="mt-2 text-sm text-zinc-500">
                        We use the YouTube transcript to identify the best moments
                      </p>
                    </>
                  ) : (
                    <>
                      <textarea
                        value={customTranscript}
                        onChange={(e) => setCustomTranscript(e.target.value)}
                        placeholder="Paste your transcript here...&#10;&#10;Can be plain text, timestamped text, or SRT format."
                        className="w-full h-40 px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 resize-y"
                      />
                      <p className="mt-2 text-sm text-zinc-500">
                        Paste your own transcript for AI to identify highlights
                      </p>
                    </>
                  )}
                </div>

                {/* Error Message */}
                {error && (
                  <div className="p-4 bg-red-900/20 border border-red-700/50 rounded-lg text-red-400">
                    {error}
                  </div>
                )}

                {/* Next Button */}
                <button
                  onClick={() => setStep('settings')}
                  disabled={!canProceedToSettings}
                  className="w-full py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  Continue to Settings
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}

            {/* Step 2: Settings */}
            {step === 'settings' && (
              <div className="space-y-6">
                {/* Clip Settings */}
                <div className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg space-y-4">
                  <h3 className="text-white font-medium">Compilation Settings</h3>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-zinc-400 mb-1">
                        Number of Clips
                      </label>
                      <select
                        value={numClips}
                        onChange={(e) => setNumClips(parseInt(e.target.value))}
                        className="w-full px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                      >
                        {[3, 5, 7, 10, 15, 20].map((n) => (
                          <option key={n} value={n}>{n} clips</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm text-zinc-400 mb-1">
                        Avg Clip Length
                      </label>
                      <select
                        value={avgClipLength}
                        onChange={(e) => setAvgClipLength(parseInt(e.target.value))}
                        className="w-full px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                      >
                        <option value={15}>~15 seconds</option>
                        <option value={30}>~30 seconds</option>
                        <option value={60}>~1 minute</option>
                        <option value={90}>~1.5 minutes</option>
                        <option value={120}>~2 minutes</option>
                        <option value={180}>~3 minutes</option>
                      </select>
                    </div>
                  </div>

                  <div className="text-sm text-zinc-400 bg-zinc-900/50 px-4 py-2 rounded-lg">
                    Estimated total duration:{" "}
                    <span className="text-purple-400 font-medium">
                      ~{Math.round(estimatedDuration / 60)} minutes
                    </span>
                    {" "}({numClips} clips × {avgClipLength >= 60 ? `${avgClipLength / 60} min` : `${avgClipLength}s`})
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="crossfade"
                      checked={useCrossfade}
                      onChange={(e) => setUseCrossfade(e.target.checked)}
                      className="w-4 h-4 text-purple-500 bg-zinc-900 border-zinc-700 rounded focus:ring-purple-500"
                    />
                    <label htmlFor="crossfade" className="text-zinc-300">
                      Add crossfade transitions between clips
                    </label>
                  </div>

                  {useCrossfade && (
                    <div className="ml-7">
                      <label className="block text-sm text-zinc-400 mb-1">
                        Crossfade Duration: {crossfadeDuration}s
                      </label>
                      <input
                        type="range"
                        min="0.25"
                        max="2"
                        step="0.25"
                        value={crossfadeDuration}
                        onChange={(e) => setCrossfadeDuration(parseFloat(e.target.value))}
                        className="w-48"
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowCustomPrompt(!showCustomPrompt)}
                    className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
                  >
                    <svg
                      className={`w-4 h-4 transition-transform ${showCustomPrompt ? "rotate-90" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    Custom instructions for AI
                  </button>

                  {showCustomPrompt && (
                    <textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="e.g., Focus on funny moments and audience reactions. Avoid any technical discussions."
                      className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 h-24"
                    />
                  )}
                </div>

                {/* Caption Settings */}
                <div className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-white font-medium">Animated Captions</h3>
                    <button
                      onClick={() => setCaptionOptions(prev => ({ ...prev, enabled: !prev.enabled }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        captionOptions.enabled ? "bg-purple-600" : "bg-zinc-600"
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        captionOptions.enabled ? "translate-x-6" : "translate-x-1"
                      }`} />
                    </button>
                  </div>

                  {captionOptions.enabled && (
                    <>
                      {/* Caption Preview */}
                      <div className="relative aspect-video bg-zinc-900 rounded-lg overflow-hidden">
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-zinc-600 text-sm">Preview</span>
                        </div>
                        <div
                          className="absolute left-0 right-0 flex justify-center"
                          style={{ top: `${captionOptions.position_y}%`, transform: "translateY(-50%)" }}
                        >
                          <div className="px-4 py-2 rounded-lg" style={{ backgroundColor: 'transparent' }}>
                            <span className="flex justify-center flex-wrap gap-2">
                              {(() => {
                                const startIdx = Math.floor(previewWordIndex / captionOptions.words_per_group) * captionOptions.words_per_group;
                                return previewWords.slice(startIdx, startIdx + captionOptions.words_per_group).map((word, idx) => {
                                  const isActive = idx === previewWordIndex % captionOptions.words_per_group;
                                  const textColor = isActive ? colorMap[captionOptions.highlight_color] : colorMap[captionOptions.primary_color];
                                  return (
                                    <span
                                      key={idx}
                                      style={{
                                        fontFamily: fontMap[captionOptions.font_name] || "Arial, sans-serif",
                                        fontWeight: captionOptions.font_name.includes("Bold") ? "bold" : "normal",
                                        fontSize: `${Math.round(captionOptions.font_size / 4)}px`,
                                        color: textColor,
                                        transform: isActive ? `scale(${captionOptions.highlight_scale})` : "scale(1)",
                                        textShadow: "2px 2px 4px black",
                                        WebkitTextStroke: "1px black",
                                        transition: "all 0.15s ease",
                                      }}
                                    >
                                      {word}
                                    </span>
                                  );
                                });
                              })()}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Caption Controls */}
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">Position: {captionOptions.position_y}%</label>
                          <input
                            type="range"
                            min="10"
                            max="90"
                            value={captionOptions.position_y}
                            onChange={(e) => setCaptionOptions(prev => ({ ...prev, position_y: parseInt(e.target.value) }))}
                            className="w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">Font Size: {captionOptions.font_size}px</label>
                          <input
                            type="range"
                            min="32"
                            max="96"
                            step="4"
                            value={captionOptions.font_size}
                            onChange={(e) => setCaptionOptions(prev => ({ ...prev, font_size: parseInt(e.target.value) }))}
                            className="w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">Max Words: {captionOptions.words_per_group}</label>
                          <input
                            type="range"
                            min="1"
                            max="5"
                            value={captionOptions.words_per_group}
                            onChange={(e) => setCaptionOptions(prev => ({ ...prev, words_per_group: parseInt(e.target.value) }))}
                            className="w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">Highlight Scale: {Math.round(captionOptions.highlight_scale * 100)}%</label>
                          <input
                            type="range"
                            min="100"
                            max="180"
                            step="10"
                            value={captionOptions.highlight_scale * 100}
                            onChange={(e) => setCaptionOptions(prev => ({ ...prev, highlight_scale: parseInt(e.target.value) / 100 }))}
                            className="w-full"
                          />
                        </div>
                      </div>

                      {/* Font Selection */}
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">Font</label>
                        <select
                          value={captionOptions.font_name}
                          onChange={(e) => setCaptionOptions(prev => ({ ...prev, font_name: e.target.value }))}
                          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
                        >
                          {Object.keys(fontMap).map(font => (
                            <option key={font} value={font}>{font}</option>
                          ))}
                        </select>
                      </div>

                      {/* Color Selection */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-zinc-500 mb-2">Text Color</label>
                          <div className="flex flex-wrap gap-2">
                            {Object.keys(colorMap).map(color => (
                              <button
                                key={color}
                                onClick={() => setCaptionOptions(prev => ({ ...prev, primary_color: color }))}
                                className={`w-6 h-6 rounded-full border-2 ${
                                  captionOptions.primary_color === color ? "border-purple-500 scale-110" : "border-zinc-600"
                                }`}
                                style={{ backgroundColor: colorMap[color] }}
                              />
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-2">Highlight Color</label>
                          <div className="flex flex-wrap gap-2">
                            {Object.keys(colorMap).map(color => (
                              <button
                                key={color}
                                onClick={() => setCaptionOptions(prev => ({ ...prev, highlight_color: color }))}
                                className={`w-6 h-6 rounded-full border-2 ${
                                  captionOptions.highlight_color === color ? "border-purple-500 scale-110" : "border-zinc-600"
                                }`}
                                style={{ backgroundColor: colorMap[color] }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      <p className="text-xs text-zinc-500">
                        Captions require OpenAI API key for Whisper transcription
                      </p>
                    </>
                  )}
                </div>

                {/* Error Message */}
                {error && (
                  <div className="p-4 bg-red-900/20 border border-red-700/50 rounded-lg text-red-400">
                    {error}
                  </div>
                )}

                {/* Navigation Buttons */}
                <div className="flex gap-4">
                  <button
                    onClick={() => setStep('upload')}
                    className="flex-1 py-4 bg-zinc-700 hover:bg-zinc-600 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                  </button>
                  <button
                    onClick={handleProcess}
                    disabled={loading}
                    className="flex-[2] py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        {loadingStep || "Processing..."}
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        Create Compilation
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Results */}
            {step === 'results' && compilation && compilationUrl && (
              <div className="space-y-6">
                {/* Compilation Video */}
                <div className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-white">Your Compilation</h2>
                    <div className="flex items-center gap-4 text-sm text-zinc-400">
                      <span>{formatDuration(compilation.total_duration_seconds)}</span>
                      <span>{formatFileSize(compilation.file_size)}</span>
                      <span>{compilation.num_clips} clips</span>
                    </div>
                  </div>

                  <div className="aspect-video bg-black rounded-lg overflow-hidden mb-4">
                    <video
                      src={compilationUrl}
                      controls
                      className="w-full h-full"
                    />
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={handleDownload}
                      className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                      Download
                    </button>
                    <button
                      onClick={() => {
                        setStep('upload');
                        setCompilation(null);
                        if (compilationUrl) URL.revokeObjectURL(compilationUrl);
                        setCompilationUrl("");
                        setMoments([]);
                        setVideoFile(null);
                        setUploadedVideoPath("");
                        setUrl("");
                        setCustomTranscript("");
                        // Reset audio state
                        setAudio({
                          separating: false,
                          processing: false,
                          separatedCache: null,
                          customAudioCache: null,
                          vocalsVolume: 1.0,
                          musicVolume: 1.0,
                          customVolume: 0.5,
                        });
                      }}
                      className="px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-white font-medium rounded-lg transition-colors"
                    >
                      Create Another
                    </button>
                  </div>
                </div>

                {/* Clips Used */}
                <div className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                  <h3 className="text-lg font-medium text-white mb-4">Clips Included</h3>
                  <div className="space-y-2">
                    {compilation.clips_used.map((clip, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-4 p-3 bg-zinc-900/50 rounded-lg"
                      >
                        <span className="w-8 h-8 flex items-center justify-center bg-purple-600 text-white text-sm font-bold rounded-full">
                          {index + 1}
                        </span>
                        <div className="flex-1">
                          <div className="text-white font-medium">{clip.title}</div>
                          <div className="text-sm text-zinc-500">
                            {clip.start_time} - {clip.end_time}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Audio Controls Section */}
                <div className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-xl">
                  <div className="flex items-center gap-3 mb-6">
                    <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                    <h2 className="text-xl font-bold text-white">Audio Controls</h2>
                  </div>

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

                        {audio.separatedCache ? (
                          <div className="space-y-3">
                            <div className="p-3 bg-green-900/30 border border-green-700/50 rounded-lg text-green-400 text-sm flex items-center gap-2">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Audio separated! Adjust volumes below.
                            </div>

                            {/* Preview players */}
                            <div className="p-3 bg-zinc-900/50 rounded-lg space-y-2">
                              <p className="text-xs text-zinc-500 mb-2">Preview separated audio:</p>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-green-400 w-16">Vocals:</span>
                                <audio controls className="h-7 flex-1" src={`data:audio/mp3;base64,${audio.separatedCache.vocalsAudio}`} />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-400 w-16">Music:</span>
                                <audio controls className="h-7 flex-1" src={`data:audio/mp3;base64,${audio.separatedCache.musicAudio}`} />
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
                            disabled={!audio.separatedCache}
                            color="green"
                          />
                          <VolumeSlider
                            label="Background Music"
                            value={audio.musicVolume}
                            onChange={(v) => setAudio((prev) => ({ ...prev, musicVolume: v }))}
                            disabled={!audio.separatedCache}
                            color="blue"
                          />
                          {!audio.separatedCache && (
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

                        {audio.customAudioCache ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg">
                              <div className="flex items-center gap-2 overflow-hidden">
                                <svg className="w-5 h-5 text-orange-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                                </svg>
                                <span className="text-white text-sm truncate">{audio.customAudioCache.audioName}</span>
                                {audio.customAudioCache.isApplied && (
                                  <span className="px-1.5 py-0.5 bg-green-900/50 text-green-400 text-xs rounded flex-shrink-0">
                                    Applied
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={handleRevertCustomAudio}
                                className="p-1 text-zinc-400 hover:text-red-400 transition-colors flex-shrink-0"
                                title={audio.customAudioCache.isApplied ? "Remove from video (keeps audio for re-apply)" : "Remove audio"}
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
                                src={`data:audio/mp3;base64,${audio.customAudioCache.audioData}`}
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

                            {/* Upload different button */}
                            <button
                              onClick={() => {
                                if (audio.customAudioCache?.isApplied) {
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
                        disabled={audio.processing || audio.separating || (!audio.separatedCache && !audio.customAudioCache)}
                        className="w-full px-6 py-4 bg-green-600 hover:bg-green-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-lg"
                      >
                        {audio.processing ? (
                          <>
                            <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Applying Changes...
                          </>
                        ) : audio.customAudioCache?.isApplied ? (
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

                      {!audio.separatedCache && !audio.customAudioCache && (
                        <p className="text-xs text-zinc-500 text-center">
                          Separate audio or upload custom audio to enable this button
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Detected Moments */}
                {moments.length > 0 && (
                  <div className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                    <h3 className="text-lg font-medium text-white mb-4">
                      All Detected Moments
                    </h3>
                    <div className="space-y-3">
                      {moments.map((moment, index) => (
                        <div
                          key={index}
                          className="p-4 bg-zinc-900/50 rounded-lg"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="text-white font-medium">{moment.title}</h4>
                            <span className="text-sm text-zinc-500">
                              {moment.start_time} - {moment.end_time}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-400">{moment.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
