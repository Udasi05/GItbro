import fs from 'fs';
import path from 'path';
import { readObject, sha1, getGitRoot } from './utils/objects.js';
import { readIndex } from './add.js';

// Get committed file SHAs from HEAD tree
function getCommittedFiles(gitRoot) {
  const headPath = path.join(gitRoot, 'HEAD');
  const headContent = fs.readFileSync(headPath, 'utf8').trim();

  let commitSHA = null;
  if (headContent.startsWith('ref: ')) {
    const refPath = path.join(gitRoot, headContent.slice(5));
    if (!fs.existsSync(refPath)) return {};
    commitSHA = fs.readFileSync(refPath, 'utf8').trim();
  } else {
    commitSHA = headContent;
  }

  const { content } = readObject(commitSHA, gitRoot);
  const treeMatch = content.toString().match(/^tree ([a-f0-9]{40})/m);
  if (!treeMatch) return {};
  return readTree(treeMatch[1], gitRoot, '');
}

function readTree(treeSHA, gitRoot, prefix) {
  const { content } = readObject(treeSHA, gitRoot);
  const files = {};
  let offset = 0;
  while (offset < content.length) {
    const nullIdx = content.indexOf(0, offset);
    const header = content.slice(offset, nullIdx).toString();
    const [mode, name] = header.split(' ');
    const sha = content.slice(nullIdx + 1, nullIdx + 21).toString('hex');
    offset = nullIdx + 21;
    const fullPath = prefix ? `${prefix}/${name}` : name;
    if (mode === '40000') Object.assign(files, readTree(sha, gitRoot, fullPath));
    else files[fullPath] = sha;
  }
  return files;
}

// -------------------------------------------------------
// Myers diff algorithm — the same core algorithm real Git uses
// Returns an array of { type: 'equal'|'insert'|'delete', line }
// -------------------------------------------------------
function myersDiff(oldLines, newLines) {
  const o = oldLines.length;
  const n = newLines.length;
  const max = o + n;

  // v[k] stores the furthest x we can reach on diagonal k
  const v = new Array(2 * max + 1).fill(0);
  const trace = [];

  for (let d = 0; d <= max; d++) {
    trace.push([...v]);
    for (let k = -d; k <= d; k += 2) {
      const idx = k + max;
      let x;
      if (k === -d || (k !== d && v[idx - 1] < v[idx + 1])) {
        x = v[idx + 1]; // move down (insert)
      } else {
        x = v[idx - 1] + 1; // move right (delete)
      }
      let y = x - k;
      // Follow the snake (matching lines)
      while (x < o && y < n && oldLines[x] === newLines[y]) {
        x++; y++;
      }
      v[idx] = x;
      if (x >= o && y >= n) {
        return buildEditScript(trace, oldLines, newLines, max);
      }
    }
  }
  return buildEditScript(trace, oldLines, newLines, max);
}

