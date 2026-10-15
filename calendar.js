// Minster More — committee calendar feed and event reminder emails
//
// 1. A private iCalendar feed (/calendar/<token>.ics) that Outlook, Google or
//    Apple Calendar can subscribe to. Every event in admin appears in it,
//    including hidden ones and the committee's planning notes.
// 2. Reminder emails to the committee inbox 14, 7 and 2 days before each
//    event, sent through Resend. Each reminder is only ever sent once.

const crypto = require('crypto');

const REMINDER_DAYS = [14, 7, 2];
const SITE = (process.env.SITE_URL || 'https://www.minstermore.org.uk').replace(/\/$/, '');
const REMINDER_TO = process.env.REMINDER_EMAIL || 'hello@minstermore.org.uk';
const REMINDER_FROM = process.env.REMINDER_FROM || 'Minster More <no-reply@minstermore.org.uk>';
const EVENT_HOURS = 3; // events have a start time only; assume they run for 3 hours

// The feed address is secret. Use CALENDAR_TOKEN if set, otherwise derive a
// stable one from the service key so it works without extra setup.
function calendarToken() {
  if (process.env.CALENDAR_TOKEN) return process.env.CALENDAR_TOKEN.trim();
  const seed = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return seed ? crypto.createHash('sha256').update('minster-more-calendar:' + seed).digest('hex').slice(0, 32) : '';
}

