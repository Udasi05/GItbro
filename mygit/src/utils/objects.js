import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';

export function getGitRoot() {
  let dir = process.cwd();
  while (true) {
    const candidate = path.join(dir, '.gitbro');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('Not a gitbro repository. Run: gitbro init');
    dir = parent;
  }
}

export function sha1(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

export function writeObject(type, content, gitRoot) {
  const contentBuf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const header = Buffer.from(`${type} ${contentBuf.length}\0`);
  const store = Buffer.concat([header, contentBuf]);
  const hash = sha1(store);
  const compressed = zlib.deflateSync(store);
  const folder = path.join(gitRoot, 'objects', hash.slice(0, 2));
  const file = path.join(folder, hash.slice(2));
  if (!fs.existsSync(file)) {
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(file, compressed);
  }
  return hash;
}

export function readObject(hash, gitRoot) {
  const file = path.join(gitRoot, 'objects', hash.slice(0, 2), hash.slice(2));
  if (!fs.existsSync(file)) throw new Error(`Object not found: ${hash}`);
  const compressed = fs.readFileSync(file);
  const raw = zlib.inflateSync(compressed);
  const nullIdx = raw.indexOf(0);
  const header = raw.slice(0, nullIdx).toString();
  const content = raw.slice(nullIdx + 1);
  const [type, size] = header.split(' ');
  return { type, size: parseInt(size), content };
}