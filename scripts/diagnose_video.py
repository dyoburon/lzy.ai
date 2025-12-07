#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Video Diagnostic Script

Analyzes a video file to identify corruption or encoding issues.
Usage: python diagnose_video.py <video_file>
"""

import subprocess
import sys
import os
import json


def run_command(cmd):
    """Run a command and return stdout, stderr, and return code."""
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.stdout, result.stderr, result.returncode


def check_file_exists(filepath):
    """Basic file checks."""
    print("\n" + "="*60)
    print("1. FILE CHECKS")
    print("="*60)

    if not os.path.exists(filepath):
        print(f"❌ File does not exist: {filepath}")
        return False

    file_size = os.path.getsize(filepath)
    print(f"✓ File exists: {filepath}")
    print(f"  Size: {file_size:,} bytes ({file_size / (1024*1024):.2f} MB)")

    if file_size == 0:
        print("❌ File is empty (0 bytes)")
        return False

    if file_size < 1000:
        print(f"⚠️  File is suspiciously small ({file_size} bytes)")

    return True


def check_ffprobe_format(filepath):
    """Check container format with ffprobe."""
    print("\n" + "="*60)
    print("2. CONTAINER FORMAT (ffprobe)")
    print("="*60)

    cmd = [
        'ffprobe', '-v', 'error',
        '-show_format',
        '-of', 'json',
        filepath
    ]

    stdout, stderr, returncode = run_command(cmd)

    if stderr:
        print(f"❌ FFprobe errors:\n{stderr}")

    if returncode != 0:
        print(f"❌ FFprobe failed with return code {returncode}")
        return None

    try:
        data = json.loads(stdout)
        fmt = data.get('format', {})

        print(f"✓ Format: {fmt.get('format_name', 'unknown')}")
        print(f"  Format long name: {fmt.get('format_long_name', 'unknown')}")
        print(f"  Duration: {fmt.get('duration', 'unknown')} seconds")
        print(f"  Bitrate: {fmt.get('bit_rate', 'unknown')} bps")
        print(f"  Number of streams: {fmt.get('nb_streams', 'unknown')}")

        return fmt
    except json.JSONDecodeError:
        print(f"❌ Could not parse ffprobe output")
        return None


def check_streams(filepath):
    """Check video and audio streams."""
    print("\n" + "="*60)
    print("3. STREAM ANALYSIS")
    print("="*60)

    cmd = [
        'ffprobe', '-v', 'error',
        '-show_streams',
        '-of', 'json',
        filepath
    ]

    stdout, stderr, returncode = run_command(cmd)

    if stderr:
        print(f"⚠️  Stream errors:\n{stderr}")

    try:
        data = json.loads(stdout)
        streams = data.get('streams', [])

        if not streams:
            print("❌ No streams found in file")
            return False

        video_streams = [s for s in streams if s.get('codec_type') == 'video']
        audio_streams = [s for s in streams if s.get('codec_type') == 'audio']

        print(f"Found {len(video_streams)} video stream(s), {len(audio_streams)} audio stream(s)")

        for i, vs in enumerate(video_streams):
            print(f"\n  Video Stream {i}:")
            print(f"    Codec: {vs.get('codec_name', 'unknown')}")
            print(f"    Resolution: {vs.get('width', '?')}x{vs.get('height', '?')}")
            print(f"    Frame rate: {vs.get('r_frame_rate', 'unknown')}")
            print(f"    Duration: {vs.get('duration', 'unknown')} seconds")
            print(f"    Frames: {vs.get('nb_frames', 'unknown')}")

            if vs.get('nb_frames') == '0':
                print("    ❌ Video stream has 0 frames!")

        for i, aus in enumerate(audio_streams):
            print(f"\n  Audio Stream {i}:")
            print(f"    Codec: {aus.get('codec_name', 'unknown')}")
            print(f"    Sample rate: {aus.get('sample_rate', 'unknown')}")
            print(f"    Channels: {aus.get('channels', 'unknown')}")
            print(f"    Duration: {aus.get('duration', 'unknown')} seconds")

        return True

    except json.JSONDecodeError:
        print(f"❌ Could not parse stream data")
        return False


def check_errors_verbose(filepath):
    """Run ffprobe with verbose error checking."""
    print("\n" + "="*60)
    print("4. DETAILED ERROR CHECK")
    print("="*60)

    # Check for any errors at warning level
    cmd = [
        'ffprobe', '-v', 'warning',
        '-i', filepath,
        '-f', 'null', '-'
    ]

    stdout, stderr, returncode = run_command(cmd)

    if stderr:
        print(f"Warnings/Errors found:\n{stderr}")
    else:
        print("✓ No warnings or errors detected")

    return returncode == 0


def check_moov_atom(filepath):
    """Check if moov atom is at the beginning (for streaming)."""
    print("\n" + "="*60)
    print("5. MOOV ATOM CHECK (MP4 streaming compatibility)")
    print("="*60)

    # Read first 32 bytes to check for ftyp/moov
    try:
        with open(filepath, 'rb') as f:
            header = f.read(32)

        # Check for ftyp box (should be at start of valid MP4)
        if b'ftyp' in header[:12]:
            print("✓ ftyp atom found at beginning (good)")
        else:
            print("⚠️  ftyp atom not at expected position")

        # Check if moov is near the beginning (within first 1MB suggests faststart)
        with open(filepath, 'rb') as f:
            first_mb = f.read(1024 * 1024)

        moov_pos = first_mb.find(b'moov')
        if moov_pos != -1:
            print(f"✓ moov atom found at byte {moov_pos} (within first 1MB - good for streaming)")
        else:
            print("⚠️  moov atom not in first 1MB (may be at end of file)")

            # Check full file for moov
            with open(filepath, 'rb') as f:
                content = f.read()
            moov_pos = content.find(b'moov')
            if moov_pos != -1:
                print(f"   Found moov at byte {moov_pos} ({moov_pos / (1024*1024):.2f} MB into file)")
            else:
                print("❌ moov atom not found in file - file may be truncated/corrupted")
                return False

        return True

    except Exception as e:
        print(f"❌ Error reading file: {e}")
        return False


def try_decode_frames(filepath, num_frames=10):
    """Try to actually decode some frames to verify playability."""
    print("\n" + "="*60)
    print(f"6. DECODE TEST (attempting to decode {num_frames} frames)")
    print("="*60)

    cmd = [
        'ffmpeg', '-v', 'error',
        '-i', filepath,
        '-vframes', str(num_frames),
        '-f', 'null', '-'
    ]

    stdout, stderr, returncode = run_command(cmd)

    if stderr:
        print(f"❌ Decode errors:\n{stderr}")
        return False

    if returncode == 0:
        print(f"✓ Successfully decoded {num_frames} frames")
        return True
    else:
        print(f"❌ Decode failed with return code {returncode}")
        return False


def try_full_decode(filepath):
    """Try to decode the entire file."""
    print("\n" + "="*60)
    print("7. FULL DECODE TEST (this may take a while...)")
    print("="*60)

    cmd = [
        'ffmpeg', '-v', 'error',
        '-i', filepath,
        '-f', 'null', '-'
    ]

    stdout, stderr, returncode = run_command(cmd)

    if stderr:
        print(f"❌ Decode errors:\n{stderr}")
        # Try to identify where the error occurs
        if 'Invalid data' in stderr:
            print("\n   → File contains invalid/corrupted data")
        if 'moov atom not found' in stderr:
            print("\n   → moov atom missing - file may be truncated")
        if 'End of file' in stderr or 'EOF' in stderr:
            print("\n   → Unexpected end of file - file may be truncated")
        return False

    if returncode == 0:
        print("✓ Full file decoded successfully")
        return True
    else:
        print(f"❌ Full decode failed with return code {returncode}")
        return False


def main():
    if len(sys.argv) < 2:
        print("Usage: python diagnose_video.py <video_file>")
        print("\nThis script analyzes a video file for corruption or encoding issues.")
        sys.exit(1)

    filepath = sys.argv[1]

    print("\n" + "#"*60)
    print("VIDEO DIAGNOSTIC REPORT")
    print("#"*60)
    print(f"Analyzing: {filepath}")

    issues = []

    # Run all checks
    if not check_file_exists(filepath):
        print("\n❌ Cannot proceed - file does not exist or is empty")
        sys.exit(1)

    fmt = check_ffprobe_format(filepath)
    if not fmt:
        issues.append("Container format unreadable")

    if not check_streams(filepath):
        issues.append("Stream analysis failed")

    check_errors_verbose(filepath)

    if not check_moov_atom(filepath):
        issues.append("moov atom issue")

    if not try_decode_frames(filepath):
        issues.append("Frame decode failed")

    # Ask if user wants full decode
    print("\n" + "-"*60)
    response = input("Run full decode test? This decodes the entire file. (y/n): ")
    if response.lower() == 'y':
        if not try_full_decode(filepath):
            issues.append("Full decode failed")

    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)

    if issues:
        print(f"❌ Found {len(issues)} issue(s):")
        for issue in issues:
            print(f"   • {issue}")
    else:
        print("✓ No major issues detected")

    print("\n" + "#"*60)


if __name__ == "__main__":
    main()
