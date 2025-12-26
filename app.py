import os
import uuid
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from werkzeug.utils import secure_filename

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Configure upload folder
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024 * 1024  # 5GB max

# Import services
from services.transcript import process_transcript, generate_chapters, chat_with_transcript
from services.youtube_live import check_live_status, get_channel_info, get_channel_context
from services.discord_notify import send_discord_notification
from services.shorts import (
    process_video_for_shorts,
    detect_interesting_moments,
    clip_all_moments,
    process_clip_to_vertical,
    process_clips_to_vertical,
    process_clip_to_vertical_with_captions,
    process_clips_to_vertical_with_captions,
    remove_silence_from_video
)
from services.idea_generator import process_video_for_ideas, generate_video_ideas, chat_with_ideas
from services.channel_improver import analyze_video_for_improvements
from services.audio_mixer import (
    check_demucs_status,
    separate_video_audio,
    process_video_audio
)
from services.bestof import (
    get_transcript_for_highlights,
    detect_highlight_moments,
    create_bestof_compilation,
    process_video_for_bestof
)
from services.concat import concatenate_videos

# Environment variable definitions for the config endpoint
ENV_VAR_CONFIG = {
    "GEMINI_API_KEY": {
        "configured": bool(os.environ.get("GEMINI_API_KEY")),
        "required_for": ["transcript"],
        "description": "Google Gemini API key for AI chapter generation"
    },
    "YOUTUBE_API_KEY": {
        "configured": bool(os.environ.get("YOUTUBE_API_KEY")),
        "required_for": ["live-checker"],
        "description": "YouTube Data API v3 key"
    },
    "YOUTUBE_CHANNEL_ID": {
        "configured": bool(os.environ.get("YOUTUBE_CHANNEL_ID")),
        "required_for": ["live-checker"],
        "description": "Your YouTube channel ID to monitor"
    },
    "DISCORD_BOT_TOKEN": {
        "configured": bool(os.environ.get("DISCORD_BOT_TOKEN")),
        "required_for": ["live-checker-notify"],
        "description": "Discord bot token for notifications"
    },
    "DISCORD_YOUTUBE_CHANNEL_ID": {
        "configured": bool(os.environ.get("DISCORD_YOUTUBE_CHANNEL_ID")),
        "required_for": ["live-checker-notify"],
        "description": "Discord channel ID for notifications"
    },
    "OPENAI_API_KEY": {
        "configured": bool(os.environ.get("OPENAI_API_KEY")),
        "required_for": ["shorts-captions"],
        "description": "OpenAI API key for Whisper transcription (animated captions)"
    }
}

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"})

@app.route('/api/config', methods=['GET'])
def get_config():
    """Returns which environment variables are configured (not the values)."""
    return jsonify(ENV_VAR_CONFIG)

# --- Transcript Tool Routes ---
@app.route('/api/transcript', methods=['POST'])
def get_transcript():
    """
    Fetch transcript and generate chapters for a YouTube video,
    or process a custom transcript.

    Request body (YouTube mode):
    {
        "url": "https://youtube.com/watch?v=...",
        "custom_instructions": "..."  // Optional style guidance for chapters
    }

    Request body (Custom mode):
    {
        "custom_transcript": "...",  // Plain text transcript
        "custom_instructions": "..."  // Optional style guidance for chapters
    }

    Returns transcript with AI-generated chapters.
    """
    if not os.environ.get("GEMINI_API_KEY"):
        return jsonify({
            "error": "GEMINI_API_KEY not configured",
            "missing_env": "GEMINI_API_KEY"
        }), 400

    data = request.json
    video_url = data.get('url')
    custom_transcript = data.get('custom_transcript')
    custom_instructions = data.get('custom_instructions')

    # Custom transcript mode
    if custom_transcript:
        # Generate chapters using Gemini directly from the text
        from services.transcript import generate_chapters
        chapters = generate_chapters(custom_transcript, custom_instructions)

        return jsonify({
            "transcript": [],
            "chapters": chapters,
            "video_id": None,
            "source": "custom"
        })

    # YouTube mode
    if not video_url:
        return jsonify({"error": "No URL or custom transcript provided"}), 400

    result = process_transcript(video_url, custom_instructions)
    if "error" in result:
        return jsonify(result), 400

    result['source'] = 'youtube'
    return jsonify(result)


@app.route('/api/transcript/chat', methods=['POST'])
def transcript_chat():
    """
    Chat with Gemini about transcript content using Gemini 2.5 Flash.

    Request body:
    {
        "message": "User's question about the transcript",
        "context": "The full transcript text",
        "history": [  // Optional - previous messages
            {"role": "user", "content": "..."},
            {"role": "assistant", "content": "..."}
        ]
    }

    Returns AI response about the transcript content.
    """
    if not os.environ.get("GEMINI_API_KEY"):
        return jsonify({
            "error": "GEMINI_API_KEY not configured",
            "missing_env": "GEMINI_API_KEY"
        }), 400

    data = request.json
    message = data.get('message')
    context = data.get('context')
    history = data.get('history', [])

    if not message:
        return jsonify({"error": "No message provided"}), 400

    if not context:
        return jsonify({"error": "No transcript context provided"}), 400

    result = chat_with_transcript(message, context, history)

    if "error" in result:
        return jsonify(result), 400

    return jsonify(result)


# --- YouTube Live Check Routes ---
@app.route('/api/youtube/live-status', methods=['GET'])
def youtube_live_status():
    """Check if the configured YouTube channel is currently live."""
    youtube_api_key = os.environ.get("YOUTUBE_API_KEY")
    youtube_channel_id = os.environ.get("YOUTUBE_CHANNEL_ID")

    missing = []
    if not youtube_api_key:
        missing.append("YOUTUBE_API_KEY")
    if not youtube_channel_id:
        missing.append("YOUTUBE_CHANNEL_ID")

    if missing:
        return jsonify({
            "error": f"Missing environment variables: {', '.join(missing)}",
            "missing_env": missing
        }), 400

    result = check_live_status(youtube_channel_id)
    return jsonify(result)

