"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

interface Suggestion {
  title: string;
  description: string;
  transcript_reference?: string;
  implementation: string;
  impact: "high" | "medium" | "low";
  goal_relevance?: string;
}

interface ImprovementCategory {
  summary: string;
  suggestions: Suggestion[];
}

interface QuickWin {
  action: string;
  expected_result: string;
}

interface TitleSuggestions {
  current_analysis: string;
  improved_titles_for_this_video: string[];
  title_formula_recommendation: string;
}

interface OverallAssessment {
  strengths: string[];
  main_opportunities: string[];
  goal_alignment_score: number;
  goal_alignment_feedback: string;
}

interface HardTruth {
  issue: string;
  why_it_matters: string;
  evidence: string;
  what_to_do: string;
}

interface HarshRating {
  content_quality: number;
  professionalism: number;
  audience_value: number;
  goal_effectiveness: number;
  overall_verdict: string;
}

interface CriticalAssessment {
  summary: string;
  hard_truths: HardTruth[];
  competitive_gaps: string[];
  blind_spots: string[];
  harsh_rating: HarshRating;
}

interface AnalysisResult {
  video_id: string;
  transcript_preview: string;
  channel_context: {
    goal: string;
    channel_description: string;
    target_audience: string;
    recent_titles: string[];
  };
  overall_assessment: OverallAssessment;
  content_improvements: ImprovementCategory;
  delivery_improvements: ImprovementCategory;
  channel_strategy: ImprovementCategory;
  branding_improvements: ImprovementCategory;
  audience_engagement: ImprovementCategory;
  title_suggestions: TitleSuggestions;
  quick_wins: QuickWin[];
  critical_assessment?: CriticalAssessment;
  error?: string;
  missing_env?: string;
}

type TabType = "overview" | "critiques" | "content" | "delivery" | "strategy" | "branding" | "engagement" | "titles";

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

function ImpactBadge({ impact }: { impact: string }) {
  const colors = {
    high: "bg-green-900/30 text-green-400 border-green-700/50",
    medium: "bg-yellow-900/30 text-yellow-400 border-yellow-700/50",
    low: "bg-zinc-700/30 text-zinc-400 border-zinc-600/50",
  };
  return (
    <span className={`px-2 py-1 text-xs rounded border ${colors[impact as keyof typeof colors] || colors.low}`}>
      {impact} impact
    </span>
  );
}

