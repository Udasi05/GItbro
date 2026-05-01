import http   from 'http';
import fs     from 'fs';
import path   from 'path';
import zlib   from 'zlib';
import { readObject, getGitRoot } from './utils/objects.js';
import { getStatusData } from './status.js';

process.on('uncaughtException', (err) => {
  try { fs.appendFileSync('d:/Projects/Hackathon_class/webui.log', `Uncaught Exception: ${err.stack}\n`); } catch(e){}
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  try { fs.appendFileSync('d:/Projects/Hackathon_class/webui.log', `Unhandled Rejection: ${reason}\n`); } catch(e){}
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

function getAllObjects(gitRoot) {
  const objectsDir = path.join(gitRoot, 'objects');
  const objects = {};
  if (!fs.existsSync(objectsDir)) return objects;
  for (const prefix of fs.readdirSync(objectsDir)) {
    const prefixDir = path.join(objectsDir, prefix);
    if (!fs.statSync(prefixDir).isDirectory()) continue;
    for (const suffix of fs.readdirSync(prefixDir)) {
      const sha = prefix + suffix;
      try {
        const { type, content } = readObject(sha, gitRoot);
        objects[sha] = { type, content: content.toString('base64') };
      } catch(e){}
    }
  }
  return objects;
}

function getAllRefs(gitRoot) {
  const refs = {};
  const heads = path.join(gitRoot, 'refs', 'heads');
  if (!fs.existsSync(heads)) return refs;
  for (const branch of fs.readdirSync(heads)) {
    refs[`refs/heads/${branch}`] = fs.readFileSync(path.join(heads, branch), 'utf8').trim();
  }
  const headPath = path.join(gitRoot, 'HEAD');
  if (fs.existsSync(headPath)) {
    refs['HEAD'] = fs.readFileSync(headPath, 'utf8').trim();
  }
  return refs;
}
function getHead(gitRoot) {
  const h = fs.readFileSync(path.join(gitRoot,'HEAD'),'utf8').trim();
  return h.startsWith('ref: refs/heads/') ? h.slice(16) : h;
}

function getBranches(gitRoot) {
  const dir = path.join(gitRoot,'refs','heads');
  if (!fs.existsSync(dir)) return {};
  const out = {};
  for (const b of fs.readdirSync(dir))
    out[b] = fs.readFileSync(path.join(dir,b),'utf8').trim();
  return out;
}

function parseCommit(content) {
  const text  = Buffer.isBuffer(content) ? content.toString() : content;
  const lines = text.split('\n');
  const h = {}; let i = 0;
  while (i < lines.length && lines[i] !== '') {
    const sp = lines[i].indexOf(' ');
    h[lines[i].slice(0,sp)] = lines[i].slice(sp+1); i++;
  }
  return { ...h, message: lines.slice(i+1).join('\n').trim() };
}

function walkAllCommits(branchMap, gitRoot, limit=150) {
  const list=[]; const seen=new Set();
  const queue=Object.values(branchMap).filter(Boolean);
  while(queue.length>0 && list.length<limit) {
    const sha=queue.shift();
    if(!sha || seen.has(sha)) continue;
    seen.add(sha);
    try {
      const {content} = readObject(sha, gitRoot);
      const c = parseCommit(content);
      const ts = c.author?.match(/(\d+) [+-]/)?.[1];
      list.push({
        sha, short: sha.slice(0,7),
        message: c.message,
        author: (c.author||'').replace(/<.*/,'').trim(),
        email:  (c.author||'').match(/<(.+)>/)?.[1]||'',
        date:   ts ? new Date(+ts*1000).toISOString() : '',
        parents:[c.parent,c.parent2].filter(Boolean),
        tree:   c.tree||''
      });
      if (c.parent) queue.push(c.parent);
      if (c.parent2) queue.push(c.parent2);
    } catch {}
  }
  return list.sort((a,b) => new Date(b.date) - new Date(a.date));
}

function flattenTree(treeSHA, gitRoot, prefix='') {
  const {content} = readObject(treeSHA, gitRoot);
  const files=[]; let offset=0;
  while (offset<content.length) {
    const ni = content.indexOf(0,offset);
    const [mode,name] = content.slice(offset,ni).toString().split(' ');
    const sha = content.slice(ni+1,ni+21).toString('hex');
    offset = ni+21;
    const full = prefix ? prefix+'/'+name : name;
    if (mode==='40000') files.push(...flattenTree(sha,gitRoot,full));
    else files.push({path:full,sha,mode});
  }
  return files;
}

function getBlobContent(sha, gitRoot) {
  try { return readObject(sha,gitRoot).content.toString('utf8'); }
  catch { return null; }
}

function diffLines(oldL, newL) {
  const m=oldL.length,n=newL.length;
  const dp=Array.from({length:m+1},()=>new Array(n+1).fill(0));
  for(let i=m-1;i>=0;i--) for(let j=n-1;j>=0;j--)
    dp[i][j]=oldL[i]===newL[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const res=[]; let i=0,j=0;
  while(i<m||j<n){
    if(i<m&&j<n&&oldL[i]===newL[j]){res.push({t:'eq',l:oldL[i]});i++;j++;}
    else if(j<n&&(i>=m||dp[i][j+1]>=dp[i+1][j])){res.push({t:'add',l:newL[j]});j++;}
    else{res.push({t:'del',l:oldL[i]});i++;}
  }
  return res;
}

function getCommitDiff(commitSHA, gitRoot) {
  const out=[];
  try {
    const {content:cc} = readObject(commitSHA,gitRoot);
    const com = parseCommit(cc);
    const files = flattenTree(com.tree,gitRoot);
    let parentFiles={};
    if (com.parent) {
      try {
        const {content:pc} = readObject(com.parent,gitRoot);
        const par = parseCommit(pc);
        flattenTree(par.tree,gitRoot).forEach(f=>{parentFiles[f.path]=f.sha;});
      } catch {}
    }
    const allPaths=new Set([...files.map(f=>f.path),...Object.keys(parentFiles)]);
    allPaths.forEach(filepath=>{
      const newEntry=files.find(f=>f.path===filepath);
      const oldSHA=parentFiles[filepath];
      const newContent=newEntry?getBlobContent(newEntry.sha,gitRoot)||'':'';
      const oldContent=oldSHA?getBlobContent(oldSHA,gitRoot)||'':'';
      if(newContent===oldContent) return;
      const edits=diffLines(oldContent.split('\n'),newContent.split('\n'));
      const hunks=[]; let hunk=null,oi=1,ni=1;
      edits.forEach(e=>{
        if(e.t!=='eq'){if(!hunk)hunk={oldStart:oi,newStart:ni,lines:[]};hunk.lines.push(e);}
        else{if(hunk){hunks.push(hunk);hunk=null;}}
        if(e.t!=='add')oi++;
        if(e.t!=='del')ni++;
      });
      if(hunk)hunks.push(hunk);
      out.push({path:filepath,isNew:!oldSHA,isDeleted:!newEntry,hunks});
    });
  } catch {}
  return out;
}

export function webui(repoPath='.', port=5005) {
  try {
    fs.appendFileSync('d:/Projects/Hackathon_class/webui.log', `Starting webui on port ${port} in ${repoPath}\n`);
  } catch(e){}
  const abs = path.resolve(repoPath);
  process.chdir(abs);
  let gitRoot = null;
  try {
    gitRoot = getGitRoot();
  } catch(e) {
    console.warn('Standby Mode: Not a gitbro repository yet. Use "gitbro init" to start.');
  }

  const repoName = gitRoot ? path.basename(path.dirname(gitRoot)) : 'None';

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type');
    if (req.method==='OPTIONS'){res.writeHead(200);res.end();return;}
    const url = req.url;
    const parsedUrl = new URL(req.url, `http://localhost:${port}`);

    if (req.method === 'GET' && parsedUrl.pathname === '/info/refs') {
      if (!gitRoot) { res.writeHead(404); res.end(JSON.stringify({error: 'Not a repo'})); return; }
      const payload = {
        refs: getAllRefs(gitRoot),
        objects: getAllObjects(gitRoot),
      };
      
      const buf = Buffer.from(JSON.stringify(payload), 'utf8');
      const gzipped = zlib.gzipSync(buf);
      
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip'
      });
      res.end(gzipped);
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/receive') {
      let chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        try {
          let bodyBuf = Buffer.concat(chunks);
          if (req.headers['content-encoding'] === 'gzip') {
            bodyBuf = zlib.gunzipSync(bodyBuf);
          }
          const { refs, objects } = JSON.parse(bodyBuf.toString('utf8'));
          let written = 0;
          for (const [sha, { type, content }] of Object.entries(objects)) {
            const buf = Buffer.from(content, 'base64');
            const objectDir = path.join(gitRoot, 'objects', sha.slice(0, 2));
            const objectFile = path.join(objectDir, sha.slice(2));
            if (!fs.existsSync(objectFile)) {
              fs.mkdirSync(objectDir, { recursive: true });
              const header = Buffer.from(`${type} ${buf.length}\0`);
              const store = Buffer.concat([header, buf]);
              fs.writeFileSync(objectFile, zlib.deflateSync(store));
              written++;
            }
          }
          for (const [ref, sha] of Object.entries(refs)) {
            if (ref === 'HEAD') continue;
            const refPath = path.join(gitRoot, ref);
            fs.mkdirSync(path.dirname(refPath), { recursive: true });
            fs.writeFileSync(refPath, sha + '\n');
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, written }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    if (url==='/') {
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({ status: 'gitbro api running', repo: gitRoot ? repoName : 'none' })); return;
    }

    if (url==='/api/info') {
      if (!gitRoot) {
        // Try to re-detect if it was just inited
        try { gitRoot = getGitRoot(); } catch(e){}
      }
      if (!gitRoot) {
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({branches:{},head:'',files:[],repoName:'Not a Repository'})); return;
      }
      const branches=getBranches(gitRoot);
      const head=getHead(gitRoot);
      const headSHA=branches[head];
      let files=[];
      if(headSHA){try{const{content}=readObject(headSHA,gitRoot);const c=parseCommit(content);if(c.tree)files=flattenTree(c.tree,gitRoot);}catch{}}
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({branches,head,files,repoName})); return;
    }

    if (url==='/api/status') {
      if (!gitRoot) { 
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({toCommit:[],notStaged:[],untracked:[]})); return;
      }
      try {
        const stats = getStatusData();
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify(stats));
      } catch(e) {
        res.writeHead(200,{'Content-Type':'application/json'}); // Stay 200 to keep UI happy
        res.end(JSON.stringify({toCommit:[],notStaged:[],untracked:[], error: e.message}));
      }
      return;
    }

    if (url==='/api/commits') {
      const branches=getBranches(gitRoot);
      const commits=walkAllCommits(branches,gitRoot);
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify(commits)); return;
    }

    if (url.startsWith('/api/files/')) {
      const sha=url.slice(11);
      let files=[];
      try{const{content}=readObject(sha,gitRoot);const c=parseCommit(content);if(c.tree)files=flattenTree(c.tree,gitRoot);}catch{}
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify(files)); return;
    }

    if (url.startsWith('/api/worktree/')) {
      const filepath = decodeURIComponent(url.slice(14));
      const absPath = path.join(path.dirname(gitRoot), filepath);
      if (req.method === 'GET') {
        try {
          const content = fs.readFileSync(absPath, 'utf8');
          res.writeHead(200,{'Content-Type':'application/json'});
          res.end(JSON.stringify({content}));
        } catch(e) { res.writeHead(404); res.end('{}'); }
      } else if (req.method === 'POST') {
        let body='';
        req.on('data',c=>body+=c);
        req.on('end',()=>{
          try {
            fs.writeFileSync(absPath, JSON.parse(body).content, 'utf8');
            res.writeHead(200,{'Content-Type':'application/json'});
            res.end(JSON.stringify({success:true}));
          } catch(e) { res.writeHead(500); res.end(JSON.stringify({error:e.message})); }
        });
      }
      return;
    }

    if (url.startsWith('/api/blob/')) {
      const sha=url.slice(10);
      try{const content=getBlobContent(sha,gitRoot);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({content}));}
      catch{res.writeHead(404);res.end('{}');}
      return;
    }

    if (url.startsWith('/api/commitdiff/')) {
      const sha=url.slice(16);
      const diff=getCommitDiff(sha,gitRoot);
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({files:diff})); return;
    }

    if (url==='/api/run' && req.method==='POST') {
      let body='';
      req.on('data',c=>body+=c);
      req.on('end',async()=>{
        try {
          const {cmd}=JSON.parse(body);
          const parts=cmd.trim().split(/\s+/);
          const sub=parts[0]==='gitbro'?parts.slice(1):parts;
          const {spawn}=await import('child_process');
          // find gitbro.js
          const gitbroJs = new URL('../bin/gitbro.js', import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1');
          const repoPath = gitRoot ? path.dirname(gitRoot) : process.cwd();
          const proc=spawn(process.execPath,[gitbroJs,...sub],{cwd:repoPath,env:process.env});
          let out='',err='';
          proc.stdout.on('data',d=>out+=d);
          proc.stderr.on('data',d=>err+=d);
          proc.on('close',()=>{
            res.writeHead(200,{'Content-Type':'application/json'});
            res.end(JSON.stringify({output:out.trim(),error:err.trim()}));
          });
        } catch(e){
          res.writeHead(200,{'Content-Type':'application/json'});
          res.end(JSON.stringify({error:e.message}));
        }
      }); return;
    }

    res.writeHead(404); res.end('not found');
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`Error: Port ${port} is already in use. Try a different port.`);
      process.exit(1);
    } else {
      console.error(e);
    }
  });

  server.listen(port,()=>{
    console.log('\x1b[32mGitBro Web UI → http://localhost:'+port+'\x1b[0m');
    console.log('Full GitHub-style interface. Ctrl+C to stop.\n');
  });
}