@app.route('/api/youtube/channel-info', methods=['GET'])
def youtube_channel_info():
    """Get info about the configured YouTube channel."""
    youtube_api_key = os.environ.get("YOUTUBE_API_KEY")
    youtube_channel_id = os.environ.get("YOUTUBE_CHANNEL_ID")

    missing = []
    if not youtube_api_key:
        missing.append("YOUTUBE_API_KEY")
    if not youtube_channel_id:
        missing.append("YOUTUBE_CHANNEL_ID")

    if missing:
        return jsonify({
            "error": f"Missing environment variables: {', '.join(missing)}",
            "missing_env": missing
        }), 400

    result = get_channel_info(youtube_channel_id)
    return jsonify(result)

@app.route('/api/discord/notify', methods=['POST'])
def discord_notify():
    """Send a notification to Discord about live status."""
    discord_token = os.environ.get("DISCORD_BOT_TOKEN")
    discord_channel = os.environ.get("DISCORD_YOUTUBE_CHANNEL_ID")

    missing = []
    if not discord_token:
        missing.append("DISCORD_BOT_TOKEN")
    if not discord_channel:
        missing.append("DISCORD_YOUTUBE_CHANNEL_ID")

    if missing:
        return jsonify({
            "error": f"Missing environment variables: {', '.join(missing)}",
            "missing_env": missing
        }), 400

    data = request.json or {}
    message = data.get('message', '')

    if not message:
        # Default: check live status and create message
        youtube_channel_id = os.environ.get("YOUTUBE_CHANNEL_ID")
        if youtube_channel_id:
            live_result = check_live_status(youtube_channel_id)
            if live_result.get('is_live') and live_result.get('streams'):
                stream = live_result['streams'][0]
                message = f"🔴 **Now LIVE!**\n\n**{stream['title']}**\n{stream['url']}"
            else:
                return jsonify({"error": "Channel is not currently live"}), 400
        else:
            return jsonify({
                "error": "YOUTUBE_CHANNEL_ID not configured",
                "missing_env": ["YOUTUBE_CHANNEL_ID"]
            }), 400

    result = send_discord_notification(discord_token, discord_channel, message)
    return jsonify(result)

# --- Shorts Clipper Routes ---
@app.route('/api/shorts/upload', methods=['POST'])
def upload_video():
    """
    Upload a video file for processing.
    Returns the server path to use for clipping.
    """
    if 'video' not in request.files:
        return jsonify({"error": "No video file provided"}), 400

    file = request.files['video']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    # Create unique filename to avoid collisions
    filename = secure_filename(file.filename)
    unique_id = str(uuid.uuid4())[:8]
    name, ext = os.path.splitext(filename)
    unique_filename = f"{name}_{unique_id}{ext}"

    filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
    file.save(filepath)

    return jsonify({
        "success": True,
        "video_path": filepath,
        "filename": unique_filename
    })


def find_wake_word_timestamps(transcript_text, wake_word):
    """
    Find all occurrences of a wake word in a timestamped transcript and return their timestamps.

    Args:
        transcript_text: Transcript with timestamps in format "[MM:SS] text" or "[H:MM:SS] text"
        wake_word: Word/phrase to search for

    Returns:
        List of timestamps where the wake word appears, e.g., ["5:23", "12:45"]
    """
    if not wake_word or not wake_word.strip():
        return []

    wake_word_lower = wake_word.lower().strip()
    timestamps = []

    # Parse transcript line by line to find timestamps
    import re
    # Match timestamps like [0:00], [5:23], [1:23:45]
    timestamp_pattern = r'\[(\d+:?\d*:\d+)\]'

    lines = transcript_text.split('\n')
    current_timestamp = None

    for line in lines:
        # Extract timestamp from line
        match = re.search(timestamp_pattern, line)
        if match:
            current_timestamp = match.group(1)

        # Check if wake word is in this line
        if current_timestamp and wake_word_lower in line.lower():
            if current_timestamp not in timestamps:
                timestamps.append(current_timestamp)
                print(f"[wake_word] Found '{wake_word}' at timestamp {current_timestamp}")

    print(f"[wake_word] Total: Found '{wake_word}' at {len(timestamps)} unique timestamps")
    return timestamps


def generate_wake_word_moments(transcript_text, wake_word, num_clips, timestamps_found):
    """
    Use AI to generate clip moments around wake word occurrences.

    If there are multiple occurrences, create clips around each.
    If there's only one occurrence but multiple clips requested, create variations.

    Args:
        transcript_text: Full transcript with timestamps
        wake_word: The wake word/phrase
        num_clips: Number of clips requested
        timestamps_found: List of timestamps where wake word appears

    Returns:
        Dict with 'moments' list
    """
    from services.shorts import detect_interesting_moments

    if not timestamps_found:
        return {"moments": [], "error": f"Wake word '{wake_word}' not found in transcript"}

    num_occurrences = len(timestamps_found)

    # Build a custom prompt that tells AI exactly where to focus
    timestamp_list = ", ".join(timestamps_found)

    if num_occurrences == 1:
        # Only 1 occurrence - create variations around it
        custom_prompt = f"""
The user wants {num_clips} clips around the phrase "{wake_word}" which appears at timestamp {timestamps_found[0]}.

Create {num_clips} different clip variations around this moment, each with different start/end times:
- Mix of short clips (~20-30s), medium clips (~45-60s), and longer clips (~60-90s)
- All clips must include the "{wake_word}" moment

Create exactly {num_clips} clips.
"""
    else:
        # Multiple occurrences - spread clips across them
        custom_prompt = f"""
The user wants {num_clips} clips around the phrase "{wake_word}" which appears at these timestamps: {timestamp_list}

Create {num_clips} clips spread across these occurrences. Don't put all clips on the same timestamp - distribute them.
Each clip should be 30-90 seconds and include one of the "{wake_word}" moments.

Create exactly {num_clips} clips.
"""

    print(f"[wake_word] Generating {num_clips} clips around {num_occurrences} occurrences of '{wake_word}'")

    # Use the existing moment detection with our custom prompt
    result = detect_interesting_moments(
        transcript_text,
        num_clips=num_clips,
        custom_prompt=custom_prompt,
        curator_mode=False
    )

    return result


