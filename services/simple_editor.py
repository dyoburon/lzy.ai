"""
Simple Video Editor Service
Provides video slicing and gap removal functionality.
Self-contained - does not depend on other services.
"""

import os
import subprocess
import tempfile
import base64
import json
from openai import OpenAI


def get_video_duration(video_path: str) -> float:
    """Get video duration in seconds using ffprobe."""
    cmd = [
        'ffprobe',
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'json',
        video_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    data = json.loads(result.stdout)
    return float(data['format']['duration'])


def get_video_info(video_path: str) -> dict:
    """Get video metadata using ffprobe."""
    cmd = [
        'ffprobe',
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,duration,r_frame_rate',
        '-show_entries', 'format=duration',
        '-of', 'json',
        video_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    data = json.loads(result.stdout)

    stream = data.get('streams', [{}])[0]
    format_info = data.get('format', {})

    # Parse frame rate (comes as "30/1" or similar)
    fps_str = stream.get('r_frame_rate', '30/1')
    if '/' in fps_str:
        num, den = fps_str.split('/')
        fps = float(num) / float(den) if float(den) > 0 else 30
    else:
        fps = float(fps_str)

    return {
        'width': stream.get('width', 1920),
        'height': stream.get('height', 1080),
        'duration': float(format_info.get('duration', 0)),
        'fps': fps
    }


def extract_audio(video_path: str, output_path: str) -> bool:
    """Extract audio from video as MP3 for Whisper."""
    cmd = [
        'ffmpeg', '-y',
        '-i', video_path,
        '-vn',
        '-acodec', 'libmp3lame',
        '-ar', '16000',
        '-ac', '1',
        '-q:a', '4',
        output_path
    ]
    result = subprocess.run(cmd, capture_output=True)
    return result.returncode == 0


def transcribe_audio(audio_path: str) -> list:
    """
    Transcribe audio using OpenAI Whisper API.
    Returns list of words with timestamps.
    """
    api_key = os.environ.get('OPENAI_API_KEY')
    if not api_key:
        raise ValueError("OPENAI_API_KEY not configured")

    client = OpenAI(api_key=api_key)

    with open(audio_path, 'rb') as audio_file:
        response = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="verbose_json",
            timestamp_granularities=["word"]
        )

    words = []
    if hasattr(response, 'words') and response.words:
        for word in response.words:
            words.append({
                'word': word.word,
                'start': word.start,
                'end': word.end
            })

    return words


def detect_gaps(words: list, min_gap_duration: float = 0.4) -> list:
    """
    Detect gaps (silences) between words.
    Returns list of gaps with start/end times.
    """
    gaps = []

    for i in range(len(words) - 1):
        gap_start = words[i]['end']
        gap_end = words[i + 1]['start']
        gap_duration = gap_end - gap_start

        if gap_duration >= min_gap_duration:
            gaps.append({
                'start': gap_start,
                'end': gap_end,
                'duration': gap_duration
            })

    return gaps


def analyze_video_for_gaps(video_path: str, start_time: float = None, end_time: float = None, min_gap_duration: float = 0.4) -> dict:
    """
    Analyze a video (or region of video) for gaps/silences.
    Returns word timestamps and detected gaps.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        # If analyzing a region, extract that region first
        if start_time is not None and end_time is not None:
            region_path = os.path.join(temp_dir, 'region.mp4')
            cmd = [
                'ffmpeg', '-y',
                '-i', video_path,
                '-ss', str(start_time),
                '-to', str(end_time),
                '-c', 'copy',
                region_path
            ]
            subprocess.run(cmd, capture_output=True)
            analyze_path = region_path
            time_offset = start_time
        else:
            analyze_path = video_path
            time_offset = 0

        # Extract audio
        audio_path = os.path.join(temp_dir, 'audio.mp3')
        if not extract_audio(analyze_path, audio_path):
            raise ValueError("Failed to extract audio from video")

        # Transcribe
        words = transcribe_audio(audio_path)

        # Adjust timestamps if we analyzed a region
        if time_offset > 0:
            for word in words:
                word['start'] += time_offset
                word['end'] += time_offset

        # Detect gaps
        gaps = detect_gaps(words, min_gap_duration)

        return {
            'words': words,
            'gaps': gaps,
            'total_gap_time': sum(g['duration'] for g in gaps),
            'gap_count': len(gaps)
        }


def remove_gaps_from_region(
    video_path: str,
    region_start: float,
    region_end: float,
    gaps: list,
    padding: float = 0.05
) -> str:
    """
    Remove gaps from a specific region of the video.
    Returns base64 encoded video of the region with gaps removed.
    """
    # Filter gaps to only those within our region
    region_gaps = [
        g for g in gaps
        if g['start'] >= region_start and g['end'] <= region_end
    ]

    if not region_gaps:
        # No gaps to remove, just return the region as-is
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = os.path.join(temp_dir, 'output.mp4')
            cmd = [
                'ffmpeg', '-y',
                '-i', video_path,
                '-ss', str(region_start),
                '-to', str(region_end),
                '-c:v', 'libx264',
                '-c:a', 'aac',
                output_path
            ]
            subprocess.run(cmd, capture_output=True)

            with open(output_path, 'rb') as f:
                return base64.b64encode(f.read()).decode('utf-8')

    # Build segments (speech parts between gaps)
    segments = []
    current_start = region_start

    for gap in sorted(region_gaps, key=lambda x: x['start']):
        # Add speech segment before this gap
        segment_end = gap['start'] - padding
        if segment_end > current_start:
            segments.append({
                'start': current_start,
                'end': segment_end
            })
        current_start = gap['end'] + padding

    # Add final segment after last gap
    if current_start < region_end:
        segments.append({
            'start': current_start,
            'end': region_end
        })

    if not segments:
        raise ValueError("No speech segments found in region")

    with tempfile.TemporaryDirectory() as temp_dir:
        # Extract each segment
        segment_files = []
        for i, seg in enumerate(segments):
            seg_path = os.path.join(temp_dir, f'segment_{i}.mp4')
            cmd = [
                'ffmpeg', '-y',
                '-i', video_path,
                '-ss', str(seg['start']),
                '-to', str(seg['end']),
                '-c:v', 'libx264',
                '-c:a', 'aac',
                seg_path
            ]
            subprocess.run(cmd, capture_output=True)
            segment_files.append(seg_path)

        # Create concat file
        concat_path = os.path.join(temp_dir, 'concat.txt')
        with open(concat_path, 'w') as f:
            for seg_file in segment_files:
                f.write(f"file '{seg_file}'\n")

        # Concatenate segments
        output_path = os.path.join(temp_dir, 'output.mp4')
        cmd = [
            'ffmpeg', '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', concat_path,
            '-c:v', 'libx264',
            '-c:a', 'aac',
            output_path
        ]
        subprocess.run(cmd, capture_output=True)

        with open(output_path, 'rb') as f:
            return base64.b64encode(f.read()).decode('utf-8')


def slice_video(video_path: str, cuts: list) -> list:
    """
    Slice video at specified cut points.

    Args:
        video_path: Path to the video file
        cuts: List of cut points in seconds, e.g., [10.5, 25.0, 40.0]
               Creates segments: [0, 10.5], [10.5, 25.0], [25.0, 40.0], [40.0, end]

    Returns:
        List of base64 encoded video segments
    """
    duration = get_video_duration(video_path)

    # Build segment boundaries
    boundaries = [0] + sorted(cuts) + [duration]
    segments = []

    for i in range(len(boundaries) - 1):
        start = boundaries[i]
        end = boundaries[i + 1]

        # Skip tiny segments
        if end - start < 0.1:
            continue

        segments.append({
            'index': len(segments),
            'start': start,
            'end': end,
            'duration': end - start
        })

    # Export each segment
    results = []
    with tempfile.TemporaryDirectory() as temp_dir:
        for seg in segments:
            output_path = os.path.join(temp_dir, f'segment_{seg["index"]}.mp4')
            cmd = [
                'ffmpeg', '-y',
                '-i', video_path,
                '-ss', str(seg['start']),
                '-to', str(seg['end']),
                '-c:v', 'libx264',
                '-c:a', 'aac',
                output_path
            ]
            subprocess.run(cmd, capture_output=True)

            with open(output_path, 'rb') as f:
                video_data = base64.b64encode(f.read()).decode('utf-8')

            results.append({
                'index': seg['index'],
                'start': seg['start'],
                'end': seg['end'],
                'duration': seg['duration'],
                'video_data': video_data
            })

    return results


def export_with_cuts_removed(video_path: str, cuts_to_remove: list) -> str:
    """
    Export video with specified segments removed.

    Args:
        video_path: Path to the video file
        cuts_to_remove: List of [start, end] pairs to remove

    Returns:
        Base64 encoded video with cuts removed
    """
    duration = get_video_duration(video_path)

    # Sort cuts by start time
    cuts_to_remove = sorted(cuts_to_remove, key=lambda x: x[0])

    # Build segments to keep
    segments_to_keep = []
    current_pos = 0

    for cut_start, cut_end in cuts_to_remove:
        if cut_start > current_pos:
            segments_to_keep.append({
                'start': current_pos,
                'end': cut_start
            })
        current_pos = max(current_pos, cut_end)

    # Add final segment
    if current_pos < duration:
        segments_to_keep.append({
            'start': current_pos,
            'end': duration
        })

    if not segments_to_keep:
        raise ValueError("No segments to keep after cuts")

    with tempfile.TemporaryDirectory() as temp_dir:
        # Extract each segment
        segment_files = []
        for i, seg in enumerate(segments_to_keep):
            seg_path = os.path.join(temp_dir, f'segment_{i}.mp4')
            cmd = [
                'ffmpeg', '-y',
                '-i', video_path,
                '-ss', str(seg['start']),
                '-to', str(seg['end']),
                '-c:v', 'libx264',
                '-c:a', 'aac',
                seg_path
            ]
            subprocess.run(cmd, capture_output=True)
            segment_files.append(seg_path)

        # Create concat file
        concat_path = os.path.join(temp_dir, 'concat.txt')
        with open(concat_path, 'w') as f:
            for seg_file in segment_files:
                f.write(f"file '{seg_file}'\n")

        # Concatenate
        output_path = os.path.join(temp_dir, 'output.mp4')
        cmd = [
            'ffmpeg', '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', concat_path,
            '-c:v', 'libx264',
            '-c:a', 'aac',
            output_path
        ]
        subprocess.run(cmd, capture_output=True)

        with open(output_path, 'rb') as f:
            return base64.b64encode(f.read()).decode('utf-8')


def export_segments(video_path: str, segments: list) -> str:
    """
    Export video by concatenating specified segments.

    Args:
        video_path: Path to the video file
        segments: List of {'start': float, 'end': float} dicts

    Returns:
        Base64 encoded concatenated video
    """
    if not segments:
        raise ValueError("No segments provided")

    # Sort by start time
    segments = sorted(segments, key=lambda x: x['start'])

    with tempfile.TemporaryDirectory() as temp_dir:
        # Extract each segment
        segment_files = []
        for i, seg in enumerate(segments):
            seg_path = os.path.join(temp_dir, f'segment_{i}.mp4')
            cmd = [
                'ffmpeg', '-y',
                '-i', video_path,
                '-ss', str(seg['start']),
                '-to', str(seg['end']),
                '-c:v', 'libx264',
                '-c:a', 'aac',
                seg_path
            ]
            subprocess.run(cmd, capture_output=True)
            segment_files.append(seg_path)

        # Create concat file
        concat_path = os.path.join(temp_dir, 'concat.txt')
        with open(concat_path, 'w') as f:
            for seg_file in segment_files:
                f.write(f"file '{seg_file}'\n")

        # Concatenate
        output_path = os.path.join(temp_dir, 'output.mp4')
        cmd = [
            'ffmpeg', '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', concat_path,
            '-c:v', 'libx264',
            '-c:a', 'aac',
            output_path
        ]
        subprocess.run(cmd, capture_output=True)

        with open(output_path, 'rb') as f:
            return base64.b64encode(f.read()).decode('utf-8')
