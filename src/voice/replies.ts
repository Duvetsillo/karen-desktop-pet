import type { CaptureStatus, ChatMessage } from "../../shared/types";

/** Keep final replies until capture ends; never interrupt a reply with its successor. */
export class VoiceReplies {
  private pending: ChatMessage[] = [];
  private seen = new Set<string>();
  private running = false;
  private epoch = 0;
  constructor(
    private speak: (text: string) => Promise<void>,
    private state: () => { enabled: boolean; capture: CaptureStatus },
  ) {}
  enqueue(message: ChatMessage) {
    if (!this.state().enabled || message.role !== "assistant" || !message.text.trim() || this.seen.has(message.id)) return;
    this.seen.add(message.id);
    if (this.seen.size > 200) this.seen.delete(this.seen.values().next().value!);
    this.pending.push(message);
    this.pending = this.pending.slice(-8);
    this.resume();
  }
  resume() {
    if (this.running || !this.pending.length || !this.state().enabled || this.state().capture.phase !== "idle") return;
    const message = this.pending.shift()!;
    const epoch = this.epoch;
    this.running = true;
    const finished = () => {
      if (epoch !== this.epoch) return;
      this.running = false;
      this.resume();
    };
    void this.speak(message.text).then(finished, finished);
  }
  clear() {
    this.epoch++;
    this.pending = [];
    this.running = false;
  }
}

/** Short natural phrases let playback begin before the whole reply is generated. */
export function speechPhrases(text: string, limit = 180): string[] {
  const plain = text
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^[\s#>*+-]+/gm, "")
    .replace(/[*_`]/g, "")
    .trim().slice(0, 4096);
  const result: string[] = [];
  let phrase = "";
  for (const word of plain.split(/\s+/).filter(Boolean)) {
    if (phrase && phrase.length + word.length + 1 > limit) {
      result.push(phrase);
      phrase = "";
    }
    // Bound even a long URL-free word to the synthesis request size.
    for (let i = 0; i < word.length; i += limit) {
      const part = word.slice(i, i + limit);
      phrase = [phrase, part].filter(Boolean).join(" ");
      if (phrase.length >= limit || (phrase.length >= 40 && /[.!?…]$/.test(part))) {
        result.push(phrase);
        phrase = "";
      }
    }
  }
  if (phrase) result.push(phrase);
  return result;
}
