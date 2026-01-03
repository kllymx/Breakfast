#!/usr/bin/env python3
import rumps
import subprocess
import os
import threading

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SYNC_SCRIPT = os.path.join(SCRIPT_DIR, 'index.js')
NODE_PATH = '/opt/homebrew/bin/node'

class GranolaSyncApp(rumps.App):
    def __init__(self):
        super().__init__("Granola", icon=None, title="🥣")
        self.menu = [
            rumps.MenuItem("Sync Now", callback=self.sync_now),
            rumps.MenuItem("Sync Last 7 Days", callback=self.sync_week),
            None,
            rumps.MenuItem("Open Notes Folder", callback=self.open_folder),
            rumps.MenuItem("View Log", callback=self.view_log),
        ]
        self.syncing = False

    def run_sync(self, args=None):
        if self.syncing:
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
                
                if result.returncode == 0:
                    rumps.notification("Granola Sync", "Complete", summary)
                else:
                    rumps.notification("Granola Sync", "Error", result.stderr[:100] or "Unknown error")
            except subprocess.TimeoutExpired:
                rumps.notification("Granola Sync", "Error", "Sync timed out")
            except Exception as e:
                rumps.notification("Granola Sync", "Error", str(e)[:100])
            finally:
                self.syncing = False
                self.title = "🥣"
        
        threading.Thread(target=do_sync, daemon=True).start()

    def sync_now(self, _):
        self.run_sync()

    def sync_week(self, _):
        self.run_sync(['--days', '7', '--force'])

    def open_folder(self, _):
        output_dir = os.environ.get('GRANOLA_OUTPUT_DIR', os.path.expanduser('~/Documents/Granola Notes'))
        subprocess.run(['open', output_dir])

    def view_log(self, _):
        log_path = os.path.expanduser('~/Library/Logs/granola-sync.log')
        subprocess.run(['open', '-a', 'Console', log_path])

if __name__ == "__main__":
    GranolaSyncApp().run()
