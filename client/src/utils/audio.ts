let lootAudioContext: AudioContext | null = null;

export function playLootAlertChime() {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
    return;
  }

  try {
    lootAudioContext = lootAudioContext ?? new window.AudioContext();
    const ctx = lootAudioContext;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 880;

    const gain = ctx.createGain();
    gain.gain.value = 0.12;

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    oscillator.start(now);
    oscillator.stop(now + 0.3);
  } catch {
    // Ignore audio errors (browser autoplay restrictions, etc.)
  }
}
