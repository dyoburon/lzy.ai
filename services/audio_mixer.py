# Audio Mixer Service
#
# This service handles advanced audio processing for video shorts:
# - Audio source separation using Demucs (Meta's AI model)
# - Custom background music mixing
# - Volume control and balancing
# - Audio extraction and replacement
#
# Demucs separates audio into stems:
# - vocals: Voice/speech
# - drums: Percussion
# - bass: Bass instruments
# - other: Everything else (synths, guitars, etc.)
#
# For simplicity, we use 2-stem mode: vocals + accompaniment (music)

import os
import subprocess
import tempfile
import base64
import json
from pathlib import Path

# Check if demucs is available
DEMUCS_AVAILABLE = False
try:
    result = subprocess.run(['python', '-m', 'demucs', '--help'],
                          capture_output=True, text=True, timeout=10)
    DEMUCS_AVAILABLE = result.returncode == 0
except:
    pass


def check_demucs_status():
    """Check if Demucs is installed and available."""
    return {
        "available": DEMUCS_AVAILABLE,
        "message": "Demucs is ready" if DEMUCS_AVAILABLE else "Demucs not installed. Run: pip install demucs"
    }


def extract_audio_from_video(video_data_base64):
    """
    Extract audio track from a base64-encoded video.

    Args:
        video_data_base64: Base64 encoded video data

    Returns:
        Dict with audio_path or error
    """
    try:
        # Decode video to temp file
        video_data = base64.b64decode(video_data_base64)
        video_file = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
        video_file.write(video_data)
        video_file.close()

        # Create temp file for audio
        audio_file = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
        audio_file.close()

        # Extract audio using ffmpeg (WAV for best quality with Demucs)
        cmd = [
            'ffmpeg', '-y',
            '-i', video_file.name,
            '-vn',  # No video
            '-acodec', 'pcm_s16le',  # PCM 16-bit (WAV)
            '-ar', '44100',  # 44.1kHz sample rate
            '-ac', '2',  # Stereo
            audio_file.name
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        # Clean up video temp file
        os.unlink(video_file.name)

        if result.returncode != 0:
            if os.path.exists(audio_file.name):
                os.unlink(audio_file.name)
            return {"error": f"Audio extraction failed: {result.stderr}"}

        # Check if audio file has content
        if os.path.getsize(audio_file.name) < 1000:
            os.unlink(audio_file.name)
            return {"error": "Video has no audio track or audio is too short"}

        return {"audio_path": audio_file.name}

    except Exception as e:
        return {"error": f"Error extracting audio: {str(e)}"}


def separate_audio_stems(audio_path, output_dir=None):
    """
    Separate audio into vocals and music using Demucs.

    Args:
        audio_path: Path to audio file (WAV recommended)
        output_dir: Directory for output files (optional)

    Returns:
        Dict with paths to separated stems or error
    """
    if not DEMUCS_AVAILABLE:
        return {"error": "Demucs is not installed. Run: pip install demucs"}

    try:
        # Create output directory if not provided
        if output_dir is None:
            output_dir = tempfile.mkdtemp(prefix='demucs_')

        # Run Demucs with 2-stem separation (vocals + accompaniment)
        # Using htdemucs for best quality/speed balance
        cmd = [
            'python', '-m', 'demucs',
            '--two-stems', 'vocals',  # Separate into vocals and "no_vocals" (accompaniment)
            '-o', output_dir,
            '--mp3',  # Output as MP3 for smaller file sizes
            '--mp3-bitrate', '192',
            audio_path
        ]

        print(f"[audio_mixer] Running Demucs: {' '.join(cmd)}")

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)  # 5 min timeout

        if result.returncode != 0:
            return {"error": f"Demucs separation failed: {result.stderr}"}

        # Find the output files
        # Demucs creates: output_dir/htdemucs/audio_filename/vocals.mp3, no_vocals.mp3
        audio_name = Path(audio_path).stem
        model_output_dir = os.path.join(output_dir, 'htdemucs', audio_name)

        vocals_path = os.path.join(model_output_dir, 'vocals.mp3')
        music_path = os.path.join(model_output_dir, 'no_vocals.mp3')

        if not os.path.exists(vocals_path) or not os.path.exists(music_path):
            # Try alternate naming
            for root, dirs, files in os.walk(output_dir):
                for f in files:
                    if 'vocal' in f.lower():
                        vocals_path = os.path.join(root, f)
                    elif 'no_vocal' in f.lower() or 'accompaniment' in f.lower():
                        music_path = os.path.join(root, f)

        if not os.path.exists(vocals_path):
            return {"error": f"Vocals file not found. Demucs output: {result.stdout}"}

        if not os.path.exists(music_path):
            return {"error": f"Music file not found. Demucs output: {result.stdout}"}

        # Read and encode the separated audio files
        with open(vocals_path, 'rb') as f:
            vocals_data = base64.b64encode(f.read()).decode('utf-8')

        with open(music_path, 'rb') as f:
            music_data = base64.b64encode(f.read()).decode('utf-8')

        return {
            "success": True,
            "vocals": {
                "data": vocals_data,
                "path": vocals_path,
                "format": "mp3"
            },
            "music": {
                "data": music_data,
                "path": music_path,
                "format": "mp3"
            },
            "output_dir": output_dir
        }

    except subprocess.TimeoutExpired:
        return {"error": "Audio separation timed out. The audio may be too long."}
    except Exception as e:
        return {"error": f"Error separating audio: {str(e)}"}


