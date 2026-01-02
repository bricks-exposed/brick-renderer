import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Part, File, Color, Colors } from "./ldraw.js";
import { fromScaling } from "./matrix.js";

const Test_Colors = new Colors([Color.custom("#000000")]);

describe("Part rendering", function () {
  it("should render basic lines", function () {
    const file = new File("test.dat", "2 24 1 0 0 1 1 0", Test_Colors);

    const { lines } = file.render();

    assert.deepEqual(lines, [
      {
        points: [
          [1, 0, 0],
          [1, 0, 1], // Remapped to GPU coordinates
        ],
        controlPoints: undefined,
      },
    ]);
  });

  it("should render optional lines", function () {
    const file = new File(
      "test.dat",
      "5 24 1 0 0 1 1 0 0.9 0 0.4 0.9 0 -0.4",
      Test_Colors
    );

    const { lines } = file.render();

    assert.deepEqual(lines, [
      {
        points: [
          [1, 0, 0],
          [1, 0, 1], // Remapped to GPU coordinates
        ],
        controlPoints: [
          [0.9, 0.4, 0],
          [0.9, -0.4, 0],
        ],
      },
    ]);
  });

  it("should render triangles", function () {
    const file = new File("triangle.dat", "3 16 0 0 0 1 0 0 0 1 0");

    const { lines, triangles } = file.render();

    assert.equal(lines.length, 0);
    // Triangle vertices: (0,0,0), (1,0,0), (0,1,0)
    // Mapped to GPU [x,z,y]: (0,0,0), (1,0,0), (0,0,1)
    assert.deepEqual(triangles, [
      {
        vertices: [
          [0, 0, 0],
          [1, 0, 0],
          [0, 0, 1],
        ],
        color: null,
      },
    ]);
  });

  it("should render quadrilaterals as two triangles", function () {
    const file = new File(
      "quad.dat",
      "4 16 0 0 0 1 0 0 1 1 0 0 1 0",
      Test_Colors
    );

    const { triangles } = file.render();

    // Quad vertices: (0,0,0), (1,0,0), (1,1,0), (0,1,0)
    // Split into two triangles: [v0,v1,v2] and [v2,v3,v0]
    // Triangle 1: (0,0,0), (1,0,0), (1,1,0) -> GPU: (0,0,0), (1,0,0), (1,0,1)
    // Triangle 2: (1,1,0), (0,1,0), (0,0,0) -> GPU: (1,0,1), (0,0,1), (0,0,0)
    assert.deepEqual(triangles, [
      {
        vertices: [
          [0, 0, 0],
          [1, 0, 0],
          [1, 0, 1],
        ],
        color: null,
      },
      {
        vertices: [
          [1, 0, 1],
          [0, 0, 1],
          [0, 0, 0],
        ],
        color: null,
      },
    ]);
  });

  it("should apply transformations", function () {
    const file = new File("test.dat", "3 16 1 0 0 2 0 0 1 1 0", Test_Colors);

    const { triangles } = file.render({ transformation: fromScaling(2) });

    // Original vertices: (1,0,0), (2,0,0), (1,1,0)
    // Scaled by 2: (2,0,0), (4,0,0), (2,2,0)
    // Mapped to GPU [x,z,y]: (2,0,0), (4,0,0), (2,0,2)
    assert.deepEqual(triangles, [
      {
        vertices: [
          [2, 0, 0],
          [4, 0, 0],
          [2, 0, 2],
        ],
        color: null,
      },
    ]);
  });

  it("should handle inversion", function () {
    const file = new File("test.dat", "3 16 0 0 0 1 0 0 0 1 0", Test_Colors);

    const inverted = file.render({ invert: true });

    // Inverted reverses coords before mapping: (0,1,0), (1,0,0), (0,0,0) -> GPU: (0,0,1), (1,0,0), (0,0,0)
    assert.deepEqual(inverted.triangles, [
      {
        vertices: [
          [0, 0, 1],
          [1, 0, 0],
          [0, 0, 0],
        ],
        color: null,
      },
    ]);
  });

  it("should render subparts with transformations", function () {
    const childFile = new File(
      "child.dat",
      "3 16 0 0 0 1 0 0 0 1 0",
      Test_Colors
    );
    const childPart = new Part(childFile, []);

    const parentFile = new File(
      "parent.dat",
      "1 16 10 0 0 1 0 0 0 1 0 0 0 1 child.dat",
      Test_Colors
    );
    const parentPart = new Part(parentFile, [childPart]);

    const { triangles } = parentPart.render();

    // Child triangle at (0,0,0), (1,0,0), (0,1,0)
    // Translated by (10,0,0)
    // Becomes (10,0,0), (11,0,0), (10,1,0)
    // Mapped to GPU [x,z,y]: (10,0,0), (11,0,0), (10,0,1)
    assert.deepEqual(triangles, [
      {
        vertices: [
          [10, 0, 0],
          [11, 0, 0],
          [10, 0, 1],
        ],
        color: null,
      },
    ]);
  });

  it("should handle BFC INVERTNEXT", function () {
    const childFile = new File(
      "child.dat",
      "3 16 0 0 0 1 0 0 0 1 0",
      Test_Colors
    );
    const childPart = new Part(childFile, []);

    const parentFile = new File(
      "parent.dat",
      `
      0 BFC INVERTNEXT
      1 16 0 0 0 1 0 0 0 1 0 0 0 1 child.dat
    `,
      Test_Colors
    );
    const parentPart = new Part(parentFile, [childPart]);

    const result = parentPart.render();

    // Child triangle inverted: reversed coords before mapping (0,1,0), (1,0,0), (0,0,0) -> GPU: (0,0,1), (1,0,0), (0,0,0)
    assert.deepEqual(result.triangles, [
      {
        vertices: [
          [0, 0, 1],
          [1, 0, 0],
          [0, 0, 0],
        ],
        color: null,
      },
    ]);
  });

  it("should detect negative determinant as inverted", function () {
    const childFile = new File(
      "child.dat",
      "3 16 0 0 0 1 0 0 0 1 0",
      Test_Colors
    );
    const childPart = new Part(childFile, []);

    const parentFile = new File(
      "parent.dat",
      "1 16 0 0 0 -1 0 0 0 1 0 0 0 1 child.dat",
      Test_Colors
    );
    const parentPart = new Part(parentFile, [childPart]);

    const result = parentPart.render();

    // Negative scale in x (-1) inverts and mirrors
    // Original: (0,0,0), (1,0,0), (0,1,0)
    // Transformed: (0,0,0), (-1,0,0), (0,1,0)
    // Inverted (reversed before mapping): (0,1,0), (-1,0,0), (0,0,0) -> GPU: (0,0,1), (-1,0,0), (0,0,0)
    assert.deepEqual(result.triangles, [
      {
        vertices: [
          [0, 0, 1],
          [-1, 0, 0],
          [0, 0, 0],
        ],
        color: null,
      },
    ]);
  });
});

