// Minster More — branded email templates
// Table-based layout with inline styles so it renders consistently in
// Outlook, Gmail and Apple Mail. Logos are hosted on the site itself.

const SITE = (process.env.SITE_URL || 'https://www.minstermore.org.uk').replace(/\/$/, '').replace('://minstermore', '://www.minstermore');
const NAVY = '#131f35', CORAL = '#e2875e', CREAM = '#f8f5ee', INK_SOFT = '#5b6474', LINE = '#e6e1d8';
const FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif";

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const tz = { timeZone: 'Europe/London' };
const fmtDate = iso => new Date(iso).toLocaleDateString('en-GB', { ...tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtTime = iso => new Date(iso).toLocaleTimeString('en-GB', { ...tz, hour: 'numeric', minute: '2-digit', hour12: true }).replace(':00', '').replace(' ', '');
const firstName = n => esc(String(n || '').trim().split(/\s+/)[0] || 'there');

// ------------------------------------------------------------ layout --
function layout({ preheader = '', heading, intro = '', body = '', cta = null, footerNote = '', signoff = 'With thanks,<br><b style="color:#131f35;">The Minster More committee</b>' }) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${CREAM};">${esc(preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;">
      <tr><td style="background:${NAVY};padding:30px 36px 26px;">
        <a href="${SITE}" style="text-decoration:none;"><img src="${SITE}/assets/email/logo-cream.png" width="210" height="28" alt="minster more+" style="display:block;border:0;width:210px;height:auto;color:${CREAM};font:800 24px ${FONT};"></a>
      </td></tr>
      <tr><td style="background:${CORAL};height:5px;line-height:5px;font-size:0;">&nbsp;</td></tr>
      <tr><td style="padding:34px 36px 8px;font:16px/1.6 ${FONT};color:${NAVY};">
        <h1 style="margin:0 0 14px;font:800 26px/1.2 ${FONT};color:${NAVY};letter-spacing:-0.3px;">${heading}</h1>
        ${intro ? `<p style="margin:0 0 20px;font:16px/1.6 ${FONT};color:${NAVY};">${intro}</p>` : ''}
        ${body}
        ${cta ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 8px;"><tr><td style="background:${NAVY};border-radius:999px;">
          <a href="${cta.href}" style="display:inline-block;padding:13px 26px;font:700 15px ${FONT};color:#ffffff;text-decoration:none;border-radius:999px;">${esc(cta.label)}</a></td></tr></table>` : ''}
      </td></tr>
      <tr><td style="padding:22px 36px 32px;font:14px/1.6 ${FONT};color:${INK_SOFT};">
        ${footerNote ? `<p style="margin:0 0 14px;">${footerNote}</p>` : ''}
        ${signoff ? `<p style="margin:0;">${signoff}</p>` : ''}
      </td></tr>
      <tr><td style="background:${NAVY};padding:24px 36px;font:12.5px/1.6 ${FONT};color:#c9cfdb;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="top" style="font:12.5px/1.6 ${FONT};color:#c9cfdb;">
            <a href="${SITE}" style="color:#ffffff;text-decoration:none;font-weight:700;">minstermore.org.uk</a><br>
            <a href="mailto:hello@minstermore.org.uk" style="color:#c9cfdb;text-decoration:none;">hello@minstermore.org.uk</a> · <a href="mailto:team@minstermore.org.uk" style="color:#c9cfdb;text-decoration:none;">team@minstermore.org.uk</a><br>
            <span style="color:#98a1b3;">Minster More is the working name of Southwell Minster School Parent Teacher Association, registered charity 516332.</span>
          </td>
          <td valign="top" align="right" width="56" style="padding-left:16px;"><img src="${SITE}/assets/email/icon.png" width="44" height="44" alt="" style="display:block;border:0;border-radius:11px;"></td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// A cream panel of label/value rows
function detailsPanel(rows) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};border-radius:14px;margin:6px 0 22px;">
  <tr><td style="padding:18px 22px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${rows.filter(r => r && r[1]).map(([label, value], i) => `<tr>
        <td valign="top" width="110" style="padding:${i ? '10px' : '0'} 12px 0 0;font:700 12px/1.5 ${FONT};text-transform:uppercase;letter-spacing:.8px;color:${INK_SOFT};">${esc(label)}</td>
        <td valign="top" style="padding:${i ? '10px' : '0'} 0 0;font:15px/1.5 ${FONT};color:${NAVY};">${value}</td></tr>`).join('')}
    </table>
  </td></tr></table>`;
}
function sectionTitle(t) {
  return `<p style="margin:22px 0 8px;font:700 12px/1.5 ${FONT};text-transform:uppercase;letter-spacing:.8px;color:${CORAL};">${esc(t)}</p>`;
}
function nextSteps(text) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 6px;"><tr>
    <td width="5" style="background:${CORAL};border-radius:3px;font-size:0;">&nbsp;</td>
    <td style="padding:4px 0 4px 16px;font:15px/1.6 ${FONT};color:${NAVY};"><b>What happens next</b><br>${text}</td></tr></table>`;
}

// ----------------------------------------------------------- calendar --
function icsFor(ev, roles) {
  const d = t => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const txt = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const start = new Date(ev.starts_at), end = new Date(start.getTime() + 3 * 3600_000);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Minster More//Volunteering//EN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:volunteer-${ev.id}@minstermore.org.uk`, `DTSTAMP:${d(Date.now())}`, `DTSTART:${d(start)}`, `DTEND:${d(end)}`,
    `SUMMARY:${txt('Volunteering: ' + ev.title)}`, ...(ev.location ? [`LOCATION:${txt(ev.location)}`] : []),
    `DESCRIPTION:${txt('Helping with: ' + roles.map(r => r.title).join(', ') + '\nQuestions: team@minstermore.org.uk')}`,
    'END:VEVENT', 'END:VCALENDAR'];
  return Buffer.from(lines.join('\r\n') + '\r\n').toString('base64');
}

