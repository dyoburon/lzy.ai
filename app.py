import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Import services
from services.transcript import process_transcript, generate_chapters
from services.youtube_live import check_live_status, get_channel_info
from services.discord_notify import send_discord_notification

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

# --- Shorts Clipper Routes (TBD) ---
@app.route('/api/shorts/clip', methods=['POST'])
def clip_shorts():
    """TBD: Clip shorts from a long video."""
    return jsonify({"message": "TBD - Shorts clipper coming soon"})

if __name__ == '__main__':
    port = int(os.environ.get('FLASK_PORT', 5005))
    app.run(host='0.0.0.0', port=port, debug=True)
