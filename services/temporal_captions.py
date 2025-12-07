# Temporal Caption Grouping Service
#
# This module handles intelligent caption segmentation based on temporal proximity.
# Instead of grouping words into fixed-size chunks, it prioritizes natural speech
# patterns by detecting silence breaks between words.
#
# Key concept: Words spoken in quick succession appear together on screen,
# while silence gaps force new caption segments regardless of word count.


def group_words_by_temporal_proximity(words, max_words_per_group=3, silence_threshold=0.5):
    """
    Group words into caption segments based on temporal proximity.

    This algorithm prioritizes natural speech rhythm over fixed word counts:
    - Words spoken in quick succession are grouped together
    - Silence gaps (pauses) force new caption segments immediately
    - The max_words_per_group acts as an upper limit, not a target

    Args:
        words: List of word dicts with 'word', 'start', 'end' timestamps
        max_words_per_group: Maximum words per caption (default 3)
                            Groups can have fewer words if silence breaks occur
        silence_threshold: Gap in seconds that forces a new segment (default 0.5s)
                          If time between word end and next word start exceeds this,
                          a new caption segment begins immediately

    Returns:
        List of caption groups, each containing:
        - text: The combined text of all words in the group
        - words: List of word dicts with timing and index info
        - start: Start time of the group (first word's start)
        - end: End time of the group (last word's end)

    Example:
        Given words with a 0.8s pause in the middle:
        ["Hello"(0.0-0.3), "world"(0.4-0.6), pause, "this"(1.4-1.6), "is"(1.7-1.8)]

        With max_words=3 and silence_threshold=0.5:
        - Group 1: "Hello world" (only 2 words due to silence break)
        - Group 2: "this is" (new group after silence)
    """
    if not words:
        return []

    captions = []
    current_group = []

    for i, word in enumerate(words):
        # Check if we should start a new group due to silence
        if current_group:
            previous_word = current_group[-1]
            gap = word['start'] - previous_word['end']

            # Force new group if silence exceeds threshold
            if gap > silence_threshold:
                # Finalize current group before starting new one
                captions.append(_build_caption_group(current_group))
                current_group = []

        # Check if current group is at max capacity
        if len(current_group) >= max_words_per_group:
            captions.append(_build_caption_group(current_group))
            current_group = []

        # Add word to current group
        current_group.append(word)

    # Don't forget the last group
    if current_group:
        captions.append(_build_caption_group(current_group))

    return captions


def _build_caption_group(words):
    """
    Build a caption group structure from a list of words.

    Args:
        words: List of word dicts with 'word', 'start', 'end'

    Returns:
        Caption group dict with text, words, start, end
    """
    caption_words = []
    for idx, word in enumerate(words):
        caption_words.append({
            "word": word['word'].strip(),
            "start": word['start'],
            "end": word['end'],
            "index_in_group": idx
        })

    return {
        "text": " ".join([w['word'] for w in caption_words]),
        "words": caption_words,
        "start": words[0]['start'],
        "end": words[-1]['end']
    }


def analyze_speech_gaps(words):
    """
    Analyze the gaps between words in a transcription.

    Useful for understanding the speech pattern and tuning the silence threshold.

    Args:
        words: List of word dicts with 'word', 'start', 'end'

    Returns:
        Dict with gap statistics:
        - gaps: List of all gaps (in seconds)
        - min_gap: Smallest gap
        - max_gap: Largest gap
        - avg_gap: Average gap
        - silence_breaks: List of indices where gaps exceed common threshold (0.5s)
    """
    if len(words) < 2:
        return {
            "gaps": [],
            "min_gap": 0,
            "max_gap": 0,
            "avg_gap": 0,
            "silence_breaks": []
        }

    gaps = []
    silence_breaks = []

    for i in range(1, len(words)):
        gap = words[i]['start'] - words[i-1]['end']
        gaps.append(gap)
        if gap > 0.5:
            silence_breaks.append(i)

    return {
        "gaps": gaps,
        "min_gap": min(gaps),
        "max_gap": max(gaps),
        "avg_gap": sum(gaps) / len(gaps),
        "silence_breaks": silence_breaks
    }
