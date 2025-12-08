import discord
from discord.ext import commands, tasks
import os
from dotenv import load_dotenv
import asyncio
import requests
from flask import Flask, request, jsonify
import threading
import logging
from better_profanity import profanity
from googleapiclient.discovery import build

# --- Configuration ---
load_dotenv() # Load environment variables from .env

BOT_TOKEN = os.environ.get("DISCORD_BOT_TOKEN")
CHANNEL_ID_STR = os.environ.get("DISCORD_CHANNEL_ID")
CHANNEL_ID = int(CHANNEL_ID_STR) if CHANNEL_ID_STR else None  # Channel to listen/post messages
GAME_SERVER_URL = os.environ.get("GAME_SERVER_URL", "http://127.0.0.1:5000") # URL of your app.py Flask server
BOT_API_PORT = int(os.environ.get("DISCORD_BOT_API_PORT", 5002)) # Port for this bot's Flask API
SHARED_SECRET = os.environ.get("DISCORD_SHARED_SECRET", "default_secret_key") # Secret key for API security
YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY")
YOUTUBE_CHANNEL_ID = os.environ.get("YOUTUBE_CHANNEL_ID")
DISCORD_YOUTUBE_CHANNEL_ID_STR = os.environ.get("DISCORD_YOUTUBE_CHANNEL_ID")
DISCORD_YOUTUBE_CHANNEL_ID = int(DISCORD_YOUTUBE_CHANNEL_ID_STR) if DISCORD_YOUTUBE_CHANNEL_ID_STR else None

youtube = None
if YOUTUBE_API_KEY:
    youtube = build('youtube', 'v3', developerKey=YOUTUBE_API_KEY)

# --- Logging ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Profanity Filter Setup ---
profanity.load_censor_words() # Load the default word list
# Optional: Add custom words if needed
profanity.add_censor_words(['hitler'])

# --- Discord Bot Setup ---
intents = discord.Intents.default()
intents.messages = True
intents.message_content = True # Ensure message content intent is enabled in Discord Dev Portal
intents.guilds = True

bot = commands.Bot(command_prefix="!", intents=intents)

# --- Flask App Setup (for receiving messages from game server) ---
flask_app = Flask(__name__)

# Disable Flask's default logging to avoid duplicate logs
werkzeug_logger = logging.getLogger('werkzeug')
werkzeug_logger.setLevel(logging.ERROR)

@flask_app.route('/game_event', methods=['POST'])
def handle_game_event():
    """Receives events (like chat, player join) from the game server."""
    # Security check
    auth_secret = request.headers.get('X-Secret-Key')
    if auth_secret != SHARED_SECRET:
        logger.warning("Received unauthorized request to /game_event")
        return jsonify({"error": "Unauthorized"}), 403

    data = request.json
    message_type = data.get('type')
    payload = data.get('payload')

    if not message_type or not payload:
        logger.warning("Received invalid data on /game_event")
        return jsonify({"error": "Invalid data"}), 400

    # Censor and Sanitize content coming *from* the game before sending to Discord
    message_to_send = ""
    if message_type == 'chat':
        sender_name = payload.get('sender_name', 'Unknown')
        content = payload.get('content', '')

        # Censor first
        censored_sender = profanity.censor(sender_name)
        censored_content = profanity.censor(content)

        # Then sanitize for Discord formatting
        safe_sender = discord.utils.escape_markdown(discord.utils.escape_mentions(censored_sender))
        safe_content = discord.utils.escape_markdown(discord.utils.escape_mentions(censored_content))
        message_to_send = f"**{safe_sender}**: {safe_content}"
    elif message_type == 'player_join':
        player_name = payload.get('name', 'Someone')

        # Censor first
        censored_player_name = profanity.censor(player_name)

        # Then sanitize for Discord formatting
        safe_player_name = discord.utils.escape_markdown(discord.utils.escape_mentions(censored_player_name))
        message_to_send = f":arrow_right: *Player **{safe_player_name}** has joined the game.*"
    # Add more event types here if needed (remember to censor and sanitize!)

    if message_to_send:
        # Use asyncio.run_coroutine_threadsafe for thread safety with discord.py
        asyncio.run_coroutine_threadsafe(send_to_discord_channel(message_to_send), bot.loop)

    return jsonify({"status": "success"}), 200

# Track which livestreams we've already notified about (by video ID)
notified_livestreams = set()

@tasks.loop(minutes=5) # Check every 5 minutes
async def check_youtube_live():
    global notified_livestreams

    if not youtube or not YOUTUBE_CHANNEL_ID or not DISCORD_YOUTUBE_CHANNEL_ID:
        return

    try:
        # Request the channel's live streaming details
        request = youtube.search().list(
            part="snippet",
            channelId=YOUTUBE_CHANNEL_ID,
            eventType="live",
            type="video"
        )
        response = request.execute()

        # Get current live video IDs
        current_live_ids = set()

        for video_data in response.get('items', []):
            video_id = video_data['id']['videoId']
            current_live_ids.add(video_id)

            # Only notify if we haven't notified about this stream yet
            if video_id not in notified_livestreams:
                video_title = video_data['snippet']['title']
                video_url = f"https://www.youtube.com/watch?v={video_id}"

                message = f"🔴 **I am now LIVE!**\n\n**{video_title}**\n{video_url}"

                await send_youtube_notification(message)
                notified_livestreams.add(video_id)
                logger.info(f"Notified about new livestream: {video_id}")

        # Clean up: remove IDs that are no longer live (stream ended)
        ended_streams = notified_livestreams - current_live_ids
        if ended_streams:
            notified_livestreams -= ended_streams
            logger.info(f"Cleared ended livestreams from tracking: {ended_streams}")

    except Exception as e:
        logger.error(f"Error checking YouTube status: {e}")

