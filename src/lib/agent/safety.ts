import { LIMITS } from "./limits";

/**
 * Phrases that try to steer the planner itself rather than describe a trip.
 * Matching text is removed before parsing and never echoed back.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override)\b[^.!?\n]{0,40}\b(previous|prior|above|earlier|all|your|the)\b[^.!?\n]{0,30}\b(instructions?|rules?|prompts?|guidelines?|constraints?)\b[^.!?\n]*/gi,
  /\b(reveal|show|print|display|output|leak|tell me|give me)\b[^.!?\n]{0,40}\b(system prompt|hidden prompt|instructions|api[\s_-]?keys?|secrets?|env(ironment)? variables?|\.env|config(uration)?|credentials?|tokens?)\b[^.!?\n]*/gi,
  /\b(you are now|act as|pretend to be|roleplay as|new instructions?|developer mode|jailbreak)\b[^.!?\n]*/gi,
  /<\s*\/?\s*(script|iframe|img|svg|object|embed|style|system|assistant|user)\b[^>]*>/gi,
  /\b(javascript|data|vbscript):\S*/gi,
  /\b(rm\s+-rf|drop\s+table|select\s+\*\s+from|process\.env|require\(|eval\(|exec\()[^.!?\n]*/gi,
];

/** Control, zero-width and bidi-override characters that can hide instructions. */
export const HIDDEN_CHARACTERS = new RegExp(
  [
    [0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x7f],
    [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff],
  ]
    .map(([from, to]) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`)
    .reduce((cls, range) => cls + range, "[") + "]",
  "g",
);

export interface SanitizedText {
  text: string;
  truncated: boolean;
  injectionDetected: boolean;
}

/** Normalises user text and strips instruction-like content. */
export function sanitizeUserText(raw: string): SanitizedText {
  let text = raw
    .normalize("NFKC")
    // Remove control and zero-width characters that can hide instructions.
    .replace(HIDDEN_CHARACTERS, " ");

  let injectionDetected = false;
  for (const pattern of INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      injectionDetected = true;
      pattern.lastIndex = 0;
      text = text.replace(pattern, " ");
    }
  }

  text = text.replace(/\s+/g, " ").trim();
  const truncated = text.length > LIMITS.requestMaxChars;
  if (truncated) text = text.slice(0, LIMITS.requestMaxChars);
  return { text, truncated, injectionDetected };
}

export function containsInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}
