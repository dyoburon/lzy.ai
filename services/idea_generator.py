# Video Idea Generator Service
#
# Analyzes video/livestream transcripts to generate:
# - Future video ideas based on topics discussed
# - Shorts ideas from interesting moments
# - Content suggestions based on audience engagement patterns

import os
import json
import google.generativeai as genai
from services.transcript import extract_video_id, format_timestamp

# Configure Gemini
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)


def get_transcript_for_ideas(video_url):
    """
    Fetches transcript from YouTube video for idea generation.
    Reuses logic from transcript.py.
    """
    from youtube_transcript_api import YouTubeTranscriptApi

    video_id = extract_video_id(video_url)
    if not video_id:
        return {"error": "Invalid YouTube URL"}

    try:
        loader = YouTubeTranscriptApi()
        transcript_list = loader.fetch(video_id)

        # Format transcript with timestamps
        full_text = ""
        for entry in transcript_list:
            timestamp = format_timestamp(entry.start)
            full_text += f"[{timestamp}] {entry.text}\n"

        return {
            "transcript": full_text,
            "video_id": video_id
        }

    except Exception as e:
        return {"error": str(e)}


def generate_video_ideas(transcript_text, num_video_ideas=5, num_shorts_ideas=5):
    """
    Uses Gemini to generate video and shorts ideas from a transcript.

    Args:
        transcript_text: The full transcript with timestamps
        num_video_ideas: Number of full video ideas to generate
        num_shorts_ideas: Number of shorts ideas to generate

    Returns:
        Dict with video_ideas and shorts_ideas arrays
    """
    if not GEMINI_API_KEY:
        return {"error": "GEMINI_API_KEY not configured"}

    try:
        model = genai.GenerativeModel('gemini-2.0-flash')

        prompt = f"""You are an expert content strategist for YouTube creators. Analyze this video/livestream transcript and generate content ideas.

TRANSCRIPT:
{transcript_text}

TASK: Based on the topics, discussions, questions, and themes in this video, generate:
1. {num_video_ideas} ideas for FUTURE FULL-LENGTH VIDEOS (10-30 minutes)
2. {num_shorts_ideas} ideas for SHORTS (15-60 seconds)

For VIDEO IDEAS, look for:
- Topics that were briefly mentioned but could be expanded into full videos
- Questions from chat/audience that deserve deep-dive answers
- Interesting tangents that could become standalone content
- Tutorial opportunities based on things explained
- Controversial takes or opinions that could spark discussion
- Behind-the-scenes or process videos hinted at

For SHORTS IDEAS, look for:
- Quotable moments or hot takes
- Quick tips or tricks mentioned
- Funny or surprising moments
- Before/after transformations
- Quick tutorials or how-tos
- Reaction-worthy content
- Cliffhangers or teasers for longer content

OUTPUT FORMAT (JSON):
{{
  "video_ideas": [
    {{
      "title": "Catchy video title",
      "description": "2-3 sentence description of the video concept",
      "hook": "Opening hook to grab viewers",
      "key_points": ["point 1", "point 2", "point 3"],
      "source_context": "What from the transcript inspired this idea",
      "estimated_length": "15-20 minutes",
      "content_type": "tutorial|discussion|review|vlog|etc"
    }}
  ],
  "shorts_ideas": [
    {{
      "title": "Catchy shorts title",
      "concept": "Brief description of the short",
      "hook": "First 3 seconds hook",
      "source_timestamp": "MM:SS if applicable",
      "format": "quick-tip|reaction|story|tutorial|hot-take|etc"
    }}
  ],
  "recurring_themes": ["theme1", "theme2"],
  "audience_questions": ["question1", "question2"]
}}

Return ONLY the JSON, no other text.
"""

        response = model.generate_content(prompt)
        response_text = response.text.strip()

        # Clean up response - remove markdown code blocks if present
        if response_text.startswith("```"):
            response_text = response_text.split("\n", 1)[1] if "\n" in response_text else response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        response_text = response_text.strip()

        # Parse JSON response
        ideas = json.loads(response_text)

        return ideas

    except json.JSONDecodeError as e:
        return {"error": f"Failed to parse AI response as JSON: {str(e)}", "raw_response": response_text}
    except Exception as e:
        return {"error": f"Error generating ideas: {str(e)}"}


def process_video_for_ideas(video_url, num_video_ideas=5, num_shorts_ideas=5):
    """
    Main function to process a video and generate content ideas.

    Args:
        video_url: YouTube URL
        num_video_ideas: Number of video ideas to generate
        num_shorts_ideas: Number of shorts ideas to generate

    Returns:
        Dict with generated ideas
    """
    # Step 1: Get transcript
    transcript_result = get_transcript_for_ideas(video_url)
    if "error" in transcript_result:
        return transcript_result

    # Step 2: Generate ideas using Gemini
    ideas_result = generate_video_ideas(
        transcript_result['transcript'],
        num_video_ideas=num_video_ideas,
        num_shorts_ideas=num_shorts_ideas
    )

    if "error" in ideas_result:
        return {
            "video_id": transcript_result['video_id'],
            "error": ideas_result['error']
        }

    return {
        "video_id": transcript_result['video_id'],
        "transcript_preview": transcript_result['transcript'][:500] + "...",
        **ideas_result
    }
