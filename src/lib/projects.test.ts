import { describe, expect, test } from "vitest";
import { MAX_INSTRUCTIONS, MAX_NAME, allProjects, findProject, newProjectId, remaining, sanitizeProject } from "./projects";

describe("sanitizeProject", () => {
  test("keeps valid fields and trims", () => {
    expect(sanitizeProject({ id: "p1", name: "  Docs  ", instructions: "Be brief.", cwd: " C:\\work " })).toEqual({ id: "p1", name: "Docs", instructions: "Be brief.", cwd: "C:\\work" });
  });
  test("rejects missing name, bad ids and junk", () => {
    expect(sanitizeProject({ id: "p1", name: " " })).toBeNull();
    expect(sanitizeProject({ id: "../x", name: "A" })).toBeNull();
    expect(sanitizeProject(null)).toBeNull();
    expect(sanitizeProject("x")).toBeNull();
  });
  test("clamps lengths and normalises empty folder to null", () => {
    const p = sanitizeProject({ id: "p", name: "n".repeat(500), instructions: "i".repeat(MAX_INSTRUCTIONS + 50), cwd: "  " })!;
    expect(p.name).toHaveLength(MAX_NAME);
    expect(p.instructions).toHaveLength(MAX_INSTRUCTIONS);
    expect(p.cwd).toBeNull();
  });
});

describe("collections", () => {
  test("allProjects drops invalid and duplicate entries", () => {
    const list = allProjects([{ id: "a", name: "A" }, { id: "a", name: "Dup" }, { name: "no id" }, 5]);
    expect(list.map((p) => p.name)).toEqual(["A"]);
  });
  test("newProjectId slugifies and avoids collisions", () => {
    expect(newProjectId("My Cool App!", [])).toBe("my-cool-app");
    expect(newProjectId("My Cool App!", ["my-cool-app"])).toBe("my-cool-app-2");
    expect(newProjectId("???", [])).toBe("project");
  });
  test("findProject and remaining", () => {
    expect(findProject([{ id: "a", name: "A" }], "a")?.name).toBe("A");
    expect(findProject([], "a")).toBeNull();
    expect(findProject([{ id: "a", name: "A" }], null)).toBeNull();
    expect(remaining("abc")).toBe(MAX_INSTRUCTIONS - 3);
  });
});
