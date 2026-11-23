import { describe, expect, it } from "vitest";
import { assistantModels, buildAssistantRequest, ChatRequest, KNOWLEDGE, MAX_CHARS, MAX_TURNS, readAssistantReply, recentTurns } from "../src/lib/assistant";

type Body = { systemInstruction: { parts: { text: string }[] }; contents: { role: string; parts: { text: string }[] }[] };

describe("assistant request", () => {
  it("sends the rules and knowledge as the system instruction and maps roles for Gemini", () => {
    const req = buildAssistantRequest([
      { role: "user", text: "How do I analyse a tender?" },
      { role: "assistant", text: "Open /analyze." },
      { role: "user", text: "Thanks" },
    ]);
    const body = req.body as Body;
    expect(body.systemInstruction.parts[0].text).toContain(KNOWLEDGE);
    expect(body.systemInstruction.parts[0].text).toMatch(/never invent/i);
    expect(body.contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
  });

  it("keeps only recent turns, starts with the user and trims long messages", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", text: `m${i}` }));
    const turns = recentTurns(many);
    expect(turns.length).toBeLessThanOrEqual(MAX_TURNS);
    expect(turns[0].role).toBe("user");
    expect(turns.at(-1)!.text).toBe("m29");
    expect(recentTurns([{ role: "user", text: "x".repeat(MAX_CHARS + 500) }])[0].text).toHaveLength(MAX_CHARS);
    expect(recentTurns([{ role: "assistant", text: "hello" }])).toEqual([]);
  });

  it("tries the configured model, then a backup, with the right thinking settings", () => {
    expect(assistantModels(undefined)).toEqual(["gemini-3-flash-preview", "gemini-flash-latest", "gemini-flash-lite-latest", "gemini-3.5-flash-lite"]);
    expect(assistantModels("gemini-flash-latest")).toEqual(["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-3.5-flash-lite"]);
    const g3 = buildAssistantRequest([{ role: "user", text: "hi" }], "gemini-3-flash-preview").body.generationConfig as Record<string, unknown>;
    const g25 = buildAssistantRequest([{ role: "user", text: "hi" }], "gemini-2.5-flash").body.generationConfig as Record<string, unknown>;
    expect(g3.thinkingConfig).toBeDefined();
    expect(g25.thinkingConfig).toBeUndefined();
  });

  it("rejects empty or malformed chats", () => {
    expect(ChatRequest.safeParse({ messages: [] }).success).toBe(false);
    expect(ChatRequest.safeParse({ messages: [{ role: "system", text: "hi" }] }).success).toBe(false);
    expect(ChatRequest.safeParse({ messages: [{ role: "user", text: "   " }] }).success).toBe(false);
    expect(ChatRequest.safeParse({ messages: [{ role: "user", text: "What is EMD?" }] }).success).toBe(true);
  });
});

describe("assistant reply", () => {
  it("joins the answer text and skips thoughts", () => {
    const raw = { candidates: [{ content: { parts: [{ text: "planning", thought: true }, { text: "Open " }, { text: "/analyze." }] } }] };
    expect(readAssistantReply(raw)).toBe("Open /analyze.");
  });

  it("returns null when there is no answer", () => {
    expect(readAssistantReply({ candidates: [{ finishReason: "SAFETY" }] })).toBeNull();
    expect(readAssistantReply(null)).toBeNull();
  });
});
