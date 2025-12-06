"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

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
  missing_env?: string[];
}

interface ConfigResult {
  [key: string]: {
    configured: boolean;
    required_for: string[];
    description: string;
  };
}

function MissingEnvMessage({ missingVars }: { missingVars: string[] }) {
  return (
    <div className="p-6 bg-amber-900/20 border border-amber-700/50 rounded-lg">
      <h3 className="text-lg font-semibold text-amber-400 mb-3">
        Setup Required
      </h3>
      <p className="text-zinc-300 mb-4">
        The following environment variables need to be configured in your{" "}
        <code className="px-1 bg-zinc-800 rounded">.env</code> file:
      </p>
      <ul className="space-y-2 mb-4">
        {missingVars.map((envVar) => (
          <li key={envVar} className="flex items-center gap-2">
            <span className="text-amber-400">•</span>
            <code className="text-purple-400">{envVar}</code>
          </li>
        ))}
      </ul>
      <Link
        href={`/instructions#${missingVars[0]?.toLowerCase().replace(/_/g, "-")}`}
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

export default function LiveCheckerPage() {
  const [loading, setLoading] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [result, setResult] = useState<LiveResult | null>(null);
  const [error, setError] = useState("");
  const [missingEnv, setMissingEnv] = useState<string[]>([]);
  const [notifyMissingEnv, setNotifyMissingEnv] = useState<string[]>([]);
  const [notifyResult, setNotifyResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const [config, setConfig] = useState<ConfigResult | null>(null);

  // Check config on mount
  useEffect(() => {
    const checkConfig = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5005"}/api/config`);
        const data = await response.json();
        setConfig(data);

        // Check for missing live-checker vars
        const missing: string[] = [];
        if (!data.YOUTUBE_API_KEY?.configured) missing.push("YOUTUBE_API_KEY");
        if (!data.YOUTUBE_CHANNEL_ID?.configured) missing.push("YOUTUBE_CHANNEL_ID");
        if (missing.length > 0) setMissingEnv(missing);

        // Check for missing notify vars
        const notifyMissing: string[] = [];
        if (!data.DISCORD_BOT_TOKEN?.configured) notifyMissing.push("DISCORD_BOT_TOKEN");
        if (!data.DISCORD_YOUTUBE_CHANNEL_ID?.configured) notifyMissing.push("DISCORD_YOUTUBE_CHANNEL_ID");
        setNotifyMissingEnv(notifyMissing);
      } catch {
        // Server not running, will show error on action
      }
    };
    checkConfig();
  }, []);

  const checkLiveStatus = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    setNotifyResult(null);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5005"}/api/youtube/live-status`);
      const data = await response.json();

      if (data.missing_env) {
        setMissingEnv(data.missing_env);
      } else if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch {
      setError("Failed to connect to the server. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const sendNotification = async () => {
    setNotifying(true);
    setNotifyResult(null);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5005"}/api/discord/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      if (data.missing_env) {
        setNotifyMissingEnv(data.missing_env);
      } else {
        setNotifyResult(data);
      }
    } catch {
      setNotifyResult({ success: false, error: "Failed to connect to the server." });
    } finally {
      setNotifying(false);
    }
  };

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
            <span className="text-zinc-400">Live Status Checker</span>
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
            YouTube Live Status Checker
          </h1>
          <p className="text-zinc-400">
            Check if your configured YouTube channel is live and send notifications to Discord.
          </p>
        </div>

        {/* Missing Environment Variables */}
        {missingEnv.length > 0 ? (
          <MissingEnvMessage missingVars={missingEnv} />
        ) : (
          <>
            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <button
                onClick={checkLiveStatus}
                disabled={loading}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Checking...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Check Live Status
                  </>
                )}
              </button>

              {notifyMissingEnv.length === 0 && (
                <button
                  onClick={sendNotification}
                  disabled={notifying || !result?.is_live}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                  title={!result?.is_live ? "Check live status first" : "Send notification to Discord"}
                >
                  {notifying ? (
                    <>
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Sending...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
                      </svg>
                      Send to Discord
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Discord Setup Notice */}
            {notifyMissingEnv.length > 0 && (
              <div className="mb-8 p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                <p className="text-zinc-400 text-sm">
                  <span className="text-amber-400">Note:</span> To enable Discord notifications, configure:{" "}
                  {notifyMissingEnv.map((v, i) => (
                    <span key={v}>
                      <code className="text-purple-400">{v}</code>
                      {i < notifyMissingEnv.length - 1 ? ", " : ""}
                    </span>
                  ))}
                  {" "}
                  <Link href="/instructions" className="text-purple-400 hover:underline">
                    Learn more
                  </Link>
                </p>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="mb-8 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-400">
                {error}
              </div>
            )}

            {/* Notification Result */}
            {notifyResult && (
              <div className={`mb-8 p-4 rounded-lg ${notifyResult.success ? "bg-green-900/30 border border-green-700 text-green-400" : "bg-red-900/30 border border-red-700 text-red-400"}`}>
                {notifyResult.success ? notifyResult.message : notifyResult.error}
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
                      Current Stream
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
          </>
        )}
      </main>
    </div>
  );
}
