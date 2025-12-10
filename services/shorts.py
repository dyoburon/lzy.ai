# Shorts Clipper Service
#
# This service handles:
# - Analyzing YouTube video transcripts for engaging moments
# - Using Gemini AI to identify the most interesting segments
# - Clipping out shorts-worthy segments with ffmpeg
# - Exporting clips for validation
# - Adding animated captions using Whisper transcription

import os
import subprocess
import json
import tempfile
import base64
import google.generativeai as genai
from services.transcript import extract_video_id, format_timestamp
from services.captions import (
    transcribe_video_for_captions,
    generate_ass_subtitles,
    create_caption_overlay_video
)

# Configure Gemini
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)


def get_transcript_for_moments(video_url):
    """
    Fetches transcript from YouTube video for moment detection.
    Reuses logic from transcript.py but returns data optimized for moment detection.
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


def detect_interesting_moments(transcript_text, num_clips=3, max_duration_seconds=120, custom_prompt=None, curator_mode=False):
    """
    Uses Gemini to detect the most interesting moments in a video transcript.

    Args:
        transcript_text: The full transcript with timestamps
        num_clips: Number of clips to identify (1-15 in curator mode, 1-10 otherwise)
        max_duration_seconds: Maximum duration for each clip (default 120 = 2 minutes)
        custom_prompt: Optional custom instructions to guide moment selection
        curator_mode: If True, allows up to 15 clips for user selection

    Returns:
        List of moments with start/end timestamps and descriptions
    """
    if not GEMINI_API_KEY:
        return {"error": "GEMINI_API_KEY not configured"}

    # Clamp num_clips to valid range (15 max in curator mode, 10 otherwise)
    max_clips = 15 if curator_mode else 10
    num_clips = max(1, min(max_clips, num_clips))

    try:
        model = genai.GenerativeModel('gemini-2.5-pro')

        # Two completely separate prompt paths
        if custom_prompt and custom_prompt.strip():
            # CUSTOM PROMPT PATH - User has specific instructions
            prompt = f"""
You are helping a content creator find specific clips from their video. They have given you instructions about what they're looking for.

Here is the transcript:
{transcript_text}

USER'S INSTRUCTIONS:
{custom_prompt.strip()}

YOUR TASK: Find exactly {num_clips} clips that match what the user asked for above.

How to interpret their request:
- If they mention a SPECIFIC MOMENT (e.g., "the part where X happens"), find that moment and create {num_clips} different variations with slightly different start/end times so they can pick the best cut.
- If they mention a THEME or IDEA (e.g., "clips about AI hallucinating"), find {num_clips} DIFFERENT moments throughout the video that match that theme.
- If they specify a duration (e.g., "30 seconds"), use that. Otherwise default to 20-30 seconds per clip.

IMPORTANT: Only return clips that match their request. Do not include unrelated "viral" moments.

OUTPUT FORMAT (JSON array):
[
  {{
    "start_time": "MM:SS",
    "end_time": "MM:SS",
    "title": "Short catchy title for the clip",
    "reason": "How this matches the user's request",
    "viral_score": 8
  }}
]

Return ONLY the JSON array, no other text.
"""
        else:
            # DEFAULT PROMPT PATH - Find viral moments
            prompt = f"""
You are an expert content strategist specializing in viral short-form content. Analyze this video transcript and identify the MOST INTERESTING MOMENTS that would make great standalone clips.

Here is the transcript:
{transcript_text}

TASK: Identify exactly {num_clips} of the most engaging, viral-worthy moments from this video.

CRITERIA for selecting moments:
1. **Emotional peaks** - Funny moments, surprising revelations, intense reactions
2. **Valuable insights** - Key tips, important information, "aha" moments
3. **Story hooks** - Compelling narratives, cliffhangers, dramatic moments
4. **Quotable content** - Memorable statements, hot takes, strong opinions
5. **Visual potential** - Moments that likely have interesting visuals or actions

RULES:
1. **TARGET LENGTH: 20-30 seconds** - This is the ideal length for viral shorts. Only go longer (up to {max_duration_seconds} seconds) if the moment truly requires it.
2. Pick segments that can stand alone without additional context
3. Avoid intros, outros, and "filler" content
4. Focus on the most ENGAGING parts, not just informative ones
5. Trim the fat - start right when the interesting part begins, end right after it concludes

OUTPUT FORMAT (JSON array):
[
  {{
    "start_time": "MM:SS",
    "end_time": "MM:SS",
    "title": "Short catchy title for the clip",
    "reason": "Brief explanation of why this moment is interesting",
    "viral_score": 8
  }}
]

The viral_score is 1-10 rating of how likely this clip would perform well as a short.

