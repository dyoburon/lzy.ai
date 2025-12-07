"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { getProcessedClips } from "@/lib/clipStore";

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
  const [processedClips, setProcessedClips] = useState<ProcessedClip[]>([]);
  const [videoUrls, setVideoUrls] = useState<string[]>([]);

  // Load processed clips from store on mount
  useEffect(() => {
    const clips = getProcessedClips();
    if (clips) {
      setProcessedClips(clips);
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
  }, []);

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