@app.route('/api/shorts/detect-moments', methods=['POST'])
def detect_moments():
    """
    Detect interesting moments from a YouTube video transcript or custom transcript.

    Request body (YouTube mode):
    {
        "url": "https://youtube.com/watch?v=...",
        "num_clips": 3,  // Optional, 1-10 (or 1-15 in curator mode), default 3
        "custom_prompt": "Focus on funny moments...",  // Optional custom instructions
        "curator_mode": false,  // Optional, if true allows up to 15 clips for user selection
        "wake_word": "clip that",  // Optional, find moments containing this word/phrase
        "only_wake_word_clips": false  // Optional, if true only return moments with wake word
    }

    Request body (Custom transcript mode):
    {
        "custom_transcript": "...",  // Plain text transcript
        "num_clips": 3,
        "custom_prompt": "...",
        "curator_mode": false,
        "wake_word": "...",
        "only_wake_word_clips": false
    }

    Returns detected moments with timestamps and viral scores.
    """
    if not os.environ.get("GEMINI_API_KEY"):
        return jsonify({
            "error": "GEMINI_API_KEY not configured",
            "missing_env": "GEMINI_API_KEY"
        }), 400

    data = request.json
    video_url = data.get('url')
    custom_transcript = data.get('custom_transcript')
    num_clips = data.get('num_clips', 3)
    custom_prompt = data.get('custom_prompt')
    curator_mode = data.get('curator_mode', False)
    wake_word = data.get('wake_word', '')
    only_wake_word_clips = data.get('only_wake_word_clips', False)

    # Validate num_clips (15 max in curator mode, 10 otherwise)
    max_clips = 15 if curator_mode else 10
    try:
        num_clips = int(num_clips)
        num_clips = max(1, min(max_clips, num_clips))
    except (ValueError, TypeError):
        num_clips = 3

    # Custom transcript mode
    if custom_transcript:
        # If wake word is specified with only_wake_word_clips, use wake word targeting
        if wake_word and only_wake_word_clips:
            # Find all timestamps where the wake word appears
            timestamps_found = find_wake_word_timestamps(custom_transcript, wake_word)

            if not timestamps_found:
                return jsonify({
                    "video_id": None,
                    "moments": [],
                    "transcript_preview": custom_transcript[:500] + "..." if len(custom_transcript) > 500 else custom_transcript,
                    "full_transcript": custom_transcript,
                    "source": "custom",
                    "wake_word_filter": {
                        "wake_word": wake_word,
                        "only_wake_word_clips": True,
                        "timestamps_found": [],
                        "error": f"Wake word '{wake_word}' not found in transcript"
                    }
                })

            # Generate moments specifically around the wake word occurrences
            moments_result = generate_wake_word_moments(
                custom_transcript,
                wake_word,
                num_clips,
                timestamps_found
            )

            if "error" in moments_result and not moments_result.get("moments"):
                return jsonify(moments_result), 400

            return jsonify({
                "video_id": None,
                "moments": moments_result.get('moments', []),
                "transcript_preview": custom_transcript[:500] + "..." if len(custom_transcript) > 500 else custom_transcript,
                "full_transcript": custom_transcript,
                "source": "custom",
                "wake_word_filter": {
                    "wake_word": wake_word,
                    "only_wake_word_clips": True,
                    "timestamps_found": timestamps_found,
                    "occurrences": len(timestamps_found),
                    "clips_requested": num_clips
                }
            })

        # Standard mode - use AI to find interesting moments
        moments_result = detect_interesting_moments(
            custom_transcript,
            num_clips=num_clips,
            custom_prompt=custom_prompt,
            curator_mode=curator_mode
        )

        if "error" in moments_result:
            return jsonify(moments_result), 400

        return jsonify({
            "video_id": None,
            "moments": moments_result['moments'],
            "transcript_preview": custom_transcript[:500] + "..." if len(custom_transcript) > 500 else custom_transcript,
            "full_transcript": custom_transcript,
            "source": "custom"
        })

    # YouTube mode
    if not video_url:
        return jsonify({"error": "No URL or custom transcript provided"}), 400

    # First get the transcript so we can search for wake word
    result = process_video_for_shorts(video_url, num_clips=num_clips, custom_prompt=custom_prompt, curator_mode=curator_mode)
    if "error" in result:
        return jsonify(result), 400

    # If wake word is specified with only_wake_word_clips, regenerate moments around wake word
    if wake_word and only_wake_word_clips:
        transcript = result.get('full_transcript', result.get('transcript_preview', ''))
        timestamps_found = find_wake_word_timestamps(transcript, wake_word)

        if not timestamps_found:
            result['moments'] = []
            result['wake_word_filter'] = {
                "wake_word": wake_word,
                "only_wake_word_clips": True,
                "timestamps_found": [],
                "error": f"Wake word '{wake_word}' not found in transcript"
            }
        else:
            # Generate moments specifically around the wake word occurrences
            moments_result = generate_wake_word_moments(
                transcript,
                wake_word,
                num_clips,
                timestamps_found
            )
            result['moments'] = moments_result.get('moments', [])
            result['wake_word_filter'] = {
                "wake_word": wake_word,
                "only_wake_word_clips": True,
                "timestamps_found": timestamps_found,
                "occurrences": len(timestamps_found),
                "clips_requested": num_clips
            }

    result['source'] = 'youtube'
    return jsonify(result)