// ---------------------------------------------------------------- iCal --
function icsText(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function icsDate(d) {
  return new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
function fold(line) {
  // RFC 5545: lines over 75 octets are folded with CRLF + space
  const out = [];
  let buf = Buffer.from(line, 'utf8');
  while (buf.length > 75) {
    let cut = 75;
    while (cut > 0 && (buf[cut] & 0xc0) === 0x80) cut--; // don't split a UTF-8 character
    out.push(buf.slice(0, cut).toString('utf8'));
    buf = Buffer.concat([Buffer.from(' '), buf.slice(cut)]);
  }
  out.push(buf.toString('utf8'));
  return out.join('\r\n');
}
function planningSummary(e, sep = '\n') {
  const parts = [];
  if (e.blurb) parts.push(e.blurb);
  parts.push(`Ticket price: ${e.price_pence ? '£' + (e.price_pence / 100).toFixed(2).replace(/\.00$/, '') : 'Free'}${e.capacity ? ` · capacity ${e.capacity}` : ''}`);
  parts.push(e.published ? 'On the website' : 'Not on the website yet');
  if (e.sells_alcohol) parts.push(`Selling alcohol · licence (TEN): ${e.licence_status || 'not set'}`);
  if (e.volunteers) parts.push(`Volunteers:${sep}${e.volunteers}`);
  if (e.equipment) parts.push(`Equipment:${sep}${e.equipment}`);
  if (e.planning_notes) parts.push(`Notes:${sep}${e.planning_notes}`);
  parts.push(`Edit in admin: ${SITE}/admin`);
  return parts.join(sep + sep);
}
function buildCalendar(events) {
  const now = icsDate(Date.now());
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Minster More//Events//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Minster More events', 'X-WR-CALDESC:Minster More committee events', 'X-WR-TIMEZONE:Europe/London',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ];
  for (const e of events) {
    const start = new Date(e.starts_at);
    const end = new Date(start.getTime() + EVENT_HOURS * 3600_000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@minstermore.org.uk`,
      `DTSTAMP:${now}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsText((e.published ? '' : '[Planning] ') + e.title)}`,
      ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
      `DESCRIPTION:${icsText(planningSummary(e))}`,
      `URL:${SITE}/admin`,
      'END:VEVENT',
    );
  }
  if (!events.length) {
    // Outlook refuses to subscribe to a calendar with no events in it, so
    // until the first event is added, show a one-day "connected" note.
    const d = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }).replace(/-/g, '');
    const next = new Date(Date.parse(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })) + 86400_000).toISOString().slice(0, 10).replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT', 'UID:calendar-connected@minstermore.org.uk', `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`,
      'SUMMARY:Minster More calendar connected',
      `DESCRIPTION:${icsText('Events you add in the Minster More admin area will appear in this calendar. This note disappears once the first event is added.')}`,
      'TRANSP:TRANSPARENT', 'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

// ------------------------------------------------------------- routes --
function calendarRoutes(app, db) {
  app.get('/calendar/:file', async (req, res) => {
    const token = calendarToken();
    const given = String(req.params.file || '').replace(/\.ics$/, '');
    const ok = token && given.length === token.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(token));
    if (!db || !ok) return res.status(404).send('Not found');
    const since = new Date(Date.now() - 180 * 86400_000).toISOString();
    const { data, error } = await db.from('events').select('*').gte('starts_at', since).order('starts_at');
    if (error) return res.status(500).send('Calendar unavailable');
    res.set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Disposition': 'inline; filename="minster-more-events.ics"' });
    res.send(buildCalendar(data));
  });

  // The admin page asks for the feed address. Only signed-in admins get it.
  app.get('/api/admin/calendar', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Not connected' });
    const jwt = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = jwt ? await db.auth.getUser(jwt) : { data: null };
    const email = u?.user?.email?.toLowerCase();
    if (!email) return res.status(401).json({ error: 'Sign in again.' });
    const { data: admin } = await db.from('admins').select('email').ilike('email', email).maybeSingle();
    if (!admin) return res.status(403).json({ error: 'Not an admin.' });
    res.json({
      url: `${SITE}/calendar/${calendarToken()}.ics`,
      reminders: Boolean(process.env.RESEND_API_KEY),
      reminder_to: REMINDER_TO,
    });
  });
}

// ---------------------------------------------------------- reminders --
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function whenText(iso) {
  return new Date(iso).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'Europe/London' });
}
// Whole calendar days between today and the event, in UK time
function calendarDaysUntil(iso, now = Date.now()) {
  const ymd = t => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); // YYYY-MM-DD
  return Math.round((Date.parse(ymd(iso)) - Date.parse(ymd(now))) / 86400_000);
}
function reminderEmail(e, days) {
  const daysLeft = calendarDaysUntil(e.starts_at);
  const lead = daysLeft <= 0 ? 'today' : daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`;
  const list = t => (t || '').split('\n').map(x => x.trim()).filter(Boolean);
  const vols = list(e.volunteers), kit = list(e.equipment);
  const licenceWarn = e.sells_alcohol && !['Applied', 'Approved'].includes(e.licence_status || '');
  const section = (title, body) => `<h3 style="font:700 13px Arial,sans-serif;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin:22px 0 6px">${title}</h3>${body}`;
  const ul = items => items.length ? `<ul style="margin:0;padding-left:18px">${items.map(i => `<li style="margin:3px 0">${esc(i)}</li>`).join('')}</ul>` : '<p style="margin:0;color:#6b7280">Nothing noted yet</p>';
  const html = `
  <div style="font:15px/1.5 Arial,sans-serif;color:#131f35;max-width:560px">
    <p style="font:800 20px Arial,sans-serif;letter-spacing:-.02em;margin:0 0 18px">minster more<span style="color:#e2875e">+</span></p>
    <h1 style="font:800 24px Arial,sans-serif;margin:0 0 4px">${esc(e.title)} is ${lead}</h1>
    <p style="margin:0 0 16px;color:#374151">${esc(whenText(e.starts_at))}${e.location ? ` · ${esc(e.location)}` : ''}</p>
    ${licenceWarn ? `<p style="background:#fdecea;border-radius:8px;padding:12px 14px;margin:0 0 8px"><b>Alcohol licence not yet applied for.</b> A Temporary Event Notice must reach Newark &amp; Sherwood council at least 10 working days before the event.</p>` : ''}
    ${!e.published ? `<p style="background:#eef2f7;border-radius:8px;padding:12px 14px;margin:0 0 8px">This event isn't on the website yet.</p>` : ''}
    ${section(`Volunteers (${vols.length})`, ul(vols))}
    ${section('Equipment', ul(kit))}
    ${e.sells_alcohol ? section('Alcohol', `<p style="margin:0">Selling alcohol · licence: <b>${esc(e.licence_status || 'not set')}</b></p>`) : ''}
    ${e.planning_notes ? section('Notes', `<p style="margin:0;white-space:pre-wrap">${esc(e.planning_notes)}</p>`) : ''}
    <p style="margin:26px 0 0"><a href="${SITE}/admin" style="background:#131f35;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:700">Open event planning</a></p>
    <p style="margin:22px 0 0;font-size:12px;color:#6b7280">Automatic ${days}-day reminder from the Minster More website.</p>
  </div>`;
  const text = `${e.title} is ${lead}\n${whenText(e.starts_at)}${e.location ? ` · ${e.location}` : ''}\n\n${planningSummary(e)}`;
  const subject = `${e.title} is ${lead} — ${new Date(e.starts_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' })}`;
  return { subject, html, text };
}

async function sendEmail({ subject, html, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: REMINDER_FROM, to: [REMINDER_TO], subject, html, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

// Which reminder is due now? Each one has a window, so an event added late
// gets one sensible reminder rather than three at once.
function dueReminder(startsAt, now = Date.now()) {
  const daysLeft = (new Date(startsAt) - now) / 86400_000;
  if (daysLeft <= 0) return null;
  const sorted = [...REMINDER_DAYS].sort((a, b) => b - a); // 14, 7, 2
  for (let i = 0; i < sorted.length; i++) {
    const upper = sorted[i], lower = sorted[i + 1] ?? 0;
    if (daysLeft <= upper && daysLeft > lower) return upper;
  }
  return null;
}

async function runReminders(db) {
  if (!db || !process.env.RESEND_API_KEY) return;
  const now = new Date();
  const horizon = new Date(now.getTime() + 15 * 86400_000).toISOString();
  const { data: events, error } = await db.from('events').select('*').gt('starts_at', now.toISOString()).lte('starts_at', horizon);
  if (error) return console.error('Reminders: could not load events', error.message);
  for (const e of events) {
    const days = dueReminder(e.starts_at, now.getTime());
    if (!days) continue;
    // Claim the reminder first so it can never be sent twice
    const { error: claimErr } = await db.from('event_reminders').insert({ event_id: e.id, days });
    if (claimErr) {
      if (claimErr.code !== '23505') console.error('Reminders: could not record', claimErr.message);
      continue; // already sent (or table missing)
    }
    try {
      await sendEmail(reminderEmail(e, days));
      console.log(`Reminder sent: ${e.title} (${days}-day)`);
    } catch (err) {
      console.error('Reminder email failed:', err.message);
      await db.from('event_reminders').delete().eq('event_id', e.id).eq('days', days); // retry next hour
    }
  }
}

function startReminders(db) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('⚠ RESEND_API_KEY not set — event reminder emails are switched off.');
    return;
  }
  setTimeout(() => runReminders(db).catch(e => console.error('Reminders:', e)), 30_000);
  setInterval(() => runReminders(db).catch(e => console.error('Reminders:', e)), 60 * 60_000).unref();
}

module.exports = { calendarRoutes, startReminders, buildCalendar, dueReminder, reminderEmail, runReminders };
