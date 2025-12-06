import os
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
