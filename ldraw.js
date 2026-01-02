/** @import { Matrix } from "./matrix.js" */
import { determinant, identity, multiply } from "./matrix.js";

export class Part {
  /**
   *
   * @param {File} file
   * @param {Part[]} subParts
   */
  constructor(file, subParts) {
    this.file = file;
    this.subParts = new Map(subParts.map((p) => [p.file.name, p]));
  }

  /**
   * @param {Partial<RenderArgs>} [args]
   */
  render(args) {
    const renderArgs = {
      color: args?.color ?? null,
      transformation: args?.transformation,
      invert: args?.invert ?? false,
    };

    const { lines, triangles } = this.#render(renderArgs, EmptyRenderResult());

    return {
      lines,
      triangles,
      ...this.#boundingBox(lines),
    };
  }

  /**
   * @param {RenderArgs} args
   * @param {RenderResult} accumulator
   *
   * @returns {RenderResult}
   */
  #render(args, accumulator) {
    const { subFiles } = this.file.render(args, accumulator);

    for (const subFile of subFiles) {
      const subPart = this.subParts.get(subFile.fileName);

      if (!subPart) {
        throw new Error(`Could not find subpart ${subFile}`);
      }

      accumulator.subFiles = [];
      subPart.#render(subFile, accumulator);
    }

    return accumulator;
  }

  /**
   * @param {RenderLine[]} lines
   */
  #boundingBox(lines) {
    let min = [
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ];
    let max = [
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];

    for (const { points } of lines) {
      for (const point of points) {
        for (let i = 0; i < point.length; i++) {
          min[i] = Math.min(min[i], point[i]);
          max[i] = Math.max(max[i], point[i]);
        }
      }
    }

    const center = [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ];

    const largestExtent = Math.max(
      max[0] - min[0],
      max[1] - min[1],
      max[2] - min[2]
    );

    return { min, max, largestExtent, center };
  }
}

/** @typedef {[number, number, number]} Coordinate */

/** @typedef {[Coordinate, Coordinate, Coordinate]} Triangle */

/** @typedef {[number, number, number, number]} Rgba */

/**
 * @typedef {{
 *   points: [Coordinate, Coordinate];
 *   controlPoints?: [Coordinate, Coordinate] | undefined;
 * }} RenderLine
 */

/**
 * @typedef {{
 *   lines: RenderLine[];
 *   triangles: { vertices: Triangle; color: number | null }[];
 * }} Geometry
 */

/**
 * @typedef {{
 *   color?: number | null | undefined;
 *   transformation?: Matrix | undefined;
 *   invert?: boolean;
 * }} RenderArgs
 */

/**
 * @typedef {{
 *   fileName: string;
 * } & RenderArgs} SubfileRenderArgs
 */

/** @typedef {Geometry & { subFiles: SubfileRenderArgs[]}} RenderResult */

const EmptyRenderResult = () => ({
  lines: [],
  optionalLines: [],
  triangles: [],
  subFiles: [],
});

/**
 * @typedef {{
 *   invert: boolean;
 *   colors: Colors;
 * }} Context
 */

export class File {
  /**
   * @param {string} name
   * @param {string} contents
   */
  constructor(name, contents) {
    this.name = name;

    this.commands = [];
    this.subFiles = [];

    const BFC_INVERTNEXT = /^0\s+BFC\s+INVERTNEXT/;

    let invertNext = false;
    for (const line of contents.split("\n")) {
      const command = line.trim();

      if (!command) {
        continue;
      }

      let parsed;
      if (BFC_INVERTNEXT.test(command)) {
        invertNext = true;
      } else if ((parsed = DrawCommand.from(command, invertNext))) {
        invertNext = false;

        this.commands.push(parsed);

        if (parsed instanceof DrawFile) {
          this.subFiles.push(parsed.fileName);
        }
      }
    }
  }

  /**
   * @param {RenderArgs} args
   * @param {RenderResult} [accumulator]
   *
   * @returns {RenderResult}
   */
  render(
    args = { transformation: undefined, color: null, invert: false },
    accumulator
  ) {
    accumulator ??= EmptyRenderResult();

    for (const command of this.commands) {
      command.render(args, accumulator);
    }

    return accumulator;
  }
}

