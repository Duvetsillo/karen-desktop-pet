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

/** A short first phrase reduces the first audio wait; later phrases keep cadence. */
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
    let remaining = word;
    while (remaining) {
      const bound = result.length ? limit : Math.min(limit, 64);
      const part = remaining.slice(0, bound);
      if (phrase && phrase.length + part.length + 1 > bound) {
        result.push(phrase);
        phrase = "";
        continue;
      }
      phrase = [phrase, part].filter(Boolean).join(" ");
      remaining = remaining.slice(part.length);
      if (phrase.length >= bound || (phrase.length >= (result.length ? 40 : 8) && /[.!?…]$/.test(part))) {
        result.push(phrase);
        phrase = "";
      }
    }
  }
  if (phrase) result.push(phrase);
  return result;
}