function SuggestionCard({ suggestion, index }: { suggestion: Suggestion; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="p-5 bg-zinc-800/50 border border-zinc-700 rounded-lg">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-purple-400">#{index + 1}</span>
          <ImpactBadge impact={suggestion.impact} />
        </div>
      </div>

      <h4 className="text-lg font-semibold text-white mb-2">{suggestion.title}</h4>
      <p className="text-zinc-300 text-sm mb-4">{suggestion.description}</p>

      {suggestion.transcript_reference && (
        <div className="mb-4 p-3 bg-zinc-900/50 border-l-2 border-purple-500 rounded">
          <p className="text-xs text-zinc-500 mb-1">From transcript:</p>
          <p className="text-zinc-400 text-sm italic">&ldquo;{suggestion.transcript_reference}&rdquo;</p>
        </div>
      )}

      <button
        onClick={() => setExpanded(!expanded)}
        className="text-purple-400 text-sm hover:text-purple-300 transition-colors flex items-center gap-1"
      >
        {expanded ? "Hide details" : "Show implementation details"}
        <svg
          className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-zinc-700 space-y-3">
          <div>
            <h5 className="text-sm font-medium text-zinc-400 mb-1">How to implement:</h5>
            <p className="text-zinc-300 text-sm">{suggestion.implementation}</p>
          </div>
          {suggestion.goal_relevance && (
            <div>
              <h5 className="text-sm font-medium text-zinc-400 mb-1">Goal relevance:</h5>
              <p className="text-purple-300 text-sm">{suggestion.goal_relevance}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CategorySection({ category, title }: { category: ImprovementCategory; title: string }) {
  if (!category?.suggestions?.length) {
    return (
      <div className="text-center py-8 text-zinc-500">
        No suggestions in this category
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="p-4 bg-purple-900/20 border border-purple-700/30 rounded-lg">
        <p className="text-purple-200">{category.summary}</p>
      </div>
      <div className="space-y-4">
        {category.suggestions.map((suggestion, index) => (
          <SuggestionCard key={index} suggestion={suggestion} index={index} />
        ))}
      </div>
    </div>
  );
}

export default function ChannelImproverPage() {
  const [url, setUrl] = useState("");
  const [goal, setGoal] = useState("");
  const [channelDescription, setChannelDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [recentTitles, setRecentTitles] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [missingEnv, setMissingEnv] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("overview");

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

    // Parse recent titles from textarea (one per line)
    const titlesArray = recentTitles
      .split("\n")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    try {
      const response = await fetch(`${API_URL}/api/channel/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          channel_context: {
            goal,
            channel_description: channelDescription,
            target_audience: targetAudience,
            recent_titles: titlesArray,
          },
        }),
      });

      const data = await response.json();

      if (data.missing_env) {
        setMissingEnv(data.missing_env);
      } else if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
        setActiveTab("overview");
      }
    } catch {
      setError("Failed to connect to the server. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const tabs: { id: TabType; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "critiques", label: "Critiques" },
    { id: "content", label: "Content" },
    { id: "delivery", label: "Delivery" },
    { id: "strategy", label: "Strategy" },
    { id: "branding", label: "Branding" },
    { id: "engagement", label: "Engagement" },
    { id: "titles", label: "Titles" },
  ];

  const goalExamples = [
    "Growing my subscriber base",
    "Marketing my products/services",
    "Building a community",
    "Establishing thought leadership",
    "Driving traffic to my website",
    "Monetizing through sponsorships",
    "Teaching and educating",
    "Entertainment and engagement",
  ];

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
            <span className="text-zinc-400">Channel Improver</span>
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
            Channel Improver
          </h1>
          <p className="text-zinc-400 max-w-2xl mx-auto">
            Analyze your video content and get personalized suggestions to improve
            your channel based on your specific goals and audience.
          </p>
        </div>

        {/* Missing Environment Variables */}
        {missingEnv ? (
          <MissingEnvMessage missingVar={missingEnv} />
        ) : (
          <>
            {/* Input Form */}
            {!result && (
              <div className="mb-8 p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Video URL */}
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">
                      YouTube Video URL <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
                      required
                    />
                    <p className="mt-1 text-xs text-zinc-500">
                      Paste a link to one of your videos to analyze
                    </p>
                  </div>

                  {/* Channel Goal */}
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">
                      What is your channel&apos;s primary goal? <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      placeholder="e.g., Marketing my SaaS product to developers"
                      className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
                      required
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {goalExamples.map((example) => (
                        <button
                          key={example}
                          type="button"
                          onClick={() => setGoal(example)}
                          className="px-3 py-1 text-xs bg-zinc-700/50 text-zinc-400 rounded-full hover:bg-purple-900/30 hover:text-purple-400 transition-colors"
                        >
                          {example}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Channel Description */}
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">
                      Describe your channel
                    </label>
                    <textarea
                      value={channelDescription}
                      onChange={(e) => setChannelDescription(e.target.value)}
                      placeholder="e.g., I create coding tutorials and tech reviews for web developers..."
                      rows={2}
                      className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors resize-none"
                    />
                  </div>

                  {/* Target Audience */}
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">
                      Who is your target audience?
                    </label>
                    <input
                      type="text"
                      value={targetAudience}
                      onChange={(e) => setTargetAudience(e.target.value)}
                      placeholder="e.g., Beginner to intermediate web developers aged 18-35"
                      className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
                    />
                  </div>

                  {/* Recent Titles */}
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">
                      Recent video titles (one per line)
                    </label>
                    <textarea
                      value={recentTitles}
                      onChange={(e) => setRecentTitles(e.target.value)}
                      placeholder="How I Built a $10K/mo SaaS in 30 Days&#10;The BEST VS Code Extensions for 2024&#10;Why Most Developers Quit (And How to Avoid It)"
                      rows={4}
                      className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors resize-none font-mono text-sm"
                    />
                    <p className="mt-1 text-xs text-zinc-500">
                      This helps us analyze your title patterns and suggest improvements
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full px-6 py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-lg"
                  >
                    {loading ? "Analyzing Your Content..." : "Analyze & Get Suggestions"}
                  </button>
                </form>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="mb-8 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-400">
                {error}
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="space-y-8">
                {/* Back Button */}
                <button
                  onClick={() => setResult(null)}
                  className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Analyze another video
                </button>

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

                {/* Goal Reminder */}
                <div className="p-4 bg-purple-900/20 border border-purple-700/30 rounded-lg text-center">
                  <p className="text-sm text-zinc-400">Analyzing for goal:</p>
                  <p className="text-lg font-medium text-purple-300">{result.channel_context?.goal}</p>
                </div>

                {/* Quick Wins */}
                {result.quick_wins && result.quick_wins.length > 0 && (
                  <div className="p-6 bg-green-900/20 border border-green-700/30 rounded-lg">
                    <h3 className="text-lg font-semibold text-green-400 mb-4 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Quick Wins
                    </h3>
                    <div className="space-y-3">
                      {result.quick_wins.map((win, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <span className="text-green-400 font-bold">{i + 1}.</span>
                          <div>
                            <p className="text-white">{win.action}</p>
                            <p className="text-green-300 text-sm">{win.expected_result}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tabs */}
                <div className="flex border-b border-zinc-700 overflow-x-auto">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-4 py-3 font-medium transition-colors whitespace-nowrap ${
                        activeTab === tab.id
                          ? "text-purple-400 border-b-2 border-purple-400"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="min-h-[400px]">
                  {/* Overview Tab */}
                  {activeTab === "overview" && result.overall_assessment && (
                    <div className="space-y-6">
                      {/* Goal Alignment Score */}
                      <div className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-white">Goal Alignment</h3>
                          <div className="flex items-center gap-2">
                            <span className="text-3xl font-bold text-purple-400">
                              {result.overall_assessment.goal_alignment_score}
                            </span>
                            <span className="text-zinc-500">/10</span>
                          </div>
                        </div>
                        <div className="w-full bg-zinc-700 rounded-full h-2 mb-4">
                          <div
                            className="bg-purple-500 h-2 rounded-full transition-all"
                            style={{ width: `${result.overall_assessment.goal_alignment_score * 10}%` }}
                          />
                        </div>
                        <p className="text-zinc-300">{result.overall_assessment.goal_alignment_feedback}</p>
                      </div>

                      {/* Strengths & Opportunities */}
                      <div className="grid md:grid-cols-2 gap-6">
                        <div className="p-5 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                          <h3 className="text-lg font-semibold text-green-400 mb-4 flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Strengths
                          </h3>
                          <ul className="space-y-2">
                            {result.overall_assessment.strengths.map((strength, i) => (
                              <li key={i} className="text-zinc-300 flex items-start gap-2">
                                <span className="text-green-400">+</span>
                                {strength}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="p-5 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                          <h3 className="text-lg font-semibold text-amber-400 mb-4 flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            Opportunities
                          </h3>
                          <ul className="space-y-2">
                            {result.overall_assessment.main_opportunities.map((opp, i) => (
                              <li key={i} className="text-zinc-300 flex items-start gap-2">
                                <span className="text-amber-400">!</span>
                                {opp}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Critiques Tab */}
                  {activeTab === "critiques" && result.critical_assessment && (
                    <div className="space-y-6">
                      {/* Warning Banner */}
                      <div className="p-4 bg-red-900/20 border border-red-700/30 rounded-lg">
                        <p className="text-red-300 text-sm flex items-center gap-2">
                          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          This is the honest, unfiltered feedback section. It might be uncomfortable, but it&apos;s meant to help you improve.
                        </p>
                      </div>

                      {/* Summary */}
                      <div className="p-5 bg-zinc-800/50 border border-red-700/30 rounded-lg">
                        <h3 className="text-lg font-semibold text-red-400 mb-3">The Bottom Line</h3>
                        <p className="text-zinc-300">{result.critical_assessment.summary}</p>
                      </div>

                      {/* Harsh Ratings */}
                      {result.critical_assessment.harsh_rating && (
                        <div className="p-5 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                          <h3 className="text-lg font-semibold text-white mb-4">Honest Ratings</h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                            {[
                              { label: "Content Quality", value: result.critical_assessment.harsh_rating.content_quality },
                              { label: "Professionalism", value: result.critical_assessment.harsh_rating.professionalism },
                              { label: "Audience Value", value: result.critical_assessment.harsh_rating.audience_value },
                              { label: "Goal Effectiveness", value: result.critical_assessment.harsh_rating.goal_effectiveness },
                            ].map((rating) => (
                              <div key={rating.label} className="text-center">
                                <div className={`text-2xl font-bold ${rating.value >= 7 ? "text-green-400" : rating.value >= 5 ? "text-yellow-400" : "text-red-400"}`}>
                                  {rating.value}/10
                                </div>
                                <div className="text-xs text-zinc-500">{rating.label}</div>
                              </div>
                            ))}
                          </div>
                          <div className="pt-4 border-t border-zinc-700">
                            <p className="text-zinc-400 text-sm font-medium">Verdict:</p>
                            <p className="text-white">{result.critical_assessment.harsh_rating.overall_verdict}</p>
                          </div>
                        </div>
                      )}

                      {/* Hard Truths */}
                      {result.critical_assessment.hard_truths?.length > 0 && (
                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold text-red-400 flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Hard Truths
                          </h3>
                          {result.critical_assessment.hard_truths.map((truth, i) => (
                            <div key={i} className="p-5 bg-zinc-800/50 border border-red-900/30 rounded-lg">
                              <div className="flex items-start gap-3 mb-3">
                                <span className="text-red-400 font-bold text-lg">#{i + 1}</span>
                                <h4 className="text-lg font-semibold text-white">{truth.issue}</h4>
                              </div>
                              <div className="space-y-3 ml-8">
                                <div>
                                  <p className="text-xs text-zinc-500 mb-1">Why it matters:</p>
                                  <p className="text-zinc-300">{truth.why_it_matters}</p>
                                </div>
                                {truth.evidence && (
                                  <div className="p-3 bg-zinc-900/50 border-l-2 border-red-500 rounded">
                                    <p className="text-xs text-zinc-500 mb-1">Evidence:</p>
                                    <p className="text-zinc-400 text-sm italic">{truth.evidence}</p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-xs text-zinc-500 mb-1">What to do:</p>
                                  <p className="text-green-300">{truth.what_to_do}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Blind Spots & Competitive Gaps */}
                      <div className="grid md:grid-cols-2 gap-6">
                        {result.critical_assessment.blind_spots?.length > 0 && (
                          <div className="p-5 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                            <h3 className="text-lg font-semibold text-amber-400 mb-4 flex items-center gap-2">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                              </svg>
                              Blind Spots
                            </h3>
                            <ul className="space-y-2">
                              {result.critical_assessment.blind_spots.map((spot, i) => (
                                <li key={i} className="text-zinc-300 flex items-start gap-2">
                                  <span className="text-amber-400">•</span>
                                  {spot}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {result.critical_assessment.competitive_gaps?.length > 0 && (
                          <div className="p-5 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                            <h3 className="text-lg font-semibold text-orange-400 mb-4 flex items-center gap-2">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                              </svg>
                              Competitive Gaps
                            </h3>
                            <ul className="space-y-2">
                              {result.critical_assessment.competitive_gaps.map((gap, i) => (
                                <li key={i} className="text-zinc-300 flex items-start gap-2">
                                  <span className="text-orange-400">•</span>
                                  {gap}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Content Tab */}
                  {activeTab === "content" && (
                    <CategorySection category={result.content_improvements} title="Content Improvements" />
                  )}

                  {/* Delivery Tab */}
                  {activeTab === "delivery" && (
                    <CategorySection category={result.delivery_improvements} title="Delivery Improvements" />
                  )}

                  {/* Strategy Tab */}
                  {activeTab === "strategy" && (
                    <CategorySection category={result.channel_strategy} title="Channel Strategy" />
                  )}

                  {/* Branding Tab */}
                  {activeTab === "branding" && (
                    <CategorySection category={result.branding_improvements} title="Branding Improvements" />
                  )}

                  {/* Engagement Tab */}
                  {activeTab === "engagement" && (
                    <CategorySection category={result.audience_engagement} title="Audience Engagement" />
                  )}

                  {/* Titles Tab */}
                  {activeTab === "titles" && result.title_suggestions && (
                    <div className="space-y-6">
                      {/* Current Analysis */}
                      <div className="p-5 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                        <h3 className="text-lg font-semibold text-white mb-3">Current Title Analysis</h3>
                        <p className="text-zinc-300">{result.title_suggestions.current_analysis}</p>
                      </div>

                      {/* Suggested Titles */}
                      <div className="p-5 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                        <h3 className="text-lg font-semibold text-white mb-4">Suggested Titles for This Video</h3>
                        <div className="space-y-3">
                          {result.title_suggestions.improved_titles_for_this_video.map((title, i) => (
                            <div
                              key={i}
                              className="p-3 bg-purple-900/20 border border-purple-700/30 rounded-lg flex items-center justify-between gap-4"
                            >
                              <span className="text-purple-200">{title}</span>
                              <button
                                onClick={() => navigator.clipboard.writeText(title)}
                                className="p-2 text-zinc-400 hover:text-white transition-colors"
                                title="Copy to clipboard"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Title Formula */}
                      <div className="p-5 bg-green-900/20 border border-green-700/30 rounded-lg">
                        <h3 className="text-lg font-semibold text-green-400 mb-3">Recommended Title Formula</h3>
                        <p className="text-zinc-300">{result.title_suggestions.title_formula_recommendation}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
