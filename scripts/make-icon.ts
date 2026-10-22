import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { PROJECT_ROOT } from './common.js';

type Color = readonly [red: number, green: number, blue: number];
type LineSegment = readonly [startX: number, startY: number, endX: number, endY: number];

const ACCENT_COLOR: Color = [229, 72, 77];
/** The header logo's strokes in its 24×24 view box: arrow shaft, arrow head, base line. */
const LOGO_STROKES: LineSegment[] = [
  [12, 4, 12, 15],
  [7, 10, 12, 15],
  [12, 15, 17, 10],
  [5, 20, 19, 20],
];
const LOGO_VIEW_BOX = 24;
const LOGO_STROKE_WIDTH = 2.6;
const LOGO_SHARE_OF_ICON = 0.62;
const CORNER_RADIUS_SHARE = 0.23;
const PADDING_SHARE = 0.04;
const SAMPLES_PER_AXIS = 4;
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

function distanceToSegment(pointX: number, pointY: number, [startX, startY, endX, endY]: LineSegment): number {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const position = Math.max(
    0,
    Math.min(1, ((pointX - startX) * deltaX + (pointY - startY) * deltaY) / (deltaX * deltaX + deltaY * deltaY)),
  );
  return Math.hypot(pointX - (startX + position * deltaX), pointY - (startY + position * deltaY));
}

function isInsideRoundedSquare(pointX: number, pointY: number, size: number, cornerRadius: number): boolean {
  const nearestX = Math.min(Math.max(pointX, cornerRadius), size - cornerRadius);
  const nearestY = Math.min(Math.max(pointY, cornerRadius), size - cornerRadius);
  return Math.hypot(pointX - nearestX, pointY - nearestY) <= cornerRadius;
}

/** Returns RGBA pixels, anti-aliased by sampling each pixel on a grid. */
function renderIcon(size: number): Buffer {
  const pixels = Buffer.alloc(size * size * 4);
  const padding = size * PADDING_SHARE;
  const squareSize = size - 2 * padding;
  const scale = (squareSize * LOGO_SHARE_OF_ICON) / LOGO_VIEW_BOX;
  const logoOffset = padding + (squareSize - LOGO_VIEW_BOX * scale) / 2;
  const halfStroke = (LOGO_STROKE_WIDTH * scale) / 2;
  const samplesPerPixel = SAMPLES_PER_AXIS * SAMPLES_PER_AXIS;

  for (let pixelY = 0; pixelY < size; pixelY++) {
    for (let pixelX = 0; pixelX < size; pixelX++) {
      let squareSamples = 0;
      let logoSamples = 0;
      for (let sampleY = 0; sampleY < SAMPLES_PER_AXIS; sampleY++) {
        for (let sampleX = 0; sampleX < SAMPLES_PER_AXIS; sampleX++) {
          const pointX = pixelX + (sampleX + 0.5) / SAMPLES_PER_AXIS;
          const pointY = pixelY + (sampleY + 0.5) / SAMPLES_PER_AXIS;
          if (!isInsideRoundedSquare(pointX - padding, pointY - padding, squareSize, squareSize * CORNER_RADIUS_SHARE)) continue;
          squareSamples++;
          const logoX = (pointX - logoOffset) / scale;
          const logoY = (pointY - logoOffset) / scale;
          if (LOGO_STROKES.some((stroke) => distanceToSegment(logoX, logoY, stroke) * scale <= halfStroke)) logoSamples++;
        }
      }
      const whiteShare = squareSamples ? logoSamples / squareSamples : 0;
      const offset = (pixelY * size + pixelX) * 4;
      ACCENT_COLOR.forEach((channel, index) => (pixels[offset + index] = Math.round(channel + (255 - channel) * whiteShare)));
      pixels[offset + 3] = Math.round((squareSamples / samplesPerPixel) * 255);
    }
  }
  return pixels;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, checksum]);
}

function encodePng(size: number, pixels: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits per channel, RGBA
  const rowLength = size * 4;
  const rows = Buffer.alloc(size * (rowLength + 1));
  for (let row = 0; row < size; row++) pixels.copy(rows, row * (rowLength + 1) + 1, row * rowLength, (row + 1) * rowLength);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** An ICO file whose images are PNGs, which Windows supports since Vista. */
function encodeIco(images: { size: number; png: Buffer }[]): Buffer {
  const directory = Buffer.alloc(6 + 16 * images.length);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(images.length, 4);
  let dataOffset = directory.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + 16 * index;
    const storedSize = size >= 256 ? 0 : size;
    directory[entry] = storedSize;
    directory[entry + 1] = storedSize;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(png.length, entry + 8);
    directory.writeUInt32LE(dataOffset, entry + 12);
    dataOffset += png.length;
  });
  return Buffer.concat([directory, ...images.map((image) => image.png)]);
}

const iconPng = (size: number) => encodePng(size, renderIcon(size));

const assetsDirectory = join(PROJECT_ROOT, 'assets');
await mkdir(assetsDirectory, { recursive: true });
await writeFile(join(assetsDirectory, 'icon.png'), iconPng(512));
await writeFile(join(assetsDirectory, 'icon.ico'), encodeIco(ICO_SIZES.map((size) => ({ size, png: iconPng(size) }))));
console.log('Wrote assets/icon.png and assets/icon.ico');
