"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";

interface VideoIdea {
  title: string;
  description: string;
  hook: string;
  key_points: string[];
  source_context: string;
  source_timestamp?: string;
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
  id: string;
  url: string;
  video_id: string | null;
  full_transcript: string;
  video_ideas: VideoIdea[];
  shorts_ideas: ShortsIdea[];
  recurring_themes: string[];
  audience_questions: string[];
  loading: boolean;
  error?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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

function IdeasChat({
  results,
  onClose
}: {
  results: IdeasResult[];
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5005";

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const buildContext = () => {
    return results.map((r, i) => {
      const ideasSummary = r.video_ideas.map((v, j) => `Video Idea ${j + 1}: ${v.title}`).join("\n");
      const shortsSummary = r.shorts_ideas.map((s, j) => `Shorts Idea ${j + 1}: ${s.title}`).join("\n");
      return `=== Video ${i + 1} ===\nTranscript:\n${r.full_transcript.slice(0, 10000)}...\n\nGenerated Ideas:\n${ideasSummary}\n${shortsSummary}`;
    }).join("\n\n");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/ideas/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          context: buildContext(),
          history: messages.slice(-10)
        }),
      });

      const data = await response.json();

      if (data.error) {
        setMessages(prev => [...prev, { role: "assistant", content: `Error: ${data.error}` }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Failed to connect to the server." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-zinc-700">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            Brainstorm Ideas
          </h3>
          <p className="text-xs text-zinc-500 mt-1">
            Refine ideas, get variations, or ask questions • Gemini 2.5 Flash
          </p>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="h-80 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-zinc-500 py-8">
            <p className="mb-2">Ask questions or refine your ideas!</p>
            <div className="text-sm space-y-1 mt-2 text-zinc-400">
              <p>"Make idea #2 more beginner-friendly"</p>
              <p>"Give me 3 more shorts ideas about [topic]"</p>
              <p>"What's a better hook for the tutorial idea?"</p>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-lg px-4 py-2 ${msg.role === "user" ? "bg-purple-600 text-white" : "bg-zinc-700 text-zinc-200"}`}>
              <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-zinc-700 rounded-lg px-4 py-2">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-zinc-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Refine ideas or ask questions..."
            className="flex-1 px-4 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

interface ChannelContext {
  channel_id?: string;
  name: string;
  description: string;
  thumbnail?: string;
  subscriber_count?: string;
  recent_videos: { title: string; video_id: string }[];
}

export default function IdeaGeneratorPage() {
  const [urls, setUrls] = useState<string[]>([""]);
  const [numVideoIdeas, setNumVideoIdeas] = useState(10);
  const [numShortsIdeas, setNumShortsIdeas] = useState(10);
  const [customInstructions, setCustomInstructions] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);
  const [channelUrl, setChannelUrl] = useState("");
  const [channelContext, setChannelContext] = useState<ChannelContext | null>(null);
  const [channelLoading, setChannelLoading] = useState(false);
  const [channelError, setChannelError] = useState("");
  const [results, setResults] = useState<IdeasResult[]>([]);
  const [missingEnv, setMissingEnv] = useState<string | null>(null);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"videos" | "shorts">("videos");
  const [showChat, setShowChat] = useState(false);
  const [regenerating, setRegenerating] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5005";

  useEffect(() => {
    const checkConfig = async () => {
      try {
        const response = await fetch(`${API_URL}/api/config`);
        const data = await response.json();
        if (!data.GEMINI_API_KEY?.configured) {
          setMissingEnv("GEMINI_API_KEY");
        }
      } catch {
        // Server not running
      }
    };
    checkConfig();
  }, [API_URL]);

  const addUrlField = () => setUrls([...urls, ""]);
  const removeUrlField = (index: number) => {
    if (urls.length > 1) setUrls(urls.filter((_, i) => i !== index));
  };
  const updateUrl = (index: number, value: string) => {
    const newUrls = [...urls];
    newUrls[index] = value;
    setUrls(newUrls);
  };

  const fetchChannelContext = async () => {
    if (!channelUrl.trim()) return;

    setChannelLoading(true);
    setChannelError("");

    try {
      const response = await fetch(`${API_URL}/api/ideas/channel-context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_url: channelUrl }),
      });

      const data = await response.json();

      if (data.error) {
        setChannelError(data.error);
        setChannelContext(null);
      } else {
        setChannelContext(data);
        setChannelError("");
      }
    } catch {
      setChannelError("Failed to fetch channel info");
      setChannelContext(null);
    } finally {
      setChannelLoading(false);
    }
  };

  const clearChannelContext = () => {
    setChannelUrl("");
    setChannelContext(null);
    setChannelError("");
  };

  const processUrls = async () => {
    const validUrls = urls.filter(u => u.trim());
    if (validUrls.length === 0) return;

    const newResults: IdeasResult[] = validUrls.map((url, i) => ({
      id: `ideas-${Date.now()}-${i}`,
      url,
      video_id: null,
      full_transcript: "",
      video_ideas: [],
      shorts_ideas: [],
      recurring_themes: [],
      audience_questions: [],
      loading: true,
    }));

    setResults(newResults);
    setActiveResultId(newResults[0].id);
    setShowChat(false);

    const processed = await Promise.all(
      newResults.map(async (r, i) => {
        try {
          const response = await fetch(`${API_URL}/api/ideas/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: validUrls[i],
              num_video_ideas: numVideoIdeas,
              num_shorts_ideas: numShortsIdeas,
              custom_instructions: customInstructions || undefined,
              channel_context: channelContext || undefined
            }),
          });

          const data = await response.json();

          if (data.missing_env) {
            setMissingEnv(data.missing_env);
            return { ...r, loading: false, error: "API key not configured" };
          } else if (data.error) {
            return { ...r, loading: false, error: data.error };
          } else {
            return {
              ...r,
              video_id: data.video_id,
              full_transcript: data.full_transcript || "",
              video_ideas: data.video_ideas || [],
              shorts_ideas: data.shorts_ideas || [],
              recurring_themes: data.recurring_themes || [],
              audience_questions: data.audience_questions || [],
              loading: false,
            };
          }
        } catch {
          return { ...r, loading: false, error: "Failed to connect to server" };
        }
      })
    );

    setResults(processed);
  };

  const regenerateIdeas = async (resultId: string) => {
    const result = results.find(r => r.id === resultId);
    if (!result || !result.full_transcript) return;

    setRegenerating(resultId);

    try {
      const response = await fetch(`${API_URL}/api/ideas/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: result.full_transcript,
          num_video_ideas: numVideoIdeas,
          num_shorts_ideas: numShortsIdeas,
          custom_instructions: customInstructions || undefined
        }),
      });

      const data = await response.json();

      if (!data.error) {
        setResults(prev => prev.map(r =>
          r.id === resultId ? {
            ...r,
            video_ideas: data.video_ideas || [],
            shorts_ideas: data.shorts_ideas || [],
            recurring_themes: data.recurring_themes || [],
            audience_questions: data.audience_questions || [],
          } : r
        ));
      }
    } catch {
      // Silently fail
    } finally {
      setRegenerating(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await processUrls();
  };

  const downloadIdeas = (result: IdeasResult, format: "txt" | "json") => {
    const filename = result.video_id ? `ideas_${result.video_id}` : "ideas";

    if (format === "txt") {
      let content = "VIDEO IDEAS\n" + "=".repeat(50) + "\n\n";
      result.video_ideas.forEach((idea, i) => {
        content += `#${i + 1}: ${idea.title}\n`;
        content += `Type: ${idea.content_type} | Length: ${idea.estimated_length}\n`;
        content += `Description: ${idea.description}\n`;
        content += `Hook: "${idea.hook}"\n`;
        content += `Key Points:\n${idea.key_points.map(p => `  - ${p}`).join("\n")}\n`;
        content += `Source: ${idea.source_context}\n\n`;
      });

      content += "\nSHORTS IDEAS\n" + "=".repeat(50) + "\n\n";
      result.shorts_ideas.forEach((idea, i) => {
        content += `#${i + 1}: ${idea.title}\n`;
        content += `Format: ${idea.format}${idea.source_timestamp ? ` | @${idea.source_timestamp}` : ""}\n`;
        content += `Concept: ${idea.concept}\n`;
        content += `Hook: "${idea.hook}"\n\n`;
      });

      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const data = {
        video_id: result.video_id,
        video_ideas: result.video_ideas,
        shorts_ideas: result.shorts_ideas,
        recurring_themes: result.recurring_themes,
        audience_questions: result.audience_questions,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.json`;
      a.click();
      URL.revokeObjectURL(url);
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

  const activeResult = results.find(r => r.id === activeResultId);
  const isLoading = results.some(r => r.loading);
  const completedResults = results.filter(r => !r.loading && !r.error);

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
      <header className="border-b border-zinc-700/50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-2xl font-bold text-white">
              lzy<span className="text-purple-500">.ai</span>
            </Link>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400">Video Idea Generator</span>
          </div>
          <Link href="/instructions" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Setup Guide
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white mb-4">Video Idea Generator</h1>
          <p className="text-zinc-400 max-w-2xl mx-auto">
            Analyze YouTube videos and generate content ideas for future videos and shorts.
          </p>
        </div>

        {missingEnv ? (
          <MissingEnvMessage missingVar={missingEnv} />
        ) : (
          <>
            {/* Channel Context (Optional) */}
            <div className="mb-6 p-4 bg-zinc-800/30 border border-zinc-700/50 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-medium text-zinc-300">Channel Context</h3>
                  <p className="text-xs text-zinc-500">Optional - helps generate ideas that fit your brand</p>
                </div>
                {channelContext && (
                  <button
                    type="button"
                    onClick={clearChannelContext}
                    className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>

              {!channelContext ? (
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={channelUrl}
                    onChange={(e) => setChannelUrl(e.target.value)}
                    placeholder="https://youtube.com/@yourchannel"
                    className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors text-sm"
                  />
                  <button
                    type="button"
                    onClick={fetchChannelContext}
                    disabled={channelLoading || !channelUrl.trim()}
                    className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg transition-colors text-sm flex items-center gap-2"
                  >
                    {channelLoading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Loading...
                      </>
                    ) : (
                      "Load Channel"
                    )}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-zinc-900/50 rounded-lg">
                  {channelContext.thumbnail && (
                    <img
                      src={channelContext.thumbnail}
                      alt={channelContext.name}
                      className="w-10 h-10 rounded-full"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{channelContext.name}</p>
                    <p className="text-xs text-zinc-500 truncate">
                      {channelContext.description?.slice(0, 100)}
                      {channelContext.description && channelContext.description.length > 100 ? "..." : ""}
                    </p>
                  </div>
                  <div className="text-right text-xs text-zinc-500">
                    {channelContext.subscriber_count && (
                      <p>{parseInt(channelContext.subscriber_count).toLocaleString()} subs</p>
                    )}
                    {channelContext.recent_videos?.length > 0 && (
                      <p>{channelContext.recent_videos.length} recent videos loaded</p>
                    )}
                  </div>
                </div>
              )}

              {channelError && (
                <p className="mt-2 text-xs text-red-400">{channelError}</p>
              )}
            </div>

            {/* Custom Instructions */}
            <div className="mb-6">
              <button
                type="button"
                onClick={() => setShowInstructions(!showInstructions)}
                className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${showInstructions ? "rotate-90" : ""}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Custom Instructions
                {customInstructions && <span className="text-purple-400">(active)</span>}
              </button>
              {showInstructions && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-zinc-500">
                    Guide how ideas are generated. Leave blank for default style.
                  </p>
                  <textarea
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    placeholder="e.g., Focus on beginner-friendly tutorials. Avoid controversial topics. Prioritize ideas that can be filmed with minimal equipment."
                    className="w-full h-24 px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition-colors resize-y text-sm"
                  />
                  <p className="text-xs text-zinc-600">
                    Default: Ideas that interest the same audience, compelling but not clickbait.
                  </p>
                </div>
              )}
            </div>

            {/* Input Form */}
            <div className="mb-8 p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">YouTube URLs</label>
                  <div className="space-y-2">
                    {urls.map((url, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="url"
                          value={url}
                          onChange={(e) => updateUrl(index, e.target.value)}
                          placeholder="https://www.youtube.com/watch?v=..."
                          className="flex-1 px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
                        />
                        {urls.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeUrlField(index)}
                            className="px-3 py-3 bg-zinc-900 border border-zinc-700 hover:border-red-500 hover:text-red-400 text-zinc-400 rounded-lg transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={addUrlField}
                    className="mt-2 px-4 py-2 bg-zinc-900 border border-zinc-700 hover:border-zinc-600 text-zinc-300 rounded-lg transition-colors flex items-center gap-2 text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Another Video
                  </button>
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
                  disabled={isLoading || urls.every(u => !u.trim())}
                  className="w-full px-6 py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-lg"
                >
                  {isLoading ? "Analyzing & Generating Ideas..." : `Generate Ideas (${urls.filter(u => u.trim()).length} video${urls.filter(u => u.trim()).length !== 1 ? "s" : ""})`}
                </button>
              </form>
            </div>

            {/* Results */}
            {results.length > 0 && (
              <div className="space-y-8">
                {/* Video Selector */}
                {results.length > 1 && (
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-zinc-400 text-sm">Videos:</span>
                    {results.map((r, i) => (
                      <button
                        key={r.id}
                        onClick={() => setActiveResultId(r.id)}
                        className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                          r.id === activeResultId
                            ? "bg-purple-600 text-white"
                            : r.error
                            ? "bg-red-900/30 text-red-400 border border-red-700/50"
                            : r.loading
                            ? "bg-zinc-700 text-zinc-400"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        {r.loading ? (
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Video {i + 1}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            Video {i + 1}
                            {r.video_id && <span className="text-xs opacity-60">({r.video_id.slice(0, 6)}...)</span>}
                            {r.error && " (Error)"}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {activeResult && (
                  <>
                    {/* Loading State */}
                    {activeResult.loading && (
                      <div className="text-center py-12">
                        <div className="inline-flex items-center gap-3 text-zinc-400">
                          <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Analyzing transcript and generating ideas...</span>
                        </div>
                      </div>
                    )}

                    {/* Error State */}
                    {activeResult.error && (
                      <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-400">
                        {activeResult.error}
                      </div>
                    )}

                    {/* Success State */}
                    {!activeResult.loading && !activeResult.error && (
                      <>
                        {/* Video Preview */}
                        {activeResult.video_id && (
                          <div className="aspect-video max-w-2xl mx-auto rounded-lg overflow-hidden bg-zinc-800">
                            <iframe
                              src={`https://www.youtube.com/embed/${activeResult.video_id}`}
                              className="w-full h-full"
                              allowFullScreen
                            />
                          </div>
                        )}

                        {/* Action Bar */}
                        <div className="flex items-center justify-between p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                          <div className="flex gap-2">
                            <button
                              onClick={() => regenerateIdeas(activeResult.id)}
                              disabled={regenerating === activeResult.id}
                              className="text-sm px-3 py-1.5 bg-purple-600/20 border border-purple-500/30 hover:border-purple-500/50 disabled:opacity-50 text-purple-300 rounded transition-colors flex items-center gap-1"
                            >
                              <svg
                                className={`w-3.5 h-3.5 ${regenerating === activeResult.id ? "animate-spin" : ""}`}
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              {regenerating === activeResult.id ? "Regenerating..." : "Regenerate"}
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => downloadIdeas(activeResult, "txt")}
                              className="text-sm px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors flex items-center gap-1"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              TXT
                            </button>
                            <button
                              onClick={() => downloadIdeas(activeResult, "json")}
                              className="text-sm px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors flex items-center gap-1"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              JSON
                            </button>
                          </div>
                        </div>

                        {/* Themes & Questions */}
                        {(activeResult.recurring_themes?.length > 0 || activeResult.audience_questions?.length > 0) && (
                          <div className="grid md:grid-cols-2 gap-6">
                            {activeResult.recurring_themes?.length > 0 && (
                              <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                                <h3 className="text-lg font-semibold text-white mb-3">Recurring Themes</h3>
                                <div className="flex flex-wrap gap-2">
                                  {activeResult.recurring_themes.map((theme, i) => (
                                    <span key={i} className="px-3 py-1 bg-purple-900/30 text-purple-400 text-sm rounded-full">
                                      {theme}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {activeResult.audience_questions?.length > 0 && (
                              <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                                <h3 className="text-lg font-semibold text-white mb-3">Audience Questions</h3>
                                <ul className="space-y-2">
                                  {activeResult.audience_questions.map((q, i) => (
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
                            Video Ideas ({activeResult.video_ideas?.length || 0})
                          </button>
                          <button
                            onClick={() => setActiveTab("shorts")}
                            className={`px-6 py-3 font-medium transition-colors ${
                              activeTab === "shorts"
                                ? "text-purple-400 border-b-2 border-purple-400"
                                : "text-zinc-400 hover:text-white"
                            }`}
                          >
                            Shorts Ideas ({activeResult.shorts_ideas?.length || 0})
                          </button>
                        </div>

                        {/* Video Ideas */}
                        {activeTab === "videos" && activeResult.video_ideas && (
                          <div className="space-y-6">
                            {regenerating === activeResult.id ? (
                              <div className="text-center py-8 text-zinc-400">Regenerating ideas...</div>
                            ) : (
                              activeResult.video_ideas.map((idea, index) => (
                                <div key={index} className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                                  <div className="flex items-start justify-between gap-4 mb-4">
                                    <div>
                                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                                        <span className="text-2xl font-bold text-purple-400">#{index + 1}</span>
                                        <span className={`px-2 py-1 text-xs rounded border ${getContentTypeColor(idea.content_type)}`}>
                                          {idea.content_type}
                                        </span>
                                        <span className="text-zinc-500 text-sm">{idea.estimated_length}</span>
                                        {idea.source_timestamp && (
                                          <span className="text-zinc-500 text-xs font-mono bg-zinc-800 px-2 py-0.5 rounded">
                                            @{idea.source_timestamp}
                                          </span>
                                        )}
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
                              ))
                            )}
                          </div>
                        )}

                        {/* Shorts Ideas */}
                        {activeTab === "shorts" && activeResult.shorts_ideas && (
                          <div className="grid md:grid-cols-2 gap-6">
                            {regenerating === activeResult.id ? (
                              <div className="col-span-2 text-center py-8 text-zinc-400">Regenerating ideas...</div>
                            ) : (
                              activeResult.shorts_ideas.map((idea, index) => (
                                <div key={index} className="p-5 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                                  <div className="flex items-center gap-3 mb-3">
                                    <span className="text-lg font-bold text-purple-400">#{index + 1}</span>
                                    <span className={`px-2 py-1 text-xs rounded ${getFormatColor(idea.format)}`}>
                                      {idea.format}
                                    </span>
                                    {idea.source_timestamp && (
                                      <span className="text-zinc-500 text-xs font-mono">@{idea.source_timestamp}</span>
                                    )}
                                  </div>

                                  <h3 className="text-lg font-semibold text-white mb-2">{idea.title}</h3>
                                  <p className="text-zinc-400 text-sm mb-3">{idea.concept}</p>

                                  <div className="pt-3 border-t border-zinc-700/50">
                                    <h4 className="text-xs font-medium text-zinc-500 mb-1">Opening Hook</h4>
                                    <p className="text-purple-300 text-sm italic">&ldquo;{idea.hook}&rdquo;</p>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {/* Chat Section */}
                {completedResults.length > 0 && (
                  <div className="mt-8">
                    {!showChat ? (
                      <button
                        onClick={() => setShowChat(true)}
                        className="w-full py-4 bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 hover:border-purple-500/50 rounded-lg text-white font-medium transition-all flex items-center justify-center gap-3"
                      >
                        <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        Brainstorm & Refine Ideas (Gemini 2.5 Flash)
                      </button>
                    ) : (
                      <IdeasChat results={completedResults} onClose={() => setShowChat(false)} />
                    )}
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
