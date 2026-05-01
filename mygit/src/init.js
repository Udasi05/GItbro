import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

export function init(targetDir = process.cwd()) {
  const gitDir = path.join(targetDir, '.gitbro');

  if (fs.existsSync(gitDir)) {
    console.log(`Reinitialized existing gitbro repository in ${gitDir}`);
    return;
  }

  const dirs = [
    gitDir,
    path.join(gitDir, 'objects'),
    path.join(gitDir, 'refs'),
    path.join(gitDir, 'refs', 'heads'),
    path.join(gitDir, 'refs', 'tags'),
  ];

  dirs.forEach(d => fs.mkdirSync(d, { recursive: true }));

  fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');

  fs.writeFileSync(path.join(gitDir, 'config'), [
    '[core]',
    '  repositoryformatversion = 0',
    '  filemode = true',
    '  bare = false',
  ].join('\n') + '\n');

  // Hide the folder on Windows
  if (process.platform === 'win32') {
    exec(`attrib +h "${gitDir}"`, (err) => {
      if (err) console.error('Failed to hide .gitbro folder:', err.message);
    });
  }

  console.log(`Initialized empty gitbro repository in ${gitDir}`);
}