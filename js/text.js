// Matches CJK Unified Ideographs + Extension A + numbers/letters (excluding whitespace and punctuation)
const CHAR_REGEX = /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFFa-zA-Z0-9]/g;

export const MIN_CHARS = 50;
export const MAX_CHARS = 3000;

/**
 * 計算有效字數（中文字元與英數，不含空白與標點符號）
 */
export function countValidChars(text) {
  if (!text) return 0;
  const matches = text.match(CHAR_REGEX);
  return matches ? matches.length : 0;
}

/**
 * 計算段落數（非空行）
 */
export function countParagraphs(text) {
  if (!text || !text.trim()) return 0;
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length;
}

/**
 * 若有效字數超過 maxChars，截斷至剛好 maxChars 個有效字元（保留中間標點與換行）
 */
export function truncateToMaxChars(text, maxChars = MAX_CHARS) {
  if (!text) return { text: '', truncated: false, count: 0 };
  let validCount = 0;
  let cutIndex = text.length;
  let truncated = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    CHAR_REGEX.lastIndex = 0;
    if (CHAR_REGEX.test(ch)) {
      validCount++;
      if (validCount > maxChars) {
        cutIndex = i;
        truncated = true;
        validCount = maxChars;
        break;
      }
    }
  }

  return {
    text: truncated ? text.slice(0, cutIndex) : text,
    truncated,
    count: validCount
  };
}

/**
 * 比對引用片段是否確實存在於學生原文中（忽略首尾空白）
 */
export function isQuoteInEssay(quote, essayText) {
  if (!quote || !essayText) return false;
  const cleanQuote = quote.trim();
  if (!cleanQuote) return false;
  if (essayText.includes(cleanQuote)) return true;

  // 退一步忽略空白與換行比對
  const normalize = (s) => s.replace(/\s+/g, '');
  return normalize(essayText).includes(normalize(cleanQuote));
}

/**
 * 格式化秒數為 MM:SS
 */
export function formatTimerSeconds(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * 學測國寫倒數計時器（預設 90 分鐘 = 5400 秒）
 */
export class ExamTimer {
  constructor({ durationSeconds = 90 * 60, onTick, onFinish } = {}) {
    this.defaultDuration = durationSeconds;
    this.remaining = durationSeconds;
    this.running = false;
    this.intervalId = null;
    this.onTick = onTick || (() => {});
    this.onFinish = onFinish || (() => {});
  }

  start() {
    if (this.running) return;
    if (this.remaining <= 0) {
      this.remaining = this.defaultDuration;
    }
    this.running = true;
    const lastStart = Date.now();
    const initialRemaining = this.remaining;

    this.intervalId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastStart) / 1000);
      this.remaining = Math.max(0, initialRemaining - elapsed);
      this.onTick(this.remaining, this.running);
      if (this.remaining <= 0) {
        this.pause();
        this.onFinish();
      }
    }, 250);
    this.onTick(this.remaining, this.running);
  }

  pause() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    this.onTick(this.remaining, this.running);
  }

  reset(newSeconds = this.defaultDuration) {
    this.pause();
    this.defaultDuration = newSeconds;
    this.remaining = newSeconds;
    this.onTick(this.remaining, this.running);
  }
}
