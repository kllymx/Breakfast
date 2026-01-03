#!/usr/bin/env python3
import rumps
import subprocess
import os
import threading
import glob
import json
from datetime import datetime
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SYNC_SCRIPT = os.path.join(SCRIPT_DIR, 'index.js')
IMPORT_SCRIPT = os.path.join(SCRIPT_DIR, 'obsidian-import.js')
CONFIG_PATH = os.path.join(SCRIPT_DIR, 'config.json')
NODE_PATH = '/opt/homebrew/bin/node'
GRANOLA_CACHE = os.path.expanduser('~/Library/Application Support/Granola/cache-v3.json')
OUTPUT_DIR = os.environ.get('GRANOLA_OUTPUT_DIR', os.path.expanduser('~/Documents/Granola Notes'))
IMPORT_LOG = os.path.expanduser('~/Library/Logs/granola-import.log')


def load_config():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH) as f:
            return json.load(f)
    return {}


class CacheChangeHandler(FileSystemEventHandler):
    def __init__(self, app):
        self.app = app
        self.last_sync = 0
    
    def on_modified(self, event):
        if event.src_path.endswith('cache-v3.json'):
            now = datetime.now().timestamp()
            if now - self.last_sync > 30:
                self.last_sync = now
                self.app.auto_sync()


