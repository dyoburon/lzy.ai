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

interface ProcessedClip {
  moment: {
    start_time: string;
    end_time: string;
    title: string;
    reason: string;
    viral_score: number;
  };
  original_filename: string;
  processed: {
    success: boolean;
    video_data?: string;
    file_size?: number;
    dimensions?: { width: number; height: number };
    error?: string;
    captions_applied?: boolean;
    caption_error?: string;
  };
}

// Module-level variables - persist across navigation, cleared on refresh
let pendingClips: Clip[] | null = null;
let processedClips: ProcessedClip[] | null = null;

// Pending clips (from shorts page to region-selector)
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

// Processed clips (from region-selector to results page)
export function setProcessedClips(clips: ProcessedClip[]): void {
  processedClips = clips;
}

export function getProcessedClips(): ProcessedClip[] | null {
  return processedClips;
}

export function clearProcessedClips(): void {
  processedClips = null;
}

export function hasProcessedClips(): boolean {
  return processedClips !== null && processedClips.length > 0;
}