@app.route('/api/shorts/clip', methods=['POST'])
def clip_shorts_endpoint():
    """
    Clip video segments based on detected moments.

    Request body:
    {
        "video_path": "/path/to/uploaded/video.mp4",
        "moments": [...]  # Array of moments from detect-moments endpoint
    }

    Returns clip results with base64 video data for each clip.
    """
    data = request.json
    video_path = data.get('video_path')
    moments = data.get('moments')

    if not video_path:
        return jsonify({"error": "No video_path provided"}), 400

    if not moments:
        return jsonify({"error": "No moments provided"}), 400

    if not os.path.exists(video_path):
        return jsonify({"error": f"Video file not found: {video_path}"}), 400

    try:
        result = clip_all_moments(video_path, moments)
        return jsonify(result)
    finally:
        # Clean up the uploaded video file after processing
        try:
            if os.path.exists(video_path):
                os.remove(video_path)
        except Exception as e:
            print(f"Warning: Failed to clean up uploaded file {video_path}: {e}")


@app.route('/api/shorts/process-vertical', methods=['POST'])
def process_vertical_shorts():
    """
    Process clipped videos into vertical shorts with stacked or PiP layout.
    Optionally adds animated captions if caption_options.enabled is true.
    Optionally removes silence/gaps if silence_removal.enabled is true.

    Request body:
    {
        "clips": [...],  # Array of clips from /api/shorts/clip endpoint
        "regions": [
            {"id": "content", "x": 5, "y": 5, "width": 60, "height": 90},
            {"id": "webcam", "x": 70, "y": 60, "width": 25, "height": 35}
        ],
        "layout_mode": "stack",  # "stack" or "pip"
        "layout": {  # For stack mode
            "topRegionId": "content",
            "splitRatio": 0.6
        },
        "pip_settings": {  # For pip mode
            "backgroundRegionId": "content",
            "overlayRegionId": "webcam",
            "position": "bottom-right",
            "size": 25,
            "shape": "rounded",
            "margin": 5
        },
        "caption_options": {  # Optional - for animated captions
            "enabled": true,
            "words_per_group": 3,
            "silence_threshold": 0.5,
            "font_size": 56,
            "primary_color": "white",
            "highlight_color": "yellow",
            "highlight_scale": 1.3
        },
        "silence_removal": {  # Optional - remove gaps/pauses
            "enabled": false,
            "min_gap_duration": 0.4,
            "padding": 0.05
        },
        "all_clip_titles": ["Title for clip 1", "Title for clip 2", ...]  # Optional per-clip titles
    }

    Returns processed vertical shorts as base64 video data.
    """
    data = request.json

    clips = data.get('clips')
    # Support per-clip regions (new) or single regions array (legacy)
    all_clip_regions = data.get('all_clip_regions')  # Array of region arrays, one per clip
    regions = data.get('regions')  # Legacy: same regions for all clips
    layout_mode = data.get('layout_mode', 'stack')
    layout = data.get('layout')
    pip_settings = data.get('pip_settings')
    caption_options = data.get('caption_options')
    silence_removal = data.get('silence_removal')
    all_clip_titles = data.get('all_clip_titles', [])  # Per-clip titles array
    title_font_size = data.get('title_font_size', 48)  # Font size for titles
    title_highlight_color = data.get('title_highlight_color', '#FBBF24')  # Highlight color for {bracketed} text

    # Debug logging
    print(f"[process-vertical] layout_mode: {layout_mode}")
    if all_clip_regions:
        print(f"[process-vertical] Using per-clip regions for {len(all_clip_regions)} clips")
    if pip_settings:
        print(f"[process-vertical] pip_settings: {pip_settings}")
    if caption_options:
        print(f"[process-vertical] caption_options: {caption_options}")
    if silence_removal:
        print(f"[process-vertical] silence_removal options: {silence_removal}")
    if all_clip_titles and any(all_clip_titles):
        print(f"[process-vertical] all_clip_titles: {all_clip_titles}")

    if not clips:
        return jsonify({"error": "No clips provided"}), 400

    # Validate regions - either all_clip_regions or legacy regions
    if all_clip_regions:
        # Validate per-clip regions
        if len(all_clip_regions) != len(clips):
            return jsonify({"error": f"Mismatch: {len(clips)} clips but {len(all_clip_regions)} region sets"}), 400
        for i, clip_regions in enumerate(all_clip_regions):
            if not clip_regions or len(clip_regions) < 2:
                return jsonify({"error": f"Two regions required for clip {i+1}"}), 400
    elif regions:
        # Legacy mode: use same regions for all clips
        if len(regions) < 2:
            return jsonify({"error": "Two regions required"}), 400
        # Convert to per-clip format for uniform processing
        all_clip_regions = [regions for _ in clips]
    else:
        return jsonify({"error": "No regions provided"}), 400

    if not layout:
        layout = {"topRegionId": "content", "splitRatio": 0.6}

    # Check if silence removal or captions are requested (both need OpenAI API)
    needs_openai = (
        (caption_options and caption_options.get('enabled', False)) or
        (silence_removal and silence_removal.get('enabled', False))
    )
    if needs_openai and not os.environ.get("OPENAI_API_KEY"):
        return jsonify({
            "error": "OPENAI_API_KEY not configured. Captions and silence removal require OpenAI Whisper API.",
            "missing_env": "OPENAI_API_KEY"
        }), 400

    # Process clips based on layout mode
    # Pass all_clip_regions for per-clip region support
    if layout_mode == "pip" and pip_settings:
        # Import PiP processing function
        from services.shorts import process_clips_to_pip, process_clips_to_pip_with_captions
        if caption_options and caption_options.get('enabled', False):
            result = process_clips_to_pip_with_captions(clips, None, pip_settings, caption_options, all_clip_regions=all_clip_regions, all_clip_titles=all_clip_titles, title_font_size=title_font_size, title_highlight_color=title_highlight_color)
        else:
            result = process_clips_to_pip(clips, None, pip_settings, all_clip_regions=all_clip_regions, all_clip_titles=all_clip_titles, title_font_size=title_font_size, title_highlight_color=title_highlight_color)
    else:
        # Stack mode (default)
        if caption_options and caption_options.get('enabled', False):
            result = process_clips_to_vertical_with_captions(clips, None, layout, caption_options, all_clip_regions=all_clip_regions, all_clip_titles=all_clip_titles, title_font_size=title_font_size, title_highlight_color=title_highlight_color)
        else:
            result = process_clips_to_vertical(clips, None, layout, all_clip_regions=all_clip_regions, all_clip_titles=all_clip_titles, title_font_size=title_font_size, title_highlight_color=title_highlight_color)

    # Apply silence removal if requested (after vertical processing)
    if silence_removal and silence_removal.get('enabled', False):
        processed_clips = result.get('processed_clips', [])
        min_gap = silence_removal.get('min_gap_duration', 0.4)
        padding = silence_removal.get('padding', 0.05)

        for clip_data in processed_clips:
            processed = clip_data.get('processed', {})
            if processed.get('success') and processed.get('video_data'):
                print(f"[process-vertical] Applying silence removal to clip...")
                silence_result = remove_silence_from_video(
                    processed['video_data'],
                    min_gap_duration=min_gap,
                    padding=padding
                )
                if silence_result.get('success'):
                    # Update the processed video with silence-removed version
                    processed['video_data'] = silence_result['video_data']
                    processed['file_size'] = silence_result.get('file_size', processed.get('file_size'))
                    processed['silence_removed'] = silence_result.get('silence_removed', False)
                    processed['gaps_removed'] = silence_result.get('gaps_removed', 0)
                    processed['time_removed_seconds'] = silence_result.get('time_removed_seconds', 0)
                else:
                    # Log error but don't fail the whole request
                    print(f"[process-vertical] Silence removal failed: {silence_result.get('error')}")
                    processed['silence_removal_error'] = silence_result.get('error')

    return jsonify(result)


