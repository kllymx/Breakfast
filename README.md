# Breakfast 🥣

A macOS menubar app that syncs your [Granola](https://granola.ai) meeting notes to a local folder as Markdown files.

## Features

- **One-click sync** from the menubar
- Exports **notes, transcripts, and metadata** (attendees, timestamps, meeting links)
- Markdown files with YAML frontmatter for easy searching/indexing
- Auto-start at login via launchd

## Installation

```bash
git clone https://github.com/kllymx/Breakfast.git
cd Breakfast

# Create virtual environment and install dependencies
python3 -m venv .venv
.venv/bin/pip install rumps pyobjc-framework-Cocoa

# Make scripts executable
chmod +x index.js menubar.py sync.sh
```

## Usage

### Menubar App

```bash
.venv/bin/python3 menubar.py
```

Look for the 🥣 icon in your menubar:

| Menu Item | Action |
|-----------|--------|
| Sync Now | Sync all new meetings |
| Sync Last 7 Days | Re-sync recent meetings (overwrites) |
| Open Notes Folder | Opens the output directory |
| View Log | Opens sync log in Console |

### Command Line

```bash
# Sync all meetings
node index.js

# Sync last 7 days
node index.js --days 7

# Force overwrite existing files
node index.js --force

# Verbose output
node index.js --verbose
```

## Auto-Start at Login

```bash
cp com.arcane.granola-sync.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.arcane.granola-sync.plist
```

To stop auto-start:
```bash
launchctl unload ~/Library/LaunchAgents/com.arcane.granola-sync.plist
```

## Configuration

Edit `index.js` to change:

```javascript
const CONFIG = {
  outputDir: '/Users/maxkelly/Documents/Granola Notes',  // Where notes are saved
  cacheFile: '~/Library/Application Support/Granola/cache-v3.json',
  logFile: '~/Library/Logs/granola-sync.log',
};
```

## Output Format

Each meeting exports as `YYYY-MM-DD-meeting-title.md`:

```markdown
---
id: abc123
title: "Weekly Standup"
created_at: 2025-01-03T10:00:00Z
meeting_start: 2025-01-03T10:00:00-05:00
meeting_end: 2025-01-03T10:30:00-05:00
attendees: ["alice@example.com", "bob@example.com"]
---

# Weekly Standup

**Start:** Friday, January 3, 2025 at 10:00 AM
**Duration:** 30 minutes

---

## Attendees

- Alice <alice@example.com> (organizer)
- Bob <bob@example.com>

---

## Notes

Discussion points from the meeting...

---

## Transcript

**Me** [10:01:05 AM]: Let's get started...
**Speaker** [10:01:10 AM]: Sounds good...
```

## Requirements

- macOS
- Node.js (for sync script)
- Python 3 (for menubar app)
- [Granola](https://granola.ai) desktop app

## How It Works

Granola stores meeting data locally at `~/Library/Application Support/Granola/cache-v3.json`. This tool reads that cache and exports meetings as Markdown files — no API keys or authentication required.

## License

MIT
