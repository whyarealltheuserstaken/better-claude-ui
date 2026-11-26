import { beforeEach, describe, expect, test } from "vitest";
import { app } from "./store.svelte";

describe("pages and Back", () => {
  beforeEach(() => app.go("home"));

  test("Back returns to the screen before the page", () => {
    app.go("usage");
    app.openPage("settings");
    expect(app.view).toBe("settings");
    app.back();
    expect(app.view).toBe("usage");
  });

  test("moving between pages still returns to the screen before the first one", () => {
    app.go("archive");
    app.openPage("settings");
    app.openPage("projects");
    app.openPage("settings");
    app.back();
    expect(app.view).toBe("archive");
  });

  test("Back does nothing on a normal screen", () => {
    app.go("usage");
    app.back();
    expect(app.view).toBe("usage");
  });
});
