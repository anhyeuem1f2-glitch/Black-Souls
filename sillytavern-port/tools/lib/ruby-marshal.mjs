import { TextDecoder } from 'node:util';

const UTF8 = new TextDecoder('utf-8', { fatal: false });

export class RubySymbol {
  constructor(name) {
    this.name = name;
  }
}

export class RubyString {
  constructor(bytes) {
    this.bytes = bytes;
    this.ivars = new Map();
  }

  text() {
    return UTF8.decode(this.bytes);
  }
}

export class RubyObject {
  constructor(className) {
    this.className = className;
    this.ivars = new Map();
  }
}

export class RubyHash {
  constructor() {
    this.entries = [];
    this.defaultValue = undefined;
    this.ivars = new Map();
  }
}

export class RubyUserDefined {
  constructor(className, bytes) {
    this.className = className;
    this.bytes = bytes;
    this.ivars = new Map();
  }
}

export class RubyRegexp {
  constructor(bytes, options) {
    this.bytes = bytes;
    this.options = options;
    this.ivars = new Map();
  }
}

function signedByte(byte) {
  return byte > 127 ? byte - 256 : byte;
}

export class RubyMarshalReader {
  constructor(input) {
    this.bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    this.offset = 0;
    this.objects = [];
    this.symbols = [];
  }

  read() {
    const major = this.byte();
    const minor = this.byte();
    if (major !== 4 || minor > 8) {
      throw new Error(`Unsupported Ruby Marshal version ${major}.${minor}`);
    }
    const value = this.value();
    if (this.offset !== this.bytes.length) {
      throw new Error(`Trailing Marshal data: ${this.bytes.length - this.offset} bytes`);
    }
    return value;
  }

  byte() {
    if (this.offset >= this.bytes.length) throw new Error('Unexpected end of Marshal data');
    return this.bytes[this.offset++];
  }