describe("Colors", function () {
  it("should parse a basic color", function () {
    const parsed = Color.from(
      "0 !COLOUR Black   CODE   0     VALUE #1B2A34   EDGE #2B4354"
    );

    assert.equal(parsed?.name, "Black");
    assert.equal(parsed.code, 0);
    assert.equal(parsed.value, "#1B2A34");
    assert.equal(parsed.edge, "#2B4354");
  });

  it("should parse a transparent color and apply the alpha", function () {
    const parsed = Color.from(
      "0 !COLOUR Transparent_Pink  CODE  45   VALUE #FC97AC   EDGE #F9345B   ALPHA 128"
    );

    assert.equal(parsed?.value, "#FC97AC80");
    assert.equal(parsed.edge, "#F9345B80");
  });

  it("should properly convert to rgb", function () {
    const parsed = Color.from(
      "0 !COLOUR Black   CODE   0     VALUE #1B2A34   EDGE #2B4354"
    );

    assert.deepEqual(parsed?.rgba, [27, 42, 52, 255]);
  });

  it("should ignore avatar commands", function () {
    const parsed = Color.from(
      '0 !AVATAR CATEGORY "Brick" DESCRIPTION "Brick" PART 1 0 0  0 1 0  0 0 1 "3002.dat"'
    );

    assert.equal(parsed, undefined);
  });
});
