"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { setPendingClips, getPendingIdea, clearPendingIdea } from "@/lib/clipStore";

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
  full_transcript?: string;
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
  const [transcriptMode, setTranscriptMode] = useState<"youtube" | "custom">("youtube");
  const [url, setUrl] = useState("");
  const [customTranscript, setCustomTranscript] = useState("");
  const [numClips, setNumClips] = useState(3);
  const [customPrompt, setCustomPrompt] = useState("");
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
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
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Curator Mode state
  const [curatorMode, setCuratorMode] = useState(false);
  const [selectedMoments, setSelectedMoments] = useState<Set<number>>(new Set());
  const [clipping, setClipping] = useState(false);

  // Wake word feature
  const [wakeWord, setWakeWord] = useState("");
  const [onlyWakeWordClips, setOnlyWakeWordClips] = useState(false);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);

  // Idea context (from idea generator)
  const [ideaContext, setIdeaContext] = useState<{
    title: string;
    hook: string;
    concept?: string;
    source_timestamp?: string;
  } | null>(null);
  const [processingIdea, setProcessingIdea] = useState(false);

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

  // Check for pending idea from idea generator
  useEffect(() => {
    const pendingIdea = getPendingIdea();
    if (pendingIdea && pendingIdea.type === 'shorts') {
      setIdeaContext({
        title: pendingIdea.title,
        hook: pendingIdea.hook,
        concept: pendingIdea.concept,
        source_timestamp: pendingIdea.source_timestamp,
      });

      // Pre-fill custom prompt with idea context
      const promptParts = [];
      if (pendingIdea.source_timestamp) {
        promptParts.push(`Find the moment around ${pendingIdea.source_timestamp}`);
      }
      promptParts.push(`The clip should capture: "${pendingIdea.title}"`);
      if (pendingIdea.concept) {
        promptParts.push(`Concept: ${pendingIdea.concept}`);
      }
      promptParts.push(`Opening hook: "${pendingIdea.hook}"`);
      promptParts.push('Make it engaging for shorts format (under 60 seconds)');

      setCustomPrompt(promptParts.join('\n'));
      setShowCustomPrompt(true);
      setNumClips(1); // Just find this one specific moment
      setTranscriptMode('custom'); // Will need custom transcript or they can switch to YouTube

      // If we have video data, upload it automatically
      if (pendingIdea.videoData && pendingIdea.videoFilename) {
        setProcessingIdea(true);

        // Convert base64 back to File and upload
        const byteCharacters = atob(pendingIdea.videoData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'video/mp4' });
        const file = new File([blob], pendingIdea.videoFilename, { type: 'video/mp4' });

        // Trigger upload
        uploadFile(file).finally(() => {
          setProcessingIdea(false);
        });
      }

      // Clear the pending idea so it's not processed again
      clearPendingIdea();
    }
  }, []);

  // Shared upload function for both click and drag-drop
  const uploadFile = async (file: File) => {
    // Check file type - be lenient since MIME types can be unreliable
    const videoExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v', '.wmv', '.flv'];
    const fileName = file.name.toLowerCase();
    const hasVideoExtension = videoExtensions.some(ext => fileName.endsWith(ext));
    const hasVideoMimeType = file.type.startsWith('video/');

    if (!hasVideoExtension && !hasVideoMimeType) {
      setError(`Please select a video file. Got: ${file.name} (${file.type || 'unknown type'})`);
      return;
    }

    setVideoFile(file);
    setUploading(true);
    setUploadProgress(0);
    setError("");
    setUploadedVideoPath(""); // Clear previous upload

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
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.video_path) {
              setUploadedVideoPath(data.video_path);
            } else {
              setError("Upload succeeded but no video path returned");
              setVideoFile(null);
            }
          } catch {
            setError("Failed to parse server response");
            setVideoFile(null);
          }
        } else {
          try {
            const data = JSON.parse(xhr.responseText);
            setError(data.error || `Upload failed with status ${xhr.status}`);
          } catch {
            setError(`Upload failed with status ${xhr.status}`);
          }
          setVideoFile(null);
        }
        setUploading(false);
      };

      xhr.onerror = () => {
        setError("Upload failed. Make sure the backend is running on " + API_URL);
        setVideoFile(null);
        setUploading(false);
      };

      xhr.ontimeout = () => {
        setError("Upload timed out. The file may be too large.");
        setVideoFile(null);
        setUploading(false);
      };

      xhr.open("POST", `${API_URL}/api/shorts/upload`);
      xhr.timeout = 300000; // 5 minute timeout for large files
      xhr.send(formData);
    } catch (err) {
      setError(`Failed to upload video: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setVideoFile(null);
      setUploading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadFile(file);
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (uploading) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      uploadFile(files[0]);
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

    // In non-curator mode, video must be uploaded first
    // In curator mode, we only need transcript to find moments
    if (!curatorMode && !uploadedVideoPath) {
      setError("Please upload a video file first");
      return;
    }

    setLoading(true);
    setError("");
    setDetectResult(null);
    setClipResult(null);
    setSelectedMoments(new Set());
    // Cleanup old blob URLs
    clipVideoUrls.forEach(url => URL.revokeObjectURL(url));
    setClipVideoUrls([]);

    try {
      // Step 1: Detect moments
      // In curator mode, find 12 moments for user selection
      const effectiveNumClips = curatorMode ? 12 : numClips;
      const detectBody = transcriptMode === "youtube"
        ? {
            url,
            num_clips: effectiveNumClips,
            custom_prompt: customPrompt || undefined,
            curator_mode: curatorMode,
            wake_word: wakeWord || undefined,
            only_wake_word_clips: onlyWakeWordClips
          }
        : {
            custom_transcript: customTranscript,
            num_clips: effectiveNumClips,
            custom_prompt: customPrompt || undefined,
            curator_mode: curatorMode,
            wake_word: wakeWord || undefined,
            only_wake_word_clips: onlyWakeWordClips
          };

      const detectResponse = await fetch(`${API_URL}/api/shorts/detect-moments`, {
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

      setDetectResult(detectData);

      // In curator mode, stop here and let user select moments
      if (curatorMode) {
        setLoading(false);
        return;
      }

      // Step 2: Clip the video automatically (non-curator mode only)
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

  // Clip selected moments (curator mode)
  const handleClipSelectedMoments = async () => {
    if (!detectResult || selectedMoments.size === 0) return;

    setClipping(true);
    setError("");
    // Cleanup old blob URLs
    clipVideoUrls.forEach(url => URL.revokeObjectURL(url));
    setClipVideoUrls([]);

    try {
      // Get only the selected moments
      const momentsToClip = detectResult.moments.filter((_, index) => selectedMoments.has(index));

      const clipResponse = await fetch(`${API_URL}/api/shorts/clip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_path: uploadedVideoPath,
          moments: momentsToClip,
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
      setClipping(false);
    }
  };

  // Toggle moment selection
  const toggleMomentSelection = (index: number) => {
    const newSelected = new Set(selectedMoments);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedMoments(newSelected);
  };

  // Select all moments
  const selectAllMoments = () => {
    if (!detectResult) return;
    const allIndices = new Set(detectResult.moments.map((_, i) => i));
    setSelectedMoments(allIndices);
  };

  // Deselect all moments
  const deselectAllMoments = () => {
    setSelectedMoments(new Set());
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

  // In curator mode, only need transcript to find moments (no video upload required yet)
  // Video upload is required when clipping
  const canSubmit = !uploading && (
    transcriptMode === "youtube" ? url : customTranscript.trim()
  ) && (curatorMode || uploadedVideoPath);

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

          {/* DEBUG: Use Sample Short Button */}
          <button
            onClick={async () => {
              // Fetch sample short from backend
              try {
                const response = await fetch(`${API_URL}/api/debug/sample-short`);
                const data = await response.json();

                if (data.error) {
                  alert(`Error: ${data.error}\n\nTo use this feature, place a sample video at: samples/sample_short.mp4`);
                  return;
                }

                // Create processed clip from sample
                const sampleClip = {
                  moment: {
                    start_time: "0:00",
                    end_time: "0:30",
                    title: "Sample Debug Short",
                    reason: "This is a sample short for testing the audio mixer",
                    viral_score: 8,
                  },
                  original_filename: "sample_short.mp4",
                  processed: {
                    success: true,
                    video_data: data.video_data,
                    file_size: data.file_size,
                    dimensions: { width: 1080, height: 1920 },
                    captions_applied: false,
                  },
                };

                // Store in clip store and navigate
                const { setProcessedClips } = await import("@/lib/clipStore");
                setProcessedClips([sampleClip]);
                router.push("/region-selector/results");
              } catch (err) {
                alert("Failed to load sample short. Make sure the backend is running.");
              }
            }}
            className="mt-4 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2"
          >
            <span className="text-xs px-1.5 py-0.5 bg-amber-800 rounded">DEBUG</span>
            Use Sample Short
          </button>

          {/* DEBUG: Use Sample Clip Button - Goes to editing step */}
          <button
            onClick={async () => {
              // Fetch sample clip from backend
              try {
                const response = await fetch(`${API_URL}/api/debug/sample-clip`);
                const data = await response.json();

                if (data.error) {
                  alert(`Error: ${data.error}\n\nTo use this feature, place a sample video at: samples/sample_clip.mp4`);
                  return;
                }

                // Create raw clip for region selector
                const sampleClip = {
                  moment: {
                    start_time: "0:00",
                    end_time: "0:30",
                    title: "Sample Debug Clip",
                    reason: "This is a sample clip for testing the region selector",
                    viral_score: 8,
                  },
                  clip_result: {
                    success: true,
                    video_data: data.video_data,
                    filename: "sample_clip.mp4",
                    duration_seconds: 30,
                    file_size: data.file_size,
                  },
                };

                // Store in clip store and navigate to region selector (editing step)
                setPendingClips([sampleClip]);
                router.push("/region-selector");
              } catch (err) {
                alert("Failed to load sample clip. Make sure the backend is running.");
              }
            }}
            className="mt-4 ml-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2"
          >
            <span className="text-xs px-1.5 py-0.5 bg-amber-800 rounded">DEBUG</span>
            Use Sample Clip
          </button>
        </div>

        {/* Idea Context Banner */}
        {ideaContext && (
          <div className="mb-6 p-4 bg-gradient-to-r from-orange-900/30 to-red-900/30 border border-orange-700/50 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 p-2 bg-orange-600/20 rounded-lg">
                <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-orange-400 font-medium mb-1">Creating Short from Idea</h3>
                <p className="text-white font-medium">{ideaContext.title}</p>
                {ideaContext.concept && (
                  <p className="text-sm text-zinc-400 mt-1">{ideaContext.concept}</p>
                )}
                {ideaContext.source_timestamp && (
                  <p className="text-xs text-zinc-500 mt-2 font-mono">Source timestamp: @{ideaContext.source_timestamp}</p>
                )}
              </div>
              <button
                onClick={() => {
                  setIdeaContext(null);
                  setCustomPrompt('');
                }}
                className="text-zinc-500 hover:text-white transition-colors"
                title="Dismiss"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {processingIdea && (
              <div className="mt-3 flex items-center gap-2 text-sm text-orange-300">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Auto-uploading video from idea...
              </div>
            )}
          </div>
        )}

        {/* Missing Environment Variables */}
        {missingEnv ? (
          <MissingEnvMessage missingVar={missingEnv} />
        ) : (
          <>
            {/* Input Form */}
            <form onSubmit={handleProcess} className="space-y-6 mb-8">
              {/* Video Upload - Hidden in curator mode (upload happens after finding moments) */}
              {!curatorMode && (
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
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${
                    uploading
                      ? "border-zinc-700 cursor-not-allowed"
                      : isDragging
                      ? "border-purple-500 bg-purple-500/10 scale-[1.02]"
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
                  ) : isDragging ? (
                    <div>
                      <div className="text-purple-400 mb-2">
                        <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <p className="text-purple-400 font-medium">Drop your video here</p>
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
                      <p className="text-zinc-600 text-xs mt-2">Click or drag to change</p>
                    </div>
                  ) : (
                    <div>
                      <div className="text-zinc-500 mb-2">
                        <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <p className="text-zinc-400">Drag and drop your video here</p>
                      <p className="text-zinc-600 text-sm mt-1">or click to browse • MP4, MOV, WebM, etc.</p>
                    </div>
                  )}
                </div>
              </div>
              )}

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
                      className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
                    />
                    <p className="mt-2 text-sm text-zinc-500">
                      Used to fetch the transcript for AI analysis
                    </p>
                  </>
                ) : (
                  <>
                    <textarea
                      value={customTranscript}
                      onChange={(e) => setCustomTranscript(e.target.value)}
                      placeholder="Paste your transcript here...&#10;&#10;Can be plain text, timestamped text, or SRT format."
                      className="w-full h-40 px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors resize-y"
                    />
                    <p className="mt-2 text-sm text-zinc-500">
                      Paste your own transcript for AI to find interesting moments
                    </p>
                  </>
                )}
              </div>

              {/* Curator Mode Toggle */}
              <div className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-medium text-white">
                      Curator Mode
                    </label>
                    <p className="text-sm text-zinc-500 mt-1">
                      Find moments from transcript first, then upload video to clip
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCuratorMode(!curatorMode)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      curatorMode ? 'bg-purple-600' : 'bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        curatorMode ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Number of Clips - hidden in curator mode */}
              {!curatorMode && (
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
              )}

              {/* Wake Word Feature */}
              <div className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                <label className="block text-sm font-medium text-white mb-2">
                  Wake Word <span className="text-zinc-500 font-normal">(Optional)</span>
                </label>
                <p className="text-sm text-zinc-500 mb-3">
                  Find clips where you said a specific word or phrase during the stream
                </p>
                <input
                  type="text"
                  value={wakeWord}
                  onChange={(e) => setWakeWord(e.target.value)}
                  placeholder="e.g., 'clip that', 'highlight', 'save this'"
                  className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
                />

                {/* Only wake word clips toggle - only show when wake word is entered */}
                {wakeWord.trim() && (
                  <div className="mt-4 flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg border border-zinc-700/50">
                    <div>
                      <label className="block text-sm font-medium text-white">
                        Only find clips with this word
                      </label>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Ignore all other moments, only return clips containing &quot;{wakeWord}&quot;
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOnlyWakeWordClips(!onlyWakeWordClips)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        onlyWakeWordClips ? 'bg-purple-600' : 'bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          onlyWakeWordClips ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                )}
              </div>

              {/* Custom Instructions (Optional) */}
              <div className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                <button
                  type="button"
                  onClick={() => setShowCustomPrompt(!showCustomPrompt)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div>
                    <span className="text-sm font-medium text-white">Custom Instructions</span>
                    <span className="ml-2 text-xs px-2 py-0.5 bg-zinc-700 text-zinc-400 rounded">Optional</span>
                  </div>
                  <svg
                    className={`w-5 h-5 text-zinc-400 transition-transform ${showCustomPrompt ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showCustomPrompt && (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm text-zinc-400">
                      Guide the AI to find specific moments. You can describe what you&apos;re looking for or specify exact timestamps.
                    </p>
                    <textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="Examples:&#10;• Find the moment where I talked about the new feature around 15 minutes in&#10;• Only clip the part from 5:30 to 6:00 where I showed the demo&#10;• Look for funny moments, skip the intro&#10;• Find when I said 'this is the best part' - make it 20 seconds max"
                      rows={4}
                      className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition-colors resize-none text-sm"
                    />
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs text-zinc-500">Quick tips:</span>
                      <button
                        type="button"
                        onClick={() => setCustomPrompt(prev => prev + (prev ? '\n' : '') + 'Only find moments between [START] and [END]')}
                        className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded transition-colors"
                      >
                        + Time range
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomPrompt(prev => prev + (prev ? '\n' : '') + 'Keep clips under 30 seconds')}
                        className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded transition-colors"
                      >
                        + Short clips
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomPrompt(prev => prev + (prev ? '\n' : '') + 'Skip the intro and outro')}
                        className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded transition-colors"
                      >
                        + Skip intro/outro
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomPrompt(prev => prev + (prev ? '\n' : '') + 'Focus on funny/entertaining moments')}
                        className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded transition-colors"
                      >
                        + Funny moments
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || !canSubmit}
                className="w-full px-6 py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-lg"
              >
                {loading
                  ? (curatorMode ? "Finding potential moments..." : "Processing... (Detecting moments & clipping)")
                  : (curatorMode ? "Find Potential Moments" : "Find & Clip Best Moments")
                }
              </button>
            </form>

            {/* Error Message */}
            {error && (
              <div className="mb-8 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-400">
                {error}
              </div>
            )}

            {/* Transcript Debug Accordion - Always shows when detectResult exists */}
            {detectResult && (
              <div className="mb-8 bg-zinc-800/50 border border-zinc-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setTranscriptOpen(!transcriptOpen)}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-700/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <svg
                      className={`w-5 h-5 text-zinc-400 transition-transform ${transcriptOpen ? 'rotate-90' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-white font-medium">View Transcript</span>
                    {detectResult.full_transcript || detectResult.transcript_preview ? (
                      <span className="text-zinc-500 text-sm">
                        ({(detectResult.full_transcript || detectResult.transcript_preview || '').length} chars)
                      </span>
                    ) : (
                      <span className="text-red-400 text-sm">(No transcript received)</span>
                    )}
                  </div>
                  <span className="text-xs px-2 py-1 bg-zinc-700 text-zinc-400 rounded">
                    {transcriptOpen ? 'Click to collapse' : 'Click to expand'}
                  </span>
                </button>
                {transcriptOpen && (
                  <div className="p-4 border-t border-zinc-700 max-h-[70vh] overflow-y-auto">
                    {detectResult.full_transcript || detectResult.transcript_preview ? (
                      <pre className="text-zinc-300 text-sm whitespace-pre-wrap font-mono leading-relaxed">
                        {detectResult.full_transcript || detectResult.transcript_preview}
                      </pre>
                    ) : (
                      <div className="text-zinc-500 text-sm">
                        <p className="mb-2">No transcript data available.</p>
                        <p className="text-xs text-zinc-600">Debug info: {JSON.stringify(detectResult, null, 2)}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Curator Mode - Moment Selection Interface */}
            {curatorMode && detectResult && !clipResult && (
              <div className="mb-8 space-y-6">
                {/* Header */}
                <div className="p-6 bg-purple-900/20 border border-purple-700/50 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-xl font-semibold text-purple-400 mb-2">
                        {detectResult.moments.length} Potential Moments Found
                      </h2>
                      <p className="text-zinc-400 text-sm">
                        Select moments below, upload your video, then clip
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={selectAllMoments}
                        className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm rounded transition-colors"
                      >
                        Select All
                      </button>
                      <button
                        onClick={deselectAllMoments}
                        className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm rounded transition-colors"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>
                  <span className="text-sm text-zinc-400">
                    {selectedMoments.size} of {detectResult.moments.length} moments selected
                  </span>
                </div>

                {/* Video Upload Section - Only shows if video not yet uploaded */}
                {!uploadedVideoPath && (
                  <div className="p-6 bg-amber-900/20 border border-amber-700/50 rounded-lg">
                    <div className="flex items-center gap-3 mb-4">
                      <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <div>
                        <h3 className="text-amber-400 font-medium">Upload Video to Clip</h3>
                        <p className="text-zinc-400 text-sm">Upload the video file to create clips from selected moments</p>
                      </div>
                    </div>
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
                      onDragEnter={handleDragEnter}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-lg p-6 text-center transition-all ${
                        uploading
                          ? "border-zinc-700 cursor-not-allowed"
                          : isDragging
                          ? "border-amber-500 bg-amber-500/10 scale-[1.02]"
                          : "border-amber-700/50 cursor-pointer hover:border-amber-500"
                      }`}
                    >
                      {uploading ? (
                        <div>
                          <p className="text-white font-medium mb-2">Uploading... {uploadProgress}%</p>
                          <div className="w-full bg-zinc-700 rounded-full h-2">
                            <div
                              className="bg-amber-500 h-2 rounded-full transition-all"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-zinc-300">Drag and drop your video here or click to browse</p>
                          <p className="text-zinc-500 text-sm mt-1">MP4, MOV, WebM, etc.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Video Uploaded Confirmation */}
                {uploadedVideoPath && (
                  <div className="p-4 bg-green-900/20 border border-green-700/50 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <div>
                        <p className="text-green-400 font-medium">Video Ready</p>
                        <p className="text-zinc-400 text-sm">{videoFile?.name}</p>
                      </div>
                    </div>
                    <button
                      onClick={handleClipSelectedMoments}
                      disabled={clipping || selectedMoments.size === 0}
                      className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                    >
                      {clipping ? (
                        <>
                          <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Clipping...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Clip {selectedMoments.size} Moment{selectedMoments.size !== 1 ? 's' : ''}
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Moment Cards */}
                <div className="grid gap-4">
                  {detectResult.moments.map((moment, index) => (
                    <div
                      key={index}
                      onClick={() => toggleMomentSelection(index)}
                      className={`p-4 rounded-lg border cursor-pointer transition-all ${
                        selectedMoments.has(index)
                          ? 'bg-purple-900/30 border-purple-500'
                          : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        {/* Checkbox */}
                        <div className={`flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                          selectedMoments.has(index)
                            ? 'bg-purple-600 border-purple-600'
                            : 'border-zinc-600'
                        }`}>
                          {selectedMoments.has(index) && (
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-white font-medium truncate pr-4">{moment.title}</h3>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-purple-400 font-mono text-sm">
                                {moment.start_time} - {moment.end_time}
                              </span>
                              <span className={`text-sm font-medium px-2 py-0.5 rounded ${
                                moment.viral_score >= 8
                                  ? 'bg-green-900/50 text-green-400'
                                  : moment.viral_score >= 6
                                  ? 'bg-yellow-900/50 text-yellow-400'
                                  : 'bg-orange-900/50 text-orange-400'
                              }`}>
                                {moment.viral_score}/10
                              </span>
                            </div>
                          </div>
                          <p className="text-zinc-400 text-sm">{moment.reason}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bottom Action - Only show if video is uploaded */}
                {uploadedVideoPath && (
                  <div className="flex justify-center">
                    <button
                      onClick={handleClipSelectedMoments}
                      disabled={clipping || selectedMoments.size === 0}
                      className="px-8 py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-lg flex items-center gap-3"
                    >
                      {clipping ? (
                        <>
                          <svg className="w-6 h-6 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Clipping Selected Moments...
                        </>
                      ) : (
                        <>
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Clip {selectedMoments.size} Selected Moment{selectedMoments.size !== 1 ? 's' : ''}
                        </>
                      )}
                    </button>
                  </div>
                )}
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
