"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { setPendingClips } from "@/lib/clipStore";

interface Moment {
  start_time: string;
  end_time: string;
  title: string;
  reason: string;
  viral_score: number;
}

interface ClipResult {
  moment: Moment;
  clip_result: {
    success?: boolean;
    video_data?: string;  // base64 encoded video
    filename?: string;
    error?: string;
    duration_seconds?: number;
    file_size?: number;
  };
}

interface DetectResult {
  video_id: string;
  moments: Moment[];
  transcript_preview: string;
  error?: string;
  missing_env?: string;
}

interface ClipResponse {
  clips: ClipResult[];
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

export default function ShortsPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [numClips, setNumClips] = useState(3);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploadedVideoPath, setUploadedVideoPath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detectResult, setDetectResult] = useState<DetectResult | null>(null);
  const [clipResult, setClipResult] = useState<ClipResponse | null>(null);
  const [clipVideoUrls, setClipVideoUrls] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [missingEnv, setMissingEnv] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5005";

  // Navigate to region selector with clips
  const handleProcessToVertical = () => {
    if (!clipResult?.clips) return;
    // Store clips in memory (avoids sessionStorage 5MB limit)
    setPendingClips(clipResult.clips);
    router.push("/region-selector");
  };

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      clipVideoUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [clipVideoUrls]);

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

      xhr.open("POST", `${API_URL}/api/shorts/upload`);
      xhr.send(formData);
    } catch {
      setError("Failed to upload video");
      setVideoFile(null);
      setUploading(false);
    }
  };

  const base64ToBlob = (base64: string, mimeType: string = 'video/mp4'): Blob => {
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
    setDetectResult(null);
    setClipResult(null);
    // Cleanup old blob URLs
    clipVideoUrls.forEach(url => URL.revokeObjectURL(url));
    setClipVideoUrls([]);

    try {
      // Step 1: Detect moments
      const detectResponse = await fetch(`${API_URL}/api/shorts/detect-moments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, num_clips: numClips }),
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

      setDetectResult(detectData);

      // Step 2: Clip the video automatically
      const clipResponse = await fetch(`${API_URL}/api/shorts/clip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_path: uploadedVideoPath,
          moments: detectData.moments,
        }),
      });

      const clipData = await clipResponse.json();

      if (clipData.error) {
        setError(clipData.error);
      } else {
        setClipResult(clipData);

        // Create blob URLs for each clip
        const urls = clipData.clips.map((clip: ClipResult) => {
          if (clip.clip_result.success && clip.clip_result.video_data) {
            const blob = base64ToBlob(clip.clip_result.video_data);
            return URL.createObjectURL(blob);
          }
          return '';
        });
        setClipVideoUrls(urls);
      }
    } catch {
      setError("Failed to connect to the server. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = (index: number) => {
    if (!clipResult || !clipVideoUrls[index]) return;

    const clip = clipResult.clips[index];
    const filename = clip.clip_result.filename || `clip_${index + 1}.mp4`;

    const a = document.createElement('a');
    a.href = clipVideoUrls[index];
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const getViralScoreColor = (score: number) => {
    if (score >= 8) return "text-green-400";
    if (score >= 6) return "text-yellow-400";
    return "text-orange-400";
  };

  const getViralScoreBg = (score: number) => {
    if (score >= 8) return "bg-green-900/30 border-green-700/50";
    if (score >= 6) return "bg-yellow-900/30 border-yellow-700/50";
    return "bg-orange-900/30 border-orange-700/50";
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
            <span className="text-zinc-400">Shorts Clipper</span>
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
          <h1 className="text-4xl font-bold text-white mb-4">
            Shorts Clipper
          </h1>
          <p className="text-zinc-400">
            Upload your video, provide the YouTube URL, and let AI find the best moments.
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
                        <svg className="w-12 h-12 mx-auto animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </div>
                      <p className="text-white font-medium">Uploading... {uploadProgress}%</p>
                      <div className="mt-3 w-full bg-zinc-700 rounded-full h-2">
                        <div
                          className="bg-purple-500 h-2 rounded-full transition-all"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  ) : uploadedVideoPath ? (
                    <div>
                      <div className="text-green-400 mb-2">
                        <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="text-white font-medium">{videoFile?.name}</p>
                      <p className="text-zinc-500 text-sm mt-1">
                        {videoFile && (videoFile.size / (1024 * 1024)).toFixed(2)} MB - Uploaded
                      </p>
                      <p className="text-zinc-600 text-xs mt-2">Click to change</p>
                    </div>
                  ) : (
                    <div>
                      <div className="text-zinc-500 mb-2">
                        <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <p className="text-zinc-400">Click to select video file</p>
                      <p className="text-zinc-600 text-sm mt-1">MP4, MOV, WebM, etc.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* YouTube URL Input */}
              <div className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                <label className="block text-sm font-medium text-white mb-2">
                  YouTube URL
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
                  required
                />
                <p className="mt-2 text-sm text-zinc-500">
                  Used to fetch the transcript for AI analysis
                </p>
              </div>

              {/* Number of Clips */}
              <div className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                <label className="block text-sm font-medium text-white mb-2">
                  Number of Clips <span className="text-zinc-500 font-normal">(1-10)</span>
                </label>
                <input
                  type="number"
                  value={numClips}
                  onChange={(e) => setNumClips(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                  min={1}
                  max={10}
                  className="w-24 px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || !canSubmit}
                className="w-full px-6 py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-lg"
              >
                {loading ? "Processing... (Detecting moments & clipping)" : "Find & Clip Best Moments"}
              </button>
            </form>

            {/* Error Message */}
            {error && (
              <div className="mb-8 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-400">
                {error}
              </div>
            )}

            {/* Results */}
            {clipResult && detectResult && (
              <div className="space-y-8">
                {/* Success Header */}
                <div className="p-6 bg-green-900/20 border border-green-700/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-green-400 mb-2">
                        {clipResult.clips.filter(c => c.clip_result.success).length} Clips Created!
                      </h2>
                      <p className="text-zinc-400 text-sm">
                        Ready to convert to vertical shorts
                      </p>
                    </div>
                    <button
                      onClick={handleProcessToVertical}
                      className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" />
                      </svg>
                      Create Vertical Shorts
                    </button>
                  </div>
                </div>

                {/* Clipped Videos - Debug/Testing Section */}
                <div className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white">
                      Clipped Videos
                    </h2>
                    <span className="text-xs px-2 py-1 bg-amber-900/50 text-amber-400 rounded">
                      DEBUG / TESTING
                    </span>
                  </div>
                  <div className="space-y-6">
                    {clipResult.clips.map((clip, index) => (
                      <div
                        key={index}
                        className={`p-4 rounded-lg border ${getViralScoreBg(clip.moment.viral_score)}`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h3 className="text-white font-medium">{clip.moment.title}</h3>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <span className="text-purple-400 font-mono text-sm">
                                {clip.moment.start_time} - {clip.moment.end_time}
                              </span>
                              <span className={`text-sm font-medium ${getViralScoreColor(clip.moment.viral_score)}`}>
                                Score: {clip.moment.viral_score}/10
                              </span>
                              {clip.clip_result.success && (
                                <>
                                  <span className="text-zinc-400 text-sm">
                                    {clip.clip_result.duration_seconds}s
                                  </span>
                                  {clip.clip_result.file_size && (
                                    <span className="text-zinc-500 text-sm">
                                      {formatFileSize(clip.clip_result.file_size)}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          {clip.clip_result.success ? (
                            <button
                              onClick={() => handleDownload(index)}
                              className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded transition-colors"
                            >
                              Download
                            </button>
                          ) : (
                            <span className="text-red-400">✗</span>
                          )}
                        </div>
                        <p className="text-zinc-400 text-sm mb-3">{clip.moment.reason}</p>

                        {/* Video Player */}
                        {clip.clip_result.success && clipVideoUrls[index] && (
                          <div className="mt-3">
                            <video
                              controls
                              className="w-full rounded-lg bg-black"
                              src={clipVideoUrls[index]}
                            >
                              Your browser does not support the video tag.
                            </video>
                          </div>
                        )}

                        {clip.clip_result.error && (
                          <p className="text-red-400 text-sm mt-2">
                            Error: {clip.clip_result.error}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
