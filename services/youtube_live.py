import os
import re
from googleapiclient.discovery import build

# Configure YouTube API
YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY")

youtube = None
if YOUTUBE_API_KEY:
    youtube = build('youtube', 'v3', developerKey=YOUTUBE_API_KEY)

def check_live_status(channel_id):
    """Check if a YouTube channel is currently live streaming."""
    if not youtube:
        return {"error": "YOUTUBE_API_KEY not configured", "is_live": False}

    try:
        # Request the channel's live streaming details
        request = youtube.search().list(
            part="snippet",
            channelId=channel_id,
            eventType="live",
            type="video"
        )
        response = request.execute()

        live_streams = []
        for video_data in response.get('items', []):
            video_id = video_data['id']['videoId']
            video_title = video_data['snippet']['title']
            video_url = f"https://www.youtube.com/watch?v={video_id}"
            thumbnail = video_data['snippet']['thumbnails'].get('high', {}).get('url', '')

            live_streams.append({
                "video_id": video_id,
                "title": video_title,
                "url": video_url,
                "thumbnail": thumbnail
            })

        return {
            "is_live": len(live_streams) > 0,
            "streams": live_streams,
            "channel_id": channel_id
        }

    except Exception as e:
        return {"error": str(e), "is_live": False}

def get_channel_info(channel_id):
    """Get basic channel information."""
    if not youtube:
        return {"error": "YOUTUBE_API_KEY not configured"}

    try:
        request = youtube.channels().list(
            part="snippet,statistics",
            id=channel_id
        )
        response = request.execute()

        if response.get('items'):
            channel = response['items'][0]
            return {
                "title": channel['snippet']['title'],
                "description": channel['snippet']['description'],
                "thumbnail": channel['snippet']['thumbnails'].get('high', {}).get('url', ''),
                "subscriber_count": channel['statistics'].get('subscriberCount', '0'),
                "video_count": channel['statistics'].get('videoCount', '0')
            }

        return {"error": "Channel not found"}

    except Exception as e:
        return {"error": str(e)}


def extract_channel_identifier(url):
    """
    Extract channel ID or handle from various YouTube URL formats.
    Returns: (identifier_type, identifier) tuple

    Supports:
    - youtube.com/channel/UC... (channel ID)
    - youtube.com/@handle (handle)
    - youtube.com/c/CustomName (custom URL)
    - youtube.com/user/Username (legacy username)
    """
    url = url.strip()

    # Channel ID format: /channel/UC...
    match = re.search(r'youtube\.com/channel/([a-zA-Z0-9_-]+)', url)
    if match:
        return ('id', match.group(1))

    # Handle format: /@handle
    match = re.search(r'youtube\.com/@([a-zA-Z0-9_-]+)', url)
    if match:
        return ('handle', match.group(1))

    # Custom URL format: /c/CustomName
    match = re.search(r'youtube\.com/c/([a-zA-Z0-9_-]+)', url)
    if match:
        return ('custom', match.group(1))

    # Legacy username format: /user/Username
    match = re.search(r'youtube\.com/user/([a-zA-Z0-9_-]+)', url)
    if match:
        return ('user', match.group(1))

    return (None, None)


def resolve_channel_id(identifier_type, identifier):
    """
    Resolve various channel identifiers to a channel ID.
    """
    if not youtube:
        return None

    if identifier_type == 'id':
        return identifier

    try:
        if identifier_type == 'handle':
            # Search for channel by handle
            request = youtube.search().list(
                part="snippet",
                q=f"@{identifier}",
                type="channel",
                maxResults=1
            )
            response = request.execute()
            if response.get('items'):
                return response['items'][0]['snippet']['channelId']

        elif identifier_type in ('custom', 'user'):
            # Search for channel by name
            request = youtube.search().list(
                part="snippet",
                q=identifier,
                type="channel",
                maxResults=1
            )
            response = request.execute()
            if response.get('items'):
                return response['items'][0]['snippet']['channelId']

    except Exception:
        pass

    return None


def get_channel_context(channel_url, num_recent_videos=2):
    """
    Get channel info and recent videos for context.

    Args:
        channel_url: YouTube channel URL
        num_recent_videos: Number of recent video titles to fetch (default 2)

    Returns:
        Dict with channel info and recent videos, or error
    """
    if not youtube:
        return {"error": "YOUTUBE_API_KEY not configured"}

    # Extract and resolve channel ID
    id_type, identifier = extract_channel_identifier(channel_url)
    if not id_type:
        return {"error": "Could not parse channel URL. Use format: youtube.com/@handle or youtube.com/channel/ID"}

    channel_id = resolve_channel_id(id_type, identifier)
    if not channel_id:
        return {"error": "Could not find channel. Check the URL and try again."}

    try:
        # Get channel info
        channel_request = youtube.channels().list(
            part="snippet,statistics,brandingSettings",
            id=channel_id
        )
        channel_response = channel_request.execute()

        if not channel_response.get('items'):
            return {"error": "Channel not found"}

        channel = channel_response['items'][0]
        snippet = channel['snippet']
        stats = channel['statistics']
        branding = channel.get('brandingSettings', {}).get('channel', {})

        # Get recent videos
        videos_request = youtube.search().list(
            part="snippet",
            channelId=channel_id,
            order="date",
            type="video",
            maxResults=num_recent_videos
        )
        videos_response = videos_request.execute()

        recent_videos = []
        for item in videos_response.get('items', []):
            recent_videos.append({
                "title": item['snippet']['title'],
                "video_id": item['id']['videoId']
            })

        return {
            "channel_id": channel_id,
            "name": snippet['title'],
            "description": snippet.get('description', ''),
            "thumbnail": snippet['thumbnails'].get('high', {}).get('url', ''),
            "subscriber_count": stats.get('subscriberCount', '0'),
            "video_count": stats.get('videoCount', '0'),
            "keywords": branding.get('keywords', ''),
            "recent_videos": recent_videos
        }

    except Exception as e:
        return {"error": f"Failed to fetch channel info: {str(e)}"}
