// QR Code Model 2, version 5-L, byte mode, mask 0. Capacity: 106 UTF-8 bytes.
const VERSION = 5;
const SIZE = 17 + VERSION * 4;
const DATA_CODEWORDS = 108;
const ECC_CODEWORDS = 26;

function multiply(a: number, b: number): number {
  let result = 0;
  for (let i = 7; i >= 0; i--) {
    result = (result << 1) ^ ((result >>> 7) * 0x11d);
    result ^= ((b >>> i) & 1) * a;
  }
  return result;
}

function reedSolomon(data: number[]): number[] {
  let generator = [1];
  let root = 1;
  for (let i = 0; i < ECC_CODEWORDS; i++) {
    const next = new Array(generator.length + 1).fill(0);
    generator.forEach((value, index) => {
      next[index] ^= value;
      next[index + 1] ^= multiply(value, root);
    });
    generator = next;
    root = multiply(root, 2);
  }
  const remainder = new Array(ECC_CODEWORDS).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder.shift()!;
    remainder.push(0);
    for (let i = 0; i < ECC_CODEWORDS; i++) remainder[i] ^= multiply(generator[i + 1], factor);
  }
  return remainder;
}

function makeCodewords(value: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(value));
  if (bytes.length > 106) throw new Error("URL excede capacidade do QR Code.");
  const bits: number[] = [];
  const append = (n: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((n >>> i) & 1);
  };
  append(0b0100, 4); // byte mode
  append(bytes.length, 8);
  bytes.forEach((byte) => append(byte, 8));
  for (let i = 0; i < Math.min(4, DATA_CODEWORDS * 8 - bits.length); i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data = bits.reduce<number[]>((out, bit, i) => {
    if (i % 8 === 0) out.push(0);
    out[out.length - 1] = (out[out.length - 1] << 1) | bit;
    return out;
  }, []);
  for (let pad = 0; data.length < DATA_CODEWORDS; pad++) data.push(pad % 2 === 0 ? 0xec : 0x11);
  return [...data, ...reedSolomon(data)];
}

export function qrCodeSvg(value: string): string {
  const codewords = makeCodewords(value);
  const modules = Array.from({ length: SIZE }, () => new Array<boolean>(SIZE).fill(false));
  const reserved = Array.from({ length: SIZE }, () => new Array<boolean>(SIZE).fill(false));
  const setFunction = (x: number, y: number, dark: boolean) => {
    if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) {
      modules[y][x] = dark;
      reserved[y][x] = true;
    }
  };

  const finder = (cx: number, cy: number) => {
    for (let dy = -1; dy <= 7; dy++)
      for (let dx = -1; dx <= 7; dx++) {
        const x = cx + dx,
          y = cy + dy;
        const inside = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
        const dark =
          inside &&
          (dx === 0 ||
            dx === 6 ||
            dy === 0 ||
            dy === 6 ||
            (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
        setFunction(x, y, dark);
      }
  };
  finder(0, 0);
  finder(SIZE - 7, 0);
  finder(0, SIZE - 7);

  // Version 5 alignment pattern has one non-overlapping center at (30, 30).
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      setFunction(30 + dx, 30 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  for (let i = 8; i < SIZE - 8; i++) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }

  // Reserve both format-information copies and dark module.
  for (let i = 0; i <= 5; i++) setFunction(8, i, false);
  setFunction(8, 7, false);
  setFunction(8, 8, false);
  setFunction(7, 8, false);
  for (let i = 9; i < 15; i++) setFunction(14 - i, 8, false);
  for (let i = 0; i < 8; i++) setFunction(SIZE - 1 - i, 8, false);
  for (let i = 8; i < 15; i++) setFunction(8, SIZE - 15 + i, false);
  setFunction(8, SIZE - 8, true);

  const data = codewords.flatMap((byte) =>
    Array.from({ length: 8 }, (_, i) => (byte >>> (7 - i)) & 1)
  );
  let bitIndex = 0;
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < SIZE; vert++) {
      const y = ((right + 1) & 2) === 0 ? SIZE - 1 - vert : vert;
      for (let offset = 0; offset < 2; offset++) {
        const x = right - offset;
        if (!reserved[y][x]) {
          const bit = data[bitIndex++] ?? 0;
          modules[y][x] = (bit === 1) !== ((x + y) % 2 === 0); // mask 0
        }
      }
    }
  }

  // L-level format bits, mask 0, BCH remainder, then standard XOR mask.
  const formatData = 0b01000;
  let rem = formatData << 10;
  for (let i = 14; i >= 10; i--) if (((rem >>> i) & 1) !== 0) rem ^= 0x537 << (i - 10);
  const format = ((formatData << 10) | rem) ^ 0x5412;
  const bit = (i: number) => ((format >>> i) & 1) !== 0;
  for (let i = 0; i <= 5; i++) modules[i][8] = bit(i);
  modules[7][8] = bit(6);
  modules[8][8] = bit(7);
  modules[8][7] = bit(8);
  for (let i = 9; i < 15; i++) modules[8][14 - i] = bit(i);
  for (let i = 0; i < 8; i++) modules[8][SIZE - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) modules[SIZE - 15 + i][8] = bit(i);
  modules[SIZE - 8][8] = true;

  const path: string[] = [];
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) path.push(`M${x + 2},${y + 2}h1v1h-1z`);
    })
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE + 4} ${SIZE + 4}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path.join("")}" fill="#000"/></svg>`;
}
