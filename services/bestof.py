# Best-Of Video Compilation Service
#
# This service handles:
# - Analyzing YouTube video/livestream transcripts for highlight moments
# - Using Gemini AI to identify the best segments for a compilation
# - Clipping and concatenating segments into a single "best of" video
# - Optional crossfade transitions between clips

import os
import subprocess
import json
import tempfile
import base64
import google.generativeai as genai
from services.transcript import extract_video_id, format_timestamp

# Configure Gemini
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)


def get_transcript_for_highlights(video_url):
    """
    Fetches transcript from YouTube video for highlight detection.
    """
    from youtube_transcript_api import YouTubeTranscriptApi

    video_id = extract_video_id(video_url)
    if not video_id:
        return {"error": "Invalid YouTube URL"}

    try:
        loader = YouTubeTranscriptApi()
        transcript_list = loader.fetch(video_id)

        # Format transcript with timestamps for AI analysis
        formatted_transcript = []
        full_text_for_ai = ""

        for entry in transcript_list:
            start = entry.start
            duration = entry.duration
            text = entry.text
            timestamp = format_timestamp(start)

            formatted_transcript.append({
                'timestamp': timestamp,
                'text': text,
                'start': start,
                'duration': duration
            })
            full_text_for_ai += f"[{timestamp}] {text}\n"

        return {
            "transcript": formatted_transcript,
            "full_text": full_text_for_ai,
            "video_id": video_id
        }

    except Exception as e:
        return {"error": str(e)}


def detect_highlight_moments(transcript_text, num_clips=5, target_duration_minutes=10, avg_clip_length_seconds=60, custom_prompt=None):
    """
    Uses Gemini to detect the best highlight moments for a compilation video.

    Args:
        transcript_text: The full transcript with timestamps
        num_clips: Number of clips to identify (default 5)
        target_duration_minutes: Target total duration in minutes (default 10)
        avg_clip_length_seconds: Average length of each clip in seconds (default 60)
        custom_prompt: Optional custom instructions to guide moment selection

    Returns:
        List of moments with start/end timestamps and descriptions
    """
    if not GEMINI_API_KEY:
        return {"error": "GEMINI_API_KEY not configured"}

    # Clamp num_clips to valid range
    num_clips = max(1, min(20, num_clips))

    # Format clip length for display
    if avg_clip_length_seconds >= 60:
        clip_length_str = f"around {avg_clip_length_seconds // 60} minute{'s' if avg_clip_length_seconds >= 120 else ''}"
    else:
        clip_length_str = f"around {avg_clip_length_seconds} seconds"

    try:
        model = genai.GenerativeModel('gemini-2.5-pro')

        if custom_prompt and custom_prompt.strip():
            prompt = f"""You are helping a content creator make a "best of" compilation video from their livestream or long-form video.

Here is the transcript:
{transcript_text}

The creator has given you these instructions about what they're looking for:
{custom_prompt}

Find {num_clips} segments that match their criteria. Each clip should be {clip_length_str} long (total ~{target_duration_minutes} minutes).

IMPORTANT RULES:
1. Each segment should be self-contained and make sense on its own
2. Segments should have clear beginnings and endings (don't cut mid-sentence)
3. Order the segments in a way that flows well for a compilation
4. Prefer moments with high energy, humor, insights, or memorable quotes
5. Each clip should be approximately {clip_length_str} - not too short, not too long

Return your response as a JSON array with this exact format:
[
  {{
    "start_time": "MM:SS",
    "end_time": "MM:SS",
    "title": "Short descriptive title",
    "reason": "Why this moment is highlight-worthy",
    "order": 1
  }}
]

Return ONLY the JSON array, no other text or markdown formatting."""
        else:
            prompt = f"""You are an expert video editor helping create a "best of" compilation from a livestream or long-form video.

Here is the transcript:
{transcript_text}

Find the {num_clips} BEST moments for a highlight compilation. Each clip should be {clip_length_str} long (total ~{target_duration_minutes} minutes).

Look for:
- Funniest moments
- Most insightful or educational parts
- High energy or exciting segments
- Memorable quotes or reactions
- Story climaxes or payoffs
- Audience interaction highlights

IMPORTANT RULES:
1. Each segment should be self-contained and make sense on its own
2. Don't cut mid-sentence or mid-thought
3. Order segments to create good flow (don't just use chronological order)
4. Vary the types of moments (mix funny with serious, etc.)
5. Each clip should be approximately {clip_length_str} - aim for this length consistently

Return your response as a JSON array with this exact format:
[
  {{
    "start_time": "MM:SS",
    "end_time": "MM:SS",
    "title": "Short descriptive title",
    "reason": "Why this moment is highlight-worthy",
    "order": 1
  }}
]

Return ONLY the JSON array, no other text or markdown formatting."""

        response = model.generate_content(prompt)
        response_text = response.text.strip()

        # Clean up response - remove markdown code blocks if present
        if response_text.startswith('```'):
            lines = response_text.split('\n')
            response_text = '\n'.join(lines[1:-1] if lines[-1] == '```' else lines[1:])

        moments = json.loads(response_text)

        # Sort by order field
        moments.sort(key=lambda x: x.get('order', 0))

        return {"moments": moments}

    except json.JSONDecodeError as e:
        return {"error": f"Failed to parse AI response as JSON: {str(e)}"}
    except Exception as e:
        return {"error": f"Error detecting highlights: {str(e)}"}


