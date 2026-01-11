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
      const interFileReferences = parsed.fileGeometry.files.filter((f) =>
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
      parsed.fileGeometry.files.forEach((f) =>
        subFileReferences.add(f.fileName)
      );
      files.set(blockFileName, parsed);
    }

    const allSubFiles = new Set(
      [...files.values()].flatMap((f) =>
        f.fileGeometry.files.map((f) => f.fileName)
      )
    );

    const subFilesToLoad = allSubFiles.difference(definedSubFiles);

    return { files, subFilesToLoad };
  }
}

export class File {
  #geometry;

  #fileGeometry;

  /** @readonly @type {GeometryType[]}*/
  static #geometryTypes = ["lines", "optionalLines", "triangles"];

  /**
   * @param {string} name
   * @param {Color[]} colors
   * @param {Geometry} geometry
   * @param {FileGeometry} fileGeometry
   * @param {Map<string, File>} subFiles
   */
  constructor(name, colors, geometry, fileGeometry, subFiles) {
    this.name = name;
    this.colors = colors;
    this.#geometry = geometry;
    this.#fileGeometry = fileGeometry;
    this.subFiles = subFiles;
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

    return new File(
      name,
      parsedFile.colors,
      parsedFile.geometry,
      parsedFile.fileGeometry,
      subFileMap
    );
  }

  /**
   * @param {string} fileName
   * @param {string} contents
   *
   * @returns {ParsedFile}
   */
  static parse(fileName, contents) {
    const colors = [];

    const BFC_INVERTNEXT = /^0\s+BFC\s+INVERTNEXT/;

    let invertNext = false;

    /** @type {Geometry} */
    const geometry = {
      lines: [],
      optionalLines: [],
      triangles: [],
      invertedTriangles: [],
    };

    /** @type {FileGeometry} */
    const fileGeometry = {
      studs: [],
      files: [],
    };

    for (const line of contents.split("\n")) {
      const command = line.trim();

      if (!command) {
        continue;
      }

      let parsed;
      if (BFC_INVERTNEXT.test(command)) {
        invertNext = true;
      } else if ((parsed = Color.from(command))) {
        colors.push(parsed);
      } else if (parseGeometry(command, geometry)) {
      } else if (parseDrawFile(command, invertNext, fileGeometry)) {
        invertNext = false;
      }
    }

    return {
      fileName,
      colors,
      geometry,
      fileGeometry,
      subFilesToLoad: new Set(fileGeometry.files.map((f) => f.fileName)),
    };
  }

