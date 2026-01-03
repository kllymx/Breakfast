#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_NAME="com.arcane.granola-sync.plist"

echo "Installing Breakfast..."

if [ ! -d "$SCRIPT_DIR/.venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$SCRIPT_DIR/.venv"
    "$SCRIPT_DIR/.venv/bin/pip" install rumps pyobjc-framework-Cocoa
fi

echo "Generating launchd plist..."
sed -e "s|__INSTALL_DIR__|$SCRIPT_DIR|g" \
    -e "s|__HOME__|$HOME|g" \
    "$SCRIPT_DIR/$PLIST_NAME.template" > "$HOME/Library/LaunchAgents/$PLIST_NAME"

echo "Loading launchd service..."
launchctl unload "$HOME/Library/LaunchAgents/$PLIST_NAME" 2>/dev/null || true
launchctl load "$HOME/Library/LaunchAgents/$PLIST_NAME"

echo ""
echo "Installed! Look for the cereal icon in your menubar."
echo "Notes will sync to: ~/Documents/Granola Notes"