// ------------------------------------------------------------ emails --
// 1. Thank-you to someone who signed up to help at a specific event
function eventSignupThanks({ name, ev, roles, note }) {
  const roleHtml = roles.map(r => `<b>${esc(r.title)}</b>${r.description ? `<br><span style="color:${INK_SOFT};font-size:14px;">${esc(r.description)}</span>` : ''}`).join('<br><br>');
  const body = `
    ${detailsPanel([
      ['Event', `<b>${esc(ev.title)}</b>`],
      ['Date', esc(fmtDate(ev.starts_at))],
      ['Time', esc(fmtTime(ev.starts_at))],
      ['Where', esc(ev.location || '')],
      [roles.length > 1 ? 'Your roles' : 'Your role', roleHtml],
      ['Your note', note ? esc(note) : ''],
    ])}
    ${ev.blurb ? `<p style="margin:0 0 18px;font:15px/1.6 ${FONT};color:${INK_SOFT};">${esc(ev.blurb)}</p>` : ''}
    ${nextSteps('Someone from the committee will be in touch before the event to arrange the details: timings, where to meet and anything you need to bring.')}
    <p style="margin:18px 0 0;font:15px/1.6 ${FONT};color:${NAVY};">We've attached a calendar entry so you can save the date.</p>`;
  return {
    subject: `Thank you for volunteering at ${ev.title}`,
    html: layout({
      preheader: `You're helping at ${ev.title} on ${fmtDate(ev.starts_at)}. Here are the details.`,
      heading: `Thank you, ${firstName(name)}!`,
      intro: `You've signed up to help at <b>${esc(ev.title)}</b>. Every pair of hands makes more possible for Minster students, so thank you for giving your time.`,
      body,
      cta: { label: 'See all our events', href: `${SITE}/#/events` },
      footerNote: `Can't make it any more, or have a question? Just reply to this email or contact <a href="mailto:team@minstermore.org.uk" style="color:${NAVY};">team@minstermore.org.uk</a>.`,
    }),
    text: `Thank you, ${String(name).split(' ')[0]}!\n\nYou've signed up to help at ${ev.title}.\n\nDate: ${fmtDate(ev.starts_at)}\nTime: ${fmtTime(ev.starts_at)}${ev.location ? `\nWhere: ${ev.location}` : ''}\nYour role${roles.length > 1 ? 's' : ''}: ${roles.map(r => r.title + (r.description ? ` (${r.description})` : '')).join('; ')}\n\nWhat happens next: someone from the committee will be in touch before the event to arrange the details.\n\nCan't make it any more? Just reply to this email.\n\nThe Minster More committee\n${SITE}`,
    attachments: [{ filename: `${ev.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`, content: icsFor(ev, roles) }],
  };
}

