# Breakfast

A macOS menubar app that syncs your [Granola](https://granola.ai) meeting notes to a local folder as Markdown files.

## Features

- **Auto-sync** when meetings end (watches Granola cache for changes)
- **One-click sync** from the menubar
- **Recent Notes** submenu for quick access to last 5 synced notes
- **Clickable notifications** - click to open the synced note
- **Action items extraction** - automatically finds TODOs, ACTION items, FOLLOW UPs
- **Sync stats** - shows meeting count and last sync time in menu
- **Obsidian integration** - AI-powered organization into your vault (optional)
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
| *X meetings synced* | Total meeting count |
| *Last sync: Xm ago* | Time since last sync |
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

## Obsidian Integration (Optional)

Use Claude Code to automatically organize notes into your Obsidian vault with proper links, tags, and folder structure.

### Requirements

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- An Obsidian vault

### Setup

1. Copy the example config:
   ```bash
   cp config.example.json config.json
   ```

2. Edit `config.json`:
   ```json
   {
     "obsidian": {
       "enabled": true,
       "vault_path": "~/Documents/YourVault",
       "meetings_folder": "Meetings",
       "auto_import": false,
       "claude_instructions": "Your instructions here..."
     }
   }
   ```

3. Customize `claude_instructions` for your vault structure. Example:
   ```
   You are organizing meeting notes for my Obsidian vault.

   VAULT STRUCTURE:
   - Clients/ - Client profile pages
   - Meetings/ - Meeting notes
   - Projects/ - Project documentation

   YOUR TASKS:
   1. Identify the client from attendee email domains
   2. Check if client file exists in Clients/
   3. Create new client file if needed
   4. Process the meeting note with proper frontmatter and wiki links
   5. Save to Meetings/YYYY-MM-DD - Title.md
   6. Update client file with backlink to meeting
   ```

### Menubar Options

| Menu Item | Description |
|-----------|-------------|
| Import to Obsidian | Import new notes in background (uses manifest to skip already-imported) |
| Force Re-import All (Live) | Opens Terminal with Claude Code UI to process all notes interactively |
| Open Obsidian Vault | Opens your vault folder |

### How It Works

- **Import to Obsidian**: Runs headlessly in background, processes one note at a time, tracks imported notes in `.breakfast-imported.json` manifest
- **Force Re-import All (Live)**: Opens a single Claude Code session that scans all notes and processes them—you can watch Claude work in real-time

### Command Line

```bash
node obsidian-import.js              # Import new notes (headless)
node obsidian-import.js --force      # Re-import all notes
node obsidian-import.js --dry-run    # Preview what would import
node obsidian-import.js --live       # Interactive mode (shows Claude UI)
```

## How It Works

Granola stores meeting data locally at `~/Library/Application Support/Granola/cache-v3.json`. This tool reads that cache and exports meetings as Markdown files — no API keys or authentication required.

## License

MIT
