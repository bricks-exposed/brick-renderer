/** @import { Matrix } from "./matrix.js" */
import * as matrix from "./matrix.js";

export class MultiPartDocument {
  /**
   * @param {string} mainFileName
   * @param {string | {files: Map<string, ParsedFile>; subFilesToLoad: Set<string> }} contents
   * @param {File[]} loadedFiles
   *
   * @returns {File}
   */
  static from(mainFileName, contents, loadedFiles = []) {
    const { files } =
      typeof contents === "string"
        ? MultiPartDocument.parse(mainFileName, contents)
        : contents;

    const mainFile = files.get(mainFileName);

    if (!mainFile) {
      throw new Error(`File ${mainFileName} is not present in contents`);
    }

    const allFiles = new Set(files.values().map((f) => f.fileName));

    /** @type {Map<string, string[]>} */
    const allReferences = new Map();

    for (const parsed of files.values()) {
      const interFileReferences = parsed.subFileReferences.filter((f) =>
        allFiles.has(f.fileName)
      );

      allReferences.set(
        parsed.fileName,
        interFileReferences.map((f) => f.fileName)
      );
    }

    const startNodes = [mainFileName];
    const out = [];
    let node;

    while ((node = startNodes.shift())) {
      out.push(node);

      const references = allReferences.get(node) ?? [];

      allReferences.delete(node);

      const remainingReferences = new Set([...allReferences.values()].flat());

      for (const reference of references) {
        if (!remainingReferences.has(reference)) {
          startNodes.push(reference);
        }
      }
    }

    const subFiles = loadedFiles;

    for (const fileName of out.slice(1).reverse()) {
      const parsedFile = files.get(fileName);

      if (!parsedFile) {
        throw new Error("This should never happen");
      }

      subFiles.push(File.from(fileName, parsedFile, subFiles));
    }

    return File.from(mainFileName, mainFile, subFiles);
  }

