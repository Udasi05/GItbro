# gitbro

A minimal Git implementation built from scratch in Node.js.

## Features

| Command | Description |
|---------|-------------|
| `gitbro init` | Initialize a new repository |
| `gitbro hash-object [-w] <file>` | Compute SHA-1 hash of a file |
| `gitbro add <file...>` | Stage files for commit |
| `gitbro commit -m "message"` | Record changes to the repository |
| `gitbro log` | Show commit history |
| `gitbro branch [name]` | List or create branches |
| `gitbro checkout <branch>` | Switch branches |

## Getting Started

```bash
# Install globally (optional)
npm link

# Initialize a repository
gitbro init

# Stage and commit files
gitbro add myfile.txt
gitbro commit -m "Initial commit"

# View history
gitbro log

# Create and switch branches
gitbro branch feature
gitbro checkout feature
```

## How It Works

- **Objects** are stored as zlib-compressed files addressed by their SHA-1 hash (just like real Git).
- **The index** is a JSON file tracking staged files and their blob SHAs.
- **Branches** are plain text files in `.gitbro/refs/heads/` containing a commit SHA.
- **HEAD** is a symbolic ref pointing to the current branch.
