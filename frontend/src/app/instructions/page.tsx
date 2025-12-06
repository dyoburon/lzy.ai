"use client";

import Link from "next/link";

const envVars = [
  {
    name: "GEMINI_API_KEY",
    required: ["Transcript & Chapters"],
    description: "Google Gemini API key for AI-powered chapter generation",
    howToGet: [
      "Go to https://makersuite.google.com/app/apikey",
      "Sign in with your Google account",
      "Click 'Create API Key'",
      "Copy the key and add it to your .env file",
    ],
  },
  {
    name: "YOUTUBE_API_KEY",
    required: ["Live Status Checker"],
    description: "YouTube Data API v3 key for checking live stream status",
    howToGet: [
      "Go to https://console.cloud.google.com/",
      "Create a new project (or select existing)",
      "Go to 'APIs & Services' > 'Library'",
      "Search for 'YouTube Data API v3' and enable it",
      "Go to 'APIs & Services' > 'Credentials'",
      "Click 'Create Credentials' > 'API Key'",
      "Copy the key and add it to your .env file",
    ],
  },
  {
    name: "YOUTUBE_CHANNEL_ID",
    required: ["Live Status Checker"],
    description: "Your YouTube channel ID to monitor for live streams",
    howToGet: [
      "Go to your YouTube channel page",
      "Click on your profile icon > 'Your channel'",
      "Look at the URL - it will be youtube.com/channel/UC...",
      "The part starting with 'UC' is your channel ID",
      "Alternatively, use a tool like https://commentpicker.com/youtube-channel-id.php",
    ],
  },
  {
    name: "DISCORD_BOT_TOKEN",
    required: ["Discord Bot", "Live Status Checker (notifications)"],
    description: "Discord bot token for sending notifications",
    howToGet: [
      "Go to https://discord.com/developers/applications",
      "Click 'New Application' and give it a name",
      "Go to 'Bot' section and click 'Add Bot'",
      "Click 'Reset Token' to reveal your bot token",
      "Copy the token and add it to your .env file",
      "Under 'Privileged Gateway Intents', enable 'Message Content Intent'",
    ],
  },
  {
    name: "DISCORD_YOUTUBE_CHANNEL_ID",
    required: ["Live Status Checker (notifications)"],
    description: "Discord channel ID where live notifications will be posted",
    howToGet: [
      "Open Discord and go to User Settings > Advanced",
      "Enable 'Developer Mode'",
      "Right-click on the channel you want notifications in",
      "Click 'Copy Channel ID'",
      "Add it to your .env file",
    ],
  },
];

export default function InstructionsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
      {/* Header */}
      <header className="border-b border-zinc-700/50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/" className="text-2xl font-bold text-white">
            lzy<span className="text-purple-500">.ai</span>
          </Link>
          <span className="text-zinc-600">/</span>
          <span className="text-zinc-400">Setup Instructions</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-white mb-4">
            Setup Instructions
          </h1>
          <p className="text-zinc-400">
            Welcome, contributor! This guide will help you set up the environment
            variables needed to run lzy.ai locally.
          </p>
        </div>

        {/* Quick Start */}
        <section className="mb-12 p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg">
          <h2 className="text-xl font-semibold text-white mb-4">Quick Start</h2>
          <ol className="space-y-3 text-zinc-300">
            <li className="flex gap-3">
              <span className="text-purple-400 font-mono">1.</span>
              <span>Clone the repository and navigate to the project root</span>
            </li>
            <li className="flex gap-3">
              <span className="text-purple-400 font-mono">2.</span>
              <span>Copy the example environment file:</span>
            </li>
            <li className="ml-8">
              <code className="px-3 py-1 bg-zinc-900 rounded text-green-400 text-sm">
                cp .env.example .env
              </code>
            </li>
            <li className="flex gap-3">
              <span className="text-purple-400 font-mono">3.</span>
              <span>Fill in the required API keys (see below)</span>
            </li>
            <li className="flex gap-3">
              <span className="text-purple-400 font-mono">4.</span>
              <span>Install dependencies and run:</span>
            </li>
            <li className="ml-8 space-y-2">
              <code className="block px-3 py-1 bg-zinc-900 rounded text-green-400 text-sm">
                pip install -r requirements.txt && python app.py
              </code>
              <code className="block px-3 py-1 bg-zinc-900 rounded text-green-400 text-sm">
                cd frontend && npm install && npm run dev
              </code>
            </li>
          </ol>
        </section>

        {/* Environment Variables */}
        <section>
          <h2 className="text-2xl font-semibold text-white mb-6">
            Environment Variables
          </h2>
          <div className="space-y-6">
            {envVars.map((envVar) => (
              <div
                key={envVar.name}
                id={envVar.name.toLowerCase().replace(/_/g, "-")}
                className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg"
              >
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <code className="text-lg font-mono text-purple-400">
                    {envVar.name}
                  </code>
                  {envVar.required.map((tool) => (
                    <span
                      key={tool}
                      className="text-xs px-2 py-1 bg-zinc-700 text-zinc-300 rounded"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
                <p className="text-zinc-400 mb-4">{envVar.description}</p>
                <div className="p-4 bg-zinc-900/50 rounded">
                  <h4 className="text-sm font-semibold text-zinc-300 mb-2">
                    How to get this:
                  </h4>
                  <ol className="space-y-1 text-sm text-zinc-400">
                    {envVar.howToGet.map((step, index) => (
                      <li key={index} className="flex gap-2">
                        <span className="text-purple-400">{index + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Example .env */}
        <section className="mt-12 p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg">
          <h2 className="text-xl font-semibold text-white mb-4">
            Example .env File
          </h2>
          <pre className="p-4 bg-zinc-900 rounded text-sm text-zinc-300 overflow-x-auto">
{`# Flask Configuration
FLASK_PORT=5005

# Required for Transcript & Chapters tool
GEMINI_API_KEY=your_gemini_api_key_here

# Required for Live Status Checker
YOUTUBE_API_KEY=your_youtube_api_key_here
YOUTUBE_CHANNEL_ID=your_youtube_channel_id_here

# Required for Discord notifications
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_YOUTUBE_CHANNEL_ID=your_discord_channel_id_here`}
          </pre>
        </section>

        {/* Need Help */}
        <section className="mt-12 p-6 bg-purple-900/20 border border-purple-700/50 rounded-lg">
          <h2 className="text-xl font-semibold text-white mb-2">Need Help?</h2>
          <p className="text-zinc-400">
            If you run into issues or have questions, feel free to open an issue
            on the GitHub repository. We&apos;re happy to help!
          </p>
        </section>
      </main>
    </div>
  );
}
