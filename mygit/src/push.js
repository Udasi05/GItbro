import fs   from 'fs';
import path from 'path';
import zlib from 'zlib';
import { readObject, getGitRoot } from './utils/objects.js';
import { getRemoteUrl } from './remote.js';

// Walk from a commit SHA and collect every reachable object SHA
function collectObjects(startSHA, gitRoot, stopSHA = null, seen = new Set()) {
  if (!startSHA || seen.has(startSHA) || startSHA === stopSHA) return seen;
  seen.add(startSHA);

  const { type, content } = readObject(startSHA, gitRoot);

  if (type === 'commit') {
    const text = content.toString('utf8');
    // Collect the tree
    const treeMatch = text.match(/^tree ([a-f0-9]{40})/m);
    if (treeMatch) collectObjects(treeMatch[1], gitRoot, stopSHA, seen);
    // Collect all parents
    for (const m of text.matchAll(/^parent ([a-f0-9]{40})/gm))
      collectObjects(m[1], gitRoot, stopSHA, seen);
  }

  if (type === 'tree') {
    let offset = 0;
    while (offset < content.length) {
      const nullIdx = content.indexOf(0, offset);
      const sha     = content.slice(nullIdx + 1, nullIdx + 21).toString('hex');
      offset        = nullIdx + 21;
      collectObjects(sha, gitRoot, stopSHA, seen);
    }
  }

  return seen;
}

function getAllRefs(gitRoot) {
  const refs  = {};
  const heads = path.join(gitRoot, 'refs', 'heads');
  if (!fs.existsSync(heads)) return refs;
  for (const branch of fs.readdirSync(heads)) {
    refs[`refs/heads/${branch}`] =
      fs.readFileSync(path.join(heads, branch), 'utf8').trim();
  }
  return refs;
}

async function postJSON(url, payload) {
  try {
    const jsonStr = JSON.stringify(payload);
    const gzipped = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'));

    const result = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        'Bypass-Tunnel-Reminder': 'true',
        'User-Agent': 'gitbro-cli'
      },
      body: gzipped
    });
    const text = await result.text();
    try { 
      const data = JSON.parse(text); 
      data.status = result.status;
      return data;
    } catch { 
      return { raw: text, status: result.status, statusText: result.statusText }; 
    }
  } catch (err) {
    throw err;
  }
}

export async function push(remoteName = 'origin', branchName) {
  const gitRoot  = getGitRoot();
  const repoRoot = path.dirname(gitRoot);
  const baseUrl  = getRemoteUrl(remoteName);

  // Figure out which branch to push
  let branch = branchName;
  if (!branch) {
    const head = fs.readFileSync(path.join(gitRoot, 'HEAD'), 'utf8').trim();
    branch = head.startsWith('ref: refs/heads/') ? head.slice(16) : null;
  }
  if (!branch) { console.error('fatal: not on a branch'); process.exit(1); }

  const refPath = path.join(gitRoot, 'refs', 'heads', branch);
  if (!fs.existsSync(refPath)) {
    console.error(`fatal: branch '${branch}' not found`);
    process.exit(1);
  }

  const tipSHA = fs.readFileSync(refPath, 'utf8').trim();
  console.log(`Pushing branch '${branch}' (${tipSHA.slice(0,7)}) to ${baseUrl}...`);

  // Optimization: see what the remote already has so we don't upload 10MB of old history
  let remoteSHA = null;
  try {
    const info = await fetch(`${baseUrl}/info/refs`, { headers: { 'Bypass-Tunnel-Reminder': 'true', 'User-Agent': 'gitbro-cli' } }).then(r=>r.json());
    if (info && info.refs) remoteSHA = info.refs[`refs/heads/${branch}`];
  } catch(e) {}

  // Collect newly reachable objects
  const allSHAs = collectObjects(tipSHA, gitRoot, remoteSHA);
  const objects = {};
  for (const sha of allSHAs) {
    const { type, content } = readObject(sha, gitRoot);
    objects[sha] = { type, content: content.toString('base64') };
  }

  const refs = { [`refs/heads/${branch}`]: tipSHA };

  // POST to the server's /receive endpoint
  try {
    const result = await postJSON(`${baseUrl}/receive`, { refs, objects });
    if (result.ok) {
      console.log(`\x1b[32mTo ${baseUrl}`);
      console.log(`   ${tipSHA.slice(0,7)}  ${branch} → ${branch}\x1b[0m`);
      console.log(`${result.written} object(s) written on remote.`);
    } else {
      console.error('push failed:', result);
    }
  } catch (e) {
    console.error(`fatal: could not connect to remote '${remoteName}' at ${baseUrl}`);
    console.error(`  ${e.message}`);
  }
}