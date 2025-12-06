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
from services.transcript import process_transcript, generate_chapters
from services.youtube_live import check_live_status, get_channel_info
from services.discord_notify import send_discord_notification
from services.shorts import process_video_for_shorts, detect_interesting_moments, clip_all_moments, process_clip_to_vertical, process_clips_to_vertical
from services.idea_generator import process_video_for_ideas

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
    """Fetch transcript and generate chapters for a YouTube video."""
    if not os.environ.get("GEMINI_API_KEY"):
        return jsonify({
            "error": "GEMINI_API_KEY not configured",
            "missing_env": "GEMINI_API_KEY"
        }), 400

    data = request.json
    video_url = data.get('url')

    if not video_url:
        return jsonify({"error": "No URL provided"}), 400

    result = process_transcript(video_url)
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


@app.route('/api/shorts/detect-moments', methods=['POST'])
def detect_moments():
    """
    Detect interesting moments from a YouTube video transcript.

    Request body:
    {
        "url": "https://youtube.com/watch?v=...",
        "num_clips": 3  // Optional, 1-10, default 3
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
    num_clips = data.get('num_clips', 3)

    # Validate num_clips
    try:
        num_clips = int(num_clips)
        num_clips = max(1, min(10, num_clips))
    except (ValueError, TypeError):
        num_clips = 3

    if not video_url:
        return jsonify({"error": "No URL provided"}), 400

    result = process_video_for_shorts(video_url, num_clips=num_clips)
    if "error" in result:
        return jsonify(result), 400

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

    result = clip_all_moments(video_path, moments)
    return jsonify(result)


@app.route('/api/shorts/process-vertical', methods=['POST'])
def process_vertical_shorts():
    """
    Process clipped videos into vertical shorts with stacked regions.

    Request body:
    {
        "clips": [...],  # Array of clips from /api/shorts/clip endpoint
        "regions": [
            {"id": "content", "x": 5, "y": 5, "width": 60, "height": 90},
            {"id": "webcam", "x": 70, "y": 60, "width": 25, "height": 35}
        ],
        "layout": {
            "topRegionId": "content",
            "splitRatio": 0.6
        }
    }

    Returns processed vertical shorts as base64 video data.
    """
    data = request.json

    clips = data.get('clips')
    regions = data.get('regions')
    layout = data.get('layout')

    if not clips:
        return jsonify({"error": "No clips provided"}), 400

    if not regions or len(regions) < 2:
        return jsonify({"error": "Two regions required"}), 400

    if not layout:
        layout = {"topRegionId": "content", "splitRatio": 0.6}

    result = process_clips_to_vertical(clips, regions, layout)
    return jsonify(result)


# --- Video Idea Generator Routes ---
@app.route('/api/ideas/generate', methods=['POST'])
def generate_ideas():
    """
    Generate video and shorts ideas from a YouTube video transcript.

    Request body:
    {
        "url": "https://youtube.com/watch?v=...",
        "num_video_ideas": 5,  // Optional, 1-10, default 5
        "num_shorts_ideas": 5  // Optional, 1-10, default 5
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
    num_video_ideas = data.get('num_video_ideas', 5)
    num_shorts_ideas = data.get('num_shorts_ideas', 5)

    # Validate counts
    try:
        num_video_ideas = max(1, min(10, int(num_video_ideas)))
        num_shorts_ideas = max(1, min(10, int(num_shorts_ideas)))
    except (ValueError, TypeError):
        num_video_ideas = 5
        num_shorts_ideas = 5

    if not video_url:
        return jsonify({"error": "No URL provided"}), 400

    result = process_video_for_ideas(
        video_url,
        num_video_ideas=num_video_ideas,
        num_shorts_ideas=num_shorts_ideas
    )

    if "error" in result and "missing_env" not in result:
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


if __name__ == '__main__':
    port = int(os.environ.get('FLASK_PORT', 5005))
    app.run(host='0.0.0.0', port=port, debug=True)
