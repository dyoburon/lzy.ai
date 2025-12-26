import subprocess
import tempfile
import os
import base64


def concatenate_videos(video_path1: str, video_path2: str) -> dict:
    """
    Concatenate two videos together using ffmpeg.
    Returns the combined video as base64.
    """
    try:
        # Create temp file for output
        output_fd, output_path = tempfile.mkstemp(suffix='.mp4')
        os.close(output_fd)

        # Create concat list file
        list_fd, list_path = tempfile.mkstemp(suffix='.txt')
        with os.fdopen(list_fd, 'w') as f:
            f.write(f"file '{video_path1}'\n")
            f.write(f"file '{video_path2}'\n")

        try:
            # Re-encode both videos to ensure compatibility
            temp1_fd, temp1_path = tempfile.mkstemp(suffix='.mp4')
            temp2_fd, temp2_path = tempfile.mkstemp(suffix='.mp4')
            os.close(temp1_fd)
            os.close(temp2_fd)

            # Normalize both videos to same format
            for input_path, temp_path in [(video_path1, temp1_path), (video_path2, temp2_path)]:
                cmd = [
                    'ffmpeg', '-y', '-i', input_path,
                    '-c:v', 'libx264', '-preset', 'fast',
                    '-c:a', 'aac', '-ar', '44100', '-ac', '2',
                    '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2',
                    '-r', '30',
                    temp_path
                ]
                result = subprocess.run(cmd, capture_output=True, text=True)
                if result.returncode != 0:
                    return {"error": f"Failed to normalize video: {result.stderr}"}

            # Update list file with normalized videos
            with open(list_path, 'w') as f:
                f.write(f"file '{temp1_path}'\n")
                f.write(f"file '{temp2_path}'\n")

            # Concatenate using concat demuxer
            cmd = [
                'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
                '-i', list_path,
                '-c', 'copy',
                output_path
            ]

            result = subprocess.run(cmd, capture_output=True, text=True)

            if result.returncode != 0:
                return {"error": f"FFmpeg concatenation failed: {result.stderr}"}

            # Read output and encode as base64
            with open(output_path, 'rb') as f:
                video_data = base64.b64encode(f.read()).decode('utf-8')

            return {
                "video_data": video_data,
                "format": "mp4"
            }

        finally:
            # Cleanup temp files
            for path in [list_path, temp1_path, temp2_path, output_path]:
                if os.path.exists(path):
                    os.remove(path)

    except Exception as e:
        return {"error": str(e)}
