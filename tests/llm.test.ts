import { describe, expect, it } from "vitest";
import { createOllamaExtractor, parseOllamaBaseUrl } from "@/lib/agent/llm/ollama";
import { understandRequest } from "@/lib/agent/understand";
import { jsonResponse } from "./helpers/fakeFetch";

const today = "2026-09-26";
const reply = (content: unknown) => jsonResponse({ message: { role: "assistant", content: typeof content === "string" ? content : JSON.stringify(content) } });
const goodFields = {
  origin_city: "Delhi",
  destination: null,
  travelers: 2,
  days: 7,
  budget_inr: null,
  budget_is_per_person: false,
  interests: ["nature", "food"],
  pace: "relaxed",
  start_date: null,
};

describe("local model (Ollama) extraction", () => {
  it("sends a schema-constrained, non-thinking request and returns validated fields", async () => {
    let sent: Record<string, unknown> = {};
    const extract = createOllamaExtractor({
      baseUrl: "http://localhost:11434",
      model: "qwen3:8b",
      fetchImpl: async (url, init) => {
        expect(url).toBe("http://localhost:11434/api/chat");
        sent = JSON.parse(String(init?.body));
        return reply(goodFields);
      },
    });
    const fields = await extract("hills with the missus for a week, greenery and good grub", today);
    expect(fields).toMatchObject({ travelers: 2, days: 7, interests: ["nature", "food"] });
    expect(sent).toMatchObject({ model: "qwen3:8b", stream: false, think: false });
    expect(sent.format).toHaveProperty("properties.interests");
    const messages = sent.messages as { role: string; content: string }[];
    expect(messages[1].content).toContain("<trip_request>");
  });

  it.each([
    ["non-JSON content", reply("Sure! Here are the details: Delhi, 7 days")],
    ["out-of-schema values", reply({ ...goodFields, interests: ["shopping"], pace: "turbo" })],
    ["an HTTP error", new Response("model not found", { status: 404 })],
    ["an unexpected envelope", jsonResponse({ response: "hi" })],
  ])("returns null on %s", async (_, response) => {
    const extract = createOllamaExtractor({ baseUrl: "http://localhost:11434", model: "qwen3:8b", fetchImpl: async () => response });
    expect(await extract("a week in the hills", today)).toBeNull();
  });

  it("returns null when Ollama isn't running", async () => {
    const extract = createOllamaExtractor({
      baseUrl: "http://localhost:11434",
      model: "qwen3:8b",
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });
    expect(await extract("a week in the hills", today)).toBeNull();
  });

  it("feeds model output through the same validation and labels who helped", async () => {
    const extract = createOllamaExtractor({ baseUrl: "http://localhost:11434", model: "qwen3:8b", fetchImpl: async () => reply({ ...goodFields, days: 90, travelers: 0 }) });
    const result = await understandRequest("off to the hills soon for a few days with a big group", { today, llm: { extract, label: "qwen3:8b (local)" } });
    expect(result.assistedBy).toBe("qwen3:8b (local)");
    expect(result.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["invalid-duration", "invalid-travelers"]));
  });

  it("only accepts plain http(s) base URLs", () => {
    expect(parseOllamaBaseUrl("http://localhost:11434/")).toBe("http://localhost:11434");
    expect(parseOllamaBaseUrl("file:///etc/passwd")).toBeNull();
    expect(parseOllamaBaseUrl("http://user:pass@host:11434")).toBeNull();
    expect(parseOllamaBaseUrl("not a url")).toBeNull();
  });
});

describe("model output needs evidence in the text", () => {
  const invented = { origin_city: null, destination: "Paris", travelers: 1, days: 1, budget_inr: 0, budget_is_per_person: false, interests: [], pace: "balanced" as const, start_date: "2026-10-01" };

  it("ignores values the traveller never mentioned", async () => {
    const result = await understandRequest("trip to Paris", { today, llm: { label: "test model", extract: async () => invented } });
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain("unsupported-destination");
    expect(codes).not.toContain("invalid-budget");
    expect(result.origins).toMatchObject({ travelers: "default", days: "default", budgetInr: "default", pace: "default", startDate: "default" });
  });

  it("accepts values the text supports", async () => {
    const result = await understandRequest("me and the missus, a week away, nothing too busy, around 40 thousand", {
      today,
      llm: { label: "test model", extract: async () => ({ ...invented, destination: null, travelers: 2, days: 7, budget_inr: 40_000, pace: "relaxed" as const }) },
    });
    expect(result.constraints).toMatchObject({ travelers: 2, days: 7, budgetInr: 40_000, pace: "relaxed" });
  });
});