// 2. Thank-you to someone who registered as a general volunteer
function volunteerRegistrationThanks({ name, help, upcoming = [] }) {
  const eventsHtml = upcoming.length ? `
    ${sectionTitle('Events that need helpers')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;">
      ${upcoming.slice(0, 4).map(e => `<tr><td style="padding:10px 0;border-bottom:1px solid ${LINE};font:15px/1.5 ${FONT};color:${NAVY};">
        <b>${esc(e.title)}</b><br><span style="color:${INK_SOFT};font-size:14px;">${esc(fmtDate(e.starts_at))}, ${esc(fmtTime(e.starts_at))}${e.location ? ` · ${esc(e.location)}` : ''}</span></td></tr>`).join('')}
    </table>
    <p style="margin:12px 0 0;font:15px/1.6 ${FONT};color:${NAVY};">If any of these suit you, you can pick a role and sign up on the website.</p>` : '';
  return {
    subject: 'Thank you for offering to volunteer',
    html: layout({
      preheader: 'Thanks for offering to help Minster More. Someone will be in touch soon.',
      heading: `Thank you, ${firstName(name)}!`,
      intro: `Thanks for offering to volunteer with Minster More. Whether it's an hour at an event or help behind the scenes, it all makes more possible for Minster students.`,
      body: `
        ${detailsPanel([['You can help with', esc(help || 'Not sure yet')]])}
        ${nextSteps('Someone from the committee will be in touch soon to talk about how you\'d like to help and arrange the details.')}
        ${eventsHtml}`,
      cta: upcoming.length ? { label: 'Pick an event to help at', href: `${SITE}/#/about` } : { label: 'Visit our website', href: SITE },
      footerNote: `Any questions in the meantime? Just reply to this email or contact <a href="mailto:team@minstermore.org.uk" style="color:${NAVY};">team@minstermore.org.uk</a>.`,
    }),
    text: `Thank you, ${String(name).split(' ')[0]}!\n\nThanks for offering to volunteer with Minster More. You said you can help with: ${help || 'not sure yet'}.\n\nWhat happens next: someone from the committee will be in touch soon to arrange the details.${upcoming.length ? `\n\nEvents that need helpers:\n${upcoming.slice(0, 4).map(e => `- ${e.title}, ${fmtDate(e.starts_at)}`).join('\n')}\nSign up at ${SITE}/#/about` : ''}\n\nThe Minster More committee\n${SITE}`,
  };
}

// 3. Committee notifications (to hello@)
function committeeNotice({ subject, heading, intro, rows, cta }) {
  return {
    subject,
    html: layout({ preheader: intro.replace(/<[^>]+>/g, ''), heading, intro, body: detailsPanel(rows), cta, footerNote: 'Reply to this email to contact them directly.', signoff: 'Sent automatically by the Minster More website.' }),
    text: `${heading}\n\n${intro.replace(/<[^>]+>/g, '')}\n\n${rows.filter(r => r && r[1]).map(([l, v]) => `${l}: ${String(v).replace(/<[^>]+>/g, '')}`).join('\n')}`,
  };
}

// ----------------------------------------------------- payments etc. --
const money = p => '£' + ((p || 0) / 100).toLocaleString('en-GB', { minimumFractionDigits: (p || 0) % 100 ? 2 : 0, maximumFractionDigits: 2 });
const MANAGE_URL = `${SITE}/manage-membership`;

function eventPanel(ev, extraRows = []) {
  return detailsPanel([
    ['Event', `<b>${esc(ev.title)}</b>`],
    ['Date', esc(fmtDate(ev.starts_at))],
    ['Time', esc(fmtTime(ev.starts_at))],
    ['Where', esc(ev.location || '')],
    ...extraRows,
  ]);
}
function icsEvent(ev, uidPrefix, summaryPrefix, description) {
  const d = t => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const txt = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const start = new Date(ev.starts_at), end = new Date(start.getTime() + 3 * 3600_000);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Minster More//Events//EN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${uidPrefix}-${ev.id}@minstermore.org.uk`, `DTSTAMP:${d(Date.now())}`, `DTSTART:${d(start)}`, `DTEND:${d(end)}`,
    `SUMMARY:${txt(summaryPrefix + ev.title)}`, ...(ev.location ? [`LOCATION:${txt(ev.location)}`] : []),
    `DESCRIPTION:${txt(description)}`, 'END:VEVENT', 'END:VCALENDAR'];
  return { filename: `${ev.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`, content: Buffer.from(lines.join('\r\n') + '\r\n').toString('base64') };
}