  take(length) {
    if (length < 0 || this.offset + length > this.bytes.length) {
      throw new Error(`Invalid byte length ${length} at offset ${this.offset}`);
    }
    const result = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  long() {
    const marker = signedByte(this.byte());
    if (marker === 0) return 0;
    if (marker > 4) return marker - 5;
    if (marker < -4) return marker + 5;

    const size = Math.abs(marker);
    let result = marker > 0 ? 0n : -1n;
    for (let index = 0; index < size; index += 1) {
      const shift = BigInt(index * 8);
      const mask = 0xffn << shift;
      result = (result & ~mask) | (BigInt(this.byte()) << shift);
    }
    const number = Number(result);
    if (!Number.isSafeInteger(number)) throw new Error(`Marshal integer exceeds JS safe range: ${result}`);
    return number;
  }

  rawBytes() {
    return this.take(this.long());
  }

  rawText() {
    return UTF8.decode(this.rawBytes());
  }

  register(value) {
    this.objects.push(value);
    return value;
  }

  symbol() {
    const type = String.fromCharCode(this.byte());
    if (type === ':') {
      const symbol = new RubySymbol(this.rawText());
      this.symbols.push(symbol);
      return symbol;
    }
    if (type === ';') {
      const index = this.long();
      if (!(index in this.symbols)) throw new Error(`Invalid symbol link ${index}`);
      return this.symbols[index];
    }
    throw new Error(`Expected symbol, found ${JSON.stringify(type)}`);
  }

  ivars(target) {
    const count = this.long();
    if (!target.ivars) target.ivars = new Map();
    for (let index = 0; index < count; index += 1) {
      target.ivars.set(this.symbol().name, this.value());
    }
    return target;
  }

  value() {
    const type = String.fromCharCode(this.byte());
    switch (type) {
      case '0': return null;
      case 'T': return true;
      case 'F': return false;
      case 'i': return this.long();
      case ':': {
        this.offset -= 1;
        return this.symbol();
      }
      case ';': {
        this.offset -= 1;
        return this.symbol();
      }
      case '@': {
        const index = this.long();
        if (!(index in this.objects)) throw new Error(`Invalid object link ${index}`);
        return this.objects[index];
      }
      case '"': return this.register(new RubyString(this.rawBytes()));
      case '[': {
        const array = this.register([]);
        const count = this.long();
        for (let index = 0; index < count; index += 1) array.push(this.value());
        return array;
      }
      case '{':
      case '}': {
        const hash = this.register(new RubyHash());
        const count = this.long();
        for (let index = 0; index < count; index += 1) {
          hash.entries.push([this.value(), this.value()]);
        }
        if (type === '}') hash.defaultValue = this.value();
        return hash;
      }
      case 'o': {
        const object = this.register(new RubyObject(this.symbol().name));
        return this.ivars(object);
      }
      case 'S': {
        const object = this.register(new RubyObject(this.symbol().name));
        const count = this.long();
        for (let index = 0; index < count; index += 1) {
          object.ivars.set(this.symbol().name, this.value());
        }
        return object;
      }
      case 'u': {
        const object = new RubyUserDefined(this.symbol().name, this.rawBytes());
        return this.register(object);
      }
      case 'U': {
        const object = this.register(new RubyObject(this.symbol().name));
        object.ivars.set('$marshal', this.value());
        return object;
      }
      case 'I': return this.ivars(this.value());
      case 'e': {
        const moduleName = this.symbol().name;
        const object = this.value();
        if (!object.extendedModules) object.extendedModules = [];
        object.extendedModules.push(moduleName);
        return object;
      }
      case 'C': {
        const className = this.symbol().name;
        const object = this.value();
        object.userClass = className;
        return object;
      }
      case '/': {
        const regexp = this.register(new RubyRegexp(this.rawBytes(), this.byte()));
        return regexp;
      }
      case 'f': {
        const text = this.rawText();
        if (text === 'nan') return this.register(Number.NaN);
        if (text === 'inf') return this.register(Number.POSITIVE_INFINITY);
        if (text === '-inf') return this.register(Number.NEGATIVE_INFINITY);
        return this.register(Number(text));
      }
      case 'l': {
        const sign = String.fromCharCode(this.byte()) === '-' ? -1n : 1n;
        const words = this.long();
        let result = 0n;
        for (let index = 0; index < words * 2; index += 1) {
          result |= BigInt(this.byte()) << BigInt(index * 8);
        }
        result *= sign;
        return this.register(Number.isSafeInteger(Number(result)) ? Number(result) : { $bigint: result.toString() });
      }
      case 'c': return this.register({ $classReference: this.rawText() });
      case 'm': return this.register({ $moduleReference: this.rawText() });
      case 'M': return this.register({ $classOrModuleReference: this.rawText() });
      default:
        throw new Error(`Unsupported Marshal type ${JSON.stringify(type)} at offset ${this.offset - 1}`);
    }
  }
}

export function parseRubyMarshal(input) {
  return new RubyMarshalReader(input).read();
}

function ivarsToObject(ivars, seen) {
  const output = {};
  for (const [key, value] of ivars ?? []) {
    const cleanKey = key.startsWith('@') ? key.slice(1) : key;
    output[cleanKey] = normalizeRubyValue(value, seen);
  }
  return output;
}

function decodeTable(bytes) {
  if (bytes.byteLength < 20) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dimensions = view.getInt32(0, true);
  const xsize = view.getInt32(4, true);
  const ysize = view.getInt32(8, true);
  const zsize = view.getInt32(12, true);
  const count = view.getInt32(16, true);
  if (count < 0 || 20 + count * 2 > bytes.byteLength) return null;
  const data = new Array(count);
  for (let index = 0; index < count; index += 1) data[index] = view.getInt16(20 + index * 2, true);
  return { $class: 'Table', dimensions, xsize, ysize, zsize, data };
}

function decodeDoubles(className, bytes) {
  if (!['Color', 'Tone'].includes(className) || bytes.byteLength !== 32) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const values = Array.from({ length: 4 }, (_, index) => view.getFloat64(index * 8, true));
  const keys = className === 'Color' ? ['red', 'green', 'blue', 'alpha'] : ['red', 'green', 'blue', 'gray'];
  return { $class: className, ...Object.fromEntries(keys.map((key, index) => [key, values[index]])) };
}

function looksLikeText(bytes, text) {
  if (bytes.length === 0) return true;
  if (text.includes('\u0000') || text.includes('\ufffd')) return false;
  let controls = 0;
  for (const byte of bytes) {
    if (byte < 0x20 && ![0x09, 0x0a, 0x0d].includes(byte)) controls += 1;
  }
  return controls / bytes.length < 0.02;
}

export function normalizeRubyValue(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return value;
  if (typeof value !== 'object') return value;
  if (value.$bigint) return value;
  if (seen.has(value)) return { $ref: 'shared-object' };
  seen.add(value);
  try {
    if (value instanceof RubySymbol) return { $symbol: value.name };
    if (value instanceof RubyString) {
      const text = value.text();
      const ivars = ivarsToObject(value.ivars, seen);
      const encodingOnly = Object.keys(ivars).every((key) => key === 'E');
      if (looksLikeText(value.bytes, text)) return Object.keys(ivars).length && !encodingOnly ? { $string: text, $ivars: ivars } : text;
      return { $bytes: Buffer.from(value.bytes).toString('base64'), size: value.bytes.length, ...(Object.keys(ivars).length ? { $ivars: ivars } : {}) };
    }
    if (Array.isArray(value)) return value.map((item) => normalizeRubyValue(item, seen));
    if (value instanceof RubyHash) {
      const simple = value.entries.every(([key]) => ['string', 'number'].includes(typeof key) || key instanceof RubyString || key instanceof RubySymbol);
      const defaultValue = value.defaultValue === undefined ? {} : { $default: normalizeRubyValue(value.defaultValue, seen) };
      if (simple) {
        const entries = value.entries.map(([key, item]) => {
          const normalizedKey = key instanceof RubyString ? key.text() : key instanceof RubySymbol ? key.name : String(key);
          return [normalizedKey, normalizeRubyValue(item, seen)];
        });
        return { ...Object.fromEntries(entries), ...defaultValue };
      }
      return { $hash: value.entries.map(([key, item]) => [normalizeRubyValue(key, seen), normalizeRubyValue(item, seen)]), ...defaultValue };
    }
    if (value instanceof RubyObject) {
      return { $class: value.className, ...ivarsToObject(value.ivars, seen) };
    }
    if (value instanceof RubyUserDefined) {
      const table = value.className === 'Table' ? decodeTable(value.bytes) : null;
      const doubles = decodeDoubles(value.className, value.bytes);
      return table ?? doubles ?? {
        $class: value.className,
        $bytes: Buffer.from(value.bytes).toString('base64'),
        size: value.bytes.length,
        ...ivarsToObject(value.ivars, seen),
      };
    }
    if (value instanceof RubyRegexp) {
      return { $regexp: UTF8.decode(value.bytes), options: value.options, ...ivarsToObject(value.ivars, seen) };
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeRubyValue(item, seen)]));
  } finally {
    seen.delete(value);
  }
}
