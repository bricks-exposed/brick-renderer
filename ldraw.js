/** @import { Matrix } from "./matrix.js" */
import * as matrix from "./matrix.js";

export class File {
  /** @type {readonly { code: number; rgba: Rgba }[]} */
  static globalColors = [];

  /**
   * @param {string} name
   * @param {Colors} colors
   * @param {readonly DrawCommand[]} commands
   */
  constructor(name, colors, commands) {
    this.name = name;
    this.colors = colors;
    this.commands = commands;
  }

  /**
   * @param {string} name
   * @param {ParsedFile | string} contents
   * @param {File[]} subFiles
   */
  static from(name, contents, subFiles = []) {
    const parsedFile =
      typeof contents === "string" ? File.parse(contents) : contents;

    const subFileMap = new Map(subFiles.map((f) => [f.name, f]));

    const drawSubGeometryCommands = [];

    for (const descriptor of parsedFile.subFiles) {
      const subFile = subFileMap.get(descriptor.fileName);

      if (!subFile) {
        throw new Error(`Missing required subFile ${descriptor.fileName}`);
      }

      drawSubGeometryCommands.push(new DrawFile(subFile, descriptor));
    }

    return new File(name, parsedFile.colors, [
      ...parsedFile.commands,
      ...drawSubGeometryCommands,
    ]);
  }

  /**
   * @param {string} contents
   *
   * @returns {ParsedFile}
   */
  static parse(contents) {
    const commands = [];
    const subFiles = [];

    let colors = Colors.from(File.globalColors);

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
      } else if ((parsed = Color.from(command))) {
        colors = colors.newWith(parsed);
      } else if ((parsed = DrawGeometry.from(command, invertNext, colors))) {
        invertNext = false;

        commands.push(parsed);
      } else if ((parsed = DrawSubGeometry.from(command, invertNext, colors))) {
        invertNext = false;

        if (parsed instanceof DrawCommand) {
          commands.push(parsed);
        } else {
          subFiles.push(parsed);
        }
      }
    }
    return { colors, commands, subFiles };
  }

  /**
   * @param {Partial<RenderArgs>} [args]
   * @param {RenderResult} [accumulator]
   *
   * @returns {RenderResult}
   */
  render(args, accumulator) {
    accumulator ??= {
      lines: [],
      triangles: [],
      studs: [],
    };

    this.#render(
      {
        transformation: matrix.identity,
        color: Color.CURRENT_COLOR,
        invert: false,
        ...args,
      },
      accumulator
    );

    return accumulator;
  }

  /**
   * @param {RenderArgs} args
   * @param {RenderResult} accumulator
   *
   * @returns {RenderResult}
   */
  #render(args, accumulator) {
    for (const command of this.commands) {
      command.render(args, accumulator);
    }

    return accumulator;
  }

  /**
   * @returns {PartGeometry}
   */
  geometry() {
    const {
      lines: rawLines,
      triangles: rawTriangles,
      studs: rawStuds,
    } = this.render();

    const { viewBox, center } = File.#boundingBox(rawLines);

    /** @type {number[]} */
    const lines = [];

    /** @type {number[]} */
    const optionalLines = [];

    /** @type {number[]} */
    const opaqueTriangles = [];

    /** @type {number[]} */
    const transparentTriangles = [];

    for (const line of rawLines) {
      const points = line.points.flat();
      if (line.controlPoints) {
        optionalLines.push(...points, ...line.controlPoints.flat());
      } else {
        lines.push(...points);
      }
    }

    for (const { vertices, color } of rawTriangles) {
      const array = color.opaque ? opaqueTriangles : transparentTriangles;
      for (const vertex of vertices) {
        array.push(...vertex, color.code);
      }
    }

    /** @type {number[]} */
    const studs = [];

    for (const args of rawStuds) {
      studs.push(...args.transformation, args.color.code);
    }

    return {
      fileName: this.name,
      lines: new Float32Array(lines),
      optionalLines: new Float32Array(optionalLines),
      opaqueTriangles: new Float32Array(opaqueTriangles),
      transparentTriangles: new Float32Array(transparentTriangles),
      studs: new Float32Array(studs),
      viewBox,
      center,
    };
  }

  /**
   * @param {RenderLine[]} lines
   *
   * @returns {{ viewBox: number; center: [number, number, number]}}
   */
  static #boundingBox(lines) {
    if (lines.length === 0) {
      return { viewBox: 10, center: [0, 0, 0] };
    }

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

    const largestExtent = Math.max(
      max[0] - min[0],
      max[1] - min[1],
      max[2] - min[2]
    );

    return {
      viewBox: largestExtent / 2,
      center: [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ],
    };
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

