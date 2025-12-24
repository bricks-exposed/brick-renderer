export const LineType = Object.freeze({
  Meta: 0,
  Comment: 0,
  DrawFile: 1,
  DrawLine: 2,
  DrawTriangle: 3,
  DrawQuadrilateral: 4,
  DrawOptionalLine: 5,
});

/**
 * @param {Command[]} commands
 * @param {number | readonly number[]} lineTypes
 *
 * @returns {Float32Array<ArrayBuffer>}
 */
export function getCommandVertices(commands, lineTypes) {
  const typeSet = new Set(
    typeof lineTypes === "number" ? [lineTypes] : lineTypes
  );

  const vertices = commands
    .filter((c) => typeSet.has(c.type))
    .flatMap(commandVertices)
    .filter((v) => v != null);

  return new Float32Array(vertices);
}

/**
 * @param {string} file
 *
 * @returns {Command[]}
 */
export function processFile(file) {
  return file
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(processCommand);
}

/**
 * @param {string} command
 *
 * @returns {Command}
 */
function processCommand(command) {
  if (command.startsWith(LineType.DrawLine.toString())) {
    return processDrawLine(command);
  }

  if (command.startsWith(LineType.DrawTriangle.toString())) {
    return processDrawTriangle(command);
  }

  if (command.startsWith(LineType.DrawQuadrilateral.toString())) {
    return processDrawQuadrilateral(command);
  }

  return { type: LineType.Comment };
}

/**
 * @param {string} command
 * @returns {DrawLine}
 */
function processDrawLine(command) {
  const [type, color, x1, y1, z1, x2, y2, z2] = command
    .split(/\s/)
    .map((s) => Number.parseFloat(s));

  if (
    type !== LineType.DrawLine ||
    color === undefined ||
    x1 === undefined ||
    y1 === undefined ||
    z1 === undefined ||
    x2 === undefined ||
    y2 === undefined ||
    z2 === undefined
  ) {
    throw new Error(`Malformed line type 2 (draw line) command: ${command}`);
  }

  return {
    type,
    color,
    points: [
      [x1, y1, z1],
      [x2, y2, z2],
    ],
  };
}

/**
 * @param {string} command
 *
 * @returns {DrawTriangle}
 */
function processDrawTriangle(command) {
  const [type, color, x1, y1, z1, x2, y2, z2, x3, y3, z3] = command
    .split(/\s/)
    .map((s) => Number.parseFloat(s));

  if (
    type !== LineType.DrawTriangle ||
    color === undefined ||
    x1 === undefined ||
    y1 === undefined ||
    z1 === undefined ||
    x2 === undefined ||
    y2 === undefined ||
    z2 === undefined ||
    x3 === undefined ||
    y3 === undefined ||
    z3 === undefined
  ) {
    throw new Error(`Malformed line type 2 (draw line) command: ${command}`);
  }

  return {
    type,
    color,
    points: [
      [x1, y1, z1],
      [x2, y2, z2],
      [x3, y3, z3],
    ],
  };
}

/**
 * @param {string} command
 * @returns {DrawQuadrilateral}
 */
function processDrawQuadrilateral(command) {
  const [type, color, x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4] = command
    .split(/\s/)
    .map((s) => Number.parseFloat(s));

  if (
    type !== LineType.DrawQuadrilateral ||
    color === undefined ||
    x1 === undefined ||
    y1 === undefined ||
    z1 === undefined ||
    x2 === undefined ||
    y2 === undefined ||
    z2 === undefined ||
    x3 === undefined ||
    y3 === undefined ||
    z3 === undefined ||
    x4 === undefined ||
    y4 === undefined ||
    z4 === undefined
  ) {
    throw new Error(
      `Malformed line type 4 (draw quadrilateral) command: ${command}`
    );
  }

  return {
    type,
    color,
    points: [
      [x1, y1, z1],
      [x2, y2, z2],
      [x3, y3, z3],
      [x4, y4, z4],
    ],
  };
}

/**
 * @param {Command} command
 *
 * @returns {number[] | null}
 */
export function commandVertices(command) {
  switch (command.type) {
    case LineType.DrawLine:
    case LineType.DrawTriangle:
      return command.points.flatMap(coordinateToGpu);
    case LineType.DrawQuadrilateral:
      return quadrilateralToTwoTriangles(command.points).flatMap(
        coordinateToGpu
      );
    default:
      return null;
  }
}

/**
 * Convert LDraw's quadrilateral vertexes
 * to a vertex list that can draw triangles
 * instead of squares.
 *
 * @param {DrawQuadrilateral["points"]} points
 *
 * @returns {Coordinate[]}
 */
function quadrilateralToTwoTriangles([one, two, three, four]) {
  return [one, two, three, three, four, one];
}

/**
 * @typedef {Comment
 *   | DrawLine
 *   | DrawTriangle
 *   | DrawQuadrilateral
 *   | DrawOptionalLine
 * } Command
 */

/**
 * @typedef {[number, number, number]} Coordinate
 * `[x, y, z]`
 */

/**
 * Map an LDraw Coordinate (where -y is out of the page)
 * to a GPU Coordinate (where -z is out of the page).
 *
 * @param {Coordinate} coordinate
 *
 * @returns {Coordinate}
 */
function coordinateToGpu([x, y, z]) {
  return [x, z, y];
}

/**
 * @typedef {{
 * type: typeof LineType.Comment
 * }} Comment
 */

/**
 * @typedef {{
 *   type: typeof LineType.DrawLine;
 *   color: number;
 *   points: readonly [Coordinate, Coordinate];
 * }} DrawLine
 */

/**
 * @typedef {{
 *   type: typeof LineType.DrawTriangle;
 *   color: number;
 *   points: readonly [Coordinate, Coordinate, Coordinate];
 * }} DrawTriangle
 */

/**
 * @typedef {{
 *   type: typeof LineType.DrawQuadrilateral;
 *   color: number;
 *   points: readonly [Coordinate, Coordinate, Coordinate, Coordinate];
 * }} DrawQuadrilateral
 */

/**
 * @typedef {{
 *   type: typeof LineType.DrawOptionalLine;
 *   color: number;
 *   points: readonly [Coordinate, Coordinate]
 *   controlPoints: readonly [Coordinate, Coordinate];
 * }} DrawOptionalLine
 */
