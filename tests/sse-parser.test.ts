import { describe, expect, it } from "vitest";
import { SseParser, type SseEvent } from "../src/checks/sse-parser.js";

describe("SseParser", () => {
  it("handles arbitrary chunk boundaries, CRLF, comments, and multiple events", () => {
    const events: SseEvent[] = [];
    const parser = new SseParser((event) => events.push(event));
    const input = ": heartbeat\r\nid: 7\r\nevent: message\r\ndata: {\"a\":\r\ndata: 1}\r\n\r\ndata: [DONE]\n\n";
    for (const character of input) parser.feed(character);
    parser.finish();
    expect(events).toEqual([
      { data: "{\"a\":\n1}", event: "message", id: "7" },
      { data: "[DONE]", id: "7" }
    ]);
  });

  it("dispatches a final event without a trailing blank line", () => {
    const events: SseEvent[] = [];
    const parser = new SseParser((event) => events.push(event));
    parser.feed("data: final");
    parser.finish();
    expect(events).toEqual([{ data: "final" }]);
  });

  it("ignores empty events and invalid IDs", () => {
    const events: SseEvent[] = [];
    const parser = new SseParser((event) => events.push(event));
    parser.feed("retry: 100\n\nid: bad\0id\ndata: ok\n\n");
    parser.finish();
    expect(events).toEqual([{ data: "ok" }]);
  });
});
