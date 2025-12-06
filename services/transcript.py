import os
import re
from youtube_transcript_api import YouTubeTranscriptApi
import google.generativeai as genai

# Configure Gemini
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

def extract_video_id(url):
    """Extracts the video ID from a YouTube URL."""
    # Examples:
    # https://www.youtube.com/watch?v=VIDEO_ID
    # https://youtu.be/VIDEO_ID
    # https://www.youtube.com/embed/VIDEO_ID

    regex = r"(?:v=|\/|youtu\.be\/)([0-9A-Za-z_-]{11}).*"
    match = re.search(regex, url)
    if match:
        return match.group(1)
    return None

def format_timestamp(seconds):
    """Formats seconds into MM:SS or HH:MM:SS."""
    seconds = int(seconds)
    m, s = divmod(seconds, 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"

def process_transcript(video_url):
    """Fetches transcript and generates chapters for a YouTube video."""
    video_id = extract_video_id(video_url)
    if not video_id:
        return {"error": "Invalid YouTube URL"}

    try:
        # Fetch transcript using the new API syntax
        loader = YouTubeTranscriptApi()
        transcript_list = loader.fetch(video_id)

        # Format transcript for display and for Gemini
        formatted_transcript = []
        full_text_for_ai = ""

        for entry in transcript_list:
            # New API returns objects, not dicts
            start = entry.start
            text = entry.text
            timestamp = format_timestamp(start)
            formatted_transcript.append({
                'timestamp': timestamp,
                'text': text,
                'start': start
            })
            full_text_for_ai += f"[{timestamp}] {text}\n"

        # Generate chapters using Gemini
        chapters = generate_chapters(full_text_for_ai)

        return {
            "transcript": formatted_transcript,
            "chapters": chapters,
            "video_id": video_id
        }

    except Exception as e:
        return {"error": str(e)}

def generate_chapters(transcript_text):
    """Uses Gemini to generate video chapters from transcript."""
    if not GEMINI_API_KEY:
        return "Error: GEMINI_API_KEY not configured."

    try:
        model = genai.GenerativeModel('gemini-2.5-pro')

        prompt = f"""
        You are an expert video marketer and content strategist. Your goal is to generate a list of engaging video chapters for a YouTube video based on its transcript.

        Here is the transcript of the video:
        {transcript_text}

        Please generate a list of chapters for this video.
        The format MUST be exactly like this:
        MM:SS - Chapter Title

        Rules:
        1. **Limit**: Generate a MAXIMUM of 15 chapters. Consolidate less important sections if necessary.
        2. **Tone**: Write "marketer-style" headlines. They should be interesting, catchy, and encourage clicks, but NOT clickbait. Avoid generic titles like "Introduction" or "Conclusion". Find the most interesting insight or topic in that section and make that the headline.
        3. **Content**: Identify the most valuable or intriguing points in each section to form the chapter.
        4. **Format**: Do not include any introductory or concluding text, just the list of chapters.
        """

        response = model.generate_content(prompt)
        return response.text

    except Exception as e:
        return f"Error generating chapters: {str(e)}"