def mix_audio_tracks(tracks, output_format='mp3'):
    """
    Mix multiple audio tracks together with volume control.

    Args:
        tracks: List of dicts with:
            - data: Base64 encoded audio OR path: file path
            - volume: Volume level 0.0 to 2.0 (1.0 = original)
            - delay: Start delay in seconds (optional)
        output_format: Output format (mp3, wav, aac)

    Returns:
        Dict with mixed audio as base64 or error
    """
    temp_files = []

    try:
        # Decode all tracks to temp files
        input_files = []
        for i, track in enumerate(tracks):
            if 'data' in track and track['data']:
                # Base64 data
                audio_data = base64.b64decode(track['data'])
                temp_file = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False)
                temp_file.write(audio_data)
                temp_file.close()
                temp_files.append(temp_file.name)
                input_files.append({
                    'path': temp_file.name,
                    'volume': track.get('volume', 1.0),
                    'delay': track.get('delay', 0)
                })
            elif 'path' in track and track['path'] and os.path.exists(track['path']):
                # File path
                input_files.append({
                    'path': track['path'],
                    'volume': track.get('volume', 1.0),
                    'delay': track.get('delay', 0)
                })

        if len(input_files) == 0:
            return {"error": "No valid audio tracks provided"}

        # Create output file
        output_file = tempfile.NamedTemporaryFile(suffix=f'.{output_format}', delete=False)
        output_file.close()
        temp_files.append(output_file.name)

        # Build ffmpeg filter for mixing
        # Using amix filter for combining multiple audio streams
        inputs = []
        filter_parts = []

        for i, track in enumerate(input_files):
            inputs.extend(['-i', track['path']])

            # Apply volume and delay
            delay_ms = int(track['delay'] * 1000)
            volume = track['volume']

            if delay_ms > 0:
                filter_parts.append(f"[{i}:a]adelay={delay_ms}|{delay_ms},volume={volume}[a{i}]")
            else:
                filter_parts.append(f"[{i}:a]volume={volume}[a{i}]")

        # Combine all processed streams
        stream_labels = ''.join([f'[a{i}]' for i in range(len(input_files))])
        filter_parts.append(f"{stream_labels}amix=inputs={len(input_files)}:duration=longest[out]")

        filter_complex = ';'.join(filter_parts)

        # Build ffmpeg command
        cmd = ['ffmpeg', '-y'] + inputs + [
            '-filter_complex', filter_complex,
            '-map', '[out]',
            '-acodec', 'libmp3lame' if output_format == 'mp3' else 'aac',
            '-b:a', '192k',
            output_file.name
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            return {"error": f"Audio mixing failed: {result.stderr}"}

        # Read and encode output
        with open(output_file.name, 'rb') as f:
            output_data = base64.b64encode(f.read()).decode('utf-8')

        return {
            "success": True,
            "audio_data": output_data,
            "format": output_format
        }

    except Exception as e:
        return {"error": f"Error mixing audio: {str(e)}"}
    finally:
        # Clean up temp files
        for f in temp_files:
            if os.path.exists(f):
                try:
                    os.unlink(f)
                except:
                    pass


def replace_video_audio(video_data_base64, audio_data_base64, audio_format='mp3'):
    """
    Replace the audio track in a video with new audio.

    Args:
        video_data_base64: Base64 encoded video
        audio_data_base64: Base64 encoded audio to use
        audio_format: Format of the input audio

    Returns:
        Dict with new video as base64 or error
    """
    temp_files = []

    try:
        # Decode video
        video_data = base64.b64decode(video_data_base64)
        video_file = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
        video_file.write(video_data)
        video_file.close()
        temp_files.append(video_file.name)

        # Decode audio
        audio_data = base64.b64decode(audio_data_base64)
        audio_file = tempfile.NamedTemporaryFile(suffix=f'.{audio_format}', delete=False)
        audio_file.write(audio_data)
        audio_file.close()
        temp_files.append(audio_file.name)

        # Create output file
        output_file = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
        output_file.close()
        temp_files.append(output_file.name)

        # Replace audio using ffmpeg
        # -c:v copy to avoid re-encoding video
        cmd = [
            'ffmpeg', '-y',
            '-i', video_file.name,
            '-i', audio_file.name,
            '-c:v', 'copy',  # Copy video stream without re-encoding
            '-map', '0:v:0',  # Take video from first input
            '-map', '1:a:0',  # Take audio from second input
            '-shortest',  # End when shortest stream ends
            '-c:a', 'aac',
            '-b:a', '192k',
            output_file.name
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            return {"error": f"Audio replacement failed: {result.stderr}"}

        # Read and encode output
        with open(output_file.name, 'rb') as f:
            output_data = base64.b64encode(f.read()).decode('utf-8')

        file_size = os.path.getsize(output_file.name)

        return {
            "success": True,
            "video_data": output_data,
            "file_size": file_size
        }

    except Exception as e:
        return {"error": f"Error replacing audio: {str(e)}"}
    finally:
        # Clean up temp files
        for f in temp_files:
            if os.path.exists(f):
                try:
                    os.unlink(f)
                except:
                    pass


def process_video_audio(video_data_base64, audio_options):
    """
    Full audio processing pipeline for a video.

    Args:
        video_data_base64: Base64 encoded video
        audio_options: Dict with processing options:
            - separate: Boolean - whether to separate audio into stems
            - use_vocals: Boolean - include vocals in output (default True)
            - use_music: Boolean - include original music in output (default True)
            - vocals_volume: Float - vocals volume 0.0-2.0 (default 1.0)
            - music_volume: Float - music volume 0.0-2.0 (default 1.0)
            - custom_audio: Base64 audio to mix in (optional)
            - custom_audio_volume: Float - custom audio volume (default 0.5)
            - fade_in: Float - fade in duration in seconds (default 0)
            - fade_out: Float - fade out duration in seconds (default 0)

    Returns:
        Dict with processed video or error
    """
    try:
        # Extract options with defaults
        separate = audio_options.get('separate', False)
        use_vocals = audio_options.get('use_vocals', True)
        use_music = audio_options.get('use_music', True)
        vocals_volume = audio_options.get('vocals_volume', 1.0)
        music_volume = audio_options.get('music_volume', 1.0)
        custom_audio = audio_options.get('custom_audio')
        custom_audio_volume = audio_options.get('custom_audio_volume', 0.5)

        # Validate volumes
        vocals_volume = max(0.0, min(2.0, vocals_volume))
        music_volume = max(0.0, min(2.0, music_volume))
        custom_audio_volume = max(0.0, min(2.0, custom_audio_volume))

        # If no separation needed and no custom audio, just return original
        if not separate and not custom_audio:
            return {
                "success": True,
                "video_data": video_data_base64,
                "message": "No audio changes requested"
            }

        # Extract audio from video
        extract_result = extract_audio_from_video(video_data_base64)
        if 'error' in extract_result:
            return extract_result

        original_audio_path = extract_result['audio_path']
        tracks_to_mix = []
        cleanup_paths = [original_audio_path]

        try:
            if separate:
                # Separate audio into stems
                separation_result = separate_audio_stems(original_audio_path)
                if 'error' in separation_result:
                    return separation_result

                # Add vocals if requested
                if use_vocals and vocals_volume > 0:
                    tracks_to_mix.append({
                        'path': separation_result['vocals']['path'],
                        'volume': vocals_volume
                    })

                # Add music if requested
                if use_music and music_volume > 0:
                    tracks_to_mix.append({
                        'path': separation_result['music']['path'],
                        'volume': music_volume
                    })

                # Track for cleanup
                if separation_result.get('output_dir'):
                    cleanup_paths.append(separation_result['output_dir'])
            else:
                # Use original audio
                if use_vocals or use_music:  # Either means use original
                    tracks_to_mix.append({
                        'path': original_audio_path,
                        'volume': max(vocals_volume, music_volume)
                    })

            # Add custom audio if provided
            if custom_audio:
                tracks_to_mix.append({
                    'data': custom_audio,
                    'volume': custom_audio_volume
                })

            # Mix all tracks
            if len(tracks_to_mix) == 0:
                # No audio - create silent video
                return {"error": "No audio tracks selected. Enable vocals, music, or add custom audio."}

            if len(tracks_to_mix) == 1 and 'path' in tracks_to_mix[0] and tracks_to_mix[0]['volume'] == 1.0:
                # Single track at full volume - just read it
                with open(tracks_to_mix[0]['path'], 'rb') as f:
                    mixed_audio_data = base64.b64encode(f.read()).decode('utf-8')
            else:
                # Mix multiple tracks
                mix_result = mix_audio_tracks(tracks_to_mix)
                if 'error' in mix_result:
                    return mix_result
                mixed_audio_data = mix_result['audio_data']

            # Replace video audio with mixed audio
            replace_result = replace_video_audio(video_data_base64, mixed_audio_data)
            if 'error' in replace_result:
                return replace_result

            return {
                "success": True,
                "video_data": replace_result['video_data'],
                "file_size": replace_result['file_size'],
                "audio_separated": separate,
                "vocals_included": use_vocals,
                "music_included": use_music,
                "custom_audio_added": bool(custom_audio)
            }

        finally:
            # Cleanup
            for path in cleanup_paths:
                if os.path.exists(path):
                    try:
                        if os.path.isdir(path):
                            import shutil
                            shutil.rmtree(path)
                        else:
                            os.unlink(path)
                    except:
                        pass

    except Exception as e:
        return {"error": f"Error processing video audio: {str(e)}"}


def separate_video_audio(video_data_base64):
    """
    Convenience function to separate a video's audio into stems.
    Returns the stems as base64 audio without modifying the video.

    Args:
        video_data_base64: Base64 encoded video

    Returns:
        Dict with vocals and music as base64, or error
    """
    try:
        # Extract audio
        extract_result = extract_audio_from_video(video_data_base64)
        if 'error' in extract_result:
            return extract_result

        audio_path = extract_result['audio_path']

        try:
            # Separate
            separation_result = separate_audio_stems(audio_path)
            if 'error' in separation_result:
                return separation_result

            # Return just the audio data
            return {
                "success": True,
                "vocals": separation_result['vocals']['data'],
                "music": separation_result['music']['data'],
                "format": "mp3"
            }

        finally:
            # Cleanup
            if os.path.exists(audio_path):
                os.unlink(audio_path)
            if separation_result and separation_result.get('output_dir'):
                import shutil
                try:
                    shutil.rmtree(separation_result['output_dir'])
                except:
                    pass

    except Exception as e:
        return {"error": f"Error separating video audio: {str(e)}"}
