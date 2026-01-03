# Breakfast

A macOS menubar app that syncs your [Granola](https://granola.ai) meeting notes to a local folder as Markdown files.

## Features

- **Auto-sync** when meetings end (watches Granola cache for changes)
- **One-click sync** from the menubar
- **Recent Notes** submenu for quick access to last 5 synced notes
- **Clickable notifications** - click to open the synced note
- Exports **notes, transcripts, and metadata** (attendees, timestamps, meeting links)
- Markdown files with YAML frontmatter for easy searching/indexing
- Auto-start at login via launchd

## Installation

```bash
git clone https://github.com/kllymx/Breakfast.git
cd Breakfast
chmod +x install.sh
./install.sh
```

This will:
1. Create a Python virtual environment
2. Install dependencies (rumps, pyobjc)
3. Configure auto-start at login
4. Launch the menubar app

## Usage

### Menubar App

Look for the icon in your menubar:

| Menu Item | Action |
|-----------|--------|
| Sync Now | Sync all new meetings |
| Sync Last 7 Days | Re-sync recent meetings (overwrites) |
| Recent Notes | Quick access to last 5 synced notes |
| Open Notes Folder | Opens the output directory |
| View Log | Opens sync log in Console |

### Command Line

```bash
node index.js              # Sync all meetings
node index.js --days 7     # Sync last 7 days
node index.js --force      # Force overwrite existing files
node index.js --verbose    # Verbose output
```

## Configuration

Set `GRANOLA_OUTPUT_DIR` environment variable to change where notes are saved:

```bash
export GRANOLA_OUTPUT_DIR="$HOME/Notes/Meetings"
```

Default: `~/Documents/Granola Notes`

## Uninstall

```bash
launchctl unload ~/Library/LaunchAgents/com.arcane.granola-sync.plist
rm ~/Library/LaunchAgents/com.arcane.granola-sync.plist
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
