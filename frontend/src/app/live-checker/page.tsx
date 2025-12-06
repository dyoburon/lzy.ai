"use client";

import Link from "next/link";
import { useState } from "react";

interface LiveStream {
  video_id: string;
  title: string;
  url: string;
  thumbnail: string;
}

interface LiveResult {
  is_live: boolean;
  streams: LiveStream[];
  channel_id: string;
  error?: string;
}

export default function LiveCheckerPage() {
  const [channelId, setChannelId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LiveResult | null>(null);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/api/youtube/live-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId }),
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
      {/* Header */}
      <header className="border-b border-zinc-700/50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/" className="text-2xl font-bold text-white">
            lzy<span className="text-purple-500">.ai</span>
          </Link>
          <span className="text-zinc-600">/</span>
          <span className="text-zinc-400">Live Status Checker</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white mb-4">
            YouTube Live Status Checker
          </h1>
          <p className="text-zinc-400">
            Enter a YouTube Channel ID to check if they&apos;re currently live streaming.
          </p>
        </div>

        {/* Channel ID Input Form */}
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex gap-3">
            <input
              type="text"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              placeholder="YouTube Channel ID (e.g., UCxxxxxxxxxxxxxxxx)"
              className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {loading ? "Checking..." : "Check"}
            </button>
          </div>
          <p className="text-zinc-500 text-sm mt-2">
            Tip: You can find the Channel ID in the channel&apos;s About page URL or using online tools.
          </p>
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
            {/* Live Status Badge */}
            <div className="flex items-center justify-center">
              {result.is_live ? (
                <div className="flex items-center gap-3 px-6 py-4 bg-red-900/30 border border-red-600 rounded-xl">
                  <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-2xl font-bold text-red-400">LIVE NOW</span>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-6 py-4 bg-zinc-800/50 border border-zinc-700 rounded-xl">
                  <div className="w-4 h-4 bg-zinc-500 rounded-full" />
                  <span className="text-2xl font-bold text-zinc-400">Not Live</span>
                </div>
              )}
            </div>

            {/* Live Streams List */}
            {result.is_live && result.streams.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white text-center">
                  Current Streams
                </h2>
                <div className="grid gap-4">
                  {result.streams.map((stream) => (
                    <a
                      key={stream.video_id}
                      href={stream.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex gap-4 p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg hover:border-red-500/50 transition-colors"
                    >
                      {stream.thumbnail && (
                        <img
                          src={stream.thumbnail}
                          alt={stream.title}
                          className="w-40 h-auto rounded"
                        />
                      )}
                      <div className="flex flex-col justify-center">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                          <span className="text-red-400 text-sm font-medium">LIVE</span>
                        </div>
                        <h3 className="text-white font-medium">{stream.title}</h3>
                      </div>
                    </a>
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