def parse_timestamp_to_seconds(timestamp):
    """Convert MM:SS or HH:MM:SS to seconds."""
    parts = timestamp.split(':')
    if len(parts) == 2:
        return int(parts[0]) * 60 + float(parts[1])
    elif len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    return 0


def clip_segment(video_path, start_time, end_time, output_path):
    """
    Clips a segment from a video using ffmpeg.

    Args:
        video_path: Path to the source video file
        start_time: Start timestamp (MM:SS or HH:MM:SS)
        end_time: End timestamp (MM:SS or HH:MM:SS)
        output_path: Path for the output clip

    Returns:
        Dict with success status
    """
    try:
        start_seconds = parse_timestamp_to_seconds(start_time)
        end_seconds = parse_timestamp_to_seconds(end_time)
        duration = end_seconds - start_seconds

        if duration <= 0:
            return {"error": "End time must be after start time"}

        # Use -ss before -i for fast seeking, -c copy for no re-encoding
        cmd = [
            'ffmpeg',
            '-y',
            '-ss', str(start_seconds),
            '-i', video_path,
            '-t', str(duration),
            '-c', 'copy',
            '-avoid_negative_ts', 'make_zero',
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            return {"error": f"ffmpeg error: {result.stderr}"}

        return {"success": True, "duration": duration}

    except Exception as e:
        return {"error": f"Error clipping segment: {str(e)}"}


def concatenate_clips(clip_paths, output_path, use_crossfade=False, crossfade_duration=0.5):
    """
    Concatenate multiple video clips into a single video.

    Args:
        clip_paths: List of paths to video clips (in order)
        output_path: Path for the output video
        use_crossfade: Whether to add crossfade transitions
        crossfade_duration: Duration of crossfade in seconds

    Returns:
        Dict with success status and output info
    """
    if not clip_paths:
        return {"error": "No clips provided"}

    if len(clip_paths) == 1:
        # Just copy the single clip
        import shutil
        shutil.copy(clip_paths[0], output_path)
        return {"success": True}

    try:
        if use_crossfade:
            # Use filter_complex for crossfade transitions
            # This requires re-encoding but gives smooth transitions
            return _concatenate_with_crossfade(clip_paths, output_path, crossfade_duration)
        else:
            # Use concat demuxer for instant concatenation (no re-encoding)
            return _concatenate_direct(clip_paths, output_path)

    except Exception as e:
        return {"error": f"Error concatenating clips: {str(e)}"}


def _concatenate_direct(clip_paths, output_path):
    """
    Concatenate clips using the concat demuxer (fast, no re-encoding).
    """
    # Create a temporary file list for concat demuxer
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        for clip_path in clip_paths:
            # Escape single quotes in path
            escaped_path = clip_path.replace("'", "'\\''")
            f.write(f"file '{escaped_path}'\n")
        list_file = f.name

    try:
        cmd = [
            'ffmpeg',
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', list_file,
            '-c', 'copy',
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            return {"error": f"ffmpeg concat error: {result.stderr}"}

        return {"success": True}

    finally:
        os.unlink(list_file)


def _concatenate_with_crossfade(clip_paths, output_path, crossfade_duration):
    """
    Concatenate clips with crossfade transitions (requires re-encoding).

    Uses xfade for video transitions and acrossfade for audio transitions.
    The acrossfade filter works by taking pairs of audio streams and crossfading
    them at the transition point.
    """
    num_clips = len(clip_paths)

    if num_clips < 2:
        return _concatenate_direct(clip_paths, output_path)

    # Build input arguments
    inputs = []
    for path in clip_paths:
        inputs.extend(['-i', path])

    # Get durations of each clip for offset calculation
    durations = []
    for path in clip_paths:
        probe_cmd = [
            'ffprobe', '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            path
        ]
        result = subprocess.run(probe_cmd, capture_output=True, text=True)
        if result.returncode == 0:
            durations.append(float(result.stdout.strip()))
        else:
            durations.append(10.0)  # Fallback

    # Build xfade filter chain for video
    # Each xfade takes two inputs and produces one output
    filter_parts = []

    # Calculate cumulative offsets for xfade
    # xfade offset is when the transition STARTS (from the beginning of the output)
    cumulative_offset = 0

    for i in range(num_clips - 1):
        if i == 0:
            input_a = "[0:v]"
            input_b = "[1:v]"
        else:
            input_a = f"[v{i}]"
            input_b = f"[{i+1}:v]"

        if i == num_clips - 2:
            output = "[outv]"
        else:
            output = f"[v{i+1}]"

        # The offset for xfade is when the transition starts
        # First clip plays, then at (duration - crossfade) the transition begins
        cumulative_offset += durations[i] - crossfade_duration

        filter_parts.append(
            f"{input_a}{input_b}xfade=transition=fade:duration={crossfade_duration}:offset={cumulative_offset}{output}"
        )

    # Build acrossfade filter chain for audio
    # acrossfade works differently - it crossfades between two audio streams
    # Parameters: d=duration, c1=curve for first stream, c2=curve for second stream
    for i in range(num_clips - 1):
        if i == 0:
            input_a = "[0:a]"
            input_b = "[1:a]"
        else:
            input_a = f"[a{i}]"
            input_b = f"[{i+1}:a]"

        if i == num_clips - 2:
            output = "[outa]"
        else:
            output = f"[a{i+1}]"

        # acrossfade just takes duration (d) - it handles the timing automatically
        # c1 and c2 control fade curves (tri = linear, exp = exponential, etc.)
        filter_parts.append(
            f"{input_a}{input_b}acrossfade=d={crossfade_duration}:c1=tri:c2=tri{output}"
        )

    filter_complex = ';'.join(filter_parts)

    cmd = ['ffmpeg', '-y'] + inputs + [
        '-filter_complex', filter_complex,
        '-map', '[outv]',
        '-map', '[outa]',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '192k',
        output_path
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        # Fallback to direct concat if crossfade fails
        print(f"[bestof] Crossfade failed, falling back to direct concat: {result.stderr}")
        return _concatenate_direct(clip_paths, output_path)

    return {"success": True}


def create_bestof_compilation(video_path, moments, use_crossfade=False, crossfade_duration=0.5):
    """
    Create a best-of compilation video from detected moments.

    Args:
        video_path: Path to the source video file
        moments: List of moment dicts with start_time, end_time, order
        use_crossfade: Whether to add crossfade transitions
        crossfade_duration: Duration of crossfade in seconds

    Returns:
        Dict with success status, video data as base64, and metadata
    """
    if not moments:
        return {"error": "No moments provided"}

    temp_clips = []
    temp_dir = tempfile.mkdtemp(prefix='bestof_')

    try:
        # Sort moments by order
        sorted_moments = sorted(moments, key=lambda x: x.get('order', 0))

        # Clip each moment
        for i, moment in enumerate(sorted_moments):
            clip_path = os.path.join(temp_dir, f"clip_{i:03d}.mp4")

            result = clip_segment(
                video_path,
                moment['start_time'],
                moment['end_time'],
                clip_path
            )

            if 'error' in result:
                return {"error": f"Failed to clip segment {i+1}: {result['error']}"}

            temp_clips.append(clip_path)

        # Concatenate all clips
        output_path = os.path.join(temp_dir, "bestof_compilation.mp4")
        concat_result = concatenate_clips(
            temp_clips,
            output_path,
            use_crossfade=use_crossfade,
            crossfade_duration=crossfade_duration
        )

        if 'error' in concat_result:
            return concat_result

        # Read output and convert to base64
        with open(output_path, 'rb') as f:
            video_data = f.read()

        video_base64 = base64.b64encode(video_data).decode('utf-8')
        file_size = len(video_data)

        # Calculate total duration
        total_duration = sum(
            parse_timestamp_to_seconds(m['end_time']) - parse_timestamp_to_seconds(m['start_time'])
            for m in sorted_moments
        )

        return {
            "success": True,
            "video_data": video_base64,
            "file_size": file_size,
            "total_duration_seconds": total_duration,
            "num_clips": len(sorted_moments),
            "clips_used": [
                {
                    "order": m.get('order', i),
                    "title": m.get('title', f'Clip {i+1}'),
                    "start_time": m['start_time'],
                    "end_time": m['end_time']
                }
                for i, m in enumerate(sorted_moments)
            ]
        }

    except Exception as e:
        return {"error": f"Error creating compilation: {str(e)}"}

    finally:
        # Cleanup temp files
        import shutil
        try:
            shutil.rmtree(temp_dir)
        except:
            pass


def process_video_for_bestof(video_url, video_path=None, num_clips=5, target_duration_minutes=10,
                              use_crossfade=False, crossfade_duration=0.5, custom_prompt=None):
    """
    Main function to process a video for best-of compilation.

    Args:
        video_url: YouTube URL to get transcript from
        video_path: Path to the downloaded video file (required for compilation)
        num_clips: Number of clips to identify (default 5)
        target_duration_minutes: Target total duration in minutes (default 10)
        use_crossfade: Whether to add crossfade transitions
        crossfade_duration: Duration of crossfade in seconds
        custom_prompt: Optional custom instructions for moment selection

    Returns:
        Dict with transcript, detected moments, and compilation video
    """
    # Step 1: Get transcript
    transcript_result = get_transcript_for_highlights(video_url)
    if "error" in transcript_result:
        return transcript_result

    # Step 2: Detect highlight moments using Gemini
    moments_result = detect_highlight_moments(
        transcript_result['full_text'],
        num_clips=num_clips,
        target_duration_minutes=target_duration_minutes,
        custom_prompt=custom_prompt
    )

    if "error" in moments_result:
        return {
            "transcript": transcript_result,
            "moments_error": moments_result['error']
        }

    # Step 3: If video path provided, create compilation
    if video_path:
        compilation_result = create_bestof_compilation(
            video_path,
            moments_result['moments'],
            use_crossfade=use_crossfade,
            crossfade_duration=crossfade_duration
        )

        return {
            "transcript": transcript_result,
            "moments": moments_result['moments'],
            "compilation": compilation_result
        }

    # If no video path, just return transcript and moments
    return {
        "transcript": transcript_result,
        "moments": moments_result['moments']
    }