# --- Video Idea Generator Routes ---
@app.route('/api/ideas/channel-context', methods=['POST'])
def fetch_channel_context():
    """
    Fetch channel info for idea generation context.

    Request body:
    {
        "channel_url": "https://youtube.com/@handle"
    }

    Returns channel name, description, and recent video titles.
    """
    if not os.environ.get("YOUTUBE_API_KEY"):
        return jsonify({
            "error": "YOUTUBE_API_KEY not configured",
            "missing_env": "YOUTUBE_API_KEY"
        }), 400

    data = request.json
    channel_url = data.get('channel_url')

    if not channel_url:
        return jsonify({"error": "No channel URL provided"}), 400

    result = get_channel_context(channel_url, num_recent_videos=2)

    if "error" in result:
        return jsonify(result), 400

    return jsonify(result)


@app.route('/api/ideas/generate', methods=['POST'])
def generate_ideas():
    """
    Generate video and shorts ideas from a YouTube video transcript.

    Request body:
    {
        "url": "https://youtube.com/watch?v=...",
        "num_video_ideas": 10,  // Optional, 1-10, default 10
        "num_shorts_ideas": 10,  // Optional, 1-10, default 10
        "custom_instructions": "...",  // Optional style guidance
        "channel_context": {  // Optional channel info
            "name": "Channel Name",
            "description": "Channel description",
            "recent_videos": [{"title": "..."}]
        }
    }

    Returns generated content ideas.
    """
    if not os.environ.get("GEMINI_API_KEY"):
        return jsonify({
            "error": "GEMINI_API_KEY not configured",
            "missing_env": "GEMINI_API_KEY"
        }), 400

    data = request.json
    video_url = data.get('url')
    num_video_ideas = data.get('num_video_ideas', 10)
    num_shorts_ideas = data.get('num_shorts_ideas', 10)
    custom_instructions = data.get('custom_instructions')
    channel_context = data.get('channel_context')

    # Validate counts
    try:
        num_video_ideas = max(1, min(10, int(num_video_ideas)))
        num_shorts_ideas = max(1, min(10, int(num_shorts_ideas)))
    except (ValueError, TypeError):
        num_video_ideas = 10
        num_shorts_ideas = 10

    if not video_url:
        return jsonify({"error": "No URL provided"}), 400

    result = process_video_for_ideas(
        video_url,
        num_video_ideas=num_video_ideas,
        num_shorts_ideas=num_shorts_ideas,
        custom_instructions=custom_instructions,
        channel_context=channel_context
    )

    if "error" in result and "missing_env" not in result:
        return jsonify(result), 400

    return jsonify(result)


@app.route('/api/ideas/regenerate', methods=['POST'])
def regenerate_ideas():
    """
    Regenerate ideas from an existing transcript.

    Request body:
    {
        "transcript": "...",  // Full transcript text
        "num_video_ideas": 10,
        "num_shorts_ideas": 10,
        "custom_instructions": "..."
    }
    """
    if not os.environ.get("GEMINI_API_KEY"):
        return jsonify({
            "error": "GEMINI_API_KEY not configured",
            "missing_env": "GEMINI_API_KEY"
        }), 400

    data = request.json
    transcript = data.get('transcript')
    num_video_ideas = data.get('num_video_ideas', 10)
    num_shorts_ideas = data.get('num_shorts_ideas', 10)
    custom_instructions = data.get('custom_instructions')

    if not transcript:
        return jsonify({"error": "No transcript provided"}), 400

    # Validate counts
    try:
        num_video_ideas = max(1, min(10, int(num_video_ideas)))
        num_shorts_ideas = max(1, min(10, int(num_shorts_ideas)))
    except (ValueError, TypeError):
        num_video_ideas = 10
        num_shorts_ideas = 10

    result = generate_video_ideas(
        transcript,
        num_video_ideas=num_video_ideas,
        num_shorts_ideas=num_shorts_ideas,
        custom_instructions=custom_instructions
    )

    if "error" in result:
        return jsonify(result), 400

    return jsonify(result)


