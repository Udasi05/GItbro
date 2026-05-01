# GitBro Setup & Deployment Guide

A minimal Git implementation built from scratch in Node.js with full support for distributed team collaboration.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Installation](#installation)
3. [Quick Start (Local Usage)](#quick-start-local-usage)
4. [Remote Setup (Single Server)](#remote-setup-single-server)
5. [Network Architecture & Scalability](#network-architecture--scalability)
6. [Team Collaboration Workflow](#team-collaboration-workflow)
7. [Production Deployment](#production-deployment)
8. [Command Reference](#command-reference)
9. [Troubleshooting](#troubleshooting)

---

## Project Overview

**GitBro** is a Git engine built from scratch in Node.js with:
- ✅ Full distributed version control
- ✅ Local and remote repositories
- ✅ Push/Pull synchronization across networks
- ✅ Branch management and merging
- ✅ Conflict detection and resolution
- ✅ Desktop GUI (Electron + React)
- ✅ Web API for remote operations

### Architecture

```
mygit/                  → CLI tool (Node.js)
├── src/                → Git engine implementation
└── bin/gitbro.js       → Command-line interface

gitbro-desktop/         → Desktop application
├── electron/           → Electron main process
├── src/                → React UI
└── package.json        → Dependencies (React, Tailwind, Electron)
```

---

## Installation

### Prerequisites

- **Node.js** v16 or higher
- **npm** v7 or higher
- Git (optional, for reference)

### Step 1: Clone or Download the Project

```bash
cd ~/projects
git clone https://github.com/yourusername/gitbro.git
cd gitbro
```

Or download the ZIP and extract it.

### Step 2: Install CLI Tool (mygit)

```bash
cd mygit
npm install

# Optional: Link globally for system-wide access
npm link
```

**Test Installation:**
```bash
gitbro --version
# Output: 1.0.0

gitbro --help
# Output: Lists all available commands
```

### Step 3: Install Desktop App (Optional)

```bash
cd ../gitbro-desktop
npm install

# Run in development
npm start

# Build for production
npm run electron:build
```

---

## Quick Start (Local Usage)

### Initialize a Repository

```bash
cd ~/my-project
gitbro init

# Verify: .gitbro/ directory is created
ls -la | grep gitbro
```

### Add Files and Commit

```bash
# Create or modify files
echo "Hello World" > README.md
echo "console.log('test');" > index.js

# Stage files
gitbro add README.md index.js

# View staging status
gitbro status

# Commit changes
gitbro commit -m "Initial commit"

# View commit history
gitbro log
```

### Create and Switch Branches

```bash
# Create a new branch
gitbro branch feature-auth

# Switch to branch
gitbro checkout feature-auth

# Make changes
echo "// Auth logic" >> index.js
gitbro add index.js
gitbro commit -m "Add authentication module"

# Switch back to main
gitbro checkout main

# Merge feature-auth
gitbro merge feature-auth
```

### View Changes

```bash
# See unstaged changes
gitbro diff

# See staged changes
gitbro diff --cached

# Show commit details
gitbro log
```

---

## Remote Setup (Single Server)

Use this setup when you have **one central server** and multiple team members.

### Server Setup (One-Time)

The server is where all team members push and pull from.

#### On Remote Server (Linux/Mac/Windows)

```bash
# Choose a location for the central repository
sudo mkdir -p /var/repos
cd /var/repos

# Create bare repository
mkdir team-project.git
cd team-project.git

# Initialize as bare repository
gitbro init

# Mark as bare (prevents accidental edits)
echo '[core]
  bare = true' >> .gitbro/config

# Start the GitBro server (always running)
gitbro webui --port 3000
```

**Keep this running:**
- Option A: Use `screen` or `tmux` (temporary)
- Option B: Run it directly in the terminal

```bash
# Start GitBro server
gitbro webui -p 3000
```

**Verify Server is Running:**
```bash
curl http://localhost:3000
# Output: {"status":"gitbro api running","repo":"..."}
```

---

### Team Member #1: Initial Setup

```bash
# On Team Member 1's Computer
cd ~/projects
mkdir team-project
cd team-project

# Initialize local repository
gitbro init

# Create initial files
echo "# Team Project" > README.md
echo "Team Name: GitBro" >> README.md

# Add and commit
gitbro add README.md
gitbro commit -m "Project setup"

# Configure remote server (replace IP/domain with actual)
gitbro remote add origin http://192.168.0.101:3000
# Or for cloud: gitbro remote add origin http://your-domain.com:3000

# Push to server
gitbro push origin main

# Verify
gitbro remote
# Output should show origin URL
```

**Note:** Replace `192.168.1.100:3000` with:
- Local IP: `192.168.1.100:3000` (local network)
- Domain: `gitbro.example.com` (cloud server)
- Cloud IP: `52.123.45.67:3000` (AWS/Azure/DO)

---

### Team Member #2: Clone and Collaborate

```bash
# On Team Member 2's Computer
cd ~/projects

# Clone from server
gitbro clone http://192.168.1.100:3000 team-project

cd team-project

# Verify you have all code
cat README.md
gitbro log
gitbro branch -a  # View all branches

# Make changes
echo "## Features" >> README.md

# Commit and push
gitbro add README.md
gitbro commit -m "Add features section"
gitbro push origin main
```

---

## Network Architecture & Scalability

### Key Clarification: Not Restricted to Same WiFi or IP

GitBro can operate across **any network configuration** as long as team members can reach the server's IP address and port. Here's the flexibility:

### ✅ Supported Network Setups

| Setup | Example | Use Case |
|-------|---------|----------|
| **Local Network (Same WiFi)** | `http://192.168.1.50:3000` | Small teams in same office |
| **Different Subnets (Corporate)** | `http://10.0.0.50:3000` → `http://10.1.0.25` | Multiple office floors/buildings |
| **VPN Connection** | `http://vpn-ip:3000` over VPN tunnel | Remote employees on secure VPN |
| **Internet / Cloud** | `http://your-domain.com:3000` or `http://52.123.45.67:3000` | Distributed teams worldwide |
| **Hybrid Setup** | Mix of local + remote team members | Growing teams |

### Example: Mixed Network Scenario

```
Team Member A: Home WiFi (192.168.1.50)
Team Member B: Office LAN (10.0.0.25)
Team Member C: Coffee Shop (different ISP)
Server: Cloud VM at 203.0.113.45:3000

All three can work together:
gitbro clone http://203.0.113.45:3000 project
gitbro push origin main
gitbro pull origin main

✅ Works perfectly!
```

### Scalability Options

**Stage 1: Local Team (Same Building)**
- Server: Desktop/NAS on office network
- URL: `http://192.168.x.x:3000`
- Easy setup, minimal configuration

**Stage 2: Distributed Team (Same Region)**
- Server: Cloud VM (AWS/Azure/DigitalOcean)
- URL: `http://your-domain.com:3000`
- Add DNS hostname for easier URLs
- Enable firewall rules for security

**Stage 3: Global Team**
- Server: Multi-region cloud deployment
- Plus: Add authentication (username/password)
- Plus: Enable HTTPS for security
- Plus: Add API rate limiting

### Current Limitations (Future Enhancements)

- **No Authentication:** Any IP that reaches the server can push/pull
- **No HTTPS:** Data sent in plain HTTP (fine for LANs, risky for internet)
- **No Authorization:** No per-user permission control

**Recommendation:** Use firewalls to restrict network access until authentication is implemented.

---

## Team Collaboration Workflow

### Real-World Example: 3 Team Members

**Day 1: Person A Starts Project**

```bash
# Computer A
cd ~/projects/startup
gitbro init
echo "# Startup Project\nMVP Features..." > README.md
gitbro add README.md
gitbro commit -m "Initial project setup"
gitbro remote add origin http://server.com:3000
gitbro push origin main
```

**Day 2: Person B Joins**

```bash
# Computer B
cd ~/projects
gitbro clone http://server.com:3000 startup
cd startup

# See Person A's work
cat README.md
gitbro log

# Person B creates a feature branch and works
gitbro branch feature-ui
gitbro checkout feature-ui
echo "// UI Components" > ui.js
gitbro add ui.js
gitbro commit -m "Create UI component library"
gitbro push origin feature-ui
```

**Day 3: Person C Joins and Syncs**

```bash
# Computer C
cd ~/projects
gitbro clone http://server.com:3000 startup
cd startup

# See everyone's branches
gitbro branch -a
# Output:
# * main
#   feature-ui

# Check out feature-ui to review
gitbro checkout feature-ui
cat ui.js

# Go back to main and pull latest
gitbro checkout main
gitbro pull origin main
```

**Day 4: Person A Reviews and Merges**

```bash
# Computer A
cd ~/projects/startup

# Fetch latest changes
gitbro pull origin main

# View feature branch
gitbro checkout feature-ui
cat ui.js  # Review Person B's code

# Go back to main and merge
gitbro checkout main
gitbro merge feature-ui

# Push merged code to server
gitbro push origin main

# Clean up feature branch (optional)
gitbro branch -d feature-ui
```

**Day 5: Everyone Syncs**

```bash
# Computer B
cd ~/projects/startup
gitbro pull origin main
# Now has merged UI components

# Computer C
cd ~/projects/startup
gitbro pull origin main
# Everyone in sync!
```

---

## Production Deployment

Use this setup when you have one always-on computer on the same local network.

### Option 1: Local Network (Small Teams)

**Requirements:**
- One always-on computer (NAS, server, or workstation)
- Local network connectivity

**Setup:**

```bash
# On central computer (192.168.1.50)
mkdir -p ~/GitBroServer/team-project.git
cd ~/GitBroServer/team-project.git
gitbro init
echo '[core]\n  bare = true' >> .gitbro/config

# Start server
gitbro webui -p 3000
```

**Team members use:**
```bash
gitbro clone http://192.168.0.101:3000/ project
gitbro remote add origin http://192.168.0.101:3000/
```

---

## Command Reference

### Repository Management

```bash
# Initialize a repository
gitbro init [directory]

# Clone a remote repository
gitbro clone <url> [directory]

# Show repository status
gitbro status

# View commit history
gitbro log
```

### Staging & Committing

```bash
# Stage files
gitbro add <files...>

# Commit staged changes
gitbro commit -m "message"

# Commit with author override
gitbro commit -m "msg" --author "Name" --email "email@example.com"

# Amend last commit
gitbro amend -m "new message"

# View changes
gitbro diff                # Unstaged changes
gitbro diff --cached       # Staged changes
```

### Branches

```bash
# List branches
gitbro branch

# Create branch
gitbro branch <branch-name>

# Delete branch
gitbro branch -d <branch-name>

# Switch branch
gitbro checkout <branch-name>

# Merge branch
gitbro merge <branch-name>
```

### Remote Operations

```bash
# Add remote
gitbro remote add <name> <url>

# List remotes
gitbro remote

# Remove remote
gitbro remote remove <name>

# Push to remote
gitbro push [remote] [branch]
# Example: gitbro push origin main

# Pull from remote
gitbro pull [remote] [branch]
# Example: gitbro pull origin main
```

### Other Commands

```bash
# Hash a file (SHA-1)
gitbro hash-object <file> [-w]

# Show object content
gitbro cat-file <hash>

# Remove file from repo
gitbro rm <file>

# Configure settings
gitbro config [key] [value]
# Example: gitbro config user.name "John Doe"

# Start web UI server
gitbro webui [--port 3000]
```

---

## Troubleshooting

### Q: "fatal: not a gitbro repository"

**Problem:** You're not in a GitBro repository.

**Solution:**
```bash
# Initialize a repo
gitbro init

# Or navigate to repo root
cd /path/to/your/repo
```

---

### Q: "fatal: no such remote 'origin'"

**Problem:** Remote is not configured.

**Solution:**
```bash
# Add remote
gitbro remote add origin http://your-server:3000

# Verify
gitbro remote
```

---

### Q: "fatal: could not connect to 'origin' at [URL]"

**Problem:** Server is not reachable.

**Solution:**
```bash
# Check server is running
curl http://your-server:3000

# Verify URL is correct
gitbro remote

# Test network connectivity
ping your-server
```

---

### Q: Push/Pull is slow

**Problem:** Network latency or large history.

**Solution:**
- Use a faster network connection
- Push only changed branches
- Consider shallow clones for large repos

---

### Q: Merge conflict

**Problem:** Both branches modified same file.

**Solution:**
```bash
# Try merge
gitbro merge feature-branch

# If conflicts occur, edit the conflicted file
# Look for <<<<<<< HEAD ... ======= ... >>>>>>>

# Edit file to resolve manually, then:
gitbro add conflicted-file
gitbro commit -m "Resolve merge conflict"
```

---

### Q: How to undo last commit?

**Problem:** Need to undo most recent commit.

**Solution:**
```bash
# Amend last commit
gitbro commit --amend -m "new message"

# Or start over (lose commit)
gitbro log
# Copy parent commit SHA

gitbro checkout <parent-sha>
gitbro branch -d main
gitbro branch main
gitbro checkout main
```

---

### Q: WebUI server won't start

**Problem:** Port is already in use.

**Solution:**
```bash
# Use different port
gitbro webui --port 4000

# Or find and kill process on port 3000
# On Linux/Mac:
lsof -i :3000
kill -9 <PID>

# On Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

---

## Next Steps

1. **For Local Use:** Follow "Quick Start" section
2. **For Team Setup:** Choose deployment option and follow "Production Deployment"
3. **For Desktop GUI:** Run `npm start` in `gitbro-desktop/`
4. **For Contributing:** Submit PRs to the repository

---

## File Structure Reference

```
gitbro/
├── mygit/
│   ├── bin/
│   │   └── gitbro.js          # CLI entry point
│   ├── src/
│   │   ├── init.js             # Initialize repo
│   │   ├── add.js              # Stage files
│   │   ├── commit.js           # Create commits
│   │   ├── branch.js           # Branch management
│   │   ├── merge.js            # Merge branches
│   │   ├── push.js             # Push to remote
│   │   ├── pull.js             # Pull from remote
│   │   ├── clone.js            # Clone repository
│   │   ├── webui.js            # Web API server
│   │   ├── log.js              # View history
│   │   ├── status.js           # Show status
│   │   ├── diff.js             # Show changes
│   │   ├── remote.js           # Manage remotes
│   │   └── utils/
│   │       └── objects.js      # Object storage
│   └── package.json
│
├── gitbro-desktop/
│   ├── electron/
│   │   ├── main.js             # Electron main
│   │   └── preload.js          # Preload script
│   ├── src/
│   │   ├── App.jsx             # Main React component
│   │   └── index.css           # Styles
│   └── package.json
│
├── .gitbroignore               # Files to ignore
├── README.md                   # Project overview
└── GITBRO_SETUP_GUIDE.md       # This file
```

---

## Support & Resources

- **GitHub Issues:** Report bugs and feature requests
- **Documentation:** See README.md in each directory
- **Examples:** Check `bin/gitbro.js` for command registration

---

## License

MIT License - See LICENSE file for details

---

**Happy collaborating with GitBro!** 🚀
