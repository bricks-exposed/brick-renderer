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
 * @typedef {DrawLine | DrawTriangle | DrawQuadrilateral | DrawOptionalLine} Command
 */

/**
 * @typedef {[number, number, number]} Coordinate
 * `[x, y, z]`
 */

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
