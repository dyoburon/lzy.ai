"use client";

import Link from "next/link";
import { useState } from "react";

interface TranscriptEntry {
  timestamp: string;
  text: string;
  start: number;
}

interface TranscriptResult {
  transcript: TranscriptEntry[];
  chapters: string;
  video_id: string;
  error?: string;
}

export default function TranscriptPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TranscriptResult | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"chapters" | "transcript">("chapters");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/api/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError("Failed to connect to the server. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
      {/* Header */}
      <header className="border-b border-zinc-700/50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/" className="text-2xl font-bold text-white">
            lzy<span className="text-purple-500">.ai</span>
          </Link>
          <span className="text-zinc-600">/</span>
          <span className="text-zinc-400">Transcript & Chapters</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white mb-4">
            YouTube Transcript & Chapters
          </h1>
          <p className="text-zinc-400">
            Paste a YouTube URL to extract the transcript and generate AI-powered chapters.
          </p>
        </div>

        {/* URL Input Form */}
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex gap-3">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {loading ? "Processing..." : "Generate"}
            </button>
          </div>
        </form>

        {/* Error Message */}
        {error && (
          <div className="mb-8 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Video Preview */}
            {result.video_id && (
              <div className="aspect-video rounded-lg overflow-hidden bg-zinc-800">
                <iframe
                  src={`https://www.youtube.com/embed/${result.video_id}`}
                  className="w-full h-full"
                  allowFullScreen
                />
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 border-b border-zinc-700">
              <button
                onClick={() => setActiveTab("chapters")}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === "chapters"
                    ? "text-purple-400 border-b-2 border-purple-400"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Chapters
              </button>
              <button
                onClick={() => setActiveTab("transcript")}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === "transcript"
                    ? "text-purple-400 border-b-2 border-purple-400"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Full Transcript
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === "chapters" && (
              <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-white">Generated Chapters</h2>
                  <button
                    onClick={() => copyToClipboard(result.chapters)}
                    className="text-sm px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <pre className="text-zinc-300 whitespace-pre-wrap font-mono text-sm">
                  {result.chapters}
                </pre>
              </div>
            )}

            {activeTab === "transcript" && (
              <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-6 max-h-96 overflow-y-auto">
                <h2 className="text-lg font-semibold text-white mb-4">Full Transcript</h2>
                <div className="space-y-2">
                  {result.transcript.map((entry, index) => (
                    <div key={index} className="flex gap-3">
                      <span className="text-purple-400 font-mono text-sm min-w-[60px]">
                        {entry.timestamp}
                      </span>
                      <span className="text-zinc-300 text-sm">{entry.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
