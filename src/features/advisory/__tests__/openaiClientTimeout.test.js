import { jest } from "@jest/globals";
import OpenAI from "openai";

process.env.OPENAI_TIMEOUT_MS = "200";
process.env.OPENAI_API_KEY = "test-key";

const { callOpenAI, __setOpenAIClientForTests } = await import(
  "../utils/llm/openaiClient.js"
);

function okResponse(json) {
  return new Response(
    JSON.stringify({
      output: [{ content: [{ type: "output_text", text: JSON.stringify(json) }] }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("callOpenAI timeout handling", () => {
  let errorSpy;
  let logSpy;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  test("a timed-out request is aborted, not left running", async () => {
    const signals = [];
    const hangingFetch = jest.fn(
      (_url, init) =>
        new Promise((_, reject) => {
          signals.push(init.signal);
          init.signal.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    );
    __setOpenAIClientForTests(
      new OpenAI({ apiKey: "test-key", fetch: hangingFetch }),
    );

    const result = await callOpenAI("prompt", { maxAttempts: 2 });

    expect(result).toBeNull();
    // One network call per attempt — no hidden SDK retries.
    expect(hangingFetch).toHaveBeenCalledTimes(2);
    expect(signals.every((s) => s.aborted)).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(
      "[Advisory] OpenAI attempt 1/2 failed:",
      "OpenAI timeout after 200ms",
    );
  });

  test("a slow first attempt is retried and the second result is used", async () => {
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(
        (_url, init) =>
          new Promise((_, reject) =>
            init.signal.addEventListener("abort", () =>
              reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
            ),
          ),
      )
      .mockImplementationOnce(async () => okResponse({ ok: true }));
    __setOpenAIClientForTests(new OpenAI({ apiKey: "test-key", fetch: fetchMock }));

    const result = await callOpenAI("prompt", { maxAttempts: 2 });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("non-timeout errors keep their original message", async () => {
    const fetchMock = jest.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: "bad key" } }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
    );
    __setOpenAIClientForTests(new OpenAI({ apiKey: "test-key", fetch: fetchMock }));

    const result = await callOpenAI("prompt", { maxAttempts: 1 });

    expect(result).toBeNull();
    expect(errorSpy.mock.calls[0][1]).toMatch(/401/);
  });
});