@app.route('/api/ideas/chat', methods=['POST'])
def ideas_chat():
    """
    Chat with Gemini about video ideas using Gemini 2.5 Flash.

    Request body:
    {
        "message": "User's question",
        "context": "Transcript and ideas context",
        "history": [...]  // Optional previous messages
    }
    """
    if not os.environ.get("GEMINI_API_KEY"):
        return jsonify({
            "error": "GEMINI_API_KEY not configured",
            "missing_env": "GEMINI_API_KEY"
        }), 400

    data = request.json
    message = data.get('message')
    context = data.get('context')
    history = data.get('history', [])

    if not message:
        return jsonify({"error": "No message provided"}), 400

    if not context:
        return jsonify({"error": "No context provided"}), 400

    result = chat_with_ideas(message, context, history)

    if "error" in result:
        return jsonify(result), 400

    return jsonify(result)


@app.route('/api/shorts/process-single', methods=['POST'])
def process_single_vertical():
    """
    Process a single video into a vertical short.

    Request body:
    {
        "video_data": "base64...",  # Base64 encoded video
        "regions": [...],
        "layout": {...}
    }

    Returns processed vertical short as base64.
    """
    data = request.json

    video_data = data.get('video_data')
    regions = data.get('regions')
    layout = data.get('layout')

    if not video_data:
        return jsonify({"error": "No video_data provided"}), 400

    if not regions or len(regions) < 2:
        return jsonify({"error": "Two regions required"}), 400

    if not layout:
        layout = {"topRegionId": "content", "splitRatio": 0.6}

    result = process_clip_to_vertical(video_data, regions, layout)
    return jsonify(result)


# --- Channel Improver Routes ---
@app.route('/api/channel/analyze', methods=['POST'])
def analyze_channel():
    """
    Analyze a video transcript and provide improvement suggestions
    based on the creator's channel context and goals.

    Request body:
    {
        "url": "https://youtube.com/watch?v=...",
        "channel_context": {
            "goal": "marketing my products",  // Primary goal
            "channel_description": "I make coding tutorials",
            "target_audience": "beginner developers",
            "recent_titles": ["Title 1", "Title 2"],  // Optional
            "improvement_focus": ["content", "branding"]  // Optional
        }
    }

    Returns categorized improvement suggestions.
    """
    if not os.environ.get("GEMINI_API_KEY"):
        return jsonify({
            "error": "GEMINI_API_KEY not configured",
            "missing_env": "GEMINI_API_KEY"
        }), 400

    data = request.json
    video_url = data.get('url')
    channel_context = data.get('channel_context', {})

    if not video_url:
        return jsonify({"error": "No URL provided"}), 400

    if not channel_context.get('goal'):
        return jsonify({"error": "Channel goal is required"}), 400

    result = analyze_video_for_improvements(video_url, channel_context)

    if "error" in result and "missing_env" not in result:
        return jsonify(result), 400

    return jsonify(result)


# --- Audio Mixer Routes ---
@app.route('/api/audio/status', methods=['GET'])
def audio_status():
    """Check if audio separation (Demucs) is available."""
    return jsonify(check_demucs_status())


@app.route('/api/audio/separate', methods=['POST'])
def separate_audio():
    """
    Separate a video's audio into vocals and music stems.

    Request body:
    {
        "video_data": "base64..."  // Base64 encoded video
    }

    Returns vocals and music as separate base64 audio files.
    """
    data = request.json
    video_data = data.get('video_data')

    if not video_data:
        return jsonify({"error": "No video_data provided"}), 400

    result = separate_video_audio(video_data)

    if "error" in result:
        return jsonify(result), 400

    return jsonify(result)


@app.route('/api/audio/process', methods=['POST'])
def process_audio():
    """
    Process a video's audio with mixing options.

    Request body:
    {
        "video_data": "base64...",  // Base64 encoded video
        "audio_options": {
            "separate": true,  // Use AI to separate vocals/music
            "use_vocals": true,  // Include vocals in output
            "use_music": false,  // Include original music
            "vocals_volume": 1.0,  // Vocals volume (0.0-2.0)
            "music_volume": 0.5,  // Music volume (0.0-2.0)
            "custom_audio": "base64...",  // Optional: custom audio to mix in
            "custom_audio_volume": 0.3  // Custom audio volume
        }
    }

    Returns processed video with modified audio.
    """
    data = request.json
    video_data = data.get('video_data')
    audio_options = data.get('audio_options', {})

    if not video_data:
        return jsonify({"error": "No video_data provided"}), 400

    result = process_video_audio(video_data, audio_options)

    if "error" in result:
        return jsonify(result), 400

    return jsonify(result)


