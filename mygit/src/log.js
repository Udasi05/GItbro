import fs from 'fs';
import path from 'path';
import { readObject, getGitRoot } from './utils/objects.js';

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

function parseCommit(content) {
  const text = content.toString('utf8');
  const lines = text.split('\n');
  const commit = { headers: {}, message: '' };
  let i = 0;
  while (i < lines.length && lines[i] !== '') {
    const spaceIdx = lines[i].indexOf(' ');
    const key = lines[i].slice(0, spaceIdx);
    const value = lines[i].slice(spaceIdx + 1);
    commit.headers[key] = value;
    i++;
  }
  commit.message = lines.slice(i + 1).join('\n').trim();
  return commit;
}

function formatIST(timestampStr) {
  const utcDate = new Date(parseInt(timestampStr) * 1000);
  // Add 5.5 hours to get IST
  const istTime = utcDate.getTime() + (5.5 * 60 * 60 * 1000);
  const istDate = new Date(istTime);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const dayName = days[istDate.getUTCDay()];
  const monthName = months[istDate.getUTCMonth()];
  const day = istDate.getUTCDate().toString().padStart(2, '0');
  const hours = istDate.getUTCHours().toString().padStart(2, '0');
  const minutes = istDate.getUTCMinutes().toString().padStart(2, '0');
  const seconds = istDate.getUTCSeconds().toString().padStart(2, '0');
  const year = istDate.getUTCFullYear();
  
  return `${dayName} ${monthName} ${day} ${hours}:${minutes}:${seconds} ${year} +0530`;
}

export function log() {
  const gitRoot = getGitRoot();
  let sha = getHeadSHA(gitRoot);

  if (!sha) {
    console.log('fatal: your current branch has no commits yet');
    process.exit(1);
  }

  while (sha) {
    const { content } = readObject(sha, gitRoot);
    const commit = parseCommit(content);
    const authorLine = commit.headers['author'] || '';
    const tsMatch = authorLine.match(/(\d+) ([+-]\d{4})$/);
    const dateStr = tsMatch
      ? formatIST(tsMatch[1])
      : 'unknown date';
    const authorName = authorLine.replace(/<.*/, '').trim();

    console.log(`\x1b[33mcommit ${sha}\x1b[0m`);
    console.log(`Author: ${authorName}`);
    console.log(`Date:   ${dateStr}`);
    console.log(`\n    ${commit.message}\n`);

    sha = commit.headers['parent'] || null;
  }
}