@check_youtube_live.before_loop
async def before_check_live():
    await bot.wait_until_ready()

async def send_youtube_notification(message):
    """Sends YouTube live notification to the dedicated YouTube Discord channel."""
    try:
        channel = bot.get_channel(DISCORD_YOUTUBE_CHANNEL_ID)
        if channel:
            await channel.send(message)
            logger.info(f"Sent YouTube notification to Discord channel {DISCORD_YOUTUBE_CHANNEL_ID}")
        else:
            logger.error(f"Could not find Discord YouTube channel with ID {DISCORD_YOUTUBE_CHANNEL_ID}")
    except Exception as e:
        logger.error(f"Error sending YouTube notification to Discord: {e}")

async def send_to_discord_channel(message):
    """Sends a message to the configured Discord channel."""
    try:
        channel = bot.get_channel(CHANNEL_ID)
        if channel:
            await channel.send(message)
            logger.info(f"Sent message to Discord channel {CHANNEL_ID}")
        else:
            logger.error(f"Could not find Discord channel with ID {CHANNEL_ID}")
    except Exception as e:
        logger.error(f"Error sending message to Discord: {e}")

# --- Discord Bot Events ---
@bot.event
async def on_ready():
    logger.info(f'Discord bot logged in as {bot.user.name}')
    if CHANNEL_ID:
        logger.info(f'Monitoring channel ID: {CHANNEL_ID}')
        logger.info(f'Game server URL: {GAME_SERVER_URL}')
    logger.info(f'Flask API running on port {BOT_API_PORT}')

    # Start the YouTube loop
    if YOUTUBE_API_KEY and YOUTUBE_CHANNEL_ID and DISCORD_YOUTUBE_CHANNEL_ID:
        if not check_youtube_live.is_running():
            check_youtube_live.start()
            logger.info(f"YouTube live check started. Notifications will go to channel {DISCORD_YOUTUBE_CHANNEL_ID}")
    else:
        logger.warning("YouTube API Key, YouTube Channel ID, or Discord YouTube Channel ID missing. Live check skipped.")

@bot.event
async def on_message(message):
    """Handles messages received from Discord."""
    # Ignore messages from the bot itself
    if message.author == bot.user:
        return

    # Only process messages from the designated channel (if configured)
    if CHANNEL_ID and message.channel.id == CHANNEL_ID:
        logger.info(f"Received message from Discord channel {CHANNEL_ID}: '{message.content}' by {message.author.display_name}")
        # Censor the message content *before* sending to the game server
        censored_content = profanity.censor(message.content)
        # Pass the original message object but provide the censored content separately for sending
        await send_to_game_server(message, censored_content)

    # Allow processing commands if needed (optional)
    # await bot.process_commands(message)

async def send_to_game_server(message, content_to_send):
    """Sends a censored and sanitized message from Discord to the game server."""
    try:
        # Sanitize content further for Discord specifics (mentions, markdown)
        # Although censoring might remove some markdown/mentions, apply escapes just in case
        # CENSORING HAPPENS *BEFORE* this function is called now.
        sanitized_content = discord.utils.escape_markdown(content_to_send) # Use content_to_send
        sanitized_content = discord.utils.escape_mentions(sanitized_content)

        # Censor the author's display name as well
        censored_author = profanity.censor(message.author.display_name)

        payload = {
            'author': censored_author, # Send censored author name
            'content': sanitized_content # Send censored & sanitized content
        }
        headers = {
            'Content-Type': 'application/json',
            'X-Secret-Key': SHARED_SECRET
        }
        response = requests.post(f"{GAME_SERVER_URL}/discord_message", json=payload, headers=headers, timeout=5)
        response.raise_for_status()
        # Log the original content for debugging/context if needed, but be mindful of privacy
        logger.info(f"Sent censored message to game server from {message.author.display_name}") # Avoid logging the raw message if sensitive

        await message.add_reaction('🚀')
    except (requests.exceptions.RequestException, Exception) as e:
        logger.error(f"Error sending message to game server: {e}")
        try:
            await message.add_reaction('🔴')
        except discord.HTTPException as reaction_error:
             logger.error(f"Failed to add error reaction: {reaction_error}")

# --- Main Execution ---
def run_flask():
    """Runs the Flask app in a separate thread."""
    try:
        # Use '0.0.0.0' to make it accessible externally if needed
        # Explicitly disable debug and reloader for threaded execution
        flask_app.run(host='0.0.0.0', port=BOT_API_PORT, debug=False, use_reloader=False)
    except Exception as e:
        logger.error(f"Flask server failed: {e}")

if __name__ == "__main__":
    if not BOT_TOKEN:
        logger.error("Error: DISCORD_BOT_TOKEN must be set in environment variables or .env file.")
    else:
        if not CHANNEL_ID:
            logger.warning("DISCORD_CHANNEL_ID not set. Game server integration disabled.")

        # Start Flask in a separate thread
        flask_thread = threading.Thread(target=run_flask, daemon=True)
        flask_thread.start()

        # Start the Discord bot
        try:
            bot.run(BOT_TOKEN)
        except discord.LoginFailure:
            logger.error("Discord login failed. Check your BOT_TOKEN.")
        except Exception as e:
            logger.error(f"An error occurred running the Discord bot: {e}")
