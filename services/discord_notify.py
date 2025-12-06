import requests

def send_discord_notification(bot_token, channel_id, message):
    """
    Send a message to a Discord channel using the bot token.

    This uses Discord's REST API directly instead of the full discord.py library
    for simple notification sending.
    """
    url = f"https://discord.com/api/v10/channels/{channel_id}/messages"

    headers = {
        "Authorization": f"Bot {bot_token}",
        "Content-Type": "application/json"
    }

    payload = {
        "content": message
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=10)

        if response.status_code == 200:
            return {
                "success": True,
                "message": "Notification sent successfully"
            }
        elif response.status_code == 401:
            return {
                "success": False,
                "error": "Invalid bot token. Check your DISCORD_BOT_TOKEN."
            }
        elif response.status_code == 404:
            return {
                "success": False,
                "error": "Channel not found. Check your DISCORD_YOUTUBE_CHANNEL_ID."
            }
        elif response.status_code == 403:
            return {
                "success": False,
                "error": "Bot doesn't have permission to send messages in this channel."
            }
        else:
            return {
                "success": False,
                "error": f"Discord API error: {response.status_code} - {response.text}"
            }

    except requests.exceptions.RequestException as e:
        return {
            "success": False,
            "error": f"Failed to connect to Discord: {str(e)}"
        }
