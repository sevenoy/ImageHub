type ZipEntry = {
  path: string;
  data: Uint8Array;
  crc: number;
  offset: number;
};

const textEncoder = new TextEncoder();

const makeCrcTable = () => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
};

const crcTable = makeCrcTable();

const crc32 = (data: Uint8Array) => {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc = crcTable[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const writeUint16 = (target: Uint8Array, offset: number, value: number) => {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
};

const writeUint32 = (target: Uint8Array, offset: number, value: number) => {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
};

const concatParts = (parts: Uint8Array[]) => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
};

export class ZipBuilder {
  private entries: ZipEntry[] = [];
  private offset = 0;

  async addFile(path: string, blob: Blob) {
    const data = new Uint8Array(await blob.arrayBuffer());
    this.entries.push({
      path,
      data,
      crc: crc32(data),
      offset: this.offset,
    });
    this.offset += 30 + textEncoder.encode(path).length + data.length;
  }

  toBlob() {
    const localParts: Uint8Array[] = [];
    const centralParts: Uint8Array[] = [];

    this.entries.forEach((entry) => {
      const name = textEncoder.encode(entry.path);
      const localHeader = new Uint8Array(30 + name.length);
      writeUint32(localHeader, 0, 0x04034b50);
      writeUint16(localHeader, 4, 20);
      writeUint16(localHeader, 6, 0x0800);
      writeUint16(localHeader, 8, 0);
      writeUint32(localHeader, 14, entry.crc);
      writeUint32(localHeader, 18, entry.data.length);
      writeUint32(localHeader, 22, entry.data.length);
      writeUint16(localHeader, 26, name.length);
      localHeader.set(name, 30);
      localParts.push(localHeader, entry.data);

      const centralHeader = new Uint8Array(46 + name.length);
      writeUint32(centralHeader, 0, 0x02014b50);
      writeUint16(centralHeader, 4, 20);
      writeUint16(centralHeader, 6, 20);
      writeUint16(centralHeader, 8, 0x0800);
      writeUint16(centralHeader, 10, 0);
      writeUint32(centralHeader, 16, entry.crc);
      writeUint32(centralHeader, 20, entry.data.length);
      writeUint32(centralHeader, 24, entry.data.length);
      writeUint16(centralHeader, 28, name.length);
      writeUint32(centralHeader, 42, entry.offset);
      centralHeader.set(name, 46);
      centralParts.push(centralHeader);
    });

    const centralDirectory = concatParts(centralParts);
    const end = new Uint8Array(22);
    writeUint32(end, 0, 0x06054b50);
    writeUint16(end, 8, this.entries.length);
    writeUint16(end, 10, this.entries.length);
    writeUint32(end, 12, centralDirectory.length);
    writeUint32(end, 16, this.offset);

    return new Blob([...localParts, centralDirectory, end], { type: 'application/zip' });
  }
}
