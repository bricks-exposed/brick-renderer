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
 * @param {string} file
 *
 * @returns {Command[]}
 */
export function processFile(file) {
  return file
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(processCommand)
    .filter((c) => c != null);
}

/**
 * @param {string} command
 *
 * @returns {Command | undefined}
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

  return undefined;
}

/**
 * @param {string} command
 * @returns {DrawLine | undefined}
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
 * @returns {DrawTriangle | undefined}
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
 * @returns {DrawQuadrilateral | undefined}
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
 * @typedef {DrawLine | DrawTriangle | DrawQuadrilateral | DrawOptionalLine} Command
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
 *   type: typeof LineType.DrawLine;
 *   color: number;
 *   points: [Coordinate, Coordinate];
 * }} DrawLine
 */

/**
 * @typedef {{
 *   type: typeof LineType.DrawTriangle;
 *   color: number;
 *   points: [Coordinate, Coordinate, Coordinate];
 * }} DrawTriangle
 */

/**
 * @typedef {{
 *   type: typeof LineType.DrawQuadrilateral;
 *   color: number;
 *   points: [Coordinate, Coordinate, Coordinate, Coordinate];
 * }} DrawQuadrilateral
 */

/**
 * @typedef {{
 *   type: typeof LineType.DrawOptionalLine;
 *   color: number;
 *   points: [Coordinate, Coordinate]
 *   controlPoints: [Coordinate, Coordinate];
 * }} DrawOptionalLine
 */