const LineType = Object.freeze({
  Meta: 0,
  Comment: 0,
  DrawFile: 1,
  DrawLine: 2,
  DrawTriangle: 3,
  DrawQuadrilateral: 4,
  DrawOptionalLine: 5,
});

class Command {
  /**
   * @param {string} command
   * @param {boolean} invert
   */
  static from(command, invert) {
    const [type] = command.split(/\s+/);
    const parsedType = Number.parseInt(type, 10);

    const constructor = CommandMap[parsedType];

    return constructor?.from(command, invert) ?? null;
  }
}

/** @abstract */
class DrawCommand extends Command {
  /**
   * @param {number | null} color
   * @param {boolean} invert
   */
  constructor(color, invert) {
    super();
    this.color = color === Color.CURRENT_COLOR ? null : color;
    this.invertedByParent = invert;
  }

  /**
   * @abstract
   *
   * @param {RenderArgs} args
   * @param {RenderResult} [accumulator]
   *
   * @returns {RenderResult}
   */
  render(args, accumulator) {
    throw new Error("Not implemented");
  }

  /**
   * @param {boolean} invert
   */
  shouldInvert(invert = false) {
    return invert != this.invertedByParent;
  }
}

class DrawFile extends DrawCommand {
  /**
   * @param {string} fileName
   * @param {number | null} color
   * @param {Matrix | undefined} transformation
   * @param {boolean} invertSelf
   * @param {boolean} parentInvert
   */
  constructor(fileName, color, transformation, invertSelf, parentInvert) {
    super(color, parentInvert);
    this.transformation = transformation ?? identity;
    this.invertSelf = invertSelf;
    this.fileName = fileName;
  }

  /**
   * @param {RenderArgs} invert
   * @param {RenderResult} [accumulator]
   *
   * @returns {RenderResult}
   */
  render({ color, transformation, invert }, accumulator) {
    accumulator ??= EmptyRenderResult();
    accumulator.subFiles.push({
      fileName: this.fileName,
      color: this.color ?? color,
      transformation: multiply(this.transformation, transformation),
      invert: this.shouldInvert(invert),
    });

    return accumulator;
  }

  /**
   * @param {string} command
   * @param {boolean} parentInvert
   */
  static from(command, parentInvert) {
    const [_type, unparsedColor, ...tokens] = command.split(/\s+/);

    const color = Number.parseInt(unparsedColor);

    const [fileStart, ...fileRest] = tokens.splice(12);

    const fileEnd = fileRest.at(fileRest.length - 1);

    const fileName = fileEnd
      ? new RegExp(`/.*\s(${fileStart}.*${fileEnd})$`).exec(command)?.[1]
      : fileStart;

    if (!fileName) {
      throw new Error(
        `Missing filename for draw file (type 1) command: ${command}`
      );
    }

    const [x, y, z, ...abcdefghi] = tokens.map(Number.parseFloat);

    const inverted = determinant(abcdefghi) < 0;

    const [a, b, c, d, e, f, g, h, i] = abcdefghi;

    return new DrawFile(
      fileName,
      color,
      [a, b, c, x, d, e, f, y, g, h, i, z, 0, 0, 0, 1],
      inverted,
      parentInvert
    );
  }

  /**
   * @param {boolean} invert
   */
  shouldInvert(invert = false) {
    return super.shouldInvert(invert) !== this.invertSelf;
  }
}

/** @abstract */
class DrawGeometry extends DrawCommand {
  /**
   * @param {number | null} color
   * @param {Coordinate[]} coordinates
   * @param {boolean} invert
   */
  constructor(color, coordinates, invert) {
    super(color, invert);

    if (new.target === DrawGeometry) {
      throw new Error(
        "DrawGeometry is abstract. Did you mean to provide a subclass?"
      );
    }
  }

  /**
   * @param {string} command
   * @param {boolean} invert
   */
  static from(command, invert) {
    const [_type, color, ...points] = command
      .split(/\s+/)
      .map(Number.parseFloat);

    /** @type {Coordinate[]} */
    const coordinates = [];
    for (let i = 0; i < points.length; i += 3) {
      coordinates.push([points[i], points[i + 1], points[i + 2]]);
    }

    return new this(color, coordinates, invert);
  }

