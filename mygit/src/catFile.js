import { readObject, getGitRoot } from './utils/objects.js';

export function catFile(sha, options) {
  const gitRoot = getGitRoot();
  try {
    const { type, content } = readObject(sha, gitRoot);

    if (options.pretty) {
      if (type === 'tree') {
        // Pretty print tree contents
        let offset = 0;
        const entries = [];
        while (offset < content.length) {
          const nullIdx = content.indexOf(0, offset);
          const [mode, name] = content.slice(offset, nullIdx).toString().split(' ');
          const entrySha = content.slice(nullIdx + 1, nullIdx + 21).toString('hex');
          offset = nullIdx + 21;
          const typeStr = mode === '40000' ? 'tree' : 'blob';
          entries.push(`${mode} ${typeStr} ${entrySha}    ${name}`);
        }
        process.stdout.write(entries.join('\n') + '\n');
      } else {
        // Commits and Blobs are safe to print as strings
        process.stdout.write(content.toString());
        if (!content.toString().endsWith('\n')) process.stdout.write('\n');
      }
    } else if (options.type) {
      process.stdout.write(type + '\n');
    } else if (options.size) {
      process.stdout.write(content.length + '\n');
    } else {
      // Default: Raw content
      process.stdout.write(content);
    }
  } catch (err) {
    console.error(`fatal: Not a valid object name ${sha}`);
  }
}
