import fs from 'fs';
import path from 'path';
import { writeObject, readObject, getGitRoot } from './utils/objects.js';
import { readIndex, writeIndex } from './add.js';

/**
 * Read a tree object and return a flat map of { 'path/to/file': sha }
 */
function readTreeFlat(treeSHA, gitRoot, prefix = '') {
  const { content } = readObject(treeSHA, gitRoot);
  const files = {};
  let offset = 0;
  while (offset < content.length) {
    const nullIdx = content.indexOf(0, offset);
    const [mode, name] = content.slice(offset, nullIdx).toString().split(' ');
    const sha = content.slice(nullIdx + 1, nullIdx + 21).toString('hex');
    offset = nullIdx + 21;
    const full = prefix ? `${prefix}/${name}` : name;
    if (mode === '40000') Object.assign(files, readTreeFlat(sha, gitRoot, full));
    else files[full] = sha;
  }
  return files;
}

/**
 * Get all files from the parent commit's tree.
 * Returns {} if there is no parent.
 */
function getParentTree(gitRoot) {
  const headSHA = getHeadSHA(gitRoot);
  if (!headSHA) return {};
  try {
    const { content } = readObject(headSHA, gitRoot);
    const match = content.toString().match(/^tree ([a-f0-9]{40})/m);
    if (!match) return {};
    return readTreeFlat(match[1], gitRoot);
  } catch {
    return {};
  }
}

/**
 * Build nested tree objects from a flat index { 'path/to/file': sha }.
 * Supports subdirectories by recursively creating sub-tree objects.
 */
function buildTree(files, gitRoot) {
  const dirs = {};
  const blobs = {};

  for (const [filePath, hash] of Object.entries(files)) {
    const slashIdx = filePath.indexOf('/');
    if (slashIdx === -1) {
      blobs[filePath] = hash;
    } else {
      const dir = filePath.slice(0, slashIdx);
      const rest = filePath.slice(slashIdx + 1);
      if (!dirs[dir]) dirs[dir] = {};
      dirs[dir][rest] = hash;
    }
  }

  let treeContent = Buffer.alloc(0);

  // Combine and sort all entries alphabetically
  const allEntries = [
    ...Object.keys(dirs).map(name => ({ name, isDir: true })),
    ...Object.keys(blobs).map(name => ({ name, isDir: false })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  for (const { name, isDir } of allEntries) {
    if (isDir) {
      const subTreeHash = buildTree(dirs[name], gitRoot);
      const entry = Buffer.from(`40000 ${name}\0`);
      const hashBinary = Buffer.from(subTreeHash, 'hex');
      treeContent = Buffer.concat([treeContent, entry, hashBinary]);
    } else {
      const entry = Buffer.from(`100644 ${name}\0`);
      const hashBinary = Buffer.from(blobs[name], 'hex');
      treeContent = Buffer.concat([treeContent, entry, hashBinary]);
    }
  }

  return writeObject('tree', treeContent, gitRoot);
}

function getHeadSHA(gitRoot) {
  const headPath = path.join(gitRoot, 'HEAD');
  const headContent = fs.readFileSync(headPath, 'utf8').trim();
  if (headContent.startsWith('ref: ')) {
    const refPath = path.join(gitRoot, headContent.slice(5));
    if (!fs.existsSync(refPath)) return null;
    return fs.readFileSync(refPath, 'utf8').trim();
  }
  return headContent;
}

function getCurrentBranch(gitRoot) {
  const headContent = fs.readFileSync(path.join(gitRoot, 'HEAD'), 'utf8').trim();
  if (headContent.startsWith('ref: refs/heads/')) {
    return headContent.slice('ref: refs/heads/'.length);
  }
  return 'HEAD';
}

function updateHead(gitRoot, sha) {
  const headPath = path.join(gitRoot, 'HEAD');
  const headContent = fs.readFileSync(headPath, 'utf8').trim();
  if (headContent.startsWith('ref: ')) {
    const refPath = path.join(gitRoot, headContent.slice(5));
    fs.mkdirSync(path.dirname(refPath), { recursive: true });
    fs.writeFileSync(refPath, sha + '\n');
  } else {
    fs.writeFileSync(headPath, sha + '\n');
  }
}

export function commit(message, authorName = 'Developer', authorEmail = 'dev@gitbro.local') {
  const gitRoot = getGitRoot();
  const index = readIndex(gitRoot);

  if (Object.keys(index).length === 0) {
    console.error('nothing to commit (use "gitbro add" to stage files)');
    process.exit(1);
  }

  // Merge parent tree with current index so all tracked files are preserved
  const parentFiles = getParentTree(gitRoot);
  const mergedFiles = { ...parentFiles, ...index };

  const treeSHA = buildTree(mergedFiles, gitRoot);
  const parentSHA = getHeadSHA(gitRoot);
  const timestamp = Math.floor(Date.now() / 1000);
  const timezone = '+0530';

  let commitContent = `tree ${treeSHA}\n`;
  if (parentSHA) commitContent += `parent ${parentSHA}\n`;
  commitContent += `author ${authorName} <${authorEmail}> ${timestamp} ${timezone}\n`;
  commitContent += `committer ${authorName} <${authorEmail}> ${timestamp} ${timezone}\n`;
  commitContent += `\n${message}\n`;

  const commitSHA = writeObject('commit', commitContent, gitRoot);
  updateHead(gitRoot, commitSHA);
  writeIndex(gitRoot, {});

  const shortSHA = commitSHA.slice(0, 7);
  const branch = getCurrentBranch(gitRoot);
  console.log(`[${branch} ${shortSHA}] ${message}`);
  console.log(`  ${Object.keys(index).length} file(s) committed`);
}