# --- Debug Routes ---
@app.route('/api/debug/sample-short', methods=['GET'])
def get_sample_short():
    """
    Get a sample short video for testing the audio mixer.
    Place a sample video at: samples/sample_short.mp4
    """
    import base64

    sample_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'samples', 'sample_short.mp4')

    if not os.path.exists(sample_path):
        return jsonify({
            "error": f"Sample video not found at: {sample_path}",
            "hint": "Create a 'samples' folder and add a 'sample_short.mp4' file for testing"
        }), 404

    try:
        with open(sample_path, 'rb') as f:
            video_data = base64.b64encode(f.read()).decode('utf-8')

        file_size = os.path.getsize(sample_path)

        return jsonify({
            "success": True,
            "video_data": video_data,
            "file_size": file_size
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/debug/sample-clip', methods=['GET'])
def get_sample_clip():
    """
    Get a sample clip video for testing the region selector.
    Place a sample video at: samples/sample_clip.mp4
    """
    import base64

    sample_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'samples', 'sample_clip.mp4')

    if not os.path.exists(sample_path):
        return jsonify({
            "error": f"Sample video not found at: {sample_path}",
            "hint": "Create a 'samples' folder and add a 'sample_clip.mp4' file for testing"
        }), 404

    try:
        with open(sample_path, 'rb') as f:
            video_data = base64.b64encode(f.read()).decode('utf-8')

        file_size = os.path.getsize(sample_path)

        return jsonify({
            "success": True,
            "video_data": video_data,
            "file_size": file_size
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- Best-Of Compilation Routes ---
@app.route('/api/bestof/upload', methods=['POST'])
def bestof_upload_video():
    """
    Upload a video file for best-of compilation.
    Reuses the same upload logic as shorts.
    """
    if 'video' not in request.files:
        return jsonify({"error": "No video file provided"}), 400

    video_file = request.files['video']

    if video_file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    # Generate unique filename
    original_filename = secure_filename(video_file.filename)
    unique_filename = f"{uuid.uuid4()}_{original_filename}"
    video_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)

    # Save the file
    video_file.save(video_path)

    return jsonify({
        "success": True,
        "video_path": video_path,
        "original_filename": original_filename
    })


@app.route('/api/bestof/detect-moments', methods=['POST'])
def bestof_detect_moments():
    """
    Detect highlight moments from a YouTube video transcript or custom transcript.

    Request body (YouTube mode):
    {
        "url": "YouTube video URL",
        "num_clips": 5,  // Optional, default 5
        "target_duration_minutes": 10,  // Optional, default 10
        "avg_clip_length_seconds": 60,  // Optional, default 60
        "custom_prompt": "..."  // Optional custom instructions
    }

    Request body (Custom transcript mode):
    {
        "custom_transcript": "...",  // Plain text transcript
        "num_clips": 5,
        "target_duration_minutes": 10,
        "avg_clip_length_seconds": 60,
        "custom_prompt": "..."
    }

    Returns list of detected highlight moments.
    """
    if not os.environ.get("GEMINI_API_KEY"):
        return jsonify({
            "error": "GEMINI_API_KEY not configured",
            "missing_env": "GEMINI_API_KEY"
        }), 400

    data = request.json
    video_url = data.get('url')
    custom_transcript = data.get('custom_transcript')
    num_clips = data.get('num_clips', 5)
    target_duration = data.get('target_duration_minutes', 10)
    avg_clip_length = data.get('avg_clip_length_seconds', 60)
    custom_prompt = data.get('custom_prompt')

    # Custom transcript mode
    if custom_transcript:
        # Detect moments directly from custom transcript
        moments_result = detect_highlight_moments(
            custom_transcript,
            num_clips=num_clips,
            target_duration_minutes=target_duration,
            avg_clip_length_seconds=avg_clip_length,
            custom_prompt=custom_prompt
        )

        if "error" in moments_result:
            return jsonify(moments_result), 400

        return jsonify({
            "transcript": {
                "full_text": custom_transcript,
                "video_id": None,
                "source": "custom"
            },
            "moments": moments_result['moments']
        })

    # YouTube mode
    if not video_url:
        return jsonify({"error": "No URL or custom transcript provided"}), 400

    # Get transcript
    transcript_result = get_transcript_for_highlights(video_url)
    if "error" in transcript_result:
        return jsonify(transcript_result), 400

    # Detect moments
    moments_result = detect_highlight_moments(
        transcript_result['full_text'],
        num_clips=num_clips,
        target_duration_minutes=target_duration,
        avg_clip_length_seconds=avg_clip_length,
        custom_prompt=custom_prompt
    )

    if "error" in moments_result:
        return jsonify(moments_result), 400

    transcript_result['source'] = 'youtube'
    return jsonify({
        "transcript": transcript_result,
        "moments": moments_result['moments']
    })


@app.route('/api/bestof/compile', methods=['POST'])
def bestof_compile():
    """
    Create a best-of compilation video from selected moments.

    Request body:
    {
        "video_path": "path to uploaded video",
        "moments": [...],  // Array of moment objects with start_time, end_time, order
        "use_crossfade": false,  // Optional, default false
        "crossfade_duration": 0.5  // Optional, default 0.5 seconds
    }

    Returns the compiled video as base64.
    """
    data = request.json
    video_path = data.get('video_path')
    moments = data.get('moments', [])
    use_crossfade = data.get('use_crossfade', False)
    crossfade_duration = data.get('crossfade_duration', 0.5)

    if not video_path:
        return jsonify({"error": "No video_path provided"}), 400

    if not os.path.exists(video_path):
        return jsonify({"error": "Video file not found"}), 400

    if not moments:
        return jsonify({"error": "No moments provided"}), 400

    try:
        result = create_bestof_compilation(
            video_path,
            moments,
            use_crossfade=use_crossfade,
            crossfade_duration=crossfade_duration
        )

        if "error" in result:
            return jsonify(result), 400

        return jsonify(result)
    finally:
        # Clean up the uploaded video file after processing
        try:
            if os.path.exists(video_path):
                os.remove(video_path)
        except Exception as e:
            print(f"Warning: Failed to clean up uploaded file {video_path}: {e}")


@app.route('/api/bestof/process', methods=['POST'])
def bestof_process_full():
    """
    Full best-of processing: detect moments and create compilation.

    Request body:
    {
        "url": "YouTube video URL",
        "video_path": "path to uploaded video",
        "num_clips": 5,
        "target_duration_minutes": 10,
        "use_crossfade": false,
        "crossfade_duration": 0.5,
        "custom_prompt": "..."
    }

    Returns the compiled video as base64 with metadata.
    """
    if not os.environ.get("GEMINI_API_KEY"):
        return jsonify({
            "error": "GEMINI_API_KEY not configured",
            "missing_env": "GEMINI_API_KEY"
        }), 400

    data = request.json
    video_url = data.get('url')
    video_path = data.get('video_path')
    num_clips = data.get('num_clips', 5)
    target_duration = data.get('target_duration_minutes', 10)
    use_crossfade = data.get('use_crossfade', False)
    crossfade_duration = data.get('crossfade_duration', 0.5)
    custom_prompt = data.get('custom_prompt')

    if not video_url:
        return jsonify({"error": "No URL provided"}), 400

    if not video_path or not os.path.exists(video_path):
        return jsonify({"error": "Video file not found"}), 400

    try:
        result = process_video_for_bestof(
            video_url,
            video_path=video_path,
            num_clips=num_clips,
            target_duration_minutes=target_duration,
            use_crossfade=use_crossfade,
            crossfade_duration=crossfade_duration,
            custom_prompt=custom_prompt
        )

        if "error" in result:
            return jsonify(result), 400

        return jsonify(result)
    finally:
        # Clean up the uploaded video file after processing
        try:
            if os.path.exists(video_path):
                os.remove(video_path)
        except Exception as e:
            print(f"Warning: Failed to clean up uploaded file {video_path}: {e}")


# --- Captions Route (shared by shorts and best-of) ---
@app.route('/api/captions/add', methods=['POST'])
def add_captions_to_video():
    """
    Add animated captions to a video.

    Request body:
    {
        "video_data": "base64 encoded video",
        "caption_options": {
            "enabled": true,
            "words_per_group": 3,
            "silence_threshold": 0.5,
            "font_size": 56,
            "font_name": "Arial Bold",
            "primary_color": "white",
            "highlight_color": "yellow",
            "highlight_scale": 1.3,
            "position_y": 85
        }
    }

    Returns the video with captions as base64.
    """
    if not os.environ.get("OPENAI_API_KEY"):
        return jsonify({
            "error": "OPENAI_API_KEY not configured. Captions require OpenAI Whisper API.",
            "missing_env": "OPENAI_API_KEY"
        }), 400

    data = request.json
    video_data = data.get('video_data')
    caption_options = data.get('caption_options', {})

    if not video_data:
        return jsonify({"error": "No video_data provided"}), 400

    # Import caption functions
    from services.captions import transcribe_video_for_captions, create_caption_overlay_video

    # Step 1: Transcribe the video
    words_per_group = caption_options.get('words_per_group', 3)
    silence_threshold = caption_options.get('silence_threshold', 0.5)

    transcription_result = transcribe_video_for_captions(
        video_data,
        words_per_group=words_per_group,
        silence_threshold=silence_threshold
    )

    if "error" in transcription_result:
        return jsonify(transcription_result), 400

    captions = transcription_result.get('captions', [])

    if not captions:
        # No speech detected, return original video
        return jsonify({
            "success": True,
            "video_data": video_data,
            "captions_applied": False,
            "message": "No speech detected in video"
        })

    # Step 2: Add caption overlay
    result = create_caption_overlay_video(video_data, captions, caption_options)

    if "error" in result:
        return jsonify(result), 400

    return jsonify({
        **result,
        "captions_applied": True,
        "num_caption_groups": len(captions)
    })


# --- Clip Joiner Routes ---
@app.route('/api/join/upload', methods=['POST'])
def join_upload_video():
    """
    Upload a video file for joining.
    Returns the server path to use for concatenation.
    """
    if 'video' not in request.files:
        return jsonify({"error": "No video file provided"}), 400

    file = request.files['video']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    filename = secure_filename(file.filename)
    unique_id = str(uuid.uuid4())[:8]
    name, ext = os.path.splitext(filename)
    unique_filename = f"{name}_{unique_id}{ext}"

    filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
    file.save(filepath)

    return jsonify({
        "success": True,
        "video_path": filepath,
        "filename": unique_filename
    })


@app.route('/api/join/concatenate', methods=['POST'])
def join_concatenate():
    """
    Concatenate two videos together.

    Request body:
    {
        "video_path_1": "/path/to/first/video.mp4",
        "video_path_2": "/path/to/second/video.mp4"
    }

    Returns the joined video as base64.
    """
    data = request.json
    video_path_1 = data.get('video_path_1')
    video_path_2 = data.get('video_path_2')

    if not video_path_1 or not video_path_2:
        return jsonify({"error": "Both video_path_1 and video_path_2 are required"}), 400

    if not os.path.exists(video_path_1):
        return jsonify({"error": f"First video not found: {video_path_1}"}), 400

    if not os.path.exists(video_path_2):
        return jsonify({"error": f"Second video not found: {video_path_2}"}), 400

    try:
        result = concatenate_videos(video_path_1, video_path_2)

        if "error" in result:
            return jsonify(result), 400

        return jsonify({
            "success": True,
            "video_data": result['video_data'],
            "format": result['format']
        })
    finally:
        # Clean up uploaded files
        for path in [video_path_1, video_path_2]:
            try:
                if os.path.exists(path):
                    os.remove(path)
            except Exception as e:
                print(f"Warning: Failed to clean up {path}: {e}")


if __name__ == '__main__':
    port = int(os.environ.get('FLASK_PORT', 5005))
    app.run(host='0.0.0.0', port=port, debug=True)