  /**
   * @param {string} fileName
   * @param {string} contents
   *
   * @returns {{
   *   files: Map<string, ParsedFile>;
   *   subFilesToLoad: Set<string>;
   * }}
   */
  static parse(fileName, contents) {
    const FILE_COMMAND = /^\s*0\s+FILE\s+/m;

    let [initial, mainFileContents, ...blocks] = contents.split(FILE_COMMAND);

    // Single file, not mpd
    if (!mainFileContents) {
      mainFileContents = initial;
    }

    /** @type {Map<string, ParsedFile>} */
    const files = new Map();

    const mainFile = File.parse(fileName, mainFileContents);

    files.set(fileName, mainFile);

    /** @type {Set<string>} */
    const definedSubFiles = new Set();

    /** @type {Set<string>} */
    const subFileReferences = new Set();

    for (const block of blocks) {
      const firstNewline = block.indexOf("\n");
      const [rawFileName, contents] = [
        block.slice(0, firstNewline),
        block.slice(firstNewline + 1),
      ];

      const blockFileName = rawFileName.trim();
      const parsed = File.parse(blockFileName, contents);
      definedSubFiles.add(blockFileName);
      parsed.subFileReferences.forEach((f) =>
        subFileReferences.add(f.fileName)
      );
      files.set(blockFileName, parsed);
    }

    const allSubFiles = new Set(
      [...files.values()].flatMap((f) =>
        f.subFileReferences.map((f) => f.fileName)
      )
    );

    const subFilesToLoad = allSubFiles.difference(definedSubFiles);

    return { files, subFilesToLoad };
  }
}

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
      typeof contents === "string" ? File.parse(name, contents) : contents;

    const subFileMap = new Map(subFiles.map((f) => [f.name, f]));

    const drawSubGeometryCommands = [];

    for (const reference of parsedFile.subFileReferences) {
      const subFile = subFileMap.get(reference.fileName);

      if (!subFile) {
        throw new Error(`Missing required subFile ${reference.fileName}`);
      }

      drawSubGeometryCommands.push(new DrawFile(subFile, reference));
    }

    return new File(name, parsedFile.colors, [
      ...parsedFile.commands,
      ...drawSubGeometryCommands,
    ]);
  }

  /**
   * @param {string} fileName
   * @param {string} contents
   *
   * @returns {ParsedFile}
   */
  static parse(fileName, contents) {
    const commands = [];
    const subFileReferences = [];

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
          subFileReferences.push(parsed);
        }
      }
    }

    return {
      fileName,
      colors,
      commands,
      subFileReferences,
      subFilesToLoad: new Set(subFileReferences.map((f) => f.fileName)),
    };
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

    for (const line of rawLines) {
      const points = line.points.flat();
      if (line.controlPoints) {
        // We need to draw
        optionalLines.push(
          ...points,
          ...line.controlPoints.flat(),
          ...points,
          ...line.controlPoints.flat()
        );
      } else {
        lines.push(...points);
      }
    }

    const triangleStride = 12; // Three (x1 y1 z1 c)

    const triangles = new Float32Array(rawTriangles.length * triangleStride);

    for (let i = 0; i < rawTriangles.length; i++) {
      const { vertices, color } = rawTriangles[i];
      for (let j = 0; j < vertices.length; j++) {
        let index = i * triangleStride + j * 4;
        const vertex = vertices[j];
        for (let k = 0; k < vertex.length; k++) {
          triangles[index + k] = vertex[k];
        }
        triangles[index + vertex.length] = color.code;
      }
    }

    const studStride = 17; // 16 matrix + 1 color
    const studs = new Float32Array(rawStuds.length * studStride);

    for (let i = 0; i < rawStuds.length; i++) {
      const args = rawStuds[i];
      const index = i * studStride;
      studs.set(args.transformation, index);
      studs[index + 16] = args.color.code;
    }

    return {
      fileName: this.name,
      lines: new Float32Array(lines),
      optionalLines: new Float32Array(optionalLines),
      triangles: triangles,
      studs: studs,
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
   * @param {SubFileReference} refererence
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
   * @returns {SubFileReference | DrawStud | undefined}
   */
  static from(command, parentInvert, colors) {
    const [type, unparsedColor, ...tokens] = command.split(/\s+/);

    if (type !== LineType.DrawFile.toString()) {
      return undefined;
    }

    const color = Number(unparsedColor);

    const fileName = command.match(/^(\S+\s+){14}(?<fileName>.*)/)?.groups
      ?.fileName;

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

    const reference = {
      fileName,
      color: colors.for(color),
      transformation,
      invertSelf,
      parentInvert,
    };

    return fileName === "stud.dat" ? new DrawStud(reference) : reference;
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
   * @param {SubFileReference} reference
   */
  constructor(file, reference) {
    super(reference);
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
   * @param {SubFileReference} reference
   */
  constructor(reference) {
    super(reference);
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
      coordinates.map((c) => this.transformCoordinate(transformation, c))
    );
  }

  /**
   * @param {Matrix | null | undefined} transformation
   * @param {Coordinate} coordinate
   *
   * @returns {Coordinate}
   */
  static transformCoordinate(transformation, coordinate) {
    if (!transformation || transformation === matrix.identity) {
      return coordinate;
    }

    const [x, y, z] = coordinate;
    const [a, b, c, , d, e, f, , g, h, i, , tx, ty, tz] = transformation;
    return [
      a * x + d * y + g * z + tx,
      b * x + e * y + h * z + ty,
      c * x + f * y + i * z + tz,
    ];
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
      const a =
        value.length === 9
          ? // I find the configured alpha values a little too transparent
            Number.parseInt(value.slice(7), 16) + 50
          : 255;
      this.rgba = [r, g, b, Math.min(a, 255)];
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
 * }} SubFileReference
 */

/**
 * @typedef {{
 *   fileName: string;
 *   colors: Colors;
 *   commands: readonly DrawCommand[];
 *   subFileReferences: readonly SubFileReference[];
 *   subFilesToLoad: Set<string>;
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
 *   triangles: Float32Array<ArrayBuffer>;
 *   studs: Float32Array<ArrayBuffer>;
 *   viewBox: number,
 *   center: [number, number, number],
 * }} PartGeometry
 */
