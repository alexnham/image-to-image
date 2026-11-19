import { expect, it } from "vitest";
import { ownsBlobPath } from "./blob-path";
it("only accepts literal paths within the exact owner or project prefix", () => {
  expect(ownsBlobPath("user/project/mask-abc.png", "user/project")).toBe(true);
  expect(ownsBlobPath("user/upload-AbC.jpg", "user")).toBe(true);
  for (const path of [
    "user-other/a.png",
    "user/../other/a.png",
    "user/%2e%2e/other.png",
    "user/project/../../other.png",
    "user\\other.png",
    "user/project/a.png?x=1",
    "https://example.com/user/project/a.png",
    "user//a.png",
  ])
    expect(ownsBlobPath(path, "user")).toBe(false);
  expect(ownsBlobPath("user/project-other/a.png", "user/project")).toBe(false);
});
