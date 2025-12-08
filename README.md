# lzy.ai

Tools for YouTube creators to automate repetitive tasks.

## Cost Targets

We're trying to make shorts generation as cheap as possible.

| Scale | Target Cost | Status |
|-------|-------------|--------|
| **At Scale (1,000-5,000 videos/day)** | ~$0.01/short | Not yet achieved - working on transcript-only approach, seeing if this viable to get a reasonably good result |
| **At Scale with Whisper** | $0.02-0.03/short | Current approach (self-hosted Whisper is similar cost) |
| **Individual Use By Cloning this Repo** | ~$0.003/short | Achievable using free tier APIs |

## How It Works

The shorts clipper relies on **YouTube's transcript** (auto-generated or manual captions) to analyze video content. The AI reads through the transcript to find interesting moments, then clips those segments from the uploaded video file.

This means:
- Videos must have a YouTube transcript available
- The transcript is used for moment detection (via Gemini AI)
- Whisper is only used if you want animated captions on the final short

## Tools

### Shorts Clipper
Detect interesting moments from long-form videos and clip them into vertical shorts.
- Uses YouTube transcript for moment detection
- Custom instructions to find specific themes or moments
- Region selector for webcam + content layouts
- Optional animated captions (requires Whisper/OpenAI)
- Caption styling options (fonts, colors, position, effects)

### Transcript & Chapters
Extract transcripts from YouTube videos and generate chapter markers.
- Pulls transcript from YouTube
- AI-generated chapter suggestions

### Live Status Checker
Check if a YouTube channel is currently live.
- Discord notification support

### Video Idea Generator
Generate video and shorts ideas from existing content.
- Analyzes transcript to suggest related topics

### Channel Improver
Suggestions based on channel goals.
- Content analysis
- Audience targeting ideas

### Audio Mixer
Separate and remix audio tracks.
- Vocal/music separation using Demucs
- Mix in custom audio tracks

## Tech Stack

**Backend:** Flask, Google Gemini AI, OpenAI Whisper, FFmpeg, Demucs

**Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- FFmpeg (required for video processing)
  ```bash
  # macOS
  brew install ffmpeg

  # Ubuntu/Debian
  sudo apt-get install ffmpeg

  # Windows - Download from https://ffmpeg.org/download.html
  ```

### Backend Setup

```bash
# Clone the repo
git clone https://github.com/yourusername/lzy.ai.git
cd lzy.ai

# Install Python dependencies
pip install -r requirements.txt

# Create .env file with your API keys
cp .env.example .env

# Run the backend
python app.py
# Server runs on http://localhost:5005
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
# Frontend runs on http://localhost:3000
```

## Environment Variables

Create a `.env` file in the root directory:

```bash
# Required for most features
GEMINI_API_KEY=your_gemini_api_key

# Required for animated captions
OPENAI_API_KEY=your_openai_api_key

# Required for live checker
YOUTUBE_API_KEY=your_youtube_api_key
YOUTUBE_CHANNEL_ID=your_channel_id

# Optional - Discord notifications
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_YOUTUBE_CHANNEL_ID=your_discord_channel_id

# Optional - Server config
FLASK_PORT=5005
```

### Getting API Keys

- **Gemini API Key**: [Google AI Studio](https://aistudio.google.com/apikey) (free tier available)
- **OpenAI API Key**: [OpenAI Platform](https://platform.openai.com/api-keys) (for Whisper captions)
- **YouTube API Key**: [Google Cloud Console](https://console.cloud.google.com/apis/credentials)

## API Endpoints

### Shorts Processing
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/shorts/upload` | POST | Upload video for processing |
| `/api/shorts/detect-moments` | POST | Find interesting moments |
| `/api/shorts/clip` | POST | Extract clips from video |
| `/api/shorts/process-vertical` | POST | Convert to vertical with captions |

### Content Tools
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/transcript` | POST | Get transcript & chapters |
| `/api/ideas/generate` | POST | Generate video ideas |
| `/api/channel/analyze` | POST | Get improvement suggestions |

### YouTube & Discord
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/youtube/live-status` | GET | Check if channel is live |
| `/api/youtube/channel-info` | GET | Get channel information |
| `/api/discord/notify` | POST | Send Discord notification |

### Audio Processing
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/audio/status` | GET | Check Demucs availability |
| `/api/audio/separate` | POST | Separate vocals/music |
| `/api/audio/process` | POST | Mix audio tracks |

### Utilities
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/config` | GET | Check configured env vars |

## Project Structure

```
lzy.ai/
├── app.py                 # Flask backend
├── requirements.txt       # Python dependencies
├── services/              # Backend services
│   ├── shorts.py          # Shorts clipper logic
│   ├── captions.py        # Caption generation
│   ├── audio_mixer.py     # Audio separation
│   ├── transcript.py      # Transcript extraction
│   ├── youtube_live.py    # Live stream checking
│   ├── idea_generator.py  # Content ideas
│   ├── channel_improver.py# Channel optimization
│   └── discord_notify.py  # Discord integration
├── frontend/              # Next.js frontend
│   ├── src/app/           # App pages
│   │   ├── shorts/        # Shorts clipper UI
│   │   ├── transcript/    # Transcript tool UI
│   │   ├── live-checker/  # Live checker UI
│   │   ├── region-selector/ # Region selection UI
│   │   └── ...
│   └── package.json
├── uploads/               # Temporary video storage
└── discord_bot.py         # Discord bot (optional)
```

## How It Works

### Shorts Clipper Flow
1. **Enter YouTube URL** - Paste a video link
2. **Detect Moments** - AI analyzes transcript to find interesting clips
3. **Upload Video** - Upload the actual video file for clipping
4. **Clip Moments** - Extract the detected segments
5. **Select Regions** - Draw boxes around webcam and content areas
6. **Configure Captions** - Style your animated captions
7. **Process** - Generate vertical shorts ready for upload

### Custom Instructions
When detecting moments, you can provide custom instructions:
- "Only find funny moments"
- "Find clips about [specific topic]"
- "Look for controversial statements"

The AI will prioritize your instructions over generic "viral" criteria.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this for your own projects.