class GranolaSyncApp(rumps.App):
    def __init__(self):
        super().__init__("Granola", icon=None, title="🥣")
        
        self.config = load_config()
        self.obsidian_enabled = self.config.get('obsidian', {}).get('enabled', False)
        self.auto_import = self.config.get('obsidian', {}).get('auto_import', False)
        
        self.stats_item = rumps.MenuItem("", callback=None)
        self.last_sync_item = rumps.MenuItem("Last sync: Never", callback=None)
        self.recent_menu = rumps.MenuItem("Recent Notes")
        
        menu_items = [
            rumps.MenuItem("Sync Now", callback=self.sync_now),
            rumps.MenuItem("Sync Last 7 Days", callback=self.sync_week),
            None,
            self.recent_menu,
            rumps.MenuItem("Open Notes Folder", callback=self.open_folder),
        ]
        
        if self.obsidian_enabled:
            menu_items.extend([
                None,
                rumps.MenuItem("Import to Obsidian", callback=self.import_to_obsidian),
                rumps.MenuItem("Force Re-import All (Live)", callback=self.force_reimport_obsidian),
                rumps.MenuItem("Open Obsidian Vault", callback=self.open_vault),
            ])
        
        menu_items.extend([
            None,
            self.stats_item,
            self.last_sync_item,
            None,
            rumps.MenuItem("View Log", callback=self.view_log),
        ])
        
        self.menu = menu_items
        self.syncing = False
        self.importing = False
        self.last_synced_file = None
        self.last_sync_time = None
        self.observer = None
        
        self.update_stats()
        self.populate_recent_menu()
        self.start_watcher()
    
    def start_watcher(self):
        cache_dir = os.path.dirname(GRANOLA_CACHE)
        if os.path.exists(cache_dir):
            self.observer = Observer()
            handler = CacheChangeHandler(self)
            self.observer.schedule(handler, cache_dir, recursive=False)
            self.observer.start()
    
    def get_meeting_count(self):
        if not os.path.exists(OUTPUT_DIR):
            return 0
        return len(glob.glob(os.path.join(OUTPUT_DIR, '*.md')))
    
    def update_stats(self):
        count = self.get_meeting_count()
        self.stats_item.title = f"{count} meeting{'s' if count != 1 else ''} synced"
    
    def update_last_sync(self):
        self.last_sync_time = datetime.now()
        self.last_sync_item.title = f"Last sync: just now"
    
    def format_time_ago(self, dt):
        if not dt:
            return "Never"
        delta = datetime.now() - dt
        seconds = delta.total_seconds()
        if seconds < 60:
            return "just now"
        elif seconds < 3600:
            mins = int(seconds / 60)
            return f"{mins}m ago"
        elif seconds < 86400:
            hours = int(seconds / 3600)
            return f"{hours}h ago"
        else:
            days = int(seconds / 86400)
            return f"{days}d ago"
    
    @rumps.timer(60)
    def refresh_time_ago(self, _):
        if self.last_sync_time:
            self.last_sync_item.title = f"Last sync: {self.format_time_ago(self.last_sync_time)}"
    
    def get_recent_files(self):
        if not os.path.exists(OUTPUT_DIR):
            return []
        files = glob.glob(os.path.join(OUTPUT_DIR, '*.md'))
        files.sort(key=os.path.getmtime, reverse=True)
        return files[:5]
    
    def format_note_name(self, filepath):
        filename = os.path.basename(filepath)
        display_name = filename.replace('.md', '').replace('-', ' ').title()
        if len(display_name) > 40:
            display_name = display_name[:37] + '...'
        return display_name
    
    def populate_recent_menu(self):
        recent = self.get_recent_files()
        if not recent:
            self.recent_menu.add(rumps.MenuItem("No notes yet", callback=None))
            return
        for filepath in recent:
            item = rumps.MenuItem(self.format_note_name(filepath), callback=self.make_open_callback(filepath))
            self.recent_menu.add(item)
    
    def update_recent_menu(self):
        try:
            self.recent_menu.clear()
        except:
            return
        
        recent = self.get_recent_files()
        if not recent:
            self.recent_menu.add(rumps.MenuItem("No notes yet", callback=None))
            return
        
        for filepath in recent:
            item = rumps.MenuItem(self.format_note_name(filepath), callback=self.make_open_callback(filepath))
            self.recent_menu.add(item)
    
    def make_open_callback(self, filepath):
        def callback(_):
            subprocess.run(['open', filepath])
        return callback
    
    def auto_sync(self):
        if not self.syncing:
            rumps.notification("Granola", "Meeting detected", "Syncing notes...", sound=False)
            self.run_sync(auto=True)
    
    def run_sync(self, args=None, auto=False):
        if self.syncing:
            if not auto:
                rumps.notification("Granola Sync", "", "Sync already in progress...")
            return
        
        self.syncing = True
        self.title = "🔄"
        
        def do_sync():
            try:
                cmd = [NODE_PATH, SYNC_SCRIPT]
                if args:
                    cmd.extend(args)
                
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
                
                output = result.stdout + result.stderr
                lines = [l for l in output.strip().split('\n') if l]
                summary = lines[-2] if len(lines) >= 2 else "Sync completed"
                
                self.update_recent_menu()
                self.update_stats()
                self.update_last_sync()
                
                newest = self.get_newest_note()
                self.last_synced_file = newest
                
                new_notes_synced = 'exported' in summary.lower() and '0 exported' not in summary.lower()
                
                if result.returncode == 0:
                    if newest and new_notes_synced:
                        note_name = os.path.basename(newest).replace('.md', '').replace('-', ' ').title()
                        if len(note_name) > 50:
                            note_name = note_name[:47] + '...'
                        rumps.notification(
                            "Granola Sync", 
                            "Click to open", 
                            note_name,
                            action_button="Open",
                            data={"file": newest}
                        )
                    else:
                        rumps.notification("Granola Sync", "Complete", summary)
                else:
                    rumps.notification("Granola Sync", "Error", result.stderr[:100] or "Unknown error")
                
                if self.auto_import and new_notes_synced and result.returncode == 0:
                    self.run_obsidian_import(auto=True)
                    
            except subprocess.TimeoutExpired:
                rumps.notification("Granola Sync", "Error", "Sync timed out")
            except Exception as e:
                rumps.notification("Granola Sync", "Error", str(e)[:100])
            finally:
                self.syncing = False
                self.title = "🥣"
        
        threading.Thread(target=do_sync, daemon=True).start()
    
    def run_obsidian_import(self, auto=False, force=False):
        if self.importing:
            if not auto:
                rumps.notification("Obsidian Import", "", "Import already in progress...")
            return
        
        self.importing = True
        if not auto:
            self.title = "📥"
        
        def do_import():
            try:
                action = "Re-importing all notes" if force else "Importing notes"
                if not auto:
                    rumps.notification("Obsidian Import", "Starting", f"{action} to Obsidian...", sound=False)
                
                cmd = [NODE_PATH, IMPORT_SCRIPT]
                if force:
                    cmd.append('--force')
                
                with open(IMPORT_LOG, 'w') as log_file:
                    log_file.write(f"=== Import started at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ===\n")
                    log_file.write(f"Mode: {'Force re-import all' if force else 'New notes only'}\n\n")
                    log_file.flush()
                    
                    process = subprocess.Popen(
                        cmd,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        text=True,
                        cwd=SCRIPT_DIR
                    )
                    
                    output_lines = []
                    for line in process.stdout:
                        log_file.write(line)
                        log_file.flush()
                        output_lines.append(line.strip())
                    
                    process.wait()
                    
                    log_file.write(f"\n=== Import finished at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ===\n")
                
                complete_line = [l for l in output_lines if 'Complete:' in l or 'Nothing to import' in l]
                summary = complete_line[-1] if complete_line else "Import finished"
                
                if process.returncode == 0:
                    rumps.notification("Obsidian Import", "Complete", summary)
                else:
                    error_lines = [l for l in output_lines if 'error' in l.lower() or 'failed' in l.lower()]
                    error_msg = error_lines[-1] if error_lines else "Check import log for details"
                    rumps.notification("Obsidian Import", "Error", error_msg[:100])
                    
            except Exception as e:
                rumps.notification("Obsidian Import", "Error", str(e)[:100])
            finally:
                self.importing = False
                if not self.syncing:
                    self.title = "🥣"
        
        threading.Thread(target=do_import, daemon=True).start()
    
    def get_newest_note(self):
        if not os.path.exists(OUTPUT_DIR):
            return None
        files = glob.glob(os.path.join(OUTPUT_DIR, '*.md'))
        if not files:
            return None
        return max(files, key=os.path.getmtime)

    @rumps.notifications
    def on_notification(self, info):
        if info and 'file' in info:
            subprocess.run(['open', info['file']])
        elif self.last_synced_file:
            subprocess.run(['open', self.last_synced_file])

    def sync_now(self, _):
        self.run_sync()

    def sync_week(self, _):
        self.run_sync(['--days', '7', '--force'])

    def import_to_obsidian(self, _):
        self.run_obsidian_import()

    def force_reimport_obsidian(self, _):
        vault_path = self.config.get('obsidian', {}).get('vault_path', '').replace('~', os.path.expanduser('~'))
        instructions = self.config.get('obsidian', {}).get('claude_instructions', '')
        source_dir = OUTPUT_DIR
        
        prompt = f'''{instructions}

SOURCE FOLDER: {source_dir}
VAULT: {vault_path}

TASK: Scan the source folder for all meeting notes (.md files). For each one, check if it already exists in the vault (by meeting ID in frontmatter or by filename). Process any that are new or updated. Work through them all in this session.'''
        
        prompt_file = os.path.join(SCRIPT_DIR, '.import-prompt.txt')
        with open(prompt_file, 'w') as f:
            f.write(prompt)
        
        launcher = os.path.join(SCRIPT_DIR, '.run-import.sh')
        with open(launcher, 'w') as f:
            f.write(f'''#!/bin/bash
cd "{vault_path}"
claude --dangerously-skip-permissions "$(cat "{prompt_file}")"
''')
        os.chmod(launcher, 0o755)
        
        subprocess.run(['osascript', '-e', f'tell application "Terminal" to do script "{launcher}"'])
        subprocess.run(['osascript', '-e', 'tell application "Terminal" to activate'])

    def open_folder(self, _):
        subprocess.run(['open', OUTPUT_DIR])

    def open_vault(self, _):
        vault_path = self.config.get('obsidian', {}).get('vault_path', '')
        if vault_path:
            vault_path = vault_path.replace('~', os.path.expanduser('~'))
            subprocess.run(['open', vault_path])

    def view_log(self, _):
        log_path = os.path.expanduser('~/Library/Logs/granola-sync.log')
        subprocess.run(['open', '-a', 'Console', log_path])


if __name__ == "__main__":
    GranolaSyncApp().run()
