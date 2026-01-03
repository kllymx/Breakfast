#!/usr/bin/env node
/**
 * Granola Notes Sync - CLI Usage:
 *   node index.js                    # Sync all meetings
 *   node index.js --days 7           # Sync last 7 days  
 *   node index.js --force            # Overwrite existing files
 *   node index.js --verbose          # Show detailed logs
 */

const fs = require('fs');
const path = require('path');

const CONFIG = {
  outputDir: process.env.GRANOLA_OUTPUT_DIR || path.join(process.env.HOME, 'Documents/Granola Notes'),
  cacheFile: path.join(process.env.HOME, 'Library/Application Support/Granola/cache-v3.json'),
  supabaseFile: path.join(process.env.HOME, 'Library/Application Support/Granola/supabase.json'),
  logFile: path.join(process.env.HOME, 'Library/Logs/granola-sync.log'),
  transcriptApi: 'https://api.granola.ai/v1/get-document-transcript',
};

const args = process.argv.slice(2);
const options = {
  days: null,
  force: args.includes('--force') || args.includes('-f'),
  verbose: args.includes('--verbose') || args.includes('-v'),
};

const daysIndex = args.findIndex(a => a === '--days' || a === '-d');
if (daysIndex !== -1 && args[daysIndex + 1]) {
  options.days = parseInt(args[daysIndex + 1], 10);
}

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  if (options.verbose || level === 'error') {
    console.log(logMessage);
  }
  
  try {
    fs.appendFileSync(CONFIG.logFile, logMessage + '\n');
  } catch (e) {}
}

function getAuthToken() {
  try {
    const supabaseData = JSON.parse(fs.readFileSync(CONFIG.supabaseFile, 'utf-8'));
    
    if (supabaseData.workos_tokens) {
      const tokens = typeof supabaseData.workos_tokens === 'string' 
        ? JSON.parse(supabaseData.workos_tokens) 
        : supabaseData.workos_tokens;
      if (tokens?.access_token) return tokens.access_token;
    }
    
    if (supabaseData.cognito_tokens) {
      const tokens = typeof supabaseData.cognito_tokens === 'string'
        ? JSON.parse(supabaseData.cognito_tokens)
        : supabaseData.cognito_tokens;
      if (tokens?.access_token) return tokens.access_token;
    }
    
    return null;
  } catch (err) {
    log(`Failed to read auth token: ${err.message}`, 'error');
    return null;
  }
}

async function fetchTranscriptFromApi(documentId) {
  const token = getAuthToken();
  if (!token) {
    log('No auth token available for transcript API', 'error');
    return null;
  }
  
  try {
    const response = await fetch(CONFIG.transcriptApi, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ document_id: documentId })
    });
    
    if (!response.ok) {
      log(`Transcript API error: ${response.status}`, 'error');
      return null;
    }
    
    const data = await response.json();
    return Array.isArray(data) ? data : null;
  } catch (err) {
    log(`Failed to fetch transcript: ${err.message}`, 'error');
    return null;
  }
}

