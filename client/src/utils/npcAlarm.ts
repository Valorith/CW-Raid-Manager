/**
 * NPC Respawn Notification Jingle
 * Plays a cheerful, uplifting melody until stopped.
 * Designed to work even when the tab is in the background.
 */

let alarmAudioContext: AudioContext | null = null;
let alarmIntervalId: number | null = null;
let melodyTimeoutIds: number[] = [];

// Cheerful jingle notes (frequencies in Hz)
// Playing a happy ascending arpeggio pattern
const JINGLE_NOTES = [
  { freq: 523.25, duration: 120 },  // C5
  { freq: 659.25, duration: 120 },  // E5
  { freq: 783.99, duration: 120 },  // G5
  { freq: 1046.50, duration: 200 }, // C6 (hold slightly longer)
  { freq: 783.99, duration: 100 },  // G5
  { freq: 1046.50, duration: 300 }, // C6 (finale note)
];

const JINGLE_VOLUME = 0.12;
const JINGLE_LOOP_DELAY = 2500; // ms between jingle repeats

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
    return null;
  }

  if (!alarmAudioContext) {
    alarmAudioContext = new window.AudioContext();
  }

  return alarmAudioContext;
}

function playNote(frequency: number, duration: number, startDelay: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine'; // Softer, more pleasant tone

    const gain = ctx.createGain();

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    const startTime = ctx.currentTime + startDelay / 1000;
    const durationSec = duration / 1000;

    // Set frequency
    oscillator.frequency.setValueAtTime(frequency, startTime);

    // Gentle envelope for a pleasant sound
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(JINGLE_VOLUME, startTime + 0.02);
    gain.gain.setValueAtTime(JINGLE_VOLUME, startTime + durationSec * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + durationSec);

    oscillator.start(startTime);
    oscillator.stop(startTime + durationSec);
  } catch {
    // Ignore audio errors
  }
}

function playJingle(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume context if suspended (browser autoplay policy)
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }

  // Play each note with appropriate timing
  let currentDelay = 0;
  for (const note of JINGLE_NOTES) {
    playNote(note.freq, note.duration, currentDelay);
    currentDelay += note.duration + 30; // Small gap between notes
  }
}

/**
 * Start the notification jingle. It will loop until stopNpcAlarm() is called.
 * The jingle will continue playing even if the tab is in the background.
 */
export function startNpcAlarm(): void {
  // Don't start if already playing
  if (alarmIntervalId !== null) {
    return;
  }

  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume context if suspended
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }

  // Play immediately
  playJingle();

  // Loop the jingle with a delay between plays
  alarmIntervalId = window.setInterval(() => {
    playJingle();
  }, JINGLE_LOOP_DELAY);
}

/**
 * Stop the notification jingle immediately.
 */
export function stopNpcAlarm(): void {
  if (alarmIntervalId !== null) {
    clearInterval(alarmIntervalId);
    alarmIntervalId = null;
  }

  // Clear any pending melody timeouts
  for (const timeoutId of melodyTimeoutIds) {
    clearTimeout(timeoutId);
  }
  melodyTimeoutIds = [];
}

/**
 * Check if the jingle is currently playing.
 */
export function isNpcAlarmPlaying(): boolean {
  return alarmIntervalId !== null;
}
