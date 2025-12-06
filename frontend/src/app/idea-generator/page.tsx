"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

interface VideoIdea {
  title: string;
  description: string;
  hook: string;
  key_points: string[];
  source_context: string;
  estimated_length: string;
  content_type: string;
}

interface ShortsIdea {
  title: string;
  concept: string;
  hook: string;
  source_timestamp?: string;
  format: string;
}

interface IdeasResult {
  video_id: string;
  transcript_preview: string;
  video_ideas: VideoIdea[];
  shorts_ideas: ShortsIdea[];
  recurring_themes: string[];
  audience_questions: string[];
  error?: string;
  missing_env?: string;
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

export default function IdeaGeneratorPage() {
  const [url, setUrl] = useState("");
  const [numVideoIdeas, setNumVideoIdeas] = useState(5);
  const [numShortsIdeas, setNumShortsIdeas] = useState(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IdeasResult | null>(null);
  const [error, setError] = useState("");
  const [missingEnv, setMissingEnv] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"videos" | "shorts">("videos");

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5005";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(`${API_URL}/api/ideas/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          num_video_ideas: numVideoIdeas,
          num_shorts_ideas: numShortsIdeas,
        }),
      });

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

  const getContentTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      tutorial: "bg-blue-900/30 text-blue-400 border-blue-700/50",
      discussion: "bg-purple-900/30 text-purple-400 border-purple-700/50",
      review: "bg-green-900/30 text-green-400 border-green-700/50",
      vlog: "bg-pink-900/30 text-pink-400 border-pink-700/50",
      reaction: "bg-orange-900/30 text-orange-400 border-orange-700/50",
    };
    return colors[type.toLowerCase()] || "bg-zinc-700/30 text-zinc-400 border-zinc-600/50";
  };

  const getFormatColor = (format: string) => {
    const colors: Record<string, string> = {
      "quick-tip": "bg-green-900/30 text-green-400",
      reaction: "bg-orange-900/30 text-orange-400",
      story: "bg-blue-900/30 text-blue-400",
      tutorial: "bg-purple-900/30 text-purple-400",
      "hot-take": "bg-red-900/30 text-red-400",
    };
    return colors[format.toLowerCase()] || "bg-zinc-700/30 text-zinc-400";
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
            <span className="text-zinc-400">Video Idea Generator</span>
          </div>
          <Link
            href="/instructions"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Setup Guide
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white mb-4">
            Video Idea Generator
          </h1>
          <p className="text-zinc-400 max-w-2xl mx-auto">
            Analyze any YouTube video or livestream and generate fresh content ideas
            for future videos and shorts based on the topics discussed.
          </p>
        </div>

        {/* Missing Environment Variables */}
        {missingEnv ? (
          <MissingEnvMessage missingVar={missingEnv} />
        ) : (
          <>
            {/* Input Form */}
            <div className="mb-8 p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">YouTube URL</label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">
                      Video Ideas <span className="text-zinc-500">(1-10)</span>
                    </label>
                    <input
                      type="number"
                      value={numVideoIdeas}
                      onChange={(e) => setNumVideoIdeas(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                      min={1}
                      max={10}
                      className="w-24 px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-purple-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">
                      Shorts Ideas <span className="text-zinc-500">(1-10)</span>
                    </label>
                    <input
                      type="number"
                      value={numShortsIdeas}
                      onChange={(e) => setNumShortsIdeas(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                      min={1}
                      max={10}
                      className="w-24 px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-purple-500 transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-6 py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-lg"
                >
                  {loading ? "Analyzing Transcript & Generating Ideas..." : "Generate Ideas"}
                </button>
              </form>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-8 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-400">
                {error}
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="space-y-8">
                {/* Video Preview */}
                {result.video_id && (
                  <div className="aspect-video max-w-2xl mx-auto rounded-lg overflow-hidden bg-zinc-800">
                    <iframe
                      src={`https://www.youtube.com/embed/${result.video_id}`}
                      className="w-full h-full"
                      allowFullScreen
                    />
                  </div>
                )}

                {/* Themes & Questions */}
                {(result.recurring_themes?.length > 0 || result.audience_questions?.length > 0) && (
                  <div className="grid md:grid-cols-2 gap-6">
                    {result.recurring_themes?.length > 0 && (
                      <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                        <h3 className="text-lg font-semibold text-white mb-3">Recurring Themes</h3>
                        <div className="flex flex-wrap gap-2">
                          {result.recurring_themes.map((theme, i) => (
                            <span key={i} className="px-3 py-1 bg-purple-900/30 text-purple-400 text-sm rounded-full">
                              {theme}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {result.audience_questions?.length > 0 && (
                      <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                        <h3 className="text-lg font-semibold text-white mb-3">Audience Questions</h3>
                        <ul className="space-y-2">
                          {result.audience_questions.map((q, i) => (
                            <li key={i} className="text-zinc-400 text-sm flex items-start gap-2">
                              <span className="text-purple-400">?</span>
                              {q}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Tabs */}
                <div className="flex border-b border-zinc-700">
                  <button
                    onClick={() => setActiveTab("videos")}
                    className={`px-6 py-3 font-medium transition-colors ${
                      activeTab === "videos"
                        ? "text-purple-400 border-b-2 border-purple-400"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    Video Ideas ({result.video_ideas?.length || 0})
                  </button>
                  <button
                    onClick={() => setActiveTab("shorts")}
                    className={`px-6 py-3 font-medium transition-colors ${
                      activeTab === "shorts"
                        ? "text-purple-400 border-b-2 border-purple-400"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    Shorts Ideas ({result.shorts_ideas?.length || 0})
                  </button>
                </div>

                {/* Video Ideas */}
                {activeTab === "videos" && result.video_ideas && (
                  <div className="space-y-6">
                    {result.video_ideas.map((idea, index) => (
                      <div
                        key={index}
                        className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg"
                      >
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div>
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-2xl font-bold text-purple-400">#{index + 1}</span>
                              <span className={`px-2 py-1 text-xs rounded border ${getContentTypeColor(idea.content_type)}`}>
                                {idea.content_type}
                              </span>
                              <span className="text-zinc-500 text-sm">{idea.estimated_length}</span>
                            </div>
                            <h3 className="text-xl font-semibold text-white">{idea.title}</h3>
                          </div>
                        </div>

                        <p className="text-zinc-300 mb-4">{idea.description}</p>

                        <div className="space-y-4">
                          <div>
                            <h4 className="text-sm font-medium text-zinc-400 mb-2">Hook</h4>
                            <p className="text-purple-300 italic">&ldquo;{idea.hook}&rdquo;</p>
                          </div>

                          <div>
                            <h4 className="text-sm font-medium text-zinc-400 mb-2">Key Points</h4>
                            <ul className="space-y-1">
                              {idea.key_points.map((point, i) => (
                                <li key={i} className="text-zinc-300 text-sm flex items-start gap-2">
                                  <span className="text-purple-400">•</span>
                                  {point}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="pt-3 border-t border-zinc-700">
                            <h4 className="text-sm font-medium text-zinc-500 mb-1">Source Context</h4>
                            <p className="text-zinc-500 text-sm italic">{idea.source_context}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Shorts Ideas */}
                {activeTab === "shorts" && result.shorts_ideas && (
                  <div className="grid md:grid-cols-2 gap-6">
                    {result.shorts_ideas.map((idea, index) => (
                      <div
                        key={index}
                        className="p-5 bg-zinc-800/50 border border-zinc-700 rounded-lg"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-lg font-bold text-purple-400">#{index + 1}</span>
                          <span className={`px-2 py-1 text-xs rounded ${getFormatColor(idea.format)}`}>
                            {idea.format}
                          </span>
                          {idea.source_timestamp && (
                            <span className="text-zinc-500 text-xs font-mono">
                              @{idea.source_timestamp}
                            </span>
                          )}
                        </div>

                        <h3 className="text-lg font-semibold text-white mb-2">{idea.title}</h3>
                        <p className="text-zinc-400 text-sm mb-3">{idea.concept}</p>

                        <div className="pt-3 border-t border-zinc-700/50">
                          <h4 className="text-xs font-medium text-zinc-500 mb-1">Opening Hook</h4>
                          <p className="text-purple-300 text-sm italic">&ldquo;{idea.hook}&rdquo;</p>
                        </div>
                      </div>
                    ))}
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
