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

def process_transcript(video_url, custom_instructions=None):
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
        chapters = generate_chapters(full_text_for_ai, custom_instructions)

        return {
            "transcript": formatted_transcript,
            "chapters": chapters,
            "video_id": video_id
        }

    except Exception as e:
        return {"error": str(e)}

def generate_chapters(transcript_text, custom_instructions=None):
    """Uses Gemini to generate video chapters from transcript."""
    if not GEMINI_API_KEY:
        return "Error: GEMINI_API_KEY not configured."

    try:
        model = genai.GenerativeModel('gemini-2.5-pro')

        # Default instructions if none provided
        default_instructions = """Your goal is to make viewers want to click through and watch each section.
Write titles that tease the interesting stuff - the drama, the funny moments, the insights, the turning points.
Be specific enough that people know what they're getting, but intriguing enough that they want to see it.
Avoid generic filler like "Introduction" or "Conclusion" - find the hook in every section.
Don't be cliche or clickbaity, but do sell it."""

        instructions = custom_instructions.strip() if custom_instructions else default_instructions

        prompt = f"""Generate YouTube chapters for this transcript.

Format each chapter exactly like:
MM:SS - Chapter Title

Rules:
- Maximum 15 chapters (combine smaller sections if needed)
- Use timestamps from the transcript
- Output only the chapter list, no other text

Style guidance:
{instructions}

Transcript:
{transcript_text}"""

        response = model.generate_content(prompt)
        return response.text

    except Exception as e:
        return f"Error generating chapters: {str(e)}"


def chat_with_transcript(message, context, history=None):
    """
    Chat with Gemini about transcript content using Gemini 2.5 Flash.

    Args:
        message: The user's question/message
        context: The transcript content to discuss
        history: Optional list of previous messages [{"role": "user"|"assistant", "content": "..."}]

    Returns:
        dict with 'response' or 'error'
    """
    if not GEMINI_API_KEY:
        return {"error": "GEMINI_API_KEY not configured."}

    try:
        # Use Gemini 2.5 Flash for cost-effective chat
        model = genai.GenerativeModel('gemini-2.5-flash')

        # Build conversation history for context
        conversation_context = ""
        if history:
            for msg in history[-10:]:  # Last 10 messages
                role = "User" if msg.get("role") == "user" else "Assistant"
                conversation_context += f"{role}: {msg.get('content', '')}\n"

        prompt = f"""You are a helpful assistant analyzing video transcripts. Answer questions about the transcript content accurately and concisely.

=== TRANSCRIPT CONTENT ===
{context}
=== END TRANSCRIPT ===

{f"Previous conversation:{chr(10)}{conversation_context}" if conversation_context else ""}

User's question: {message}

Provide a helpful, accurate response based on the transcript content. If the answer isn't in the transcript, say so. Be concise but thorough."""

        response = model.generate_content(prompt)
        return {"response": response.text}

    except Exception as e:
        return {"error": f"Chat error: {str(e)}"}
