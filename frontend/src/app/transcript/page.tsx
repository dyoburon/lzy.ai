"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";

interface TranscriptEntry {
  timestamp: string;
  text: string;
  start: number;
}

interface VideoTranscript {
  id: string;
  url: string;
  video_id: string | null;
  transcript: TranscriptEntry[];
  chapters: string;
  fullText: string;
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

function DownloadButton({
  transcript,
  chapters,
  videoId,
  format
}: {
  transcript: TranscriptEntry[];
  chapters: string;
  videoId: string | null;
  format: "txt" | "json";
}) {
  const handleDownload = () => {
    const filename = videoId ? `transcript_${videoId}` : "transcript";

    if (format === "txt") {
      const fullText = transcript.map(e => `[${e.timestamp}] ${e.text}`).join("\n");
      const content = `CHAPTERS:\n${chapters}\n\n---\n\nFULL TRANSCRIPT:\n${fullText}`;
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const data = { chapters, transcript, video_id: videoId };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <button
      onClick={handleDownload}
      className="text-sm px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors flex items-center gap-1"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      {format.toUpperCase()}
    </button>
  );
}

function TranscriptChat({
  transcripts,
  onClose
}: {
  transcripts: VideoTranscript[];
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Build context from all transcripts
  const buildContext = () => {
    return transcripts.map((t, i) => {
      const videoLabel = t.video_id ? `Video ${i + 1} (${t.video_id})` : `Transcript ${i + 1}`;
      return `=== ${videoLabel} ===\n${t.fullText}`;
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
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5005"}/api/transcript/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          context: buildContext(),
          history: messages.slice(-10) // Last 10 messages for context
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

  const totalTokenEstimate = Math.round(transcripts.reduce((sum, t) => sum + t.fullText.length / 4, 0));

  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-700">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            Chat with Transcripts
          </h3>
          <p className="text-xs text-zinc-500 mt-1">
            ~{totalTokenEstimate.toLocaleString()} tokens loaded ({transcripts.length} video{transcripts.length > 1 ? "s" : ""}) • Gemini 2.5 Flash
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="h-80 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-zinc-500 py-8">
            <p className="mb-2">Ask questions about your transcript{transcripts.length > 1 ? "s" : ""}!</p>
            <p className="text-sm">Examples:</p>
            <div className="text-sm space-y-1 mt-2 text-zinc-400">
              <p>"What are the main topics discussed?"</p>
              <p>"Summarize this in 3 bullet points"</p>
              <p>"Find all mentions of [topic]"</p>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                msg.role === "user"
                  ? "bg-purple-600 text-white"
                  : "bg-zinc-700 text-zinc-200"
              }`}
            >
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

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-zinc-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about the transcript..."
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

export default function TranscriptPage() {
  const [inputMode, setInputMode] = useState<"youtube" | "custom">("youtube");
  const [urls, setUrls] = useState<string[]>([""]);
  const [customTranscript, setCustomTranscript] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);
  const [transcripts, setTranscripts] = useState<VideoTranscript[]>([]);
  const [missingEnv, setMissingEnv] = useState<string | null>(null);
  const [activeTranscriptId, setActiveTranscriptId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"chapters" | "transcript">("chapters");
  const [showChat, setShowChat] = useState(false);
  const [regenerating, setRegenerating] = useState<string | null>(null);

  // Check config on mount
  useEffect(() => {
    const checkConfig = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5005"}/api/config`);
        const data = await response.json();

        if (!data.GEMINI_API_KEY?.configured) {
          setMissingEnv("GEMINI_API_KEY");
        }
      } catch {
        // Server not running, will show error on submit
      }
    };
    checkConfig();
  }, []);

  const addUrlField = () => {
    setUrls([...urls, ""]);
  };

  const removeUrlField = (index: number) => {
    if (urls.length > 1) {
      setUrls(urls.filter((_, i) => i !== index));
    }
  };

  const updateUrl = (index: number, value: string) => {
    const newUrls = [...urls];
    newUrls[index] = value;
    setUrls(newUrls);
  };