function formatDateTime(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(startStr, endStr) {
  if (!startStr || !endStr) return '';
  
  const start = new Date(startStr);
  const end = new Date(endStr);
  const durationMs = end.getTime() - start.getTime();
  
  const hours = Math.floor(durationMs / (60 * 60 * 1000));
  const minutes = Math.floor((durationMs % (60 * 60 * 1000)) / (60 * 1000));
  
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''}${minutes > 0 ? ` ${minutes} minute${minutes > 1 ? 's' : ''}` : ''}`;
  }
  return `${minutes} minute${minutes > 1 ? 's' : ''}`;
}

function extractAttendees(meeting, metadata) {
  const attendees = [];
  
  const creator = metadata?.creator || meeting.people?.creator;
  if (creator) {
    attendees.push({
      name: creator.name || creator.details?.person?.name?.fullName || '',
      email: creator.email || '',
      role: 'organizer',
    });
  }
  
  const metaAttendees = metadata?.attendees || meeting.people?.attendees || [];
  for (const attendee of metaAttendees) {
    const name = attendee.name || attendee.details?.person?.name?.fullName || '';
    const email = attendee.email || '';
    
    if (!attendees.some(a => a.email === email)) {
      attendees.push({ name, email, role: 'attendee' });
    }
  }
  
  const calendarAttendees = meeting.google_calendar_event?.attendees || [];
  for (const attendee of calendarAttendees) {
    const name = attendee.displayName || '';
    const email = attendee.email || '';
    
    if (!attendees.some(a => a.email === email)) {
      attendees.push({ name, email, role: 'attendee' });
    }
  }
  
  return attendees;
}

function formatAttendeesList(attendees) {
  if (attendees.length === 0) return '*No attendees recorded*';
  
  return attendees.map(a => {
    const parts = [];
    if (a.name) parts.push(a.name);
    if (a.email) parts.push(`<${a.email}>`);
    if (a.role === 'organizer') parts.push('(organizer)');
    return `- ${parts.join(' ')}`;
  }).join('\n');
}

function formatTranscript(transcriptEntries) {
  if (!transcriptEntries || transcriptEntries.length === 0) {
    return '*No transcript available*';
  }
  
  const sorted = [...transcriptEntries].sort((a, b) => 
    (a.sequence_number || 0) - (b.sequence_number || 0)
  );
  
  return sorted.map(entry => {
    const speaker = entry.source === 'microphone' ? 'Me' : (entry.speaker || 'Speaker');
    const timestamp = entry.start_timestamp 
      ? `[${new Date(entry.start_timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]` 
      : '';
    return `**${speaker}** ${timestamp}: ${entry.text}`;
  }).join('\n\n');
}

function extractActionItems(notes, transcript) {
  const actionItems = [];
  const patterns = [
    /(?:^|\n)\s*[-*]\s*\[[ ]\]\s*(.+)/gi,
    /(?:^|\n)\s*(?:TODO|ACTION|FOLLOW[- ]?UP|NEXT STEP|ACTION ITEM)[:\s]+(.+)/gi,
    /(?:^|\n)\s*[-*]\s*(?:TODO|ACTION|FOLLOW[- ]?UP|NEXT STEP)[:\s]+(.+)/gi,
  ];
  
  const sources = [notes || '', transcript || ''];
  
  for (const text of sources) {
    for (const pattern of patterns) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) {
        const item = match[1].trim();
        if (item && item.length > 3 && !actionItems.includes(item)) {
          actionItems.push(item);
        }
      }
    }
  }
  
  return actionItems;
}

function generateMarkdown(meeting, metadata, transcriptEntries) {
  const attendees = extractAttendees(meeting, metadata);
  const calEvent = meeting.google_calendar_event;
  const notesText = meeting.notes_markdown || meeting.notes_plain || '';
  const transcriptText = formatTranscript(transcriptEntries);
  const actionItems = extractActionItems(notesText, transcriptText);
  
  const frontmatter = [
    '---',
    `id: ${meeting.id}`,
    `title: "${(meeting.title || 'Untitled Meeting').replace(/"/g, '\\"')}"`,
    `created_at: ${meeting.created_at}`,
    `updated_at: ${meeting.updated_at || meeting.created_at}`,
  ];
  
  if (calEvent?.start?.dateTime) {
    frontmatter.push(`meeting_start: ${calEvent.start.dateTime}`);
  }
  if (calEvent?.end?.dateTime) {
    frontmatter.push(`meeting_end: ${calEvent.end.dateTime}`);
  }
  if (attendees.length > 0) {
    frontmatter.push(`attendees: [${attendees.map(a => `"${a.email || a.name}"`).join(', ')}]`);
  }
  if (calEvent?.conferenceData?.entryPoints?.[0]?.uri) {
    frontmatter.push(`meeting_link: ${calEvent.conferenceData.entryPoints[0].uri}`);
  }
  frontmatter.push('---');
  
  let meetingInfo = '';
  if (calEvent?.start?.dateTime) {
    meetingInfo += `**Start:** ${formatDateTime(calEvent.start.dateTime)}\n`;
    if (calEvent?.end?.dateTime) {
      meetingInfo += `**End:** ${formatDateTime(calEvent.end.dateTime)}\n`;
      meetingInfo += `**Duration:** ${formatDuration(calEvent.start.dateTime, calEvent.end.dateTime)}\n`;
    }
  } else {
    meetingInfo += `**Date:** ${formatDateTime(meeting.created_at)}\n`;
  }
  
  if (calEvent?.conferenceData?.conferenceSolution?.name) {
    meetingInfo += `**Platform:** ${calEvent.conferenceData.conferenceSolution.name}\n`;
  }
  
  if (calEvent?.conferenceData?.entryPoints?.[0]?.uri) {
    meetingInfo += `**Meeting Link:** ${calEvent.conferenceData.entryPoints[0].uri}\n`;
  }
  
  const sections = [
    frontmatter.join('\n'),
    '',
    `# ${meeting.title || 'Untitled Meeting'}`,
    '',
    meetingInfo,
    '',
    '---',
    '',
    '## Attendees',
    '',
    formatAttendeesList(attendees),
    '',
    '---',
    '',
    '## Notes',
    '',
    notesText || '*No notes recorded*',
    '',
    '---',
    '',
    '## Summary',
    '',
    meeting.summary || meeting.overview || '*No summary available*',
  ];
  
  if (actionItems.length > 0) {
    sections.push(
      '',
      '---',
      '',
      '## Action Items',
      '',
      actionItems.map(item => `- [ ] ${item}`).join('\n')
    );
  }
  
  sections.push(
    '',
    '---',
    '',
    '## Transcript',
    '',
    transcriptText,
    ''
  );
  
  return sections.join('\n');
}

