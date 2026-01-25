/** @import { type Triangle, type Line, type Vertex } from "./triangles.js" */
/** @import { type Matrix } from "./matrix.js" */
import { Loader } from "./part-loader-worker.js";
import { Model } from "./model.js";
import { Color } from "./ldraw.js";
import { Transformation } from "./transformation.js";
import { orbitControls } from "./orbit.js";
import { isFrontFacing, depthSortTrianglesAndLines } from "./triangles.js";

const worker = new Worker(new URL("part-worker.js", import.meta.url), {
  type: "module",
  name: "part-loader-worker",
});

const loader = new Loader(worker);

const colors = await loader.initialize();

Model.loader = loader;

/**
 * @param {string} fileName
 */
export async function createSvg(fileName) {
  const defaultColor = Color.custom("#e04d4d");
  const model = await Model.for(fileName, defaultColor);

  const transformation = new Transformation();

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttributeNS(null, "viewBox", `-1 -1 2 2`);

  render(svg, model, transformation);

  orbitControls(svg, transformation, () => render(svg, model, transformation));

  return svg;
}

/**
 *
 * @param {SVGSVGElement} svg
 * @param {Model} model
 * @param {Transformation} transformation
 */
function render(svg, model, transformation) {
  const matrix = model.matrix(transformation);

  const transformer = transformPoint.bind(null, matrix);

  const lines = getLines(
    model.geometry.lines,
    model.geometry.optionalLines,
    transformer
  );

  const triangles = getTriangles(model.geometry.triangles, transformer);

  const contents = depthSortTrianglesAndLines([...triangles, ...lines]).map(
    ([g, i]) => draw(g, model.color, i)
  );

  svg.innerHTML = contents.join("");
}

/**
 * @param {TriangleData | LineData} geometry
 * @param {Color} defaultColor
 * @param {number} i
 */
function draw(geometry, defaultColor, i) {
  const { p1, p2 } = geometry;

  const color =
    geometry.colorCode === Color.CURRENT_COLOR_CODE
      ? defaultColor
      : colors.find((c) => c.code === geometry.colorCode) ?? defaultColor;
  const [r, g, b, a] = color.rgba;

  if ("p3" in geometry) {
    const p3 = geometry.p3;
    return `
    <polygon
      points="${p1[0]}, ${p1[1]} ${p2[0]}, ${p2[1]} ${p3[0]}, ${p3[1]}"
      fill="rgba(${r} ${g} ${b} / ${a})"
      stroke="rgba(${r} ${g} ${b} / ${a})"
      stroke-width="0.01"
      stroke-linejoin="bevel"
      data-i="${i}"
    />`;
  } else {
    return `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${
      p2[1]
    }" stroke="${
      geometry.colorCode === 16 ? "black" : "yellow"
    }" stroke-width="0.01" stroke-linecap="round" data-color="${
      geometry.colorCode
    }" data-i="${i}" />`;
  }
}

/**
 * @typedef {Triangle & { colorCode: number }} TriangleData
 * @typedef {Line & { colorCode: number }} LineData
 */

/**
 * @param {number[] | Float32Array} lineData
 * @param {number[] | Float32Array} optionalLineData
 * @param {(x: number, y: number, z: number) => Vertex} transformer
 *
 * @returns {LineData[]}
 */
function getLines(lineData, optionalLineData, transformer) {
  const lines = [];
  for (let i = 0; i < lineData.length; i += 2 * 4) {
    const points = [];
    let colorCode = 16;

    for (let j = 0; j < 8; j += 4) {
      const x = lineData[i + j];
      const y = lineData[i + j + 1];
      const z = lineData[i + j + 2];
      colorCode = lineData[i + j + 3];

      const point = transformer(x, y, z);

      points.push(point);
    }

    const line = {
      p1: points[0],
      p2: points[1],
      colorCode,
    };

    lines.push(line);
  }

  for (let i = 0; i < optionalLineData.length; i += 4 * 4 * 2) {
    const points = [];
    let colorCode = 16;

    for (let j = 0; j < 16; j += 4) {
      const x = optionalLineData[i + j];
      const y = optionalLineData[i + j + 1];
      const z = optionalLineData[i + j + 2];
      colorCode = optionalLineData[i + j + 3];

      const point = transformer(x, y, z);

      points.push(point);
    }

    const [p1, p2, c1, c2] = points;

    /** @type {Vertex} */
    const edge = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];

    /** @type {Vertex} */
    const toC1 = [c1[0] - p1[0], c1[1] - p1[1], c1[2] - p1[2]];

    /** @type {Vertex} */
    const toC2 = [c2[0] - p1[0], c2[1] - p1[1], c2[2] - p1[2]];

    /** @type {Vertex} */
    const viewNormal = [0, 0, 1];

    const cross1 = dot(cross(edge, toC1), viewNormal);
    const cross2 = dot(cross(edge, toC2), viewNormal);

    if (cross1 * cross2 > 0) {
      lines.push({
        p1,
        p2,
        colorCode,
      });
    }
  }

  return lines;
}

/**
 *
 * @param {Vertex} a
 * @param {Vertex} b
 */
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 *
 * @param {Vertex} a
 * @param {Vertex} b
 *
 * @returns {Vertex}
 */
function cross([ax, ay, az], [bx, by, bz]) {
  const x = ay * bz - az * by;
  const y = az * bx - ax * bz;
  const z = ax * by - ay * bx;

  return [x, y, z];
}

/**
 * @param {number[] | Float32Array} triangleData
 * @param {(x: number, y: number, z: number) => Vertex} transformer
 * @returns {TriangleData[]}
 */
function getTriangles(triangleData, transformer) {
  const triangles = [];
  for (let i = 0; i < triangleData.length; i += 3 * 4) {
    const points = [];
    let colorCode = 16;

    for (let j = 0; j < 12; j += 4) {
      const x = triangleData[i + j];
      const y = triangleData[i + j + 1];
      const z = triangleData[i + j + 2];
      colorCode = triangleData[i + j + 3];

      const point = transformer(x, y, z);

      points.push(point);
    }

    const triangle = {
      colorCode,
      p1: points[0],
      p2: points[1],
      p3: points[2],
    };

    // Back-face culling
    if (!isFrontFacing(triangle)) {
      continue;
    }

    triangles.push(triangle);
  }

  return triangles;
}

/**
 *
 * @param {Matrix} transformation
 * @param {number} x
 * @param {number} y
 * @param {number} z
 *
 * @returns {Vertex}
 */
function transformPoint(
  [a, b, c, , d, e, f, , g, h, i, , tx, ty, tz],
  x,
  y,
  z
) {
  const mappedX = a * x + d * y + g * z + tx;
  const mappedY = b * x + e * y + h * z + ty;
  const mappedZ = c * x + f * y + i * z + tz;

  return [mappedX, -mappedY, mappedZ];
}