Return ONLY the JSON array, no other text.
"""

        response = model.generate_content(prompt)
        response_text = response.text.strip()

        # Clean up response - remove markdown code blocks if present
        if response_text.startswith("```"):
            # Remove ```json or ``` from start
            response_text = response_text.split("\n", 1)[1] if "\n" in response_text else response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        response_text = response_text.strip()

        # Parse JSON response
        moments = json.loads(response_text)

        # Sort by viral score descending
        moments.sort(key=lambda x: x.get('viral_score', 0), reverse=True)

        return {"moments": moments}

    except json.JSONDecodeError as e:
        return {"error": f"Failed to parse AI response as JSON: {str(e)}", "raw_response": response_text}
    except Exception as e:
        return {"error": f"Error detecting moments: {str(e)}"}


def parse_timestamp_to_seconds(timestamp):
    """Convert MM:SS or HH:MM:SS to seconds."""
    parts = timestamp.split(":")
    if len(parts) == 2:
        return int(parts[0]) * 60 + int(parts[1])
    elif len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    return 0


def clip_video_segment(video_path, start_time, end_time, output_path=None):
    """
    Clips a segment from a video using ffmpeg.

    Args:
        video_path: Path to the source video file
        start_time: Start timestamp (MM:SS or HH:MM:SS)
        end_time: End timestamp (MM:SS or HH:MM:SS)
        output_path: Path for the output clip (optional, uses temp file if not provided)

    Returns:
        Dict with success status, clip data as base64, and metadata
    """
    import tempfile
    import base64

    try:
        # Convert timestamps to seconds for ffmpeg
        start_seconds = parse_timestamp_to_seconds(start_time)
        end_seconds = parse_timestamp_to_seconds(end_time)
        duration = end_seconds - start_seconds

        if duration <= 0:
            return {"error": "End time must be after start time"}

        # Use temp file if no output path provided
        use_temp = output_path is None
        if use_temp:
            temp_file = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
            output_path = temp_file.name
            temp_file.close()

        # Build ffmpeg command
        # -ss before -i for fast seeking
        # -t for duration
        # -c copy for fast copy without re-encoding (no cropping, just clipping)
        cmd = [
            'ffmpeg',
            '-y',  # Overwrite output
            '-ss', str(start_seconds),
            '-i', video_path,
            '-t', str(duration),
            '-c', 'copy',  # Copy codecs, no re-encoding
            '-avoid_negative_ts', 'make_zero',
            output_path
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True
        )

        if result.returncode != 0:
            if use_temp and os.path.exists(output_path):
                os.unlink(output_path)
            return {"error": f"ffmpeg error: {result.stderr}"}

        # Read the clip file and convert to base64
        with open(output_path, 'rb') as f:
            video_data = f.read()

        video_base64 = base64.b64encode(video_data).decode('utf-8')
        file_size = len(video_data)

        # Clean up temp file
        if use_temp and os.path.exists(output_path):
            os.unlink(output_path)

        return {
            "success": True,
            "video_data": video_base64,
            "start_time": start_time,
            "end_time": end_time,
            "duration_seconds": duration,
            "file_size": file_size
        }

    except FileNotFoundError:
        return {"error": "ffmpeg not found. Please install ffmpeg."}
    except Exception as e:
        return {"error": f"Error clipping video: {str(e)}"}


def clip_all_moments(video_path, moments):
    """
    Clips all identified moments from a video.

    Args:
        video_path: Path to the source video file
        moments: List of moment dicts with start_time and end_time

    Returns:
        Dict with results for each clip, including base64 video data
    """
    results = []
    for i, moment in enumerate(moments):
        # Create safe filename from title
        safe_title = "".join(c for c in moment.get('title', f'clip_{i}') if c.isalnum() or c in ' -_').strip()
        safe_title = safe_title[:50]  # Limit length
        filename = f"{i+1:02d}_{safe_title}.mp4"

        clip_result = clip_video_segment(
            video_path,
            moment['start_time'],
            moment['end_time']
        )

        # Add filename for download purposes
        if clip_result.get('success'):
            clip_result['filename'] = filename

        results.append({
            "moment": moment,
            "clip_result": clip_result
        })

    return {"clips": results}


def process_video_for_shorts(video_url, video_path=None, output_dir=None, num_clips=3, custom_prompt=None, curator_mode=False):
    """
    Main function to process a video for shorts.

    Args:
        video_url: YouTube URL to get transcript from
        video_path: Path to the downloaded video file (optional, for clipping)
        output_dir: Directory to save clips (optional)
        num_clips: Number of clips to identify (1-15 in curator mode, 1-10 otherwise)
        custom_prompt: Optional custom instructions to guide moment selection
        curator_mode: If True, allows up to 15 clips for user selection

    Returns:
        Dict with transcript, detected moments, and optionally clipped videos
    """
    # Step 1: Get transcript
    transcript_result = get_transcript_for_moments(video_url)
    if "error" in transcript_result:
        return transcript_result

    # Step 2: Detect interesting moments using Gemini
    moments_result = detect_interesting_moments(transcript_result['full_text'], num_clips=num_clips, custom_prompt=custom_prompt, curator_mode=curator_mode)
    if "error" in moments_result:
        return {
            "transcript": transcript_result,
            "moments_error": moments_result['error']
        }

    result = {
        "video_id": transcript_result['video_id'],
        "moments": moments_result['moments'],
        "transcript_preview": transcript_result['full_text'][:500] + "..." if len(transcript_result['full_text']) > 500 else transcript_result['full_text'],
        "full_transcript": transcript_result['full_text']
    }

    # Step 3: If video path provided, clip the moments
    if video_path and os.path.exists(video_path):
        if not output_dir:
            # Default output directory next to video
            video_dir = os.path.dirname(video_path)
            video_name = os.path.splitext(os.path.basename(video_path))[0]
            output_dir = os.path.join(video_dir, f"{video_name}_clips")

        clips_result = clip_all_moments(video_path, moments_result['moments'], output_dir)
        result['clips'] = clips_result

    return result


def process_clip_to_vertical(video_data_base64, regions, layout_config):
    """
    Process a clipped video into a vertical short by cropping and stacking regions.

    Args:
        video_data_base64: Base64 encoded video data
        regions: List of two region dicts with x, y, width, height (as percentages)
            [
                {"id": "content", "x": 5, "y": 5, "width": 60, "height": 90},
                {"id": "webcam", "x": 70, "y": 60, "width": 25, "height": 35}
            ]
        layout_config: Dict with layout settings
            {
                "topRegionId": "content",  # which region goes on top
                "splitRatio": 0.6  # 60% top, 40% bottom
            }

    Returns:
        Dict with success status and processed video as base64
    """
    import tempfile
    import base64

    try:
        # Decode input video to temp file
        input_data = base64.b64decode(video_data_base64)
        input_file = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
        input_file.write(input_data)
        input_file.close()
        input_path = input_file.name

        # Create temp output file
        output_file = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
        output_file.close()
        output_path = output_file.name

        # Get video dimensions using ffprobe
        probe_cmd = [
            'ffprobe', '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height',
            '-of', 'json',
            input_path
        ]
        probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
        if probe_result.returncode != 0:
            return {"error": f"ffprobe error: {probe_result.stderr}"}

        probe_data = json.loads(probe_result.stdout)
        src_width = probe_data['streams'][0]['width']
        src_height = probe_data['streams'][0]['height']

        # Determine which region is top and bottom
        top_region_id = layout_config.get('topRegionId', 'content')
        split_ratio = layout_config.get('splitRatio', 0.6)

        top_region = next((r for r in regions if r['id'] == top_region_id), regions[0])
        bottom_region = next((r for r in regions if r['id'] != top_region_id), regions[1])

        # Convert percentage-based regions to pixel values
        def region_to_pixels(region, src_w, src_h):
            return {
                'x': int(region['x'] / 100 * src_w),
                'y': int(region['y'] / 100 * src_h),
                'w': int(region['width'] / 100 * src_w),
                'h': int(region['height'] / 100 * src_h)
            }

        top_px = region_to_pixels(top_region, src_width, src_height)
        bottom_px = region_to_pixels(bottom_region, src_width, src_height)

        # Target dimensions for vertical short (9:16 aspect ratio)
        target_width = 1080
        target_height = 1920

        # Calculate heights based on split ratio
        top_height = int(target_height * split_ratio)
        bottom_height = target_height - top_height

        # Debug logging
        print(f"[process_clip_to_vertical] Source: {src_width}x{src_height}")
        print(f"[process_clip_to_vertical] Top region: {top_px} -> target {target_width}x{top_height}")
        print(f"[process_clip_to_vertical] Bottom region: {bottom_px} -> target {target_width}x{bottom_height}")

        # Build complex FFmpeg filter
        # 1. Crop each region from source
        # 2. Scale to FIT within target box (respects both width AND height)
        # 3. Pad to exact dimensions (center the content)
        # 4. Stack vertically
        #
        # Using force_original_aspect_ratio=decrease ensures the scaled result
        # fits WITHIN the target box, then we pad to fill the exact size.
        filter_complex = (
            # Crop and scale top region to fit within target_width x top_height
            f"[0:v]crop={top_px['w']}:{top_px['h']}:{top_px['x']}:{top_px['y']},"
            f"scale={target_width}:{top_height}:force_original_aspect_ratio=decrease,"
            f"pad={target_width}:{top_height}:(ow-iw)/2:(oh-ih)/2:black[top];"
            # Crop and scale bottom region to fit within target_width x bottom_height
            f"[0:v]crop={bottom_px['w']}:{bottom_px['h']}:{bottom_px['x']}:{bottom_px['y']},"
            f"scale={target_width}:{bottom_height}:force_original_aspect_ratio=decrease,"
            f"pad={target_width}:{bottom_height}:(ow-iw)/2:(oh-ih)/2:black[bottom];"
            # Stack vertically
            f"[top][bottom]vstack=inputs=2[out]"
        )

        print(f"[process_clip_to_vertical] Filter: {filter_complex}")

        # Build ffmpeg command
        cmd = [
            'ffmpeg', '-y',
            '-i', input_path,
            '-filter_complex', filter_complex,
            '-map', '[out]',
            '-map', '0:a?',  # Include audio if present
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        # Clean up input temp file
        os.unlink(input_path)

        if result.returncode != 0:
            if os.path.exists(output_path):
                os.unlink(output_path)
            return {"error": f"ffmpeg error: {result.stderr}"}

        # Read output and convert to base64
        with open(output_path, 'rb') as f:
            output_data = f.read()

        output_base64 = base64.b64encode(output_data).decode('utf-8')
        file_size = len(output_data)

        # Clean up output temp file
        os.unlink(output_path)

        return {
            "success": True,
            "video_data": output_base64,
            "file_size": file_size,
            "dimensions": {"width": target_width, "height": target_height}
        }

    except FileNotFoundError:
        return {"error": "ffmpeg/ffprobe not found. Please install ffmpeg."}
    except Exception as e:
        # Clean up any temp files
        if 'input_path' in dir() and os.path.exists(input_path):
            os.unlink(input_path)
        if 'output_path' in dir() and os.path.exists(output_path):
            os.unlink(output_path)
        return {"error": f"Error processing video: {str(e)}"}


def process_clips_to_vertical(clips, regions, layout_config, all_clip_regions=None):
    """
    Process multiple clips into vertical shorts.

    Args:
        clips: List of clip results from clip_all_moments
        regions: Region selections (used for all clips if all_clip_regions not provided)
        layout_config: Layout configuration
        all_clip_regions: Optional list of region arrays, one per clip (for per-clip regions)

    Returns:
        List of processed results
    """
    results = []
    for i, clip in enumerate(clips):
        clip_result = clip.get('clip_result', {})
        if not clip_result.get('success') or not clip_result.get('video_data'):
            results.append({
                "moment": clip.get('moment'),
                "error": "No video data available for this clip"
            })
            continue

        # Use per-clip regions if provided, otherwise fall back to shared regions
        clip_regions = all_clip_regions[i] if all_clip_regions else regions

        processed = process_clip_to_vertical(
            clip_result['video_data'],
            clip_regions,
            layout_config
        )

        results.append({
            "moment": clip.get('moment'),
            "original_filename": clip_result.get('filename', 'clip.mp4'),
            "processed": processed
        })

    return {"processed_clips": results}


# Legacy function for backwards compatibility
def clip_shorts(video_path, options=None):
    """
    Legacy function - now redirects to process_video_for_shorts.

    Args:
        video_path: Path to the uploaded video file
        options: Configuration options for clipping
            - video_url: YouTube URL for transcript
            - output_dir: Directory to save clips

    Returns:
        Processing results
    """
    if options is None:
        options = {}

    video_url = options.get('video_url')
    if not video_url:
        return {
            "error": "video_url is required in options to fetch transcript"
        }

    return process_video_for_shorts(
        video_url=video_url,
        video_path=video_path,
        output_dir=options.get('output_dir')
    )


def process_clip_to_vertical_with_captions(video_data_base64, regions, layout_config, caption_options=None):
    """
    Process a clipped video into a vertical short with animated captions.

    This function:
    1. First processes the video to vertical format (crop + stack regions)
    2. Transcribes the audio using Whisper API
    3. Adds animated word-by-word captions that highlight as spoken

    Args:
        video_data_base64: Base64 encoded video data
        regions: List of two region dicts with x, y, width, height (as percentages)
        layout_config: Dict with layout settings (topRegionId, splitRatio)
        caption_options: Dict with caption settings:
            - enabled: Whether to add captions (default True)
            - words_per_group: Words to show at once (default 3)
            - font_size: Base font size (default 56)
            - primary_color: Normal text color (default "white")
            - highlight_color: Highlighted word color (default "yellow")
            - highlight_scale: Scale factor for active word (default 1.3)

    Returns:
        Dict with success status and processed video as base64
    """
    if caption_options is None:
        caption_options = {}

    # Debug: Log caption options received
    print(f"[process_clip_to_vertical_with_captions] caption_options received: {caption_options}")
    print(f"[process_clip_to_vertical_with_captions] background_enabled: {caption_options.get('background_enabled')}")
    print(f"[process_clip_to_vertical_with_captions] background_color: {caption_options.get('background_color')}")
    print(f"[process_clip_to_vertical_with_captions] background_opacity: {caption_options.get('background_opacity')}")

    # Check if captions are enabled
    captions_enabled = caption_options.get('enabled', True)

    # Step 1: Process to vertical format first
    vertical_result = process_clip_to_vertical(video_data_base64, regions, layout_config)

    if not vertical_result.get('success'):
        return vertical_result

    # If captions disabled, return vertical result as-is
    if not captions_enabled:
        return vertical_result

    # Step 2: Transcribe the vertical video for captions
    words_per_group = caption_options.get('words_per_group', 3)
    silence_threshold = caption_options.get('silence_threshold', 0.5)

    transcription_result = transcribe_video_for_captions(
        vertical_result['video_data'],
        words_per_group=words_per_group,
        silence_threshold=silence_threshold
    )

    if "error" in transcription_result:
        # If transcription fails, return video without captions but note the error
        return {
            **vertical_result,
            "caption_error": transcription_result['error'],
            "captions_applied": False
        }

    captions = transcription_result.get('captions', [])

    if not captions:
        # No captions generated (silent video?), return as-is
        return {
            **vertical_result,
            "captions_applied": False,
            "transcription": transcription_result.get('text', '')
        }

    # Step 3: Add caption overlay - pass all styling options
    caption_result = create_caption_overlay_video(
        vertical_result['video_data'],
        captions,
        caption_options={
            'font_size': caption_options.get('font_size', 56),
            'font_name': caption_options.get('font_name', 'Arial Black'),
            'primary_color': caption_options.get('primary_color', '#ffffff'),
            'highlight_color': caption_options.get('highlight_color', '#fbbf24'),
            'highlight_scale': caption_options.get('highlight_scale', 1.3),
            'position_y': caption_options.get('position_y', 85),
            'text_style': caption_options.get('text_style', 'normal'),
            'animation_style': caption_options.get('animation_style', 'both'),
            'word_spacing': caption_options.get('word_spacing', 8),
            'outline_enabled': caption_options.get('outline_enabled', True),
            'outline_color': caption_options.get('outline_color', '#000000'),
            'outline_width': caption_options.get('outline_width', 3),
            'shadow_enabled': caption_options.get('shadow_enabled', True),
            'shadow_color': caption_options.get('shadow_color', '#000000'),
            'background_enabled': caption_options.get('background_enabled', False),
            'background_color': caption_options.get('background_color', '#000000'),
            'background_opacity': caption_options.get('background_opacity', 50),
        }
    )

    if not caption_result.get('success'):
        # If caption overlay fails, return video without captions
        return {
            **vertical_result,
            "caption_error": caption_result.get('error'),
            "captions_applied": False
        }

    # Build debug info for caption groups
    caption_debug = {
        "settings": {
            "words_per_group": words_per_group,
            "silence_threshold": silence_threshold,
        },
        "words": transcription_result.get('words', []),
        "groups": [
            {
                "text": g['text'],
                "word_count": len(g['words']),
                "start": g['start'],
                "end": g['end'],
                "duration": round(g['end'] - g['start'], 3),
                "words": [
                    {
                        "word": w['word'],
                        "start": w['start'],
                        "end": w['end'],
                    }
                    for w in g['words']
                ]
            }
            for g in captions
        ],
        "gaps": []  # Gaps between groups
    }

    # Calculate gaps between groups (silence breaks)
    for i in range(1, len(captions)):
        prev_end = captions[i-1]['end']
        curr_start = captions[i]['start']
        gap = round(curr_start - prev_end, 3)
        caption_debug["gaps"].append({
            "after_group": i - 1,
            "gap_seconds": gap,
            "is_silence_break": gap > silence_threshold
        })

    return {
        "success": True,
        "video_data": caption_result['video_data'],
        "file_size": caption_result['file_size'],
        "dimensions": vertical_result.get('dimensions', {"width": 1080, "height": 1920}),
        "captions_applied": True,
        "transcription": transcription_result.get('text', ''),
        "word_count": len(transcription_result.get('words', [])),
        "caption_debug": caption_debug
    }


def process_clips_to_vertical_with_captions(clips, regions, layout_config, caption_options=None, all_clip_regions=None):
    """
    Process multiple clips into vertical shorts with animated captions.

    Args:
        clips: List of clip results from clip_all_moments
        regions: Region selections (used for all clips if all_clip_regions not provided)
        layout_config: Layout configuration
        caption_options: Caption styling options
        all_clip_regions: Optional list of region arrays, one per clip (for per-clip regions)

    Returns:
        List of processed results
    """
    results = []
    for i, clip in enumerate(clips):
        clip_result = clip.get('clip_result', {})
        if not clip_result.get('success') or not clip_result.get('video_data'):
            results.append({
                "moment": clip.get('moment'),
                "error": "No video data available for this clip"
            })
            continue

        # Use per-clip regions if provided, otherwise fall back to shared regions
        clip_regions = all_clip_regions[i] if all_clip_regions else regions

        processed = process_clip_to_vertical_with_captions(
            clip_result['video_data'],
            clip_regions,
            layout_config,
            caption_options
        )

        results.append({
            "moment": clip.get('moment'),
            "original_filename": clip_result.get('filename', 'clip.mp4'),
            "processed": processed
        })

    return {"processed_clips": results}


def process_clip_to_pip(video_data_base64, regions, pip_settings):
    """
    Process a clipped video into a vertical short with Picture-in-Picture layout.

    Args:
        video_data_base64: Base64 encoded video data
        regions: List of region dicts with id, x, y, width, height (percentages)
        pip_settings: Dict with PiP configuration:
            - backgroundRegionId: Region ID for the background (fills frame)
            - overlayRegionId: Region ID for the overlay (small PiP)
            - position: "top-left", "top-right", "bottom-left", "bottom-right"
            - size: Overlay size as percentage of output width (10-40)
            - shape: "rounded" or "circle"
            - margin: Margin from edges as percentage (default 5)

    Returns:
        Dict with success status and processed video as base64
    """
    try:
        # Parse settings
        bg_region_id = pip_settings.get('backgroundRegionId', 'content')
        overlay_region_id = pip_settings.get('overlayRegionId', 'webcam')
        position = pip_settings.get('position', 'bottom-right')
        overlay_size_pct = pip_settings.get('size', 25)
        shape = pip_settings.get('shape', 'rounded')
        margin_pct = pip_settings.get('margin', 5)

        # Find regions
        bg_region = next((r for r in regions if r['id'] == bg_region_id), None)
        overlay_region = next((r for r in regions if r['id'] == overlay_region_id), None)

        if not bg_region or not overlay_region:
            return {"error": "Could not find specified regions"}

        # Decode video to temp file
        video_data = base64.b64decode(video_data_base64)
        input_file = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
        input_file.write(video_data)
        input_file.close()
        input_path = input_file.name

        # Get video dimensions using ffprobe
        probe_cmd = ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                     '-show_entries', 'stream=width,height', '-of', 'csv=p=0', input_path]
        probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
        if probe_result.returncode != 0:
            os.unlink(input_path)
            return {"error": f"Failed to probe video: {probe_result.stderr}"}

        src_width, src_height = map(int, probe_result.stdout.strip().split(','))

        # Output dimensions (vertical 9:16)
        out_width = 1080
        out_height = 1920

        # Calculate background crop (fills the entire 9:16 frame)
        bg_x = int(src_width * bg_region['x'] / 100)
        bg_y = int(src_height * bg_region['y'] / 100)
        bg_w = int(src_width * bg_region['width'] / 100)
        bg_h = int(src_height * bg_region['height'] / 100)

        # Calculate overlay crop
        ov_x = int(src_width * overlay_region['x'] / 100)
        ov_y = int(src_height * overlay_region['y'] / 100)
        ov_w = int(src_width * overlay_region['width'] / 100)
        ov_h = int(src_height * overlay_region['height'] / 100)

        # Calculate overlay output size
        overlay_width = int(out_width * overlay_size_pct / 100)
        if shape == "circle":
            overlay_height = overlay_width  # Square for circle
        else:
            # Maintain aspect ratio of the overlay region
            overlay_ar = ov_w / ov_h if ov_h > 0 else 1
            overlay_height = int(overlay_width / overlay_ar)

        # Calculate overlay position
        margin = int(out_width * margin_pct / 100)
        if position == "top-left":
            ov_out_x = margin
            ov_out_y = margin
        elif position == "top-right":
            ov_out_x = out_width - overlay_width - margin
            ov_out_y = margin
        elif position == "bottom-left":
            ov_out_x = margin
            ov_out_y = out_height - overlay_height - margin
        else:  # bottom-right (default)
            ov_out_x = out_width - overlay_width - margin
            ov_out_y = out_height - overlay_height - margin

        # Build ffmpeg filter
        # 1. Crop and scale background to fill 9:16
        # 2. Crop overlay region
        # 3. Scale overlay to desired size
        # 4. Apply shape (rounded corners or circle mask)
        # 5. Overlay on top of background

        if shape == "circle":
            # Circle mask - use colorkey approach or proper rgba geq
            # geq needs r, g, b, a all specified to preserve colors
            cx = overlay_width // 2
            cy = overlay_height // 2
            radius = min(overlay_width, overlay_height) // 2
            filter_complex = (
                f"[0:v]crop={bg_w}:{bg_h}:{bg_x}:{bg_y},scale={out_width}:{out_height}:force_original_aspect_ratio=increase,"
                f"crop={out_width}:{out_height}[bg];"
                f"[0:v]crop={ov_w}:{ov_h}:{ov_x}:{ov_y},scale={overlay_width}:{overlay_height},"
                f"format=rgba,geq="
                f"r='r(X,Y)':"
                f"g='g(X,Y)':"
                f"b='b(X,Y)':"
                f"a='if(lte(sqrt(pow(X-{cx},2)+pow(Y-{cy},2)),{radius}),255,0)'"
                f"[ov];"
                f"[bg][ov]overlay={ov_out_x}:{ov_out_y}"
            )
        else:
            # Rounded corners - use proper rgba geq to preserve colors
            border_radius = min(overlay_width, overlay_height) // 6
            w2 = overlay_width // 2
            h2 = overlay_height // 2
            # Corners are at: (border_radius, border_radius), (w-border_radius, border_radius), etc.
            filter_complex = (
                f"[0:v]crop={bg_w}:{bg_h}:{bg_x}:{bg_y},scale={out_width}:{out_height}:force_original_aspect_ratio=increase,"
                f"crop={out_width}:{out_height}[bg];"
                f"[0:v]crop={ov_w}:{ov_h}:{ov_x}:{ov_y},scale={overlay_width}:{overlay_height},"
                f"format=rgba,geq="
                f"r='r(X,Y)':"
                f"g='g(X,Y)':"
                f"b='b(X,Y)':"
                f"a='if("
                f"gt(X,{border_radius})*lt(X,{overlay_width}-{border_radius})+"
                f"gt(Y,{border_radius})*lt(Y,{overlay_height}-{border_radius})+"
                f"lte(sqrt(pow(X-{border_radius},2)+pow(Y-{border_radius},2)),{border_radius})*lte(X,{border_radius})*lte(Y,{border_radius})+"
                f"lte(sqrt(pow(X-{overlay_width}+{border_radius},2)+pow(Y-{border_radius},2)),{border_radius})*gte(X,{overlay_width}-{border_radius})*lte(Y,{border_radius})+"
                f"lte(sqrt(pow(X-{border_radius},2)+pow(Y-{overlay_height}+{border_radius},2)),{border_radius})*lte(X,{border_radius})*gte(Y,{overlay_height}-{border_radius})+"
                f"lte(sqrt(pow(X-{overlay_width}+{border_radius},2)+pow(Y-{overlay_height}+{border_radius},2)),{border_radius})*gte(X,{overlay_width}-{border_radius})*gte(Y,{overlay_height}-{border_radius})"
                f",255,0)'"
                f"[ov];"
                f"[bg][ov]overlay={ov_out_x}:{ov_out_y}"
            )

        # Create output file
        output_file = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
        output_file.close()
        output_path = output_file.name

        cmd = [
            'ffmpeg', '-y',
            '-i', input_path,
            '-filter_complex', filter_complex,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        # Clean up input
        os.unlink(input_path)

        if result.returncode != 0:
            if os.path.exists(output_path):
                os.unlink(output_path)
            return {"error": f"FFmpeg PiP processing failed: {result.stderr}"}

        # Read output and convert to base64
        with open(output_path, 'rb') as f:
            output_data = f.read()

        output_base64 = base64.b64encode(output_data).decode('utf-8')
        file_size = len(output_data)

        os.unlink(output_path)

        return {
            "success": True,
            "video_data": output_base64,
            "file_size": file_size,
            "dimensions": {"width": out_width, "height": out_height},
            "layout_mode": "pip"
        }

    except Exception as e:
        return {"error": f"Error processing PiP video: {str(e)}"}


def process_clips_to_pip(clips, regions, pip_settings, all_clip_regions=None):
    """
    Process multiple clips into vertical shorts with PiP layout.

    Args:
        clips: List of clip results from clip_all_moments
        regions: Region selections (used for all clips if all_clip_regions not provided)
        pip_settings: PiP configuration
        all_clip_regions: Optional list of region arrays, one per clip (for per-clip regions)

    Returns:
        List of processed results
    """
    results = []
    for i, clip in enumerate(clips):
        clip_result = clip.get('clip_result', {})
        if not clip_result.get('success') or not clip_result.get('video_data'):
            results.append({
                "moment": clip.get('moment'),
                "error": "No video data available for this clip"
            })
            continue

        # Use per-clip regions if provided, otherwise fall back to shared regions
        clip_regions = all_clip_regions[i] if all_clip_regions else regions

        processed = process_clip_to_pip(
            clip_result['video_data'],
            clip_regions,
            pip_settings
        )

        results.append({
            "moment": clip.get('moment'),
            "original_filename": clip_result.get('filename', 'clip.mp4'),
            "processed": processed
        })

    return {"processed_clips": results}


def process_clips_to_pip_with_captions(clips, regions, pip_settings, caption_options=None, all_clip_regions=None):
    """
    Process multiple clips into vertical shorts with PiP layout and animated captions.

    Args:
        clips: List of clip results from clip_all_moments
        regions: Region selections (used for all clips if all_clip_regions not provided)
        pip_settings: PiP configuration
        caption_options: Caption styling options
        all_clip_regions: Optional list of region arrays, one per clip (for per-clip regions)

    Returns:
        List of processed results
    """
    results = []
    for i, clip in enumerate(clips):
        clip_result = clip.get('clip_result', {})
        if not clip_result.get('success') or not clip_result.get('video_data'):
            results.append({
                "moment": clip.get('moment'),
                "error": "No video data available for this clip"
            })
            continue

        # Use per-clip regions if provided, otherwise fall back to shared regions
        clip_regions = all_clip_regions[i] if all_clip_regions else regions

        # First, process to PiP layout
        pip_result = process_clip_to_pip(
            clip_result['video_data'],
            clip_regions,
            pip_settings
        )

        if not pip_result.get('success'):
            results.append({
                "moment": clip.get('moment'),
                "original_filename": clip_result.get('filename', 'clip.mp4'),
                "processed": pip_result
            })
            continue

        # Then add captions to the PiP video
        transcription_result = transcribe_video_for_captions(
            pip_result['video_data'],
            words_per_group=caption_options.get('words_per_group', 3) if caption_options else 3,
            silence_threshold=caption_options.get('silence_threshold', 0.5) if caption_options else 0.5
        )

        if "error" in transcription_result:
            results.append({
                "moment": clip.get('moment'),
                "original_filename": clip_result.get('filename', 'clip.mp4'),
                "processed": {
                    **pip_result,
                    "caption_error": transcription_result['error']
                }
            })
            continue

        # Generate captions and overlay
        captions = transcription_result.get('captions', [])
        if not captions:
            results.append({
                "moment": clip.get('moment'),
                "original_filename": clip_result.get('filename', 'clip.mp4'),
                "processed": {
                    **pip_result,
                    "caption_error": "No captions generated"
                }
            })
            continue

        # Apply captions
        caption_result = create_caption_overlay_video(
            pip_result['video_data'],
            captions,
            caption_options
        )

        if "error" in caption_result:
            results.append({
                "moment": clip.get('moment'),
                "original_filename": clip_result.get('filename', 'clip.mp4'),
                "processed": {
                    **pip_result,
                    "caption_error": caption_result['error']
                }
            })
            continue

        results.append({
            "moment": clip.get('moment'),
            "original_filename": clip_result.get('filename', 'clip.mp4'),
            "processed": {
                "success": True,
                "video_data": caption_result['video_data'],
                "file_size": caption_result['file_size'],
                "dimensions": pip_result.get('dimensions', {"width": 1080, "height": 1920}),
                "layout_mode": "pip",
                "captions_applied": True
            }
        })

    return {"processed_clips": results}


def remove_silence_from_video(video_data_base64, min_gap_duration=0.4, padding=0.05):
    """
    Remove silent gaps from a video using Whisper word-level timestamps.

    This function:
    1. Transcribes the video with Whisper to get word timestamps
    2. Identifies gaps between words longer than min_gap_duration
    3. Cuts out those gaps and concatenates the speaking segments

    Args:
        video_data_base64: Base64 encoded video data
        min_gap_duration: Minimum gap duration (in seconds) to remove (default 0.4s)
        padding: Padding to keep around each segment (default 0.05s)

    Returns:
        Dict with success status and processed video as base64
    """
    from services.captions import extract_audio_from_video, transcribe_with_whisper

    try:
        # Step 1: Extract audio and transcribe with Whisper
        print(f"[remove_silence] Starting silence removal with min_gap={min_gap_duration}s, padding={padding}s")

        audio_result = extract_audio_from_video(video_data_base64)
        if "error" in audio_result:
            return audio_result

        audio_path = audio_result['audio_path']

        try:
            transcription = transcribe_with_whisper(audio_path)
            if "error" in transcription:
                return transcription
        finally:
            # Clean up audio file
            if os.path.exists(audio_path):
                os.unlink(audio_path)

        words = transcription.get('words', [])

        if not words:
            print("[remove_silence] No words detected in transcription, returning original video")
            return {
                "success": True,
                "video_data": video_data_base64,
                "silence_removed": False,
                "message": "No speech detected in video"
            }

        # Step 2: Find segments to keep (speech) and gaps to remove
        segments = []
        gaps_removed = []

        for i, word in enumerate(words):
            word_start = max(0, word['start'] - padding)
            word_end = word['end'] + padding

            if i == 0:
                # First word - start segment
                segments.append({'start': word_start, 'end': word_end})
            else:
                prev_word = words[i - 1]
                gap = word['start'] - prev_word['end']

                if gap > min_gap_duration:
                    # Gap is too long - end previous segment, start new one
                    gaps_removed.append({
                        'start': prev_word['end'],
                        'end': word['start'],
                        'duration': gap
                    })
                    segments.append({'start': word_start, 'end': word_end})
                else:
                    # Gap is acceptable - extend current segment
                    segments[-1]['end'] = word_end

        print(f"[remove_silence] Found {len(words)} words, {len(segments)} segments, {len(gaps_removed)} gaps to remove")

        if len(gaps_removed) == 0:
            print("[remove_silence] No significant gaps found, returning original video")
            return {
                "success": True,
                "video_data": video_data_base64,
                "silence_removed": False,
                "message": "No significant gaps found to remove"
            }

        total_gap_time = sum(g['duration'] for g in gaps_removed)
        print(f"[remove_silence] Total gap time to remove: {total_gap_time:.2f}s")

        # Step 3: Decode video to temp file
        video_data = base64.b64decode(video_data_base64)
        input_file = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
        input_file.write(video_data)
        input_file.close()
        input_path = input_file.name

        # Step 4: Extract each segment and concatenate
        segment_files = []
        concat_list_file = tempfile.NamedTemporaryFile(suffix='.txt', delete=False, mode='w')

        try:
            for i, segment in enumerate(segments):
                segment_file = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
                segment_file.close()
                segment_path = segment_file.name
                segment_files.append(segment_path)

                duration = segment['end'] - segment['start']

                # Extract segment with re-encoding for precise cuts
                cmd = [
                    'ffmpeg', '-y',
                    '-ss', str(segment['start']),
                    '-i', input_path,
                    '-t', str(duration),
                    '-c:v', 'libx264',
                    '-preset', 'fast',
                    '-crf', '23',
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-avoid_negative_ts', 'make_zero',
                    segment_path
                ]

                result = subprocess.run(cmd, capture_output=True, text=True)
                if result.returncode != 0:
                    raise Exception(f"Failed to extract segment {i}: {result.stderr}")

                # Add to concat list
                concat_list_file.write(f"file '{segment_path}'\n")

            concat_list_file.close()

            # Step 5: Concatenate all segments
            output_file = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
            output_file.close()
            output_path = output_file.name

            concat_cmd = [
                'ffmpeg', '-y',
                '-f', 'concat',
                '-safe', '0',
                '-i', concat_list_file.name,
                '-c', 'copy',
                '-movflags', '+faststart',
                output_path
            ]

            result = subprocess.run(concat_cmd, capture_output=True, text=True)
            if result.returncode != 0:
                raise Exception(f"Failed to concatenate segments: {result.stderr}")

            # Read output and convert to base64
            with open(output_path, 'rb') as f:
                output_data = f.read()

            output_base64 = base64.b64encode(output_data).decode('utf-8')
            file_size = len(output_data)

            print(f"[remove_silence] Successfully removed {len(gaps_removed)} gaps ({total_gap_time:.2f}s total)")

            return {
                "success": True,
                "video_data": output_base64,
                "file_size": file_size,
                "silence_removed": True,
                "gaps_removed": len(gaps_removed),
                "time_removed_seconds": round(total_gap_time, 2),
                "segments_kept": len(segments)
            }

        finally:
            # Clean up temp files
            os.unlink(input_path)
            os.unlink(concat_list_file.name)
            for seg_path in segment_files:
                if os.path.exists(seg_path):
                    os.unlink(seg_path)
            if 'output_path' in dir() and os.path.exists(output_path):
                os.unlink(output_path)

    except Exception as e:
        return {"error": f"Error removing silence: {str(e)}"}