// One thank-you per payment, covering everything in the basket:
// donation, Future Makers, 50:50 numbers and event tickets.
function paymentThanks({ name, items, giftAid, wallName, events = {}, totalPence }) {
  const donation = items.filter(i => i.kind === 'donation').reduce((t, i) => t + i.unit_pence * i.qty, 0);
  const membership = items.find(i => i.kind === 'membership');
  const fifty = items.filter(i => i.kind === 'fifty');
  const tickets = items.filter(i => i.kind === 'ticket');
  const fiftyQty = fifty.reduce((n, i) => n + i.qty, 0);
  const term = fifty[0]?.term_label || 'this term';
  const parts = [], textParts = [], attachments = [];

  if (donation) {
    const boost = giftAid ? Math.round(donation * 0.25) : 0;
    parts.push(sectionTitle('Your donation') + detailsPanel([
      ['Amount', `<b>${money(donation)}</b>`],
      ['Gift Aid', giftAid ? `Yes, thank you. We'll claim an extra <b>${money(boost)}</b> from HMRC, at no cost to you.` : ''],
      ['Goes to', 'The resources, experiences and opportunities the Minster community votes for'],
    ]));
    textParts.push(`Donation: ${money(donation)}${giftAid ? ` (plus ${money(boost)} Gift Aid)` : ''}`);
  }
  if (membership) {
    parts.push(sectionTitle('Welcome to Future Makers') + detailsPanel([
      ['Membership', '<b>£10 a month</b>, starting today'],
      ['Over a year', '£120 of dependable funding for Minster students'],
      ['Supporters wall', wallName ? `${esc(wallName)} <span style="color:${INK_SOFT};">(we'll add you once approved)</span>` : ''],
      ['Gift Aid', giftAid ? 'Yes, on every monthly payment' : ''],
      ['Change or cancel', `Any time at <a href="${MANAGE_URL}" style="color:${NAVY};">minstermore.org.uk/manage-membership</a>`],
    ]) + `<p style="margin:0 0 18px;font:15px/1.6 ${FONT};color:${NAVY};">Regular giving lets us plan ahead and say yes to bigger ideas. You'll get a receipt each month, and we'll keep you posted on what your support helps fund.</p>`);
    textParts.push(`Future Makers: £10 a month, starting today. Manage or cancel any time: ${MANAGE_URL}`);
  }
  if (fiftyQty) {
    const pot = fiftyQty * 1000;
    parts.push(sectionTitle('Your 50:50 Club entry') + detailsPanel([
      ['Numbers', `<b>${fiftyQty}</b> ${fiftyQty === 1 ? 'number' : 'numbers'} for <b>${esc(term)}</b>`],
      ['How it works', 'Half of everything raised goes to student resources. The other half is the prize fund: 1st prize wins half of it, 2nd and 3rd a quarter each.'],
      ['The draw', 'At the end of term, witnessed by two committee members. Winners are emailed within 48 hours.'],
    ]) + `<p style="margin:0 0 18px;font:13.5px/1.6 ${FONT};color:${INK_SOFT};">Numbers are given out in order of entry and don't carry over between terms. Players must be 18 or over.</p>`);
    textParts.push(`50:50 Club: ${fiftyQty} number(s) for ${term}. Winners are emailed within 48 hours of the end-of-term draw.`);
  }
  for (const t of tickets) {
    const ev = events[t.ref_id];
    if (!ev) continue;
    parts.push(sectionTitle(t.qty === 1 ? 'Your ticket' : 'Your tickets') + eventPanel(ev, [['Tickets', `<b>${t.qty}</b> × ${money(t.unit_pence)}`]])
      + `<p style="margin:0 0 18px;font:15px/1.6 ${FONT};color:${NAVY};">Your name is on the list, so just give it on the door. No need to print anything.</p>`);
    attachments.push(icsEvent(ev, 'ticket', '', `${t.qty} ticket(s). Questions: events@minstermore.org.uk`));
    textParts.push(`${ev.title}: ${t.qty} ticket(s), ${fmtDate(ev.starts_at)} ${fmtTime(ev.starts_at)}${ev.location ? `, ${ev.location}` : ''}. Give your name on the door.`);
  }

  const kinds = [donation && 'donation', membership && 'membership', fiftyQty && 'fifty', tickets.length && 'tickets'].filter(Boolean);
  const subject = kinds.length > 1 ? 'Thank you for supporting Minster More'
    : membership ? 'Welcome to Future Makers'
    : donation ? 'Thank you for your donation'
    : fiftyQty ? `You're in the 50:50 Club for ${term}`
    : tickets.length === 1 && events[tickets[0].ref_id] ? `Your tickets for ${events[tickets[0].ref_id].title}` : 'Your tickets';
  const intro = membership ? "Thank you for becoming a Future Maker. Your monthly support makes more possible for every Minster student."
    : donation ? 'Thank you for your donation. Every pound goes to what Minster students need, chosen by the school community.'
    : fiftyQty && !tickets.length ? "Thanks for joining the 50:50 Club. Good luck in the draw, and thank you for helping fund student resources."
    : 'Thank you for your order. Here are your details.';
  if (attachments.length) parts.push(`<p style="margin:0 0 6px;font:15px/1.6 ${FONT};color:${NAVY};">We've attached ${attachments.length === 1 ? 'a calendar entry' : 'calendar entries'} so you can save the date.</p>`);
  if (kinds.length > 1 && totalPence) parts.push(`<p style="margin:12px 0 0;font:15px/1.6 ${FONT};color:${NAVY};">Total paid today: <b>${money(totalPence)}</b></p>`);

  return {
    subject,
    html: layout({
      preheader: intro,
      heading: `Thank you, ${firstName(name)}!`,
      intro,
      body: parts.join(''),
      cta: membership ? { label: 'See where the money goes', href: `${SITE}/#/money` } : tickets.length ? { label: 'See all our events', href: `${SITE}/#/events` } : { label: 'See where the money goes', href: `${SITE}/#/money` },
      footerNote: `Your payment receipt comes separately from our payment provider, Stripe. Any questions? Just reply to this email or contact <a href="mailto:finance@minstermore.org.uk" style="color:${NAVY};">finance@minstermore.org.uk</a>.`,
    }),
    text: `Thank you, ${String(name || 'there').split(' ')[0]}!\n\n${intro}\n\n${textParts.join('\n\n')}\n\nAny questions? Reply to this email or contact finance@minstermore.org.uk.\n\nThe Minster More committee\n${SITE}`,
    attachments: attachments.length ? attachments : undefined,
  };
}

