import fs from 'fs';
import path from 'path';

export function loadIgnore(gitRoot) {
  const repoRoot = path.dirname(gitRoot);
  const ignorePath = path.join(repoRoot, '.gitbroignore');
  
  // Base ignores that are always active
  const rules = ['.gitbro', '.git', 'node_modules', '.gitignore'];
  
  if (fs.existsSync(ignorePath)) {
    const content = fs.readFileSync(ignorePath, 'utf8');
    const lines = content.split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#')); // filter empty and comments
    rules.push(...lines);
  }
  
  return Array.from(new Set(rules));
}

export function isIgnored(relPath, rules) {
  const parts = relPath.split('/').filter(Boolean);
  
  return rules.some(rule => {
    // 1. Check if ANY segment matches the rule (for core folders like .gitbro, node_modules)
    const isCoreRoot = ['.gitbro', '.git', 'node_modules'].includes(rule);
    if (isCoreRoot && parts.some(p => p === rule)) return true;

    // 2. Exact match for specific rules
    if (relPath === rule) return true;
    
    // 3. Directory prefix match
    if (relPath.startsWith(rule + '/')) return true;
    
    // 4. Wildcard/Extension match
    if (rule.startsWith('*.') && relPath.endsWith(rule.slice(1))) return true;
    
    return false;
  });
}