function sanitizeFilename(title) {
  return (title || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 100);
}

async function syncGranolaNotes() {
  log('Starting Granola notes sync');
  
  if (!fs.existsSync(CONFIG.cacheFile)) {
    log(`Cache file not found: ${CONFIG.cacheFile}`, 'error');
    console.error('Error: Granola cache file not found. Make sure Granola is installed and has been used.');
    process.exit(1);
  }
  
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    log(`Created output directory: ${CONFIG.outputDir}`);
  }
  
  log('Reading Granola cache file');
  let cacheContent;
  try {
    cacheContent = fs.readFileSync(CONFIG.cacheFile, 'utf-8');
  } catch (err) {
    log(`Failed to read cache file: ${err.message}`, 'error');
    process.exit(1);
  }
  
  let cacheData;
  try {
    const parsed = JSON.parse(cacheContent);
    cacheData = JSON.parse(parsed.cache);
  } catch (err) {
    log(`Failed to parse cache file: ${err.message}`, 'error');
    process.exit(1);
  }
  
  if (!cacheData?.state?.documents) {
    log('Invalid cache structure: missing documents', 'error');
    process.exit(1);
  }
  
  const documents = Object.values(cacheData.state.documents);
  const meetingsMetadata = cacheData.state.meetingsMetadata || {};
  const transcripts = cacheData.state.transcripts || {};
  
  log(`Found ${documents.length} total documents`);
  
  let startDate = null;
  if (options.days) {
    startDate = new Date();
    startDate.setDate(startDate.getDate() - options.days);
    log(`Filtering to last ${options.days} days (since ${startDate.toISOString()})`);
  }
  
  const meetings = documents.filter(doc => {
    if (!doc.valid_meeting || doc.deleted_at) return false;
    if (startDate) {
      const meetingDate = new Date(doc.created_at);
      return meetingDate >= startDate;
    }
    return true;
  });
  
  log(`Found ${meetings.length} valid meetings to sync`);
  
  if (meetings.length === 0) {
    console.log('No meetings to sync.');
    return;
  }
  
  let exportedCount = 0;
  let skippedCount = 0;
  
  const hasAuthToken = !!getAuthToken();
  if (hasAuthToken) {
    log('Auth token found - will fetch transcripts from API');
  } else {
    log('No auth token - transcripts will use local cache only');
  }
  
  for (const meeting of meetings) {
    const meetingDate = new Date(meeting.created_at);
    const datePrefix = meetingDate.toISOString().split('T')[0];
    const sanitizedTitle = sanitizeFilename(meeting.title);
    const filename = `${datePrefix}-${sanitizedTitle}.md`;
    const filePath = path.join(CONFIG.outputDir, filename);
    
    if (!options.force && fs.existsSync(filePath)) {
      log(`Skipping (exists): ${filename}`);
      skippedCount++;
      continue;
    }
    
    const metadata = meetingsMetadata[meeting.id];
    
    let transcriptEntries = transcripts[meeting.id] || [];
    if (hasAuthToken && transcriptEntries.length === 0) {
      log(`Fetching transcript from API for: ${meeting.title}`);
      const apiTranscript = await fetchTranscriptFromApi(meeting.id);
      if (apiTranscript) {
        transcriptEntries = apiTranscript;
      }
    }
    
    const markdown = generateMarkdown(meeting, metadata, transcriptEntries);
    
    try {
      fs.writeFileSync(filePath, markdown);
      log(`Exported: ${filename}`);
      exportedCount++;
    } catch (err) {
      log(`Failed to write ${filename}: ${err.message}`, 'error');
    }
  }
  
  const summary = `Sync complete: ${exportedCount} exported, ${skippedCount} skipped`;
  log(summary);
  console.log(`\n${summary}`);
  console.log(`Files saved to: ${CONFIG.outputDir}`);
  
  if (skippedCount > 0 && !options.force) {
    console.log('Use --force to overwrite existing files.');
  }
}

syncGranolaNotes().catch(err => {
  log(`Sync failed: ${err.message}`, 'error');
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