/** @abstract */
class DrawCommand {
  /**
   * @param {Color} color
   * @param {boolean} invert
   */
  constructor(color, invert) {
    this.color = color.code === Color.CURRENT_COLOR_CODE ? null : color;
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

/** @abstract */
class DrawSubGeometry extends DrawCommand {
  /**
   * @param {SubFileDescriptor} descriptor
   */
  constructor({ color, transformation, invertSelf, parentInvert }) {
    super(color, parentInvert);
    this.transformation = transformation ?? matrix.identity;
    this.invertSelf = invertSelf;
  }

  /**
   * @param {RenderArgs} args
   * @param {RenderResult} accumulator
   *
   * @returns {RenderResult}
   */
  render({ color, transformation, invert }, accumulator) {
    this._renderInternal(
      {
        color: this.color ?? color,
        transformation: matrix.multiply(transformation, this.transformation),
        invert: this.shouldInvert(invert),
      },
      accumulator
    );

    return accumulator;
  }

  /**
   * @abstract @protected
   *
   * @param {RenderArgs} args
   * @param {RenderResult} accumulator
   *
   * @returns {RenderResult}
   */
  _renderInternal(args, accumulator) {
    throw new Error(
      "DrawSubGeometry is abstract. Did you mean to call a subclass?"
    );
  }

  /**
   * @param {string} command
   * @param {boolean} parentInvert
   * @param {Colors} colors
   *
   * @returns {SubFileDescriptor | DrawStud | undefined}
   */
  static from(command, parentInvert, colors) {
    const [type, unparsedColor, ...tokens] = command.split(/\s+/);

    if (type !== LineType.DrawFile.toString()) {
      return undefined;
    }

    const color = Number(unparsedColor);

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

    const [x, y, z, a, b, c, d, e, f, g, h, i] = tokens.map(Number.parseFloat);

    const invertSelf = matrix.determinant(a, b, c, d, e, f, g, h, i) < 0;

    /**
     * Map an LDraw matrix (where -y is out of the page)
     * to a GPU matrix (where -z is out of the page).
     *
     * @type {Matrix}
     */
    const transformation = [a, g, d, 0, c, i, f, 0, b, h, e, 0, x, z, y, 1];

    const descriptor = {
      fileName,
      color: colors.for(color),
      transformation,
      invertSelf,
      parentInvert,
    };

    return fileName === "stud.dat" ? new DrawStud(descriptor) : descriptor;
  }

  /**
   * @param {boolean} invert
   */
  shouldInvert(invert = false) {
    return super.shouldInvert(invert) !== this.invertSelf;
  }
}

class DrawFile extends DrawSubGeometry {
  /**
   * @param {File} file
   * @param {SubFileDescriptor} descriptor
   */
  constructor(file, descriptor) {
    super(descriptor);
    this.file = file;
  }

  /**
   * @protected
   *
   * @param {RenderArgs} args
   * @param {RenderResult} accumulator
   *
   * @returns {RenderResult}
   */
  _renderInternal(args, accumulator) {
    return this.file.render(args, accumulator);
  }
}

class DrawStud extends DrawSubGeometry {
  /**
   * @param {SubFileDescriptor} descriptor
   */
  constructor(descriptor) {
    super(descriptor);
  }

  /**
   * @protected
   *
   * @param {RenderArgs} args
   * @param {RenderResult} accumulator
   *
   * @returns {RenderResult}
   */
  _renderInternal(args, accumulator) {
    accumulator.studs.push(args);
    return accumulator;
  }
}

/** @abstract */
class DrawGeometry extends DrawCommand {
  /**
   * @param {Color} color
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
   * @param {Colors} colors
   */
  static from(command, invert, colors) {
    const tokens = command.split(/\s+/);

    const type = Number(tokens[0]);

    const subclass = CommandMap[type];

    if (!subclass) {
      return undefined;
    }

    const [_type, color, ...points] = command
      .split(/\s+/)
      .map(Number.parseFloat);

    /** @type {Coordinate[]} */
    const coordinates = [];
    for (let i = 0; i < points.length; i += 3) {
      coordinates.push([points[i], points[i + 2], points[i + 1]]);
    }

    return new subclass(colors.for(color), coordinates, invert);
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
      coordinates.map(function ([x, y, z]) {
        if (!transformation || transformation === matrix.identity) {
          return [x, y, z];
        }

        const [a, b, c, , d, e, f, , g, h, i, , tx, ty, tz] = transformation;
        return [
          a * x + d * y + g * z + tx,
          b * x + e * y + h * z + ty,
          c * x + f * y + i * z + tz,
        ];
      })
    );
  }
}

class DrawTriangle extends DrawGeometry {
  /** @readonly @type {Triangle[]} */
  triangles;

  /** @readonly @type {Triangle[]} */
  invertedTriangles;

