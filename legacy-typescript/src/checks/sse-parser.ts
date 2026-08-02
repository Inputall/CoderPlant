export interface SseEvent {
  data: string;
  event?: string;
  id?: string;
}

export class SseParser {
  private buffer = "";
  private dataLines: string[] = [];
  private eventName: string | undefined;
  private eventId: string | undefined;

  constructor(private readonly onEvent: (event: SseEvent) => void) {}

  feed(chunk: string): void {
    this.buffer += chunk;
    this.consumeLines(false);
  }

  finish(): void {
    this.consumeLines(true);
    this.dispatch();
  }

  private consumeLines(final: boolean): void {
    while (this.buffer.length > 0) {
      const match = /[\r\n]/.exec(this.buffer);
      if (!match) {
        if (final) {
          this.processLine(this.buffer);
          this.buffer = "";
        }
        return;
      }

      const index = match.index;
      const delimiter = this.buffer[index]!;
      if (delimiter === "\r" && index === this.buffer.length - 1 && !final) {
        return;
      }
      const consume = delimiter === "\r" && this.buffer[index + 1] === "\n" ? 2 : 1;
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + consume);
      this.processLine(line);
    }
  }

  private processLine(line: string): void {
    if (line === "") {
      this.dispatch();
      return;
    }
    if (line.startsWith(":")) {
      return;
    }

    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }

    if (field === "data") {
      this.dataLines.push(value);
    } else if (field === "event") {
      this.eventName = value;
    } else if (field === "id" && !value.includes("\0")) {
      this.eventId = value;
    }
  }

  private dispatch(): void {
    if (this.dataLines.length === 0) {
      this.eventName = undefined;
      return;
    }

    const event: SseEvent = { data: this.dataLines.join("\n") };
    if (this.eventName !== undefined) {
      event.event = this.eventName;
    }
    if (this.eventId !== undefined) {
      event.id = this.eventId;
    }
    this.onEvent(event);
    this.dataLines = [];
    this.eventName = undefined;
  }
}