  /**
   * @template {Coordinate[]} T
   * @param {Matrix | null | undefined} transformation
   * @param {T} coordinates
   *
   * @returns {T}
   */
  static transform(transformation, coordinates) {
    return /** @type {T} */ (
      coordinates.map(
        DrawGeometry.transformCoordinate.bind(null, transformation)
      )
    );
  }

  /**
   * @param {Matrix | null | undefined} transformation
   * @param {Coordinate} coordinate
   *
   * @returns {Coordinate}
   */
  static transformCoordinate(transformation, [x, y, z]) {
    let transformedX = x;
    let transformedY = y;
    let transformedZ = z;

    if (transformation) {
      const [a, b, c, tx, d, e, f, ty, g, h, ii, tz] = transformation;
      transformedX = a * x + b * y + c * z + tx;
      transformedY = d * x + e * y + f * z + ty;
      transformedZ = g * x + h * y + ii * z + tz;
    }

    /*
     * Map an LDraw Coordinate (where -y is out of the page)
     * to a GPU Coordinate (where -z is out of the page).
     */
    return [transformedX, transformedZ, transformedY];
  }
}

class DrawTriangle extends DrawGeometry {
  /** @readonly @type {Triangle[]} */
  triangles;

  /** @readonly @type {Triangle[]} */
  invertedTriangles;

  /**
   * @param {number} color
   * @param {Coordinate[]} coordinates
   * @param {boolean} invert
   */
  constructor(color, coordinates, invert) {
    super(color, coordinates, invert);

    this.triangles = [];
    this.invertedTriangles = [];

    for (let i = 0; i < coordinates.length; i += 3) {
      this.triangles.push([
        coordinates[i],
        coordinates[i + 1],
        coordinates[i + 2],
      ]);
      this.invertedTriangles.push([
        coordinates[i + 2],
        coordinates[i + 1],
        coordinates[i],
      ]);
    }
  }

  /**
   * @param {RenderArgs} args
   * @param {RenderResult} [accumulator]
   *
   * @returns {RenderResult}
   */
  render({ color, transformation, invert }, accumulator) {
    accumulator ??= EmptyRenderResult();

    const geometry = accumulator.triangles;

    const triangles = this.shouldInvert(invert)
      ? this.invertedTriangles
      : this.triangles;

    for (const triangle of triangles) {
      geometry.push({
        vertices: DrawTriangle.transformTriangle(transformation, triangle),
        color: this.color ?? color ?? null,
      });
    }

    return accumulator;
  }

  /**
   * @param {Matrix | null | undefined} transformation
   * @param {Triangle} triangle
   *
   * @returns {Triangle}
   */
  static transformTriangle(transformation, triangle) {
    return DrawGeometry.transform(transformation, triangle);
  }
}

class DrawQuadrilateral extends DrawTriangle {
  /**
   * @param {number} color
   * @param {Coordinate[]} coordinates
   * @param {boolean} invert
   */
  constructor(color, coordinates, invert) {
    /*
     * Convert LDraw's quadrilateral vertexes
     * to a vertex list that can draw triangles
     * instead of squares.
     *
     * 1 --> 2
     * | \ a |
     * |  \  |
     * | b \ |
     * 4 <-- 3
     */
    const [one, two, three, four] = coordinates;
    super(color, [one, two, three, three, four, one], invert);
  }
}

class DrawLine extends DrawGeometry {
  /** @readonly @type {[Coordinate, Coordinate]} */
  coordinates;

  /** @readonly @type {[Coordinate, Coordinate] | undefined} */
  controlPoints;

  /**
   * @param {number} _color
   * @param {Coordinate[]} coordinates
   * @param {boolean} _invert
   */
  constructor(_color, coordinates, _invert) {
    super(Color.EDGE_COLOR, coordinates, false);
    const [first, second, control1, control2] = coordinates;
    this.coordinates = [first, second];
    this.controlPoints = control1 ? [control1, control2] : undefined;
  }