function buildEditScript(trace, oldLines, newLines, offset) {
  const o = oldLines.length;
  const n = newLines.length;
  const result = [];

  let x = o, y = n;

  for (let d = trace.length - 1; d > 0 && (x > 0 || y > 0); d--) {
    const v = trace[d];
    const k = x - y;
    const idx = k + offset;

    let prevK;
    if (k === -d || (k !== d && v[idx - 1] < v[idx + 1])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = v[prevK + offset];
    const prevY = prevX - prevK;

    // Walk back along the snake
    while (x > prevX && y > prevY) {
      result.push({ type: 'equal', line: oldLines[x - 1] });
      x--; y--;
    }

    if (d > 0) {
      if (x === prevX) {
        result.push({ type: 'insert', line: newLines[y - 1] });
        y--;
      } else {
        result.push({ type: 'delete', line: oldLines[x - 1] });
        x--;
      }
    }
  }

  // Any remaining lines at start
  while (x > 0 && y > 0) {
    result.push({ type: 'equal', line: oldLines[x - 1] });
    x--; y--;
  }
  while (y > 0) {
    result.push({ type: 'insert', line: newLines[y - 1] });
    y--;
  }
  while (x > 0) {
    result.push({ type: 'delete', line: oldLines[x - 1] });
    x--;
  }

  return result.reverse();
}

// Print a unified diff for two versions of a file
function printDiff(filename, oldContent, newContent, oldLabel = 'a', newLabel = 'b') {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  const edits = myersDiff(oldLines, newLines);

  // Check if anything actually changed
  const hasChanges = edits.some(e => e.type !== 'equal');
  if (!hasChanges) return false;

  console.log(`\x1b[1mdiff --gitbro ${oldLabel}/${filename} ${newLabel}/${filename}\x1b[0m`);
  console.log(`\x1b[1m--- ${oldLabel}/${filename}\x1b[0m`);
  console.log(`\x1b[1m+++ ${newLabel}/${filename}\x1b[0m`);

  // Group into hunks (context of 3 lines around changes)
  const CONTEXT = 3;
  let hunkLines = [];
  let oldLine = 1, newLine = 1;
  let hunkOldStart = 1, hunkNewStart = 1;
  let inHunk = false;
  let pendingContext = [];

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];

    if (edit.type === 'equal') {
      if (inHunk) {
        hunkLines.push({ ...edit, oldLine, newLine });
        // If we have more than CONTEXT equal lines and no upcoming changes, flush
        const futureChanges = edits.slice(i + 1, i + CONTEXT + 1).some(e => e.type !== 'equal');
        if (!futureChanges && hunkLines.filter(l => l.type === 'equal').length > CONTEXT * 2) {
          flushHunk(hunkLines, hunkOldStart, hunkNewStart);
          hunkLines = [];
          inHunk = false;
        }
      } else {
        pendingContext.push({ ...edit, oldLine, newLine });
        if (pendingContext.length > CONTEXT) pendingContext.shift();
      }
      oldLine++; newLine++;
    } else {
      if (!inHunk) {
        hunkOldStart = pendingContext.length ? pendingContext[0].oldLine : oldLine;
        hunkNewStart = pendingContext.length ? pendingContext[0].newLine : newLine;
        hunkLines = [...pendingContext];
        pendingContext = [];
        inHunk = true;
      }
      hunkLines.push({ ...edit, oldLine, newLine });
      if (edit.type === 'delete') oldLine++;
      else newLine++;
    }
  }

  if (inHunk && hunkLines.length) {
    flushHunk(hunkLines, hunkOldStart, hunkNewStart);
  }

  return true;
}

function flushHunk(lines, oldStart, newStart) {
  const CONTEXT = 3;
  // Trim trailing context to at most CONTEXT lines
  let trimEnd = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].type === 'equal') trimEnd++;
    else break;
  }
  const trimmed = trimEnd > CONTEXT ? lines.slice(0, lines.length - (trimEnd - CONTEXT)) : lines;

  const oldCount = trimmed.filter(l => l.type !== 'insert').length;
  const newCount = trimmed.filter(l => l.type !== 'delete').length;

  console.log(`\x1b[36m@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\x1b[0m`);

  for (const line of trimmed) {
    if (line.type === 'insert') console.log(`\x1b[32m+${line.line}\x1b[0m`);
    else if (line.type === 'delete') console.log(`\x1b[31m-${line.line}\x1b[0m`);
    else console.log(` ${line.line}`);
  }
}

// -------------------------------------------------------
// Main diff command
// -------------------------------------------------------
export function diff(options = {}) {
  const gitRoot = getGitRoot();
  const repoRoot = path.dirname(gitRoot);
  const committed = getCommittedFiles(gitRoot);
  const index = readIndex(gitRoot);

  if (options.cached) {
    // --cached: compare index vs last commit (what will go into next commit)
    let anyDiff = false;
    for (const [file, stagedSHA] of Object.entries(index)) {
      const oldContent = committed[file]
        ? readObject(committed[file], gitRoot).content.toString('utf8')
        : '';
      const newContent = readObject(stagedSHA, gitRoot).content.toString('utf8');
      if (printDiff(file, oldContent, newContent)) anyDiff = true;
    }
    if (!anyDiff) console.log('(no staged changes)');
  } else {
    // Default: compare working directory vs index (or vs last commit)
    const allTracked = new Set([...Object.keys(committed), ...Object.keys(index)]);
    let anyDiff = false;

    for (const file of allTracked) {
      const diskPath = path.join(repoRoot, file);

      // Get "old" content: from index if staged, else from last commit
      const baseSHA = index[file] || committed[file];
      const oldContent = baseSHA
        ? readObject(baseSHA, gitRoot).content.toString('utf8')
        : '';

      // Get "new" content: current file on disk
      const newContent = fs.existsSync(diskPath)
        ? fs.readFileSync(diskPath, 'utf8')
        : '';

      if (oldContent === newContent) continue;
      if (printDiff(file, oldContent, newContent)) anyDiff = true;
    }

    if (!anyDiff) console.log('(no changes)');
  }
}