import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Import services
from services.transcript import process_transcript, generate_chapters
from services.youtube_live import check_live_status

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"})

# --- Transcript Tool Routes ---
@app.route('/api/transcript', methods=['POST'])
def get_transcript():
    """Fetch transcript and generate chapters for a YouTube video."""
    data = request.json
    video_url = data.get('url')

    if not video_url:
        return jsonify({"error": "No URL provided"}), 400

    result = process_transcript(video_url)
    if "error" in result:
        return jsonify(result), 400

    return jsonify(result)

# --- YouTube Live Check Routes ---
@app.route('/api/youtube/live-status', methods=['POST'])
def youtube_live_status():
    """Check if a YouTube channel is currently live."""
    data = request.json
    channel_id = data.get('channel_id')

    if not channel_id:
        return jsonify({"error": "No channel_id provided"}), 400

    result = check_live_status(channel_id)
    return jsonify(result)

# --- Shorts Clipper Routes (TBD) ---
@app.route('/api/shorts/clip', methods=['POST'])
def clip_shorts():
    """TBD: Clip shorts from a long video."""
    return jsonify({"message": "TBD - Shorts clipper coming soon"})

if __name__ == '__main__':
    port = int(os.environ.get('FLASK_PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
