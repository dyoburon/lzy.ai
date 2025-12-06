/**
 * In-memory store for video clips during the shorts creation flow.
 *
 * This avoids sessionStorage limits (~5MB) by keeping clips in memory.
 * Data persists across navigation but is cleared on page refresh.
 *
 * Typical usage: ~50-100MB for 3 clips (well within browser's 1-4GB heap limit)
 */

interface Clip {
  moment: {
    start_time: string;
    end_time: string;
    title: string;
    reason: string;
    viral_score: number;
  };
  clip_result: {
    success?: boolean;
    video_data?: string;
    filename?: string;
    duration_seconds?: number;
    file_size?: number;
    error?: string;
  };
}

// Module-level variable - persists across navigation, cleared on refresh
let pendingClips: Clip[] | null = null;

export function setPendingClips(clips: Clip[]): void {
  pendingClips = clips;
}

export function getPendingClips(): Clip[] | null {
  return pendingClips;
}

export function clearPendingClips(): void {
  pendingClips = null;
}

export function hasPendingClips(): boolean {
  return pendingClips !== null && pendingClips.length > 0;
}