  /**
   * @param {number} color
   * @param {Matrix} transformation
   * @param {boolean} invert
   * @param {RenderResult} [accumulator]
   *
   * @returns {RenderResult}
   */
  render(
    color = Color.CURRENT_COLOR_CODE,
    transformation = matrix.identity,
    invert = false,
    accumulator
  ) {
    accumulator ??= {
      lines: [],
      optionalLines: [],
      triangles: [],
      studs: [],
    };

    const [a, b, c, , d, e, f, , g, h, ii, , tx, ty, tz] = transformation;

    for (const key of File.#geometryTypes) {
      const destination = accumulator[key];

      const array =
        this.#geometry[
          key === "triangles" && invert ? "invertedTriangles" : key
        ];

      this.#transformGeometry(
        array,
        destination,
        color,
        a,
        d,
        g,
        tx,
        b,
        e,
        h,
        ty,
        c,
        f,
        ii,
        tz
      );
    }

    const startingStudIndex = accumulator.studs.length;
    accumulator.studs.length += this.#fileGeometry.studs.length;
    let index = startingStudIndex;
    for (const stud of this.#fileGeometry.studs) {
      accumulator.studs[index] = {
        color: stud.color === 16 ? color : stud.color,
        invert: invert !== stud.invert,
        transformation: matrix.multiply(transformation, stud.transformation),
      };
      index++;
    }

    for (let i = 0; i < this.#fileGeometry.files.length; i++) {
      const reference = this.#fileGeometry.files[i];
      const file = this.subFiles.get(reference.fileName);

      if (!file) {
        throw new Error(`Missing subfile ${reference.fileName}`);
      }

      file.render(
        reference.color === 16 ? color : reference.color,
        matrix.multiply(transformation, reference.transformation),
        invert !== reference.invert,
        accumulator
      );
    }

    return accumulator;
  }

  /**
   *
   * @param {*} array
   * @param {*} destination
   * @param {number} color
   * @param {number} a
   * @param {number} d
   * @param {number} g
   * @param {number} tx
   * @param {number} b
   * @param {number} e
   * @param {number} h
   * @param {number} ty
   * @param {number} c
   * @param {number} f
   * @param {number} ii
   * @param {number} tz
   */
  #transformGeometry(
    array,
    destination,
    color,
    a,
    d,
    g,
    tx,
    b,
    e,
    h,
    ty,
    c,
    f,
    ii,
    tz
  ) {
    for (let i = 0; i < array.length; i += 4) {
      const x = array[i];
      const y = array[i + 1];
      const z = array[i + 2];

      destination.push(a * x + d * y + g * z + tx);
      destination.push(b * x + e * y + h * z + ty);
      destination.push(c * x + f * y + ii * z + tz);

      destination.push(
        array[i + 3] === 16 || array[i + 3] === 24 ? color : array[i + 3]
      );
    }
  }

  /**
   * @returns {PartGeometry}
   */
  geometry() {
    const {
      lines,
      optionalLines: rawOptionalLines,
      triangles,
      studs: rawStuds,
    } = this.render();

    const { viewBox, center } = File.#boundingBox(lines);

    const optionalLines = new Float32Array(rawOptionalLines.length * 2);

    const optionalLineStride = 4 * 4;

    for (let i = 0; i < rawOptionalLines.length; i += optionalLineStride) {
      const points = rawOptionalLines.slice(i, i + optionalLineStride);
      const index = i * 2;

      // Optional lines are duplicated for the GPU because it needs to render
      // each point considering both points and control points
      optionalLines.set(points, index);
      optionalLines.set(points, index + points.length);
    }

    const studStride = 17; // 16 matrix + 1 color
    const studs = new Float32Array(rawStuds.length * studStride);

    for (let i = 0; i < rawStuds.length; i++) {
      const args = rawStuds[i];
      const index = i * studStride;
      studs.set(args.transformation, index);
      studs[index + 16] = args.color;
    }

    return {
      fileName: this.name,
      lines: new Float32Array(lines),
      optionalLines,
      triangles: new Float32Array(triangles),
      studs: studs,
      viewBox,
      center,
    };
  }

  /**
   * @param {number[]} lines
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

    for (let i = 0; i < lines.length; i += 4) {
      for (let j = 0; j < 3; j++) {
        min[j] = Math.min(min[j], lines[i + j]);
        max[j] = Math.max(max[j], lines[i + j]);
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

/**
 * @param {string} command
 * @param {boolean} parentInvert
 * @param {FileGeometry} geometry
 *
 * @returns {boolean}
 */
