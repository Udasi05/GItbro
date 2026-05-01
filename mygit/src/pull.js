import fs   from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { getGitRoot } from './utils/objects.js';
import { getRemoteUrl } from './remote.js';

async function getJSON(url) {
  try {
    const result = await fetch(url, {
      headers: { 'Bypass-Tunnel-Reminder': 'true' }
    });
    if (!result.ok) throw new Error(`HTTP ${result.status}`);
    const text = await result.text();
    try { return JSON.parse(text); }
    catch { throw new Error('invalid JSON from server'); }
  } catch (err) {
    throw err;
  }
}

function sha1(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

// Write a raw object (already-decoded content) into the object store
function writeRawObject(type, contentBuf, gitRoot) {
  const header  = Buffer.from(`${type} ${contentBuf.length}\0`);
  const store   = Buffer.concat([header, contentBuf]);
  const hash    = sha1(store);
  const objDir  = path.join(gitRoot, 'objects', hash.slice(0, 2));
  const objFile = path.join(objDir, hash.slice(2));
  if (!fs.existsSync(objFile)) {
    fs.mkdirSync(objDir, { recursive: true });
    fs.writeFileSync(objFile, zlib.deflateSync(store));
  }
  return hash;
}

// Restore working directory from a commit's tree
function readObject(sha, gitRoot) {
  const file       = path.join(gitRoot, 'objects', sha.slice(0,2), sha.slice(2));
  const raw        = zlib.inflateSync(fs.readFileSync(file));
  const nullIdx    = raw.indexOf(0);
  const [type]     = raw.slice(0, nullIdx).toString().split(' ');
  return { type, content: raw.slice(nullIdx + 1) };
}

function restoreTree(treeSHA, gitRoot, dir) {
  const { content } = readObject(treeSHA, gitRoot);
  let offset = 0;
  while (offset < content.length) {
    const nullIdx  = content.indexOf(0, offset);
    const [mode, name] = content.slice(offset, nullIdx).toString().split(' ');
    const fileSHA  = content.slice(nullIdx + 1, nullIdx + 21).toString('hex');
    offset         = nullIdx + 21;
    const dest     = path.join(dir, name);
    if (mode === '40000') {
      fs.mkdirSync(dest, { recursive: true });
      restoreTree(fileSHA, gitRoot, dest);
    } else {
      const { content: blob } = readObject(fileSHA, gitRoot);
      fs.writeFileSync(dest, blob);
    }
  }
}

export async function pull(remoteName = 'origin', branchName) {
  const gitRoot  = getGitRoot();
  const repoRoot = path.dirname(gitRoot);
  const baseUrl  = getRemoteUrl(remoteName);

  let branch = branchName;
  if (!branch) {
    const head = fs.readFileSync(path.join(gitRoot, 'HEAD'), 'utf8').trim();
    branch = head.startsWith('ref: refs/heads/') ? head.slice(16) : 'main';
  }

  console.log(`Fetching from ${baseUrl}...`);

  let payload;
  try {
    payload = await getJSON(`${baseUrl}/info/refs`);
  } catch (e) {
    console.error(`fatal: could not connect to '${remoteName}' at ${baseUrl}`);
    console.error(`  ${e.message}`);
    process.exit(1);
  }

  const { refs, objects } = payload;
  const remoteRef = `refs/heads/${branch}`;
  const remoteSHA = refs[remoteRef];

  if (!remoteSHA) {
    console.error(`fatal: remote branch '${branch}' not found`);
    process.exit(1);
  }

  // Write all incoming objects into local store
  let written = 0;
  for (const [sha, { type, content }] of Object.entries(objects)) {
    const buf     = Buffer.from(content, 'base64');
    const objDir  = path.join(gitRoot, 'objects', sha.slice(0, 2));
    const objFile = path.join(objDir, sha.slice(2));
    if (!fs.existsSync(objFile)) {
      const header = Buffer.from(`${type} ${buf.length}\0`);
      const store  = Buffer.concat([header, buf]);
      fs.mkdirSync(objDir, { recursive: true });
      fs.writeFileSync(objFile, zlib.deflateSync(store));
      written++;
    }
  }

  // Update local branch ref
  const localRefPath = path.join(gitRoot, 'refs', 'heads', branch);
  const localSHA     = fs.existsSync(localRefPath)
    ? fs.readFileSync(localRefPath, 'utf8').trim()
    : null;

  fs.mkdirSync(path.dirname(localRefPath), { recursive: true });
  fs.writeFileSync(localRefPath, remoteSHA + '\n');

  // Restore working directory
  const { content: commitContent } = readObject(remoteSHA, gitRoot);
  const treeMatch = commitContent.toString().match(/^tree ([a-f0-9]{40})/m);
  if (treeMatch) restoreTree(treeMatch[1], gitRoot, repoRoot);

  console.log(`\x1b[32mFrom ${baseUrl}`);
  const fromLabel = localSHA ? localSHA.slice(0,7) : '0000000';
  console.log(`   ${fromLabel}..${remoteSHA.slice(0,7)}  ${branch} → ${branch}\x1b[0m`);
  console.log(`${written} new object(s) fetched. Working directory updated.`);
}