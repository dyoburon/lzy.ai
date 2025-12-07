# Channel Improver Service
#
# This service analyzes video transcripts and provides personalized
# improvement suggestions based on the creator's channel context and goals.
#
# It generates recommendations across multiple categories:
# - Content/Transcript improvements
# - Channel strategy improvements
# - Branding improvements
# - Audience engagement improvements

import os
import json
import google.generativeai as genai
from services.transcript import extract_video_id, format_timestamp

# Configure Gemini
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)


def get_transcript_for_analysis(video_url):
    """
    Fetches transcript from YouTube video for improvement analysis.
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


def generate_improvement_suggestions(transcript_text, channel_context):
    """
    Uses Gemini to analyze transcript and generate improvement suggestions
    based on the creator's channel context and goals.

    Args:
        transcript_text: The full transcript with timestamps
        channel_context: Dict containing:
            - goal: The creator's primary goal (e.g., "marketing products", "building community")
            - channel_description: What the channel is about
            - target_audience: Who the content is for
            - recent_titles: List of recent video titles
            - improvement_focus: Optional list of areas to focus on

    Returns:
        Dict with categorized improvement suggestions
    """
    if not GEMINI_API_KEY:
        return {"error": "GEMINI_API_KEY not configured"}

    goal = channel_context.get('goal', 'growing my audience')
    channel_description = channel_context.get('channel_description', 'Not specified')
    target_audience = channel_context.get('target_audience', 'Not specified')
    recent_titles = channel_context.get('recent_titles', [])
    improvement_focus = channel_context.get('improvement_focus', [])

    titles_text = "\n".join([f"- {title}" for title in recent_titles]) if recent_titles else "No titles provided"
    focus_text = ", ".join(improvement_focus) if improvement_focus else "all areas"

    try:
        model = genai.GenerativeModel('gemini-2.0-flash')

        prompt = f"""You are an expert YouTube consultant and content strategist. Analyze this video transcript and provide specific, actionable improvement suggestions tailored to the creator's goals and channel context.

CREATOR'S CHANNEL CONTEXT:
- Primary Goal: {goal}
- Channel Description: {channel_description}
- Target Audience: {target_audience}
- Recent Video Titles:
{titles_text}

FOCUS AREAS: {focus_text}

VIDEO TRANSCRIPT TO ANALYZE:
{transcript_text}

TASK: Based on the transcript and channel context, provide detailed improvement suggestions. Be specific and reference actual moments from the transcript where relevant.

Consider the creator's PRIMARY GOAL of "{goal}" when making all recommendations. Every suggestion should help them achieve this goal.

OUTPUT FORMAT (JSON):
{{
  "overall_assessment": {{
    "strengths": ["strength 1", "strength 2", "strength 3"],
    "main_opportunities": ["opportunity 1", "opportunity 2"],
    "goal_alignment_score": 7,
    "goal_alignment_feedback": "Brief assessment of how well the content aligns with their stated goal"
  }},
  "content_improvements": {{
    "summary": "Brief overview of content improvement opportunities",
    "suggestions": [
      {{
        "title": "Short title for the suggestion",
        "description": "Detailed explanation of what to improve",
        "transcript_reference": "Specific moment or quote from transcript (if applicable)",
        "implementation": "How to implement this improvement",
        "impact": "high|medium|low",
        "goal_relevance": "How this helps achieve their goal"
      }}
    ]
  }},
  "delivery_improvements": {{
    "summary": "Brief overview of delivery/presentation improvements",
    "suggestions": [
      {{
        "title": "Short title",
        "description": "Detailed explanation",
        "transcript_reference": "Specific moment (if applicable)",
        "implementation": "How to implement",
        "impact": "high|medium|low"
      }}
    ]
  }},
  "channel_strategy": {{
    "summary": "Brief overview of channel strategy recommendations",
    "suggestions": [
      {{
        "title": "Short title",
        "description": "Detailed explanation",
        "implementation": "How to implement",
        "impact": "high|medium|low",
        "goal_relevance": "How this helps achieve their goal"
      }}
    ]
  }},
  "branding_improvements": {{
    "summary": "Brief overview of branding opportunities",
    "suggestions": [
      {{
        "title": "Short title",
        "description": "Detailed explanation",
        "implementation": "How to implement",
        "impact": "high|medium|low"
      }}
    ]
  }},
  "audience_engagement": {{
    "summary": "Brief overview of engagement opportunities",
    "suggestions": [
      {{
        "title": "Short title",
        "description": "Detailed explanation",
        "transcript_reference": "Specific moment (if applicable)",
        "implementation": "How to implement",
        "impact": "high|medium|low"
      }}
    ]
  }},
  "title_suggestions": {{
    "current_analysis": "Brief analysis of their current title style based on recent titles",
    "improved_titles_for_this_video": ["title 1", "title 2", "title 3"],
    "title_formula_recommendation": "A formula/pattern they could use for future titles"
  }},
  "quick_wins": [
    {{
      "action": "Simple, immediately actionable improvement",
      "expected_result": "What they can expect from implementing this"
    }}
  ]
}}

IMPORTANT:
- Be specific and reference the actual transcript content
- Tailor ALL suggestions to their stated goal of "{goal}"
- Provide 2-4 suggestions per category (fewer is fine if not applicable)
- Focus on actionable, practical advice
- Be encouraging but honest about areas for improvement
- If certain categories don't apply based on the transcript, provide fewer suggestions for those

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
        suggestions = json.loads(response_text)

        return suggestions

    except json.JSONDecodeError as e:
        return {"error": f"Failed to parse AI response as JSON: {str(e)}", "raw_response": response_text}
    except Exception as e:
        return {"error": f"Error generating suggestions: {str(e)}"}


def analyze_video_for_improvements(video_url, channel_context):
    """
    Main function to analyze a video and generate improvement suggestions.

    Args:
        video_url: YouTube URL
        channel_context: Dict with channel information and goals

    Returns:
        Dict with analysis results and suggestions
    """
    # Step 1: Get transcript
    transcript_result = get_transcript_for_analysis(video_url)
    if "error" in transcript_result:
        return transcript_result

    # Step 2: Generate improvement suggestions
    suggestions = generate_improvement_suggestions(
        transcript_result['transcript'],
        channel_context
    )

    if "error" in suggestions:
        return {
            "video_id": transcript_result['video_id'],
            "error": suggestions['error']
        }

    return {
        "video_id": transcript_result['video_id'],
        "transcript_preview": transcript_result['transcript'][:500] + "...",
        "channel_context": channel_context,
        **suggestions
    }