function parseDrawFile(command, parentInvert, geometry) {
  const [type, unparsedColor, ...tokens] = command.split(/\s+/);

  if (type !== LineType.DrawFile.toString()) {
    return false;
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

  const invert = matrix.determinant(a, b, c, d, e, f, g, h, i) < 0;

  /**
   * Map an LDraw matrix (where -y is out of the page)
   * to a GPU matrix (where -z is out of the page).
   *
   * @type {Matrix}
   */
  const transformation = [a, g, d, 0, c, i, f, 0, b, h, e, 0, x, z, y, 1];

  const args = {
    fileName,
    color,
    transformation,
    invert: parentInvert !== invert,
  };

  if (fileName === "stud.dat") {
    geometry.studs.push(args);
  } else {
    geometry.files.push(args);
  }

  return true;
}

/**
 * @param {string} command
 * @param {Geometry} geometry
 */
function parseGeometry(command, geometry) {
  const tokens = command.split(/\s+/);

  const type = Number(tokens[0]);

  const geometryType = GeometryMap[type];

  if (!geometryType) {
    return false;
  }

  const [_type, color, ...points] = command.split(/\s+/).map(Number.parseFloat);

  /** @type {Coordinate[]} */
  let coordinates = [];
  for (let i = 0; i < points.length; i += 3) {
    coordinates.push([points[i], points[i + 2], points[i + 1]]);
  }

  if (type === LineType.DrawQuadrilateral) {
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
    coordinates = [one, two, three, three, four, one];
  }

  const array = geometry[geometryType];

  addGeometryCoordinates(array, coordinates, color);

  if (geometryType === "triangles") {
    const invertedCoordinates = coordinates.toReversed();
    addGeometryCoordinates(
      geometry.invertedTriangles,
      invertedCoordinates,
      color
    );
  }

  return true;
}

/**
 * @param {number[]} array
 * @param {Coordinate[]} coordinates
 * @param {number} color
 */
function addGeometryCoordinates(array, coordinates, color) {
  const startingIndex = array.length;
  const stride = 4; // (x y z c)
  array.length += coordinates.length * stride;

  for (let i = 0; i < coordinates.length; i++) {
    const index = startingIndex + i * stride;

    array[index] = coordinates[i][0];
    array[index + 1] = coordinates[i][1];
    array[index + 2] = coordinates[i][2];

    array[index + 3] = color;
  }
}

/** @type {Record<number, Exclude<GeometryType, "studs">>} */
const GeometryMap = {
  [LineType.DrawLine]: "lines",
  [LineType.DrawOptionalLine]: "optionalLines",
  [LineType.DrawTriangle]: "triangles",
  [LineType.DrawQuadrilateral]: "triangles",
};

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

  /** @readonly @type {Rgba} */
  edge;

  /**
   * @param {string} name
   * @param {number} code
   * @param {string | Rgba} value
   * @param {string | Rgba} [edge]
   */
  constructor(name, code, value, edge) {
    this.name = name;
    this.code = code;

    this.rgba = Color.#toRgba(value);
    this.edge = Color.#toRgba(edge ?? [0, 0, 0, 0]);

    this.opaque = this.rgba[3] === 255;
  }

  /**
   * @param {string | Rgba} value
   *
   * @returns {Rgba}
   */
  static #toRgba(value) {
    if (typeof value !== "string") {
      return value;
    }

    const r = Number.parseInt(value.slice(1, 3), 16);
    const g = Number.parseInt(value.slice(3, 5), 16);
    const b = Number.parseInt(value.slice(5, 7), 16);
    const a =
      value.length === 9
        ? // I find the configured alpha values a little too transparent
          Number.parseInt(value.slice(7), 16) + 50
        : 255;

    return [r, g, b, Math.min(a, 255)];
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
      value,
      edge
    );
  }
}

/**
 * @typedef {{
 *   fileName: string;
 *   color: number;
 *   transformation: Matrix;
 *   invert: boolean;
 * }} SubFileReference
 */

/**
 * @typedef {{
 *   fileName: string;
 *   colors: Color[];
 *   geometry: Geometry;
 *   fileGeometry: FileGeometry;
 *   subFilesToLoad: Set<string>;
 * }} ParsedFile
 */

/** @typedef {[number, number, number]} Coordinate */

/** @typedef {[number, number, number, number]} Rgba */

/**
 * @typedef {{
 *   lines: number[];
 *   optionalLines: number[];
 *   triangles: number[];
 *   invertedTriangles: number[];
 * }} Geometry
 *
 * @typedef {"lines" | "optionalLines" | "triangles"} GeometryType
 */

/**
 * @typedef {{
 *   color: number;
 *   transformation: Matrix;
 *   invert: boolean;
 * }} RenderArgs
 */

/**
 * @typedef {{
 *   studs: SubFileReference[];
 *   files: SubFileReference[];
 * }} FileGeometry
 */

/** @typedef {Omit<Geometry, "invertedTriangles"> & { studs: RenderArgs[] }} RenderResult */

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
