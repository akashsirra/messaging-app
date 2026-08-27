// Lightweight client-side sentiment scorer — no server call needed.
// Scores recent messages and maps the average mood to a theme color.

const POSITIVE_WORDS = [
  "love", "great", "awesome", "happy", "haha", "lol", "thanks", "yay",
  "good", "nice", "amazing", "excited", "glad", "yes", "perfect", "beautiful"
];

const NEGATIVE_WORDS = [
  "sad", "angry", "hate", "bad", "sorry", "ugh", "no", "worried",
  "annoyed", "tired", "sick", "cry", "upset", "mad", "terrible", "awful"
];

const POSITIVE_EMOJI = ["😂", "😊", "😍", "🎉", "❤️", "👍", "😁", "🥳"];
const NEGATIVE_EMOJI = ["😢", "😡", "💔", "😞", "😭", "😤", "😔"];

function scoreMessage(text) {
  if (!text) return 0;
  const lower = text.toLowerCase();
  let score = 0;

  POSITIVE_WORDS.forEach((w) => {
    if (lower.includes(w)) score += 1;
  });
  NEGATIVE_WORDS.forEach((w) => {
    if (lower.includes(w)) score -= 1;
  });
  POSITIVE_EMOJI.forEach((e) => {
    if (text.includes(e)) score += 1;
  });
  NEGATIVE_EMOJI.forEach((e) => {
    if (text.includes(e)) score -= 1;
  });

  // Exclamation marks nudge positive slightly, lots of caps nudges negative (shouting)
  if (/!{1,}/.test(text)) score += 0.3;
  if (text.length > 6 && text === text.toUpperCase() && /[A-Z]/.test(text)) score -= 0.5;

  return score;
}

// Compute average mood score from the last N messages (default 8)
export function getMoodScore(messages, count = 8) {
  if (!messages || messages.length === 0) return 0;
  const recent = messages.slice(-count);
  const total = recent.reduce((sum, m) => sum + scoreMessage((m.type && m.type !== "text") ? "" : (m.content || "")), 0);
  return total / recent.length;
}

// Map a mood score (roughly -2 to +2) to a background/accent color pair.
// Clamped and smoothly interpolated between three anchor moods.
export function moodToColors(score) {
  const clamped = Math.max(-2, Math.min(2, score));

  // Anchors: negative (cool blue-grey), neutral (default dark), positive (warm amber-pink)
  const negative = { bg: "#1a2233", accent: "#5b7fd6" };
  const neutral  = { bg: "#161616", accent: "#8a8a8a" };
  const positive = { bg: "#2e1a2b", accent: "#e0708c" };

  function lerp(a, b, t) {
    return Math.round(a + (b - a) * t);
  }

  function lerpColor(hexA, hexB, t) {
    const a = hexA.match(/\w\w/g).map((h) => parseInt(h, 16));
    const b = hexB.match(/\w\w/g).map((h) => parseInt(h, 16));
    const r = lerp(a[0], b[0], t);
    const g = lerp(a[1], b[1], t);
    const bl = lerp(a[2], b[2], t);
    return `rgb(${r}, ${g}, ${bl})`;
  }

  if (clamped < 0) {
    const t = (clamped + 2) / 2; // -2 -> 0, 0 -> 1
    return {
      bg: lerpColor(negative.bg, neutral.bg, t),
      accent: lerpColor(negative.accent, neutral.accent, t),
    };
  } else {
    const t = clamped / 2; // 0 -> 0, 2 -> 1
    return {
      bg: lerpColor(neutral.bg, positive.bg, t),
      accent: lerpColor(neutral.accent, positive.accent, t),
    };
  }
}
