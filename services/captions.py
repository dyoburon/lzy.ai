# Captions Service
#
# This service handles:
# - Extracting audio from video clips
# - Transcribing audio using OpenAI Whisper API with word-level timestamps
# - Generating animated caption overlays for FFmpeg

import os
import subprocess
import tempfile
import base64
from openai import OpenAI
from services.temporal_captions import group_words_by_temporal_proximity

# Configure OpenAI
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")


def get_openai_client():
    """Get configured OpenAI client."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None
    return OpenAI(api_key=api_key)


def extract_audio_from_video(video_data_base64):
    """
    Extract audio from a base64-encoded video.

    Args:
        video_data_base64: Base64 encoded video data

    Returns:
        Path to extracted audio file (caller must clean up)
    """
    try:
        # Decode video to temp file
        video_data = base64.b64decode(video_data_base64)
        video_file = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
        video_file.write(video_data)
        video_file.close()

        # Create temp file for audio
        audio_file = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False)
        audio_file.close()

        # Extract audio using ffmpeg
        cmd = [
            'ffmpeg', '-y',
            '-i', video_file.name,
            '-vn',  # No video
            '-acodec', 'libmp3lame',
            '-ar', '16000',  # 16kHz sample rate (good for speech)
            '-ac', '1',  # Mono
            '-b:a', '64k',
            audio_file.name
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        # Clean up video temp file
        os.unlink(video_file.name)

        if result.returncode != 0:
            if os.path.exists(audio_file.name):
                os.unlink(audio_file.name)
            return {"error": f"Audio extraction failed: {result.stderr}"}

        return {"audio_path": audio_file.name}

    except Exception as e:
        return {"error": f"Error extracting audio: {str(e)}"}


def transcribe_with_whisper(audio_path):
    """
    Transcribe audio using OpenAI Whisper API with word-level timestamps.

    Args:
        audio_path: Path to audio file

    Returns:
        Dict with words and their timestamps
    """
    client = get_openai_client()
    if not client:
        return {"error": "OPENAI_API_KEY not configured"}

    try:
        with open(audio_path, 'rb') as audio_file:
            # Use verbose_json to get word-level timestamps
            response = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                response_format="verbose_json",
                timestamp_granularities=["word"]
            )

        # Extract words with timestamps
        words = []
        if hasattr(response, 'words') and response.words:
            for word_data in response.words:
                words.append({
                    "word": word_data.word,
                    "start": word_data.start,
                    "end": word_data.end
                })

        return {
            "text": response.text,
            "words": words,
            "duration": response.duration if hasattr(response, 'duration') else None
        }

    except Exception as e:
        return {"error": f"Whisper transcription failed: {str(e)}"}


def group_words_into_captions(words, words_per_group=3, silence_threshold=0.5):
    """
    Group words into caption segments for display.

    Uses temporal proximity algorithm: words spoken in quick succession appear
    together, while silence gaps force new segments regardless of word count.

    Args:
        words: List of word dicts with 'word', 'start', 'end'
        words_per_group: Maximum words per caption (default 3)
                        Acts as upper limit, not target - groups can be smaller
        silence_threshold: Gap in seconds that forces new segment (default 0.5s)
                          Set to None or very high value to disable silence breaks

    Returns:
        List of caption groups with timing info
    """
    # Use the temporal proximity algorithm from the dedicated module
    return group_words_by_temporal_proximity(
        words,
        max_words_per_group=words_per_group,
        silence_threshold=silence_threshold
    )


def generate_ffmpeg_caption_filter(captions, video_width=1080, video_height=1920,
                                    font_size=72, font_color="white",
                                    highlight_color="yellow", position_y=0.85):
    """
    Generate FFmpeg drawtext filter for animated captions.

    The captions will:
    - Display at the bottom of the video
    - Highlight the current word by making it bigger
    - Show 3-4 words at a time

    Args:
        captions: List of caption groups from group_words_into_captions
        video_width: Width of the video (default 1080 for vertical)
        video_height: Height of the video (default 1920 for vertical)
        font_size: Base font size
        font_color: Default text color
        highlight_color: Color for highlighted word
        position_y: Vertical position as fraction (0.85 = 85% down)

    Returns:
        FFmpeg filter string for drawtext
    """
    if not captions:
        return None

    # Calculate Y position
    y_pos = int(video_height * position_y)

    # We'll use a different approach: generate ASS subtitles for better styling control
    # But for now, let's use multiple drawtext filters with enable conditions

    filters = []

    for caption in captions:
        start_time = caption['start']
        end_time = caption['end']
        words = caption['words']

        # For each word in the group, we need to determine when it's "active"
        for word_idx, word in enumerate(words):
            word_start = word['start']
            word_end = word['end']
            word_text = word['word']

            # Build the full caption text with this word potentially highlighted
            # We'll create separate filters for normal and highlighted states

            # Calculate x position for centered text
            # This is approximate - FFmpeg drawtext centering can be tricky

            # Normal state (before this word is spoken)
            if word_idx == 0:
                # First word - show from group start to word start
                # But since timing is tight, we'll keep it simple
                pass

            # During this word - make it bigger/highlighted
            # We escape special characters for FFmpeg
            escaped_word = word_text.replace("'", "'\\''").replace(":", "\\:")

            # Create a filter that shows this word highlighted during its time
            # and normal otherwise

        # Simpler approach: Just show the full caption group with the current word highlighted
        # We'll use ASS subtitles for this level of control

    # Actually, the best approach for animated word-by-word highlighting is ASS subtitles
    # Let's generate those instead
    return None  # We'll use ASS approach instead


def hex_to_ass_color(hex_color):
    """
    Convert hex color (#RRGGBB) to ASS format (&HBBGGRR).

    Args:
        hex_color: Color in hex format (#RRGGBB or #RGB) or named color

    Returns:
        Color in ASS format (&HBBGGRR)
    """
    # Named color fallbacks
    color_map = {
        'white': '&HFFFFFF',
        'yellow': '&H00FFFF',
        'cyan': '&HFFFF00',
        'green': '&H00FF00',
        'red': '&H0000FF',
        'blue': '&HFF0000',
        'orange': '&H0080FF',
        'pink': '&HFF00FF',
        'black': '&H000000',
    }

    if not hex_color:
        return '&HFFFFFF'

    # Handle named colors
    if hex_color.lower() in color_map:
        return color_map[hex_color.lower()]

    # Handle hex colors
    if hex_color.startswith('#'):
        hex_color = hex_color[1:]

    # Handle short hex (#RGB -> #RRGGBB)
    if len(hex_color) == 3:
        hex_color = ''.join([c*2 for c in hex_color])

    if len(hex_color) != 6:
        return '&HFFFFFF'  # Default to white on invalid

    try:
        r = hex_color[0:2]
        g = hex_color[2:4]
        b = hex_color[4:6]
        # ASS uses BGR format
        return f'&H{b}{g}{r}'.upper()
    except:
        return '&HFFFFFF'


def generate_ass_subtitles(captions, video_width=1080, video_height=1920,
                           font_size=56, font_name="Arial Black",
                           primary_color="&HFFFFFF", highlight_color="&H00FFFF",
                           outline_color="&H000000", highlight_scale=1.3,
                           position_y=85, text_style="normal", animation_style="both",
                           word_spacing=8, outline_enabled=True, outline_width=3,
                           shadow_enabled=True, shadow_color="&H000000",
                           background_enabled=False, background_color="&H000000",
                           background_opacity=50):
    """
    Generate ASS subtitle file content for animated captions.

    Args:
        captions: List of caption groups
        video_width/height: Video dimensions
        font_size: Base font size
        font_name: Font to use
        primary_color: Normal text color (ASS format: &HBBGGRR or hex #RRGGBB)
        highlight_color: Highlighted word color
        outline_color: Text outline color
        highlight_scale: Scale factor for highlighted word (1.3 = 30% bigger)
        position_y: Vertical position as percentage from top (0-100, default 85)
        text_style: 'normal' or 'uppercase'
        animation_style: 'scale', 'color', 'both', or 'glow'
        word_spacing: Space between words in pixels
        outline_enabled: Whether to show text outline
        outline_width: Width of outline in pixels
        shadow_enabled: Whether to show text shadow
        shadow_color: Shadow color
        background_enabled: Whether to show background box
        background_color: Background color
        background_opacity: Background opacity (0-100)

    Returns:
        String content for .ass file
    """
    # Convert colors from hex to ASS format if needed
    if primary_color.startswith('#') or primary_color.lower() in ['white', 'yellow', 'cyan', 'green', 'red', 'blue', 'orange', 'pink', 'black']:
        primary_color = hex_to_ass_color(primary_color)
    if highlight_color.startswith('#') or highlight_color.lower() in ['white', 'yellow', 'cyan', 'green', 'red', 'blue', 'orange', 'pink', 'black']:
        highlight_color = hex_to_ass_color(highlight_color)
    if outline_color.startswith('#') or outline_color.lower() in ['white', 'yellow', 'cyan', 'green', 'red', 'blue', 'orange', 'pink', 'black']:
        outline_color = hex_to_ass_color(outline_color)
    if shadow_color.startswith('#') or shadow_color.lower() in ['white', 'yellow', 'cyan', 'green', 'red', 'blue', 'orange', 'pink', 'black']:
        shadow_color = hex_to_ass_color(shadow_color)
    if background_color.startswith('#') or background_color.lower() in ['white', 'yellow', 'cyan', 'green', 'red', 'blue', 'orange', 'pink', 'black']:
        background_color = hex_to_ass_color(background_color)

    # Calculate margin from bottom based on position_y percentage
    # position_y=85 means 85% from top, so 15% from bottom
    # MarginV in ASS is distance from bottom for alignment 2 (bottom-center)
    # For top positioning, we need to use alignment 8 (top-center)

    # Determine alignment and margin based on position
    if position_y <= 33:
        # Top third - use top alignment (8)
        alignment = 8
        margin_v = int(video_height * (position_y / 100))
    elif position_y <= 66:
        # Middle third - use middle alignment (5)
        alignment = 5
        margin_v = 0  # Middle alignment ignores MarginV
    else:
        # Bottom third - use bottom alignment (2)
        alignment = 2
        # MarginV is from bottom, so if position_y=85, margin from bottom = 15%
        margin_v = int(video_height * ((100 - position_y) / 100))

    # Calculate outline and shadow settings
    actual_outline = outline_width if outline_enabled else 0
    actual_shadow = 2 if shadow_enabled else 0

    # BorderStyle: 1 = outline + shadow, 3 = opaque box background
    border_style = 3 if background_enabled else 1

    # BackColour with alpha (for background box): &HAABBGGRR
    # Alpha is 00 = opaque, FF = transparent
    # Convert opacity (0-100) to alpha (FF-00)
    bg_alpha = hex(int(255 * (1 - background_opacity / 100)))[2:].upper().zfill(2)
    back_color = f"&H{bg_alpha}{background_color[2:]}" if background_enabled else f"&H80{shadow_color[2:]}"

    # ASS header
    ass_content = f"""[Script Info]
Title: Auto-generated Captions
ScriptType: v4.00+
PlayResX: {video_width}
PlayResY: {video_height}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{font_size},{primary_color},&H000000FF,{outline_color},{back_color},1,0,0,0,100,100,{word_spacing},0,{border_style},{actual_outline},{actual_shadow},{alignment},50,50,{margin_v},1
Style: Highlight,{font_name},{int(font_size * highlight_scale)},{highlight_color},&H000000FF,{outline_color},{back_color},1,0,0,0,100,100,{word_spacing},0,{border_style},{actual_outline + 1},{actual_shadow},{alignment},50,50,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    def format_time(seconds):
        """Convert seconds to ASS time format (H:MM:SS.cc)"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = seconds % 60
        return f"{hours}:{minutes:02d}:{secs:05.2f}"

    for caption in captions:
        words = caption['words']
        group_start = caption['start']
        group_end = caption['end']

        # For each moment within this caption group, generate a subtitle line
        # that shows the full text but with the current word highlighted

        for i, current_word in enumerate(words):
            word_start = current_word['start']
            # Word end is either this word's end or next word's start
            if i < len(words) - 1:
                word_end = words[i + 1]['start']
            else:
                word_end = group_end

            # Build text with current word highlighted using ASS override tags
            text_parts = []
            for j, word in enumerate(words):
                word_text = word['word']

                # Apply text style (uppercase)
                if text_style == 'uppercase':
                    word_text = word_text.upper()

                if j == i:
                    # Highlighted word - apply animation based on style
                    if animation_style == 'scale':
                        # Only scale, no color change
                        text_parts.append(f"{{\\fscx{int(highlight_scale * 100)}\\fscy{int(highlight_scale * 100)}}}{word_text}{{\\r}}")
                    elif animation_style == 'color':
                        # Only color change, no scale
                        text_parts.append(f"{{\\c{highlight_color}}}{word_text}{{\\r}}")
                    elif animation_style == 'glow':
                        # Color + blur for glow effect
                        text_parts.append(f"{{\\c{highlight_color}\\blur2}}{word_text}{{\\r}}")
                    else:  # 'both' or default
                        # Scale + color
                        text_parts.append(f"{{\\fscx{int(highlight_scale * 100)}\\fscy{int(highlight_scale * 100)}\\c{highlight_color}}}{word_text}{{\\r}}")
                else:
                    text_parts.append(word_text)

            full_text = " ".join(text_parts)

            # Add dialogue line
            start_str = format_time(word_start)
            end_str = format_time(word_end)

            ass_content += f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{full_text}\n"

    return ass_content


def transcribe_video_for_captions(video_data_base64, words_per_group=3, silence_threshold=0.5):
    """
    Full pipeline: Extract audio, transcribe, and generate caption data.

    Args:
        video_data_base64: Base64 encoded video
        words_per_group: Maximum words per caption group (can be fewer due to silence breaks)
        silence_threshold: Gap in seconds that forces new caption segment (default 0.5s)
                          Words with gaps exceeding this are split into separate captions

    Returns:
        Dict with transcription and caption data
    """
    # Step 1: Extract audio
    audio_result = extract_audio_from_video(video_data_base64)
    if "error" in audio_result:
        return audio_result

    audio_path = audio_result['audio_path']

    try:
        # Step 2: Transcribe with Whisper
        transcription = transcribe_with_whisper(audio_path)
        if "error" in transcription:
            return transcription

        # Step 3: Group words into captions using temporal proximity
        captions = group_words_into_captions(
            transcription.get('words', []),
            words_per_group=words_per_group,
            silence_threshold=silence_threshold
        )

        return {
            "success": True,
            "text": transcription.get('text', ''),
            "words": transcription.get('words', []),
            "captions": captions,
            "duration": transcription.get('duration')
        }

    finally:
        # Clean up audio file
        if os.path.exists(audio_path):
            os.unlink(audio_path)


def create_caption_overlay_video(video_data_base64, captions, caption_options=None):
    """
    Create a video with animated caption overlay.

    Args:
        video_data_base64: Base64 encoded video
        captions: Caption data from transcribe_video_for_captions
        caption_options: Dict with styling options:
            - font_size: Base font size (default 56)
            - font_name: Font name (default "Arial Black")
            - primary_color: Normal text color (default #ffffff)
            - highlight_color: Highlighted word color (default #fbbf24)
            - highlight_scale: Scale factor for highlighted word (default 1.3)
            - position_y: Vertical position as percentage from top (default 85)
            - text_style: 'normal' or 'uppercase'
            - animation_style: 'scale', 'color', 'both', or 'glow'
            - word_spacing: Space between words in pixels
            - outline_enabled: Whether to show text outline
            - outline_color: Outline color
            - outline_width: Width of outline in pixels
            - shadow_enabled: Whether to show text shadow
            - shadow_color: Shadow color
            - background_enabled: Whether to show background box
            - background_color: Background color
            - background_opacity: Background opacity (0-100)

    Returns:
        Dict with success status and processed video as base64
    """
    if caption_options is None:
        caption_options = {}

    # Extract all options with defaults
    font_size = caption_options.get('font_size', 56)
    font_name = caption_options.get('font_name', 'Arial Black')
    highlight_scale = caption_options.get('highlight_scale', 1.3)
    position_y = caption_options.get('position_y', 85)
    primary_color = caption_options.get('primary_color', '#ffffff')
    highlight_color = caption_options.get('highlight_color', '#fbbf24')
    text_style = caption_options.get('text_style', 'normal')
    animation_style = caption_options.get('animation_style', 'both')
    word_spacing = caption_options.get('word_spacing', 8)
    outline_enabled = caption_options.get('outline_enabled', True)
    outline_color = caption_options.get('outline_color', '#000000')
    outline_width = caption_options.get('outline_width', 3)
    shadow_enabled = caption_options.get('shadow_enabled', True)
    shadow_color = caption_options.get('shadow_color', '#000000')
    background_enabled = caption_options.get('background_enabled', False)
    background_color = caption_options.get('background_color', '#000000')
    background_opacity = caption_options.get('background_opacity', 50)

    try:
        # Decode input video to temp file
        input_data = base64.b64decode(video_data_base64)
        input_file = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
        input_file.write(input_data)
        input_file.close()
        input_path = input_file.name

        # Generate ASS subtitles with all styling options
        ass_content = generate_ass_subtitles(
            captions,
            font_size=font_size,
            font_name=font_name,
            primary_color=primary_color,
            highlight_color=highlight_color,
            outline_color=outline_color,
            highlight_scale=highlight_scale,
            position_y=position_y,
            text_style=text_style,
            animation_style=animation_style,
            word_spacing=word_spacing,
            outline_enabled=outline_enabled,
            outline_width=outline_width,
            shadow_enabled=shadow_enabled,
            shadow_color=shadow_color,
            background_enabled=background_enabled,
            background_color=background_color,
            background_opacity=background_opacity
        )

        # Write ASS to temp file
        ass_file = tempfile.NamedTemporaryFile(suffix='.ass', delete=False, mode='w')
        ass_file.write(ass_content)
        ass_file.close()
        ass_path = ass_file.name

        # Create temp output file
        output_file = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
        output_file.close()
        output_path = output_file.name

        # Build ffmpeg command with ASS subtitles
        # Using subtitles filter to burn in the ASS file
        cmd = [
            'ffmpeg', '-y',
            '-i', input_path,
            '-vf', f"ass={ass_path}",
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        # Clean up temp files
        os.unlink(input_path)
        os.unlink(ass_path)

        if result.returncode != 0:
            if os.path.exists(output_path):
                os.unlink(output_path)
            return {"error": f"FFmpeg caption overlay failed: {result.stderr}"}

        # Read output and convert to base64
        with open(output_path, 'rb') as f:
            output_data = f.read()

        output_base64 = base64.b64encode(output_data).decode('utf-8')
        file_size = len(output_data)

        os.unlink(output_path)

        return {
            "success": True,
            "video_data": output_base64,
            "file_size": file_size
        }

    except Exception as e:
        # Clean up any temp files
        for path in ['input_path', 'ass_path', 'output_path']:
            if path in dir() and os.path.exists(eval(path)):
                os.unlink(eval(path))
        return {"error": f"Error adding captions: {str(e)}"}
