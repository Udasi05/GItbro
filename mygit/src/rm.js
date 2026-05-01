import fs from 'fs';
import path from 'path';
import { getGitRoot } from './utils/objects.js';
import { readIndex, writeIndex } from './add.js';

export function rm(files, options = {}) {
  const gitRoot = getGitRoot();
  const index = readIndex(gitRoot);
  const cwd = process.cwd();

  for (const file of files) {
    const absPath = path.resolve(cwd, file);
    const relPath = path.relative(cwd, absPath).split(path.sep).join('/');

    if (!index[relPath]) {
      console.error(`fatal: pathspec '${file}' did not match any files`);
      continue;
    }

    // 1. Remove from Disk (unless --cached is specified)
    if (!options.cached && fs.existsSync(absPath)) {
      if (fs.statSync(absPath).isDirectory()) {
        fs.rmSync(absPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(absPath);
      }
    }

    // 2. Remove from Index
    delete index[relPath];
    console.log(`rm '${relPath}'`);
  }

  writeIndex(gitRoot, index);
}