  const processYouTubeUrls = async () => {
    const validUrls = urls.filter(u => u.trim());
    if (validUrls.length === 0) return;

    // Create initial transcript entries
    const newTranscripts: VideoTranscript[] = validUrls.map((url, i) => ({
      id: `yt-${Date.now()}-${i}`,
      url,
      video_id: null,
      transcript: [],
      chapters: "",
      fullText: "",
      loading: true,
    }));

    setTranscripts(newTranscripts);
    setActiveTranscriptId(newTranscripts[0].id);
    setShowChat(false);

    // Process each URL in parallel
    const results = await Promise.all(
      newTranscripts.map(async (t, i) => {
        try {
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5005"}/api/transcript`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: validUrls[i],
              custom_instructions: customInstructions || undefined
            }),
          });

          const data = await response.json();

          if (data.missing_env) {
            setMissingEnv(data.missing_env);
            return { ...t, loading: false, error: "API key not configured" };
          } else if (data.error) {
            return { ...t, loading: false, error: data.error };
          } else {
            const fullText = data.transcript.map((e: TranscriptEntry) => `[${e.timestamp}] ${e.text}`).join("\n");
            return {
              ...t,
              video_id: data.video_id,
              transcript: data.transcript,
              chapters: data.chapters,
              fullText,
              loading: false,
            };
          }
        } catch {
          return { ...t, loading: false, error: "Failed to connect to server" };
        }
      })
    );

    setTranscripts(results);
  };

  const processCustomTranscript = async () => {
    if (!customTranscript.trim()) return;

    const id = `custom-${Date.now()}`;
    const newTranscript: VideoTranscript = {
      id,
      url: "",
      video_id: null,
      transcript: [],
      chapters: "",
      fullText: customTranscript,
      loading: true,
    };

    setTranscripts([newTranscript]);
    setActiveTranscriptId(id);
    setShowChat(false);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5005"}/api/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          custom_transcript: customTranscript,
          custom_instructions: customInstructions || undefined
        }),
      });

      const data = await response.json();

      if (data.missing_env) {
        setMissingEnv(data.missing_env);
        setTranscripts([{ ...newTranscript, loading: false, error: "API key not configured" }]);
      } else if (data.error) {
        setTranscripts([{ ...newTranscript, loading: false, error: data.error }]);
      } else {
        setTranscripts([{
          ...newTranscript,
          chapters: data.chapters,
          loading: false,
        }]);
      }
    } catch {
      setTranscripts([{ ...newTranscript, loading: false, error: "Failed to connect to server" }]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMode === "youtube") {
      await processYouTubeUrls();
    } else {
      await processCustomTranscript();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const regenerateChapters = async (transcriptId: string) => {
    const transcript = transcripts.find(t => t.id === transcriptId);
    if (!transcript || !transcript.fullText) return;

    setRegenerating(transcriptId);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5005"}/api/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          custom_transcript: transcript.fullText,
          custom_instructions: customInstructions || undefined
        }),
      });

      const data = await response.json();

      if (!data.error) {
        setTranscripts(prev => prev.map(t =>
          t.id === transcriptId ? { ...t, chapters: data.chapters } : t
        ));
      }
    } catch {
      // Silently fail - user can try again
    } finally {
      setRegenerating(null);
    }
  };

  const activeTranscript = transcripts.find(t => t.id === activeTranscriptId);
  const isLoading = transcripts.some(t => t.loading);
  const completedTranscripts = transcripts.filter(t => !t.loading && !t.error);

  // Download all transcripts as a single file
  const downloadAll = (format: "txt" | "json") => {
    if (completedTranscripts.length === 0) return;

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `transcripts_${timestamp}`;

    if (format === "txt") {
      const content = completedTranscripts.map((t, i) => {
        const header = t.video_id ? `=== Video ${i + 1}: ${t.video_id} ===` : `=== Transcript ${i + 1} ===`;
        return `${header}\n\nCHAPTERS:\n${t.chapters}\n\n---\n\nFULL TRANSCRIPT:\n${t.fullText}`;
      }).join("\n\n" + "=".repeat(50) + "\n\n");

      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const data = completedTranscripts.map(t => ({
        video_id: t.video_id,
        url: t.url,
        chapters: t.chapters,
        transcript: t.transcript,
        fullText: t.fullText,
      }));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.json`;
      a.click();
      URL.revokeObjectURL(url);
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
            <span className="text-zinc-400">Transcript & Chapters</span>
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
            Transcript & Chapters
          </h1>
          <p className="text-zinc-400">
            Add multiple YouTube URLs or paste your own transcript to generate AI-powered chapters.
          </p>
        </div>

        {/* Missing Environment Variables */}
        {missingEnv ? (
          <MissingEnvMessage missingVar={missingEnv} />
        ) : (
          <>
            {/* Input Mode Tabs */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setInputMode("youtube")}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  inputMode === "youtube"
                    ? "bg-purple-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:text-white"
                }`}
              >
                YouTube URLs
              </button>
              <button
                onClick={() => setInputMode("custom")}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  inputMode === "custom"
                    ? "bg-purple-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:text-white"
                }`}
              >
                Paste Transcript
              </button>
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
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Custom Instructions
                {customInstructions && <span className="text-purple-400">(active)</span>}
              </button>
              {showInstructions && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-zinc-500">
                    Tell the AI how to write chapter titles. Leave blank for default style.
                  </p>
                  <textarea
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    placeholder="e.g., Keep titles short and casual. Focus on the games being played. Use timestamps for major topic shifts only."
                    className="w-full h-24 px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition-colors resize-y text-sm"
                  />
                  <p className="text-xs text-zinc-600">
                    Default: Titles that tease the interesting stuff and make viewers want to click through.
                  </p>
                </div>
              )}
            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="mb-8">
              {inputMode === "youtube" ? (
                <div className="space-y-3">
                  {urls.map((url, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => updateUrl(index, e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
                      />
                      {urls.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeUrlField(index)}
                          className="px-3 py-3 bg-zinc-800 border border-zinc-700 hover:border-red-500 hover:text-red-400 text-zinc-400 rounded-lg transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={addUrlField}
                      className="px-4 py-2 bg-zinc-800 border border-zinc-700 hover:border-zinc-600 text-zinc-300 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Another Video
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading || urls.every(u => !u.trim())}
                      className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                    >
                      {isLoading ? "Processing..." : `Generate (${urls.filter(u => u.trim()).length} video${urls.filter(u => u.trim()).length !== 1 ? "s" : ""})`}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    value={customTranscript}
                    onChange={(e) => setCustomTranscript(e.target.value)}
                    placeholder="Paste your transcript here... (SRT format, timestamped text, or plain text)"
                    className="w-full h-48 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors resize-y"
                    required
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isLoading || !customTranscript.trim()}
                      className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                    >
                      {isLoading ? "Processing..." : "Generate Chapters"}
                    </button>
                  </div>
                </div>
              )}
            </form>

            {/* Results */}
            {transcripts.length > 0 && (
              <div className="space-y-6">
                {/* Video Selector (if multiple) */}
                {transcripts.length > 1 && (
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-zinc-400 text-sm">Videos:</span>
                    {transcripts.map((t, i) => (
                      <button
                        key={t.id}
                        onClick={() => setActiveTranscriptId(t.id)}
                        className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                          t.id === activeTranscriptId
                            ? "bg-purple-600 text-white"
                            : t.error
                            ? "bg-red-900/30 text-red-400 border border-red-700/50"
                            : t.loading
                            ? "bg-zinc-700 text-zinc-400"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        {t.loading ? (
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Video {i + 1}
                          </span>
                        ) : t.error ? (
                          <span>Video {i + 1} (Error)</span>
                        ) : (
                          <span>Video {i + 1}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Download All Button (if multiple completed) */}
                {completedTranscripts.length > 1 && (
                  <div className="flex items-center gap-2 p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                    <span className="text-zinc-300 text-sm">Download all {completedTranscripts.length} transcripts:</span>
                    <button
                      onClick={() => downloadAll("txt")}
                      className="text-sm px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      TXT
                    </button>
                    <button
                      onClick={() => downloadAll("json")}
                      className="text-sm px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      JSON
                    </button>
                  </div>
                )}

                {/* Active Transcript Content */}
                {activeTranscript && (
                  <>
                    {/* Loading State */}
                    {activeTranscript.loading && (
                      <div className="text-center py-12">
                        <div className="inline-flex items-center gap-3 text-zinc-400">
                          <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Fetching transcript and generating chapters...</span>
                        </div>
                      </div>
                    )}

                    {/* Error State */}
                    {activeTranscript.error && (
                      <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-400">
                        {activeTranscript.error}
                      </div>
                    )}

                    {/* Success State */}
                    {!activeTranscript.loading && !activeTranscript.error && (
                      <>
                        {/* Video Preview */}
                        {activeTranscript.video_id && (
                          <div className="aspect-video rounded-lg overflow-hidden bg-zinc-800">
                            <iframe
                              src={`https://www.youtube.com/embed/${activeTranscript.video_id}`}
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
                              <div className="flex gap-2">
                                <button
                                  onClick={() => regenerateChapters(activeTranscript.id)}
                                  disabled={regenerating === activeTranscript.id}
                                  className="text-sm px-3 py-1 bg-purple-600/20 border border-purple-500/30 hover:border-purple-500/50 disabled:opacity-50 text-purple-300 rounded transition-colors flex items-center gap-1"
                                >
                                  <svg
                                    className={`w-3.5 h-3.5 ${regenerating === activeTranscript.id ? "animate-spin" : ""}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                  </svg>
                                  {regenerating === activeTranscript.id ? "Regenerating..." : "Regenerate"}
                                </button>
                                <button
                                  onClick={() => copyToClipboard(activeTranscript.chapters)}
                                  className="text-sm px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors"
                                >
                                  Copy
                                </button>
                                <DownloadButton
                                  transcript={activeTranscript.transcript}
                                  chapters={activeTranscript.chapters}
                                  videoId={activeTranscript.video_id}
                                  format="txt"
                                />
                                <DownloadButton
                                  transcript={activeTranscript.transcript}
                                  chapters={activeTranscript.chapters}
                                  videoId={activeTranscript.video_id}
                                  format="json"
                                />
                              </div>
                            </div>
                            <pre className="text-zinc-300 whitespace-pre-wrap font-mono text-sm">
                              {regenerating === activeTranscript.id ? "Regenerating chapters..." : activeTranscript.chapters}
                            </pre>
                          </div>
                        )}

                        {activeTab === "transcript" && (
                          <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-6">
                            <div className="flex justify-between items-center mb-4">
                              <h2 className="text-lg font-semibold text-white">Full Transcript</h2>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => copyToClipboard(activeTranscript.fullText)}
                                  className="text-sm px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors"
                                >
                                  Copy
                                </button>
                                <DownloadButton
                                  transcript={activeTranscript.transcript}
                                  chapters={activeTranscript.chapters}
                                  videoId={activeTranscript.video_id}
                                  format="txt"
                                />
                              </div>
                            </div>
                            <div className="max-h-96 overflow-y-auto space-y-2">
                              {activeTranscript.transcript.length > 0 ? (
                                activeTranscript.transcript.map((entry, index) => (
                                  <div key={index} className="flex gap-3">
                                    <span className="text-purple-400 font-mono text-sm min-w-[60px]">
                                      {entry.timestamp}
                                    </span>
                                    <span className="text-zinc-300 text-sm">{entry.text}</span>
                                  </div>
                                ))
                              ) : (
                                <pre className="text-zinc-300 whitespace-pre-wrap text-sm">
                                  {activeTranscript.fullText}
                                </pre>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {/* Chat Section */}
                {completedTranscripts.length > 0 && (
                  <div className="mt-8">
                    {!showChat ? (
                      <button
                        onClick={() => setShowChat(true)}
                        className="w-full py-4 bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 hover:border-purple-500/50 rounded-lg text-white font-medium transition-all flex items-center justify-center gap-3"
                      >
                        <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        Chat with Transcript{completedTranscripts.length > 1 ? "s" : ""} (Gemini 2.5 Flash)
                      </button>
                    ) : (
                      <TranscriptChat
                        transcripts={completedTranscripts}
                        onClose={() => setShowChat(false)}
                      />
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
