# CLAUDE.md — Jads-2

## Project Overview

**Jads-2** is an application project (referred to as "App" in the README). The repository is in early development and currently contains only foundational scaffolding.

## Repository Structure

```
Jads-2/
├── README.md          # Project description
└── CLAUDE.md          # This file — AI assistant guide
```

## Development Setup

### Prerequisites

- Git

### Getting Started

```bash
git clone <repository-url>
cd Jads-2
```

## Git Workflow

### Branches

- `main` — production-ready code; protected branch
- `master` — legacy default branch (use `main` for new work)
- Feature branches — use descriptive names prefixed with purpose (e.g., `feature/`, `fix/`, `claude/`)

### Commit Conventions

- Write clear, descriptive commit messages
- Use imperative mood in the subject line (e.g., "Add feature" not "Added feature")
- Keep subject line under 72 characters

## Conventions for AI Assistants

### General Rules

- **Read before writing** — Always read a file before proposing changes to it
- **Minimal changes** — Only modify what is necessary; avoid unnecessary refactoring or additions
- **No speculation** — Do not add features, dependencies, or files that were not requested
- **Preserve existing style** — Match the coding style, indentation, and conventions already present in the codebase
- **Security first** — Never introduce credentials, secrets, or security vulnerabilities into the codebase

### File Management

- Prefer editing existing files over creating new ones
- Do not create documentation files unless explicitly asked
- Keep the repository clean — do not add generated files, build artifacts, or temporary files

### When Adding New Code

- Follow the existing project structure
- Add only necessary dependencies
- Write self-documenting code; add comments only where logic is non-obvious
- Avoid over-engineering or premature abstraction

### Testing

- When tests exist, run them after making changes
- Do not remove or weaken existing tests without explicit permission

### Git Operations

- Always work on the designated feature branch
- Never force-push or perform destructive git operations without explicit permission
- Review changes with `git diff` before committing