// Free event reservation
function reservationConfirm({ name, ev, qty }) {
  return {
    subject: `You're booked in: ${ev.title}`,
    html: layout({
      preheader: `${qty} ${qty === 1 ? 'place' : 'places'} reserved for ${ev.title}, ${fmtDate(ev.starts_at)}.`,
      heading: `You're booked in, ${firstName(name)}!`,
      intro: `Thanks for reserving your ${qty === 1 ? 'place' : 'places'} at <b>${esc(ev.title)}</b>. We're looking forward to seeing you.`,
      body: eventPanel(ev, [['Places', `<b>${qty}</b>`]])
        + (ev.blurb ? `<p style="margin:0 0 18px;font:15px/1.6 ${FONT};color:${INK_SOFT};">${esc(ev.blurb)}</p>` : '')
        + `<p style="margin:0 0 6px;font:15px/1.6 ${FONT};color:${NAVY};">Your name is on the list, so just give it when you arrive. We've attached a calendar entry so you can save the date.</p>`,
      cta: { label: 'See all our events', href: `${SITE}/#/events` },
      footerNote: `Can't make it any more? Please reply to let us know so we can offer your place to someone else, or contact <a href="mailto:events@minstermore.org.uk" style="color:${NAVY};">events@minstermore.org.uk</a>.`,
    }),
    text: `You're booked in!\n\n${ev.title}\n${fmtDate(ev.starts_at)}, ${fmtTime(ev.starts_at)}${ev.location ? `\n${ev.location}` : ''}\nPlaces: ${qty}\n\nCan't make it? Reply to let us know.\n\nThe Minster More committee\n${SITE}`,
    attachments: [icsEvent(ev, 'reservation', '', `${qty} place(s) reserved. Questions: events@minstermore.org.uk`)],
  };
}

module.exports = { paymentThanks, reservationConfirm, layout, detailsPanel, sectionTitle, nextSteps, eventSignupThanks, volunteerRegistrationThanks, committeeNotice, esc, fmtDate, fmtTime, SITE };
