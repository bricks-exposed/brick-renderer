import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { FileLoader } from "./file-loader.js";

describe("PartLoader", function () {
  describe("caching", function () {
    it("should cache part loads", async function () {
      const accessFile = mock.fn(async (path) => path);
      const loader = new FileLoader(accessFile);

      const part1 = await loader.load("4-4edge.dat");
      const part2 = await loader.load("4-4edge.dat");

      // Should return the same instance
      assert.equal(part1, part2);

      // Should only call accessFile once per unique path (tries ldraw/parts and ldraw/p)
      // Second load should be fully cached
      assert.ok(accessFile.mock.calls.length <= 2);
    });

    it("should handle concurrent loads without duplication", async function () {
      const accessFile = mock.fn(async function (path) {
        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 10));
        return path;
      });

      const loader = new FileLoader(accessFile);

      // Load same file concurrently
      const [part1, part2, part3] = await Promise.all([
        loader.load("4-4edge.dat"),
        loader.load("4-4edge.dat"),
        loader.load("4-4edge.dat"),
      ]);

      // Should all return the same instance
      assert.equal(part1, part2);
      assert.equal(part2, part3);

      // Should only make one request per unique path despite concurrent calls
      // (tries ldraw/parts and ldraw/p)
      assert.ok(accessFile.mock.calls.length <= 2);
    });

    it("should cache requests by path to prevent duplicate fetches", async function () {
      const accessFile = mock.fn(async function (path) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return path;
      });

      const loader = new FileLoader(accessFile);

      // These will try multiple paths
      await Promise.all([
        loader.load("4-4edge.dat"),
        loader.load("4-4edge.dat"),
      ]);

      // Should cache the request for each path tried
      const paths = accessFile.mock.calls.map((call) => call.arguments[0]);
      const uniquePaths = new Set(paths);

      // Each unique path should only be requested once
      assert.equal(paths.length, uniquePaths.size);
    });
  });
});
