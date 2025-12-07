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

export default function BestOfPage() {
  const [url, setUrl] = useState("");
  const [numClips, setNumClips] = useState(5);
  const [avgClipLength, setAvgClipLength] = useState(60); // seconds
  const [customPrompt, setCustomPrompt] = useState("");

  // Calculate estimated total duration
  const estimatedDuration = numClips * avgClipLength;
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const [useCrossfade, setUseCrossfade] = useState(false);
  const [crossfadeDuration, setCrossfadeDuration] = useState(0.5);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploadedVideoPath, setUploadedVideoPath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [moments, setMoments] = useState<Moment[]>([]);
  const [compilation, setCompilation] = useState<CompilationResult | null>(null);
  const [compilationUrl, setCompilationUrl] = useState("");

  const [error, setError] = useState("");
  const [missingEnv, setMissingEnv] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5005";

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

  const handleProcess = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!uploadedVideoPath) {
      setError("Please upload a video file first");
      return;
    }

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

      const detectResponse = await fetch(`${API_URL}/api/bestof/detect-moments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          num_clips: numClips,
          target_duration_minutes: Math.round(estimatedDuration / 60),
          avg_clip_length_seconds: avgClipLength,
          custom_prompt: customPrompt || undefined,
        }),
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
      } else {
        setCompilation(compileData);

        // Create blob URL for video preview
        const blob = base64ToBlob(compileData.video_data);
        const url = URL.createObjectURL(blob);
        setCompilationUrl(url);
      }
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

  const canSubmit = url && uploadedVideoPath && !uploading;

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

        {/* Missing Environment Variables */}
        {missingEnv ? (
          <MissingEnvMessage missingVar={missingEnv} />
        ) : (
          <>
            {/* Input Form */}
            <form onSubmit={handleProcess} className="space-y-6 mb-8">
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

              {/* YouTube URL */}
              <div className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                <label className="block text-sm font-medium text-white mb-2">
                  YouTube URL (for transcript)
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                  required
                />
                <p className="mt-2 text-sm text-zinc-500">
                  We use the YouTube transcript to identify the best moments
                </p>
              </div>

              {/* Options */}
              <div className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg space-y-4">
                <h3 className="text-white font-medium mb-4">Compilation Options</h3>

                <div className="grid md:grid-cols-2 gap-4">
                  {/* Number of clips */}
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
                        <option key={n} value={n}>
                          {n} clips
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Average clip length */}
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">
                      Avg Clip Length
                    </label>
                    <select
                      value={avgClipLength}
                      onChange={(e) => setAvgClipLength(parseInt(e.target.value))}
                      className="w-full px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                    >
                      <option value={30}>~30 seconds</option>
                      <option value={60}>~1 minute</option>
                      <option value={90}>~1.5 minutes</option>
                      <option value={120}>~2 minutes</option>
                      <option value={180}>~3 minutes</option>
                    </select>
                  </div>
                </div>

                {/* Estimated total duration */}
                <div className="text-sm text-zinc-400 bg-zinc-900/50 px-4 py-2 rounded-lg">
                  Estimated total duration:{" "}
                  <span className="text-purple-400 font-medium">
                    ~{Math.round(estimatedDuration / 60)} minutes
                  </span>
                  {" "}({numClips} clips × {avgClipLength >= 60 ? `${avgClipLength / 60} min` : `${avgClipLength}s`})
                </div>

                {/* Crossfade option */}
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

                {/* Custom prompt toggle */}
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
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
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

              {/* Error Message */}
              {error && (
                <div className="p-4 bg-red-900/20 border border-red-700/50 rounded-lg text-red-400">
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!canSubmit || loading}
                className="w-full py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
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
                    Create Best-Of Compilation
                  </>
                )}
              </button>
            </form>

            {/* Results */}
            {compilation && compilationUrl && (
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

                  <button
                    onClick={handleDownload}
                    className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Download Compilation
                  </button>
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

                {/* Detected Moments (full list) */}
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
