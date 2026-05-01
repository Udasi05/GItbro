import fs from 'fs';
import { writeObject, sha1, getGitRoot } from './utils/objects.js';

export function hashObject(filepath, write = false) {
  if (!fs.existsSync(filepath)) {
    throw new Error(`File not found: ${filepath}`);
  }
  const content = fs.readFileSync(filepath);
  if (write) {
    const gitRoot = getGitRoot();
    const hash = writeObject('blob', content, gitRoot);
    console.log(hash);
    return hash;
  } else {
    const header = Buffer.from(`blob ${content.length}\0`);
    const store = Buffer.concat([header, content]);
    const hash = sha1(store);
    console.log(hash);
    return hash;
  }
}