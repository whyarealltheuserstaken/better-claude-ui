import { describe, expect, test } from "vitest";
import { dictationError, dictationSupported, mergeTranscript } from "./dictation";

describe("mergeTranscript", () => {
  test("appends spoken text to what was typed with one space", () => {
    expect(mergeTranscript("Hello", "world", "")).toBe("Hello world");
    expect(mergeTranscript("Hello ", "world", "")).toBe("Hello world");
  });
  test("works from an empty box and includes interim text", () => {
    expect(mergeTranscript("", "hi ", "there")).toBe("hi there");
  });
  test("nothing spoken leaves the text alone; extra whitespace is collapsed", () => {
    expect(mergeTranscript("keep", "", "")).toBe("keep");
    expect(mergeTranscript("", "  a   b  ", "")).toBe("a b");
  });
});

describe("dictationError", () => {
  test("gives actionable messages and stays quiet for a user abort", () => {
    expect(dictationError("not-allowed")).toMatch(/microphone/i);
    expect(dictationError("no-speech")).toMatch(/Didn't hear/);
    expect(dictationError("aborted")).toBe("");
    expect(dictationError("weird")).toMatch(/isn't available/);
  });
});

describe("dictationSupported", () => {
  test("is false where there is no speech API (jsdom)", () => {
    expect(dictationSupported()).toBe(false);
  });
});
