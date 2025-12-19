/**
 * NPC Respawn Notification Alarm
 * Plays a looping alarm sound until stopped.
 * Designed to work even when the tab is in the background.
 */

let alarmAudioContext: AudioContext | null = null;
let alarmOscillator: OscillatorNode | null = null;
let alarmGain: GainNode | null = null;
let alarmIntervalId: number | null = null;

// Alarm pattern: alternating tones to create an attention-grabbing sound
const ALARM_FREQUENCY_HIGH = 880; // A5
const ALARM_FREQUENCY_LOW = 660;  // E5
const ALARM_VOLUME = 0.15;
const TONE_DURATION = 300; // ms per tone
const ALARM_CYCLE = 600; // ms per full cycle (high + low)

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
    return null;
  }

  if (!alarmAudioContext) {
    alarmAudioContext = new window.AudioContext();
  }

  return alarmAudioContext;
}

function playTone(frequency: number, duration: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume context if suspended (browser autoplay policy)
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }

  try {
    const oscillator = ctx.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;

    const gain = ctx.createGain();
    gain.gain.value = ALARM_VOLUME;

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    const durationSec = duration / 1000;

    // Quick fade in and out for each tone
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(ALARM_VOLUME, now + 0.02);
    gain.gain.setValueAtTime(ALARM_VOLUME, now + durationSec - 0.02);
    gain.gain.linearRampToValueAtTime(0, now + durationSec);

    oscillator.start(now);
    oscillator.stop(now + durationSec);
  } catch {
    // Ignore audio errors
  }
}

/**
 * Start the alarm sound. It will loop until stopNpcAlarm() is called.
 * The alarm will continue playing even if the tab is in the background.
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
  playTone(ALARM_FREQUENCY_HIGH, TONE_DURATION);

  let isHighTone = true;
  let lastPlayTime = Date.now();

  // Use setInterval for the looping alarm
  // This works better in background tabs than requestAnimationFrame
  alarmIntervalId = window.setInterval(() => {
    const now = Date.now();
    const elapsed = now - lastPlayTime;

    if (elapsed >= TONE_DURATION) {
      isHighTone = !isHighTone;
      playTone(isHighTone ? ALARM_FREQUENCY_HIGH : ALARM_FREQUENCY_LOW, TONE_DURATION);
      lastPlayTime = now;
    }
  }, 100); // Check frequently but only play when needed
}

/**
 * Stop the alarm sound immediately.
 */
export function stopNpcAlarm(): void {
  if (alarmIntervalId !== null) {
    clearInterval(alarmIntervalId);
    alarmIntervalId = null;
  }

  // Clean up any lingering audio nodes
  if (alarmOscillator) {
    try {
      alarmOscillator.stop();
    } catch {
      // Already stopped
    }
    alarmOscillator = null;
  }

  if (alarmGain) {
    alarmGain = null;
  }
}

/**
 * Check if the alarm is currently playing.
 */
export function isNpcAlarmPlaying(): boolean {
  return alarmIntervalId !== null;
}