  /**
   * @param {Color} color
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
   * @param {RenderResult} accumulator
   *
   * @returns {RenderResult}
   */
  render({ color, transformation, invert }, accumulator) {
    const geometry = accumulator.triangles;

    const triangles = this.shouldInvert(invert)
      ? this.invertedTriangles
      : this.triangles;

    for (const triangle of triangles) {
      geometry.push({
        vertices: DrawGeometry.transform(transformation, triangle),
        color: this.color ?? color,
      });
    }

    return accumulator;
  }
}

class DrawQuadrilateral extends DrawTriangle {
  /**
   * @param {Color} color
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
   * @param {Color} color
   * @param {Coordinate[]} coordinates
   * @param {boolean} _invert
   */
  constructor(color, coordinates, _invert) {
    super(color, coordinates, false);
    const [first, second, control1, control2] = coordinates;
    this.coordinates = [first, second];
    this.controlPoints = control1 ? [control1, control2] : undefined;
  }

  /**
   * @param {RenderArgs} args
   * @param {RenderResult} accumulator
   *
   * @returns {RenderResult}
   */
  render({ transformation }, accumulator) {
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

/** @type {Record<number, { new(color: Color, coordinates: Coordinate[], invert: boolean): DrawGeometry}>} */
const CommandMap = {
  [LineType.DrawLine]: DrawLine,
  [LineType.DrawOptionalLine]: DrawLine,
  [LineType.DrawTriangle]: DrawTriangle,
  [LineType.DrawQuadrilateral]: DrawQuadrilateral,
};

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
   *
   * @param {readonly {
   *   code: number;
   *   rgba: Rgba;
   * }[]} colors
   */
  static from(colors) {
    return new Colors(
      colors.map(({ code, rgba }) => new Color(code.toString(), code, rgba))
    );
  }

  /**
   * @param {Colors} colors
   */
  combine(colors) {
    return new Colors([...this.all, ...colors.all]);
  }

  /**
   * @param {Color} color
   */
  newWith(color) {
    return new Colors([...this.all, color]);
  }

  /**
   * @param {number | string} code
   */
  for(code) {
    code = Number(code);

    if (code === Color.CURRENT_COLOR_CODE) {
      return Color.CURRENT_COLOR;
    }

    if (code === Color.EDGE_COLOR_CODE) {
      return Color.EDGE_COLOR;
    }

    const color = this.#colors.get(code);

    if (!color) {
      throw new Error(`No color defined for code ${code}`);
    }

    return color;
  }
}

export class Color {
  static CURRENT_COLOR_CODE = 16;

  static CURRENT_COLOR = new Color(
    "Current color",
    this.CURRENT_COLOR_CODE,
    [0, 0, 0, 0]
  );

  static EDGE_COLOR_CODE = 24;

  static EDGE_COLOR = new Color(
    "Current color",
    this.EDGE_COLOR_CODE,
    [0, 0, 0, 0]
  );

  static DEFAULT = new Color("DEFAULT_COLOR", -1, "#1B2A34");

  /** @readonly @type {Rgba} */
  rgba;

  /**
   * @param {string} name
   * @param {number} code
   * @param {string | Rgba} value
   */
  constructor(name, code, value) {
    this.name = name;
    this.code = code;

    if (typeof value === "string") {
      const r = Number.parseInt(value.slice(1, 3), 16);
      const g = Number.parseInt(value.slice(3, 5), 16);
      const b = Number.parseInt(value.slice(5, 7), 16);
      const a = value.length === 9 ? Number.parseInt(value.slice(7), 16) : 255;
      this.rgba = [r, g, b, a];
    } else {
      this.rgba = value;
    }
    this.opaque = this.rgba[3] === 255;
  }

  /**
   * @param {string} hex
   */
  static custom(hex) {
    return new Color("Custom", -1, hex);
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
      value
    );
  }
}

/**
 * @typedef {{
 *   fileName: string;
 *   color: Color;
 *   transformation: Matrix;
 *   invertSelf: boolean;
 *   parentInvert: boolean;
 * }} SubFileDescriptor
 */

/**
 * @typedef {{
 *   colors: Colors;
 *   commands: readonly DrawCommand[];
 *   subFiles: readonly SubFileDescriptor[];
 * }} ParsedFile
 */

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
 *   triangles: { vertices: Triangle; color: Color }[];
 * }} Geometry
 */

/**
 * @typedef {{
 *   color: Color;
 *   transformation: Matrix;
 *   invert: boolean;
 * }} RenderArgs
 */

/** @typedef {Geometry & { studs: RenderArgs[] }} RenderResult */

/**
 * @typedef {{
 *   fileName: string;
 *   lines: Float32Array<ArrayBuffer>;
 *   optionalLines: Float32Array<ArrayBuffer>;
 *   opaqueTriangles: Float32Array<ArrayBuffer>;
 *   transparentTriangles: Float32Array<ArrayBuffer>;
 *   studs: Float32Array<ArrayBuffer>;
 *   viewBox: number,
 *   center: [number, number, number],
 * }} PartGeometry
 */
