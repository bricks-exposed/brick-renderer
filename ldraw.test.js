import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Part, File } from "./ldraw.js";

describe("Part rendering", function () {
  it("should render basic edges", function () {
    const file = new File(
      "test.dat",
      `
      0 Test Part
      2 24 0 0 0 1 0 0
      2 24 1 0 0 1 1 0
    `
    );
    const part = new Part(file, []);

    const { lines, triangles } = part.render();

    // Line 1: LDraw (0,0,0) to (1,0,0) → GPU [0,0,0] to [1,0,0]
    // Line 2: LDraw (1,0,0) to (1,1,0) → GPU [1,0,0] to [1,0,1]
    assert.deepEqual(
      lines,
      new Float32Array([0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1])
    );
    assert.equal(triangles.length, 0);
  });

  it("should map LDraw coordinates to GPU coordinates", function () {
    const file = new File(
      "test.dat",
      `
      0 Test
      2 24 0 1 0 0 2 0
    `
    );
    const part = new Part(file, []);

    const { lines } = part.render();

    // LDraw: (0, 1, 0) and (0, 2, 0)
    // Should map to GPU: (0, 0, 1) and (0, 0, 2)
    // Format: [x, z, y] for each vertex
    assert.deepEqual(lines, new Float32Array([0, 0, 1, 0, 0, 2]));
  });

  it("should render triangles", function () {
    const file = new File(
      "triangle.dat",
      `
      0 Triangle
      3 16 0 0 0 1 0 0 0 1 0
    `
    );
    const part = new Part(file, []);

    const { lines, triangles } = part.render();

    assert.equal(lines.length, 0);
    // Triangle vertices: (0,0,0), (1,0,0), (0,1,0)
    // Mapped to GPU [x,z,y]: (0,0,0), (1,0,0), (0,0,1)
    assert.deepEqual(triangles, new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]));
  });

  it("should render quadrilaterals as two triangles", function () {
    const file = new File(
      "quad.dat",
      `
      0 Quad
      4 16 0 0 0 1 0 0 1 1 0 0 1 0
    `
    );
    const part = new Part(file, []);

    const { triangles } = part.render();

    // Quad vertices: (0,0,0), (1,0,0), (1,1,0), (0,1,0)
    // Split into two triangles: [v0,v1,v2] and [v2,v3,v0]
    // Triangle 1: (0,0,0), (1,0,0), (1,1,0) -> GPU: (0,0,0), (1,0,0), (1,0,1)
    // Triangle 2: (1,1,0), (0,1,0), (0,0,0) -> GPU: (1,0,1), (0,0,1), (0,0,0)
    assert.deepEqual(
      triangles,
      new Float32Array([0, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 0, 0])
    );
  });

  it("should apply transformations", function () {
    const file = new File(
      "simple.dat",
      `
      0 Simple
      3 16 1 0 0 2 0 0 1 1 0
    `
    );
    const part = new Part(file, []);

    const { triangles } = part.render(
      // Scale by 2 in all dimensions
      { transformation: [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1] }
    );

    // Original vertices: (1,0,0), (2,0,0), (1,1,0)
    // Scaled by 2: (2,0,0), (4,0,0), (2,2,0)
    // Mapped to GPU [x,z,y]: (2,0,0), (4,0,0), (2,0,2)
    assert.deepEqual(triangles, new Float32Array([2, 0, 0, 4, 0, 0, 2, 0, 2]));
  });

  it("should handle inversion", function () {
    const file = new File(
      "tri.dat",
      `
      0 Triangle
      3 16 0 0 0 1 0 0 0 1 0
    `
    );
    const part = new Part(file, []);

    const normal = part.render({ invert: false });
    const inverted = part.render({ invert: true });

    // Normal: (0,0,0), (1,0,0), (0,1,0) -> GPU: (0,0,0), (1,0,0), (0,0,1)
    assert.deepEqual(
      normal.triangles,
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1])
    );

    // Inverted reverses coords before mapping: (0,1,0), (1,0,0), (0,0,0) -> GPU: (0,0,1), (1,0,0), (0,0,0)
    assert.deepEqual(
      inverted.triangles,
      new Float32Array([0, 0, 1, 1, 0, 0, 0, 0, 0])
    );
  });

  it("should render subparts with transformations", function () {
    const childFile = new File(
      "child.dat",
      `
      0 Child
      3 16 0 0 0 1 0 0 0 1 0
    `
    );
    const childPart = new Part(childFile, []);

    const parentFile = new File(
      "parent.dat",
      `
      0 Parent
      1 16 10 0 0 1 0 0 0 1 0 0 0 1 child.dat
    `
    );
    const parentPart = new Part(parentFile, [childPart]);

    const { triangles } = parentPart.render();

    // Child triangle at (0,0,0), (1,0,0), (0,1,0)
    // Translated by (10,0,0)
    // Becomes (10,0,0), (11,0,0), (10,1,0)
    // Mapped to GPU [x,z,y]: (10,0,0), (11,0,0), (10,0,1)
    assert.deepEqual(
      triangles,
      new Float32Array([10, 0, 0, 11, 0, 0, 10, 0, 1])
    );
  });

  it("should handle BFC INVERTNEXT", function () {
    const childFile = new File(
      "child.dat",
      `
      0 Child
      3 16 0 0 0 1 0 0 0 1 0
    `
    );
    const childPart = new Part(childFile, []);

    const parentFile = new File(
      "parent.dat",
      `
      0 Parent
      0 BFC INVERTNEXT
      1 16 0 0 0 1 0 0 0 1 0 0 0 1 child.dat
    `
    );
    const parentPart = new Part(parentFile, [childPart]);

    const result = parentPart.render();

    // Child triangle inverted: reversed coords before mapping (0,1,0), (1,0,0), (0,0,0) -> GPU: (0,0,1), (1,0,0), (0,0,0)
    assert.deepEqual(
      result.triangles,
      new Float32Array([0, 0, 1, 1, 0, 0, 0, 0, 0])
    );
  });

  it("should detect negative determinant as inverted", function () {
    const childFile = new File(
      "child.dat",
      `
      0 Child
      3 16 0 0 0 1 0 0 0 1 0
    `
    );
    const childPart = new Part(childFile, []);

    const parentFile = new File(
      "parent.dat",
      `
      0 Parent
      1 16 0 0 0 -1 0 0 0 1 0 0 0 1 child.dat
    `
    );
    const parentPart = new Part(parentFile, [childPart]);

    const result = parentPart.render();

    // Negative scale in x (-1) inverts and mirrors
    // Original: (0,0,0), (1,0,0), (0,1,0)
    // Transformed: (0,0,0), (-1,0,0), (0,1,0)
    // Inverted (reversed before mapping): (0,1,0), (-1,0,0), (0,0,0) -> GPU: (0,0,1), (-1,0,0), (0,0,0)
    assert.deepEqual(
      result.triangles,
      new Float32Array([0, 0, 1, -1, 0, 0, 0, 0, 0])
    );
  });
});
