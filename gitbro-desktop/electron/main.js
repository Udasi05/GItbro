const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { exec, spawn } = require('child_process');

const isDev = process.env.NODE_ENV === 'development'
let mainWindow;
let webuiProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f8fafc' // slate-50 to match react
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (webuiProcess) webuiProcess.kill();
  if (process.platform !== 'darwin') app.quit()
})

// === IPC Handlers for GitBro Desktop ===

// 1. Select a Repository Native Dialog
ipcMain.handle('gitbro:selectRepo', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select a GitBro Repository'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const selectedPath = result.filePaths[0];

  // If a previous background server is running, kill it
  if (webuiProcess) {
    webuiProcess.kill();
    webuiProcess = null;
  }

  return new Promise((resolve) => {
    // Spawn the GitBro WebUI server dynamically in the background on the selected folder!
    const gitbroJs = path.join(__dirname, '../../mygit/bin/gitbro.js');
    
    // We start it on port 5005
    webuiProcess = spawn(process.execPath, [gitbroJs, 'webui', '--port', '5005'], {
      cwd: selectedPath,
      env: process.env
    });

    // Wait a brief moment for the local server to spin up internally before resolving
    setTimeout(() => {
      resolve({ 
        path: selectedPath,
        port: 5005,
        success: true
      });
    }, 1000);

    // Handle unexpected crashes
    webuiProcess.on('error', (err) => {
      console.error('Background API Server Error:', err);
    });
  });
});

// 1.5 Open a Specific Repository Directly
ipcMain.handle('gitbro:openRepo', async (event, targetPath) => {
  if (webuiProcess) {
    webuiProcess.kill();
    webuiProcess = null;
  }

  return new Promise((resolve) => {
    const gitbroJs = path.join(__dirname, '../../mygit/bin/gitbro.js');
    webuiProcess = spawn(process.execPath, [gitbroJs, 'webui', '--port', '5005'], {
      cwd: targetPath,
      env: process.env
    });

    setTimeout(() => {
      resolve({ path: targetPath, port: 5005, success: true });
    }, 1000);

    webuiProcess.on('error', (err) => console.error('API Error:', err));
  });
});

// 2. Direct CLI executor for quick tasks (falling back to API usually though)
ipcMain.handle('gitbro:run', async (event, command, targetCwd) => {
  return new Promise((resolve) => {
    const gitbroJs = path.join(__dirname, '../../mygit/bin/gitbro.js');
    exec(`"${process.execPath}" "${gitbroJs}" ${command}`, { cwd: targetCwd || path.join(__dirname, '../../mygit') }, (error, stdout, stderr) => {
      if (error) {
        resolve({ error: stderr || stdout || error.message });
      } else {
        resolve({ output: stdout });
      }
    });
  });
});


