#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const SCRIPT_DIR = __dirname;
const CONFIG_PATH = path.join(SCRIPT_DIR, 'config.json');
const DEFAULT_OUTPUT_DIR = path.join(process.env.HOME, 'Documents/Granola Notes');
const MANIFEST_NAME = '.breakfast-imported.json';

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.log('No config.json found. Copy config.example.json and customize it.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function loadManifest(vaultPath) {
  const manifestPath = path.join(vaultPath, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) {
    return { imported: {}, lastRun: null };
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
}

function saveManifest(vaultPath, manifest) {
  const manifestPath = path.join(vaultPath, MANIFEST_NAME);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function getSourceNotes(outputDir) {
  if (!fs.existsSync(outputDir)) return [];
  
  return fs.readdirSync(outputDir)
    .filter(f => f.endsWith('.md'))
    .map(f => ({
      filename: f,
      path: path.join(outputDir, f),
      mtime: fs.statSync(path.join(outputDir, f)).mtime.toISOString()
    }));
}

function extractNoteId(filepath) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const match = content.match(/^id:\s*(.+)$/m);
  return match ? match[1].trim() : path.basename(filepath, '.md');
}

function runClaudeImport(notePath, vaultPath, instructions, liveMode = false) {
  return new Promise((resolve, reject) => {
    const noteContent = fs.readFileSync(notePath, 'utf-8');
    const filename = path.basename(notePath);
    
    const prompt = `${instructions}

MEETING NOTE TO PROCESS:
Filename: ${filename}
Source: ${notePath}
Vault: ${vaultPath}

---
${noteContent}
---

Process this meeting note according to the instructions. Create or update files in the vault as needed. Report what you did.`;

    const args = liveMode 
      ? ['--dangerously-skip-permissions', prompt]
      : ['--print', '--dangerously-skip-permissions', prompt];
    
    const claudeProcess = spawn('claude', args, {
      cwd: vaultPath,
      stdio: liveMode ? 'inherit' : ['pipe', 'pipe', 'pipe']
    });
    
    if (liveMode) {
      claudeProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output: '' });
        } else {
          reject(new Error(`Claude exited with code ${code}`));
        }
      });
      claudeProcess.on('error', reject);
      return;
    }
    
    let stdout = '';
    let stderr = '';
    
    claudeProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });
    
    claudeProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    claudeProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output: stdout });
      } else {
        reject(new Error(`Claude exited with code ${code}: ${stderr}`));
      }
    });
    
    claudeProcess.on('error', reject);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const forceAll = args.includes('--force') || args.includes('-f');
  const dryRun = args.includes('--dry-run') || args.includes('-n');
  const verbose = args.includes('--verbose') || args.includes('-v');
  const liveMode = args.includes('--live') || args.includes('-l');
  
  console.log('Breakfast Obsidian Import\n');
  
  const config = loadConfig();
  const obsidianConfig = config.obsidian;
  
  if (!obsidianConfig?.enabled) {
    console.log('Obsidian integration is disabled in config.json');
    process.exit(0);
  }
  
  const vaultPath = obsidianConfig.vault_path.replace(/^~/, process.env.HOME);
  const outputDir = process.env.GRANOLA_OUTPUT_DIR || DEFAULT_OUTPUT_DIR;
  
  if (!fs.existsSync(vaultPath)) {
    console.error(`Vault not found: ${vaultPath}`);
    process.exit(1);
  }
  
  console.log(`Source: ${outputDir}`);
  console.log(`Vault: ${vaultPath}`);
  console.log('');
  
  const manifest = loadManifest(vaultPath);
  const sourceNotes = getSourceNotes(outputDir);
  
  console.log(`Found ${sourceNotes.length} notes in source folder`);
  console.log(`Already imported: ${Object.keys(manifest.imported).length}`);
  
  const notesToImport = sourceNotes.filter(note => {
    const noteId = extractNoteId(note.path);
    if (forceAll) return true;
    
    const imported = manifest.imported[noteId];
    if (!imported) return true;
    
    return new Date(note.mtime) > new Date(imported.importedAt);
  });
  
  console.log(`Notes to import: ${notesToImport.length}\n`);
  
  if (notesToImport.length === 0) {
    console.log('Nothing to import.');
    return;
  }
  
  if (dryRun) {
    console.log('Dry run - would import:');
    notesToImport.forEach(n => console.log(`  - ${n.filename}`));
    return;
  }
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const note of notesToImport) {
    const noteId = extractNoteId(note.path);
    console.log(`\nImporting: ${note.filename}`);
    console.log('─'.repeat(50));
    
    try {
      await runClaudeImport(note.path, vaultPath, obsidianConfig.claude_instructions, liveMode);
      
      manifest.imported[noteId] = {
        filename: note.filename,
        sourcePath: note.path,
        importedAt: new Date().toISOString()
      };
      saveManifest(vaultPath, manifest);
      
      successCount++;
      console.log(`✓ Imported successfully\n`);
    } catch (err) {
      errorCount++;
      console.error(`✗ Failed: ${err.message}\n`);
    }
  }
  
  manifest.lastRun = new Date().toISOString();
  saveManifest(vaultPath, manifest);
  
  console.log('─'.repeat(50));
  console.log(`\nComplete: ${successCount} imported, ${errorCount} failed`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