  /**
   * @param {RenderArgs} args
   * @param {RenderResult} [accumulator]
   *
   * @returns {RenderResult}
   */
  render({ transformation }, accumulator) {
    accumulator ??= EmptyRenderResult();

    const geometry = accumulator.lines;

    const points = DrawGeometry.transform(transformation, this.coordinates);

    const controlPoints = this.controlPoints
      ? DrawGeometry.transform(transformation, this.controlPoints)
      : undefined;

    geometry.push({
      points,
      controlPoints,
    });

    return accumulator;
  }

  shouldInvert() {
    // Never invert lines
    return false;
  }
}

/** @type {Record<number, { from(command: string, invert: boolean): DrawCommand}>} */
const CommandMap = {
  [LineType.DrawFile]: DrawFile,
  [LineType.DrawLine]: DrawLine,
  [LineType.DrawOptionalLine]: DrawLine,
  [LineType.DrawTriangle]: DrawTriangle,
  [LineType.DrawQuadrilateral]: DrawQuadrilateral,
};

export class Configuration {
  /**
   * @param {Colors} colors
   */
  constructor(colors) {
    this.colors = colors;
  }

  /**
   * @param {string} contents
   */
  static from(contents) {
    const commands = contents.split("\n").filter((l) => !!l.trim());

    const colors = commands.map(Color.from).filter((c) => c != null);

    return new this(new Colors(colors));
  }
}

export class Colors {
  #colors;

  /**
   * @param {readonly Color[]} colors
   */
  constructor(colors) {
    this.all = colors;
    this.#colors = new Map(colors.map((c) => [c.code, c]));
  }

  /**
   * @param {number | string | null | undefined} code
   */
  for(code) {
    if (code == null) {
      return null;
    }

    code = typeof code === "number" ? code : Number.parseInt(code, 10);

    if (code === Color.CURRENT_COLOR || code === Color.EDGE_COLOR) {
      return null;
    }

    const color = this.#colors.get(code);

    if (!color) {
      throw new Error(`No color defined for code ${code}`);
    }

    return color;
  }
}

export class Color {
  static CURRENT_COLOR = 16;

  static EDGE_COLOR = 24;

  static DEFAULT = new Color("DEFAULT_COLOR", -1, "#1B2A34", "#2B4354");

  /** @readonly @type {Rgba} */
  rgba;

  /**
   * @param {string} name
   * @param {number} code
   * @param {string} value
   * @param {string} edge
   */
  constructor(name, code, value, edge) {
    this.name = name;
    this.code = code;
    this.value = value;
    this.edge = edge;
    const r = Number.parseInt(value.slice(1, 3), 16);
    const g = Number.parseInt(value.slice(3, 5), 16);
    const b = Number.parseInt(value.slice(5, 7), 16);
    const a = value.length === 9 ? Number.parseInt(value.slice(7), 16) : 255;
    this.rgba = [r, g, b, a];
    this.opaque = a === 255;
  }

  /**
   * @param {string} hex
   */
  static custom(hex) {
    return new Color("Custom", -1, hex, hex);
  }

  /**
   * @param {string} command
   */
  static from(command) {
    /*
     * 0 !COLOUR <name>
     * CODE <c, number>
     * VALUE <v, hex>
     * EDGE <e, hex>
     * [ALPHA <a, 0-255>]
     * [LUMINANCE <l>]
     * [CHROME | PEARLESCENT | RUBBER | MATTE_METALLIC | METAL | MATERIAL <params>]
     */
    let [
      type,
      metaCommand,
      name,
      _CODE,
      code,
      _VALUE,
      value,
      _EDGE,
      edge,
      ...optional
    ] = command.split(/\s+/);

    if (type !== "0" || metaCommand !== "!COLOUR") {
      return undefined;
    }

    const alphaParam = optional.findIndex((p) => p.toLowerCase() === "alpha");

    if (alphaParam !== -1) {
      const alpha = Number.parseInt(optional[alphaParam + 1], 10);
      const alphaHex = alpha.toString(16);
      value += alphaHex;
      edge += alphaHex;
    }

    return new Color(
      name.replaceAll("_", " "),
      Number.parseInt(code, 10),
      value,
      edge
    );
  }
}
