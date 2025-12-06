"use client";

import Link from "next/link";

export default function ShortsPage() {
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
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-4">
            Shorts Clipper
          </h1>
          <p className="text-zinc-400 mb-12">
            Automatically clip engaging shorts from your long-form videos.
          </p>

          {/* TBD Card */}
          <div className="max-w-md mx-auto p-8 bg-zinc-800/50 border border-zinc-700 rounded-2xl">
            <div className="text-6xl mb-6">🚧</div>
            <h2 className="text-2xl font-bold text-white mb-4">Coming Soon</h2>
            <p className="text-zinc-400 mb-6">
              TBD - This feature is currently under development.
              It will allow you to upload long-form videos and automatically
              extract the most engaging moments as shorts.
            </p>

            {/* Planned Features */}
            <div className="text-left space-y-3 p-4 bg-zinc-900/50 rounded-lg">
              <h3 className="text-sm font-semibold text-purple-400 uppercase tracking-wide">
                Planned Features
              </h3>
              <ul className="space-y-2 text-sm text-zinc-400">
                <li className="flex items-center gap-2">
                  <span className="text-purple-400">•</span>
                  Upload long-form video files
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-purple-400">•</span>
                  AI-powered moment detection
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-purple-400">•</span>
                  Automatic vertical cropping for Shorts/TikTok/Reels
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-purple-400">•</span>
                  Batch export multiple clips
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
