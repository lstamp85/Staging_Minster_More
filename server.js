// Minster More — web server
// Serves the public site and admin area, and handles the small number of
// things that must happen server-side: Stripe checkout, the Stripe webhook,
// and public form submissions (suggestions, votes, volunteers, reservations).

const path = require('path');
const express = require('express');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const {
  PORT = 3000,
  SITE_URL,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
} = process.env;

const db = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;
const STRIPE_KEY = (STRIPE_SECRET_KEY || '').trim().replace(/^["']|["']$/g, '');
const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY) : null;
if (STRIPE_KEY && !/^(sk|rk)_(live|test)_/.test(STRIPE_KEY)) {
  console.warn('⚠ STRIPE_SECRET_KEY does not look like a secret key (should start sk_live_ or sk_test_).');
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
const MAX_DONATION = 1_000_000; // £10,000 in pence
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EASYFUNDRAISING_URL = 'https://www.easyfundraising.org.uk/causes/msptasouthwell/';

// The 50:50 Club is open by default for the current school term.
// Admins can name the term themselves, or type CLOSED to stop entries.
function currentTerm(label) {
  if (label && label.trim().toUpperCase() === 'CLOSED') return null;
  if (label && label.trim()) return label.trim();
  const now = new Date();
  const m = now.getMonth() + 1, y = now.getFullYear();
  return m >= 9 ? `Autumn term ${y}` : m <= 3 ? `Spring term ${y}` : `Summer term ${y}`;
}

function str(v, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
function int(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}
function needDb(res) {
  if (!db) { res.status(503).json({ error: 'The site is not connected to its database yet.' }); return true; }
  return false;
}
function origin(req) {
  return (SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

// Very small in-memory rate limiter for public form posts
const hits = new Map();
function rateLimit(limit = 20, windowMs = 60_000) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const list = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (list.length >= limit) return res.status(429).json({ error: 'Too many requests — try again in a minute.' });
    list.push(now);
    hits.set(key, list);
    next();
  };
}
setInterval(() => hits.clear(), 10 * 60_000).unref();

// Short cache for the public data feed
let siteCache = null;
let siteCacheAt = 0;
function bustCache() { siteCache = null; }

async function ticketsTaken(eventId) {
  const [{ data: items }, { data: res }] = await Promise.all([
    db.from('order_items').select('qty, orders!inner(status)').eq('kind', 'ticket').eq('ref_id', eventId).eq('orders.status', 'paid'),
    db.from('reservations').select('qty').eq('event_id', eventId),
  ]);
  return (items || []).reduce((s, r) => s + r.qty, 0) + (res || []).reduce((s, r) => s + r.qty, 0);
}

// ---------------------------------------------------------------------
// Stripe webhook (needs the raw body, so it's registered before JSON parsing)
// ---------------------------------------------------------------------
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET || !db) return res.status(503).end();
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send('Bad signature');
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await handlePaidSession(event.data.object);
        break;
      case 'checkout.session.expired': {
        const s = event.data.object;
        if (s.client_reference_id) {
          await db.from('orders').update({ status: 'expired' }).eq('id', s.client_reference_id).eq('status', 'pending');
        }
        break;
      }
      case 'invoice.paid':
        await handleRenewal(event.data.object);
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook handling failed:', err);
    res.status(500).end(); // Stripe will retry
  }
});

async function handlePaidSession(s) {
  if (!['paid', 'no_payment_required'].includes(s.payment_status)) return;
  const orderId = s.client_reference_id;
  if (!orderId) return;
  const { data: order } = await db.from('orders').select('*').eq('id', orderId).single();
  if (!order || order.status === 'paid') return;

  const email = s.customer_details?.email || null;
  const name = s.customer_details?.name || null;
  const customer = typeof s.customer === 'string' ? s.customer : s.customer?.id || null;
  const subscription = typeof s.subscription === 'string' ? s.subscription : s.subscription?.id || null;

  await db.from('orders').update({
    status: 'paid', paid_at: new Date().toISOString(), stripe_session: s.id,
    email, name, stripe_customer: customer, stripe_subscription: subscription,
  }).eq('id', orderId);

  const items = order.items || [];
  const donation = items.filter(i => i.kind === 'donation').reduce((t, i) => t + i.unit_pence * i.qty, 0);
  const membership = items.find(i => i.kind === 'membership');

  // Gift Aid declaration
  let giftAidId = null;
  if (order.gift_aid && (donation > 0 || membership)) {
    const { data: ga } = await db.from('gift_aid_declarations').insert({
      full_name: order.gift_aid.full_name, house: order.gift_aid.house,
      postcode: order.gift_aid.postcode, email, stripe_customer: customer,
    }).select('id').single();
    giftAidId = ga?.id || null;
  }

  // Line items (tickets, 50:50 numbers etc.)
  if (items.length) {
    await db.from('order_items').insert(items.map(i => ({
      order_id: orderId, kind: i.kind, ref_id: i.ref_id || null, label: i.label,
      qty: i.qty, unit_pence: i.unit_pence, term_label: i.term_label || null,
    })));
  }

  // Donations and memberships go straight onto the totaliser
  const funds = [];
  if (donation > 0) funds.push({ amount_pence: donation, label: 'Online donation', source: 'online', gift_aid_id: giftAidId, stripe_ref: `${s.id}:donation` });
  if (membership) funds.push({ amount_pence: membership.unit_pence, label: 'Future Makers — first month', source: 'online', gift_aid_id: giftAidId, stripe_ref: `${s.id}:membership` });
  if (funds.length) await db.from('funds').upsert(funds, { onConflict: 'stripe_ref', ignoreDuplicates: true });

  if (membership && order.wall_name) {
    await db.from('supporters').insert({ name: order.wall_name, kind: 'future_maker', approved: false });
  }
  if (membership && subscription) {
    // Remember the Gift Aid declaration so monthly renewals can be claimed too
    try {
      await stripe.subscriptions.update(subscription, { metadata: { order_id: orderId, gift_aid_id: giftAidId || '' } });
    } catch (err) {
      console.error('Could not tag subscription', subscription, err.message);
    }
  }
  bustCache();
}

async function handleRenewal(inv) {
  if (inv.billing_reason !== 'subscription_cycle' || !inv.amount_paid) return;
  const meta = inv.subscription_details?.metadata || inv.parent?.subscription_details?.metadata || {};
  await db.from('funds').upsert({
    amount_pence: inv.amount_paid,
    label: 'Future Makers — monthly',
    source: 'online',
    gift_aid_id: meta.gift_aid_id || null,
    stripe_ref: inv.id,
  }, { onConflict: 'stripe_ref', ignoreDuplicates: true });
  bustCache();
}

// ---------------------------------------------------------------------
// Everything else uses JSON
// ---------------------------------------------------------------------
app.use(express.json({ limit: '50kb' }));

// Public config for the admin page (the anon key is safe to expose)
app.get('/config.js', (req, res) => {
  res.type('application/javascript').set('Cache-Control', 'no-store').send(
    `window.MM_CONFIG = ${JSON.stringify({ supabaseUrl: SUPABASE_URL || '', supabaseAnonKey: SUPABASE_ANON_KEY || '' })};`
  );
});

// All public content in one request
app.get('/api/site', async (req, res) => {
  if (needDb(res)) return;
  if (siteCache && Date.now() - siteCacheAt < 15_000) return res.json(siteCache);
  try {
    const since = new Date(Date.now() - 12 * 3600_000).toISOString();
    const [settings, funds, pots, ideas, votes, events, news, committee, documents, supporters] = await Promise.all([
      db.from('settings').select('year_label,target_pence,easyfundraising_url,coop_url,fifty_term_label').eq('id', 1).single(),
      db.from('funds').select('amount_pence'),
      db.from('pots').select('id,title,blurb,goal_pence,raised_pence,status,sort').order('sort').order('created_at'),
      db.from('ideas').select('id,title,blurb,cost_pence,who,created_at').eq('status', 'approved'),
      db.from('votes').select('idea_id'),
      db.from('events').select('id,title,blurb,starts_at,location,price_pence,capacity').eq('published', true).gte('starts_at', since).order('starts_at'),
      db.from('news').select('id,title,body,published_on').order('published_on', { ascending: false }).limit(6),
      db.from('committee').select('id,name,role,photo_url,sort').order('sort'),
      db.from('documents').select('id,title,category,doc_date,file_url').order('doc_date', { ascending: false, nullsFirst: false }),
      db.from('supporters').select('id,name,kind,tier,note,url').eq('approved', true).order('created_at'),
    ]);
    const firstError = [settings, funds, pots, ideas, votes, events, news, committee, documents, supporters].find(r => r.error);
    if (firstError) throw firstError.error;

    const voteMap = {};
    for (const v of votes.data) voteMap[v.idea_id] = (voteMap[v.idea_id] || 0) + 1;

    const evs = await Promise.all(events.data.map(async e => ({
      ...e,
      remaining: e.capacity ? Math.max(0, e.capacity - await ticketsTaken(e.id)) : null,
    })));

    siteCache = {
      settings: {
        ...settings.data,
        easyfundraising_url: settings.data.easyfundraising_url || EASYFUNDRAISING_URL,
        fifty_term_label: currentTerm(settings.data.fifty_term_label),
      },
      raised_pence: funds.data.reduce((s, f) => s + f.amount_pence, 0),
      pots: pots.data,
      ideas: ideas.data.map(i => ({ ...i, votes: voteMap[i.id] || 0 })).sort((a, b) => b.votes - a.votes),
      events: evs,
      news: news.data,
      committee: committee.data,
      documents: documents.data,
      supporters: supporters.data,
      payments: Boolean(stripe),
    };
    siteCacheAt = Date.now();
    res.set('Cache-Control', 'no-store').json(siteCache);
  } catch (err) {
    console.error('/api/site failed:', err);
    res.status(500).json({ error: 'Could not load the site content.' });
  }
});

app.post('/api/vote', rateLimit(30), async (req, res) => {
  if (needDb(res)) return;
  const ideaId = str(req.body.idea_id, 64);
  const voter = str(req.body.voter, 64);
  if (!ideaId || voter.length < 16) return res.status(400).json({ error: 'Invalid vote.' });
  const { data: idea } = await db.from('ideas').select('id').eq('id', ideaId).eq('status', 'approved').maybeSingle();
  if (!idea) return res.status(404).json({ error: 'That suggestion is no longer open.' });
  const { error } = await db.from('votes').insert({ idea_id: ideaId, voter });
  if (error && error.code === '23505') return res.status(409).json({ error: 'You have already voted for that one.' });
  if (error) return res.status(500).json({ error: 'Could not save your vote.' });
  bustCache();
  res.json({ ok: true });
});

app.post('/api/suggest', rateLimit(5), async (req, res) => {
  if (needDb(res)) return;
  const title = str(req.body.title, 120);
  const blurb = str(req.body.blurb, 600);
  const who = ['Student', 'Parent / carer', 'Staff'].includes(req.body.who) ? req.body.who : 'Parent / carer';
  const costPounds = int(req.body.cost);
  if (!title) return res.status(400).json({ error: 'Give it a title first.' });
  const { error } = await db.from('ideas').insert({
    title, blurb: blurb || null, who, status: 'pending',
    cost_pence: Number.isFinite(costPounds) && costPounds > 0 ? Math.min(costPounds, 1_000_000) * 100 : null,
  });
  if (error) return res.status(500).json({ error: 'Could not save your idea.' });
  res.json({ ok: true });
});

app.post('/api/volunteer', rateLimit(5), async (req, res) => {
  if (needDb(res)) return;
  const name = str(req.body.name, 120);
  const email = str(req.body.email, 200);
  const help = str(req.body.help, 120);
  if (!name || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Add your name and a valid email.' });
  const { error } = await db.from('volunteers').insert({ name, email, help });
  if (error) return res.status(500).json({ error: 'Could not send that — please email team@minstermore.org.uk.' });
  res.json({ ok: true });
});

app.post('/api/reserve', rateLimit(10), async (req, res) => {
  if (needDb(res)) return;
  const eventId = str(req.body.event_id, 64);
  const name = str(req.body.name, 120);
  const email = str(req.body.email, 200);
  const qty = int(req.body.qty);
  if (!name || !EMAIL_RE.test(email) || !(qty >= 1 && qty <= 20)) return res.status(400).json({ error: 'Add your name, email and number of places.' });
  const { data: ev } = await db.from('events').select('*').eq('id', eventId).eq('published', true).maybeSingle();
  if (!ev || ev.price_pence > 0) return res.status(404).json({ error: 'That event can’t be reserved.' });
  if (new Date(ev.starts_at) < new Date()) return res.status(400).json({ error: 'That event has already started.' });
  if (ev.capacity && (await ticketsTaken(ev.id)) + qty > ev.capacity) return res.status(409).json({ error: 'Sorry, there aren’t enough places left.' });
  const { error } = await db.from('reservations').insert({ event_id: ev.id, name, email, qty });
  if (error) return res.status(500).json({ error: 'Could not save your reservation.' });
  bustCache();
  res.json({ ok: true });
});

// Create a Stripe Checkout session from the basket. Prices always come from
// the database, never from the browser.
app.post('/api/checkout', rateLimit(10), async (req, res) => {
  if (needDb(res)) return;
  if (!stripe) return res.status(503).json({ error: 'Online payments aren’t switched on yet.' });

  const input = Array.isArray(req.body.items) ? req.body.items.slice(0, 20) : [];
  if (!input.length) return res.status(400).json({ error: 'Your basket is empty.' });

  const { data: settings } = await db.from('settings').select('*').eq('id', 1).single();
  const items = [];
  const lineItems = [];
  let hasMembership = false;

  try {
    for (const it of input) {
      if (it.kind === 'donation') {
        const amount = int(it.amount_pence);
        if (!(amount >= 100 && amount <= MAX_DONATION)) throw new Error('Donations can be between £1 and £10,000.');
        items.push({ kind: 'donation', label: 'Donation', qty: 1, unit_pence: amount });
        lineItems.push({ quantity: 1, price_data: { currency: 'gbp', unit_amount: amount, product_data: { name: 'Donation to Minster More' } } });
      } else if (it.kind === 'ticket') {
        const qty = int(it.qty);
        if (!(qty >= 1 && qty <= 10)) throw new Error('Up to 10 tickets per event.');
        const { data: ev } = await db.from('events').select('*').eq('id', str(it.event_id, 64)).eq('published', true).maybeSingle();
        if (!ev || ev.price_pence <= 0) throw new Error('One of those events is no longer on sale.');
        if (new Date(ev.starts_at) < new Date()) throw new Error(`${ev.title} has already started.`);
        if (ev.capacity && (await ticketsTaken(ev.id)) + qty > ev.capacity) throw new Error(`Not enough tickets left for ${ev.title}.`);
        const when = new Date(ev.starts_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Europe/London' });
        items.push({ kind: 'ticket', ref_id: ev.id, label: ev.title, qty, unit_pence: ev.price_pence });
        lineItems.push({ quantity: qty, price_data: { currency: 'gbp', unit_amount: ev.price_pence, product_data: { name: `${ev.title} — ticket`, description: when + (ev.location ? `, ${ev.location}` : '') } } });
      } else if (it.kind === 'membership') {
        if (hasMembership) continue;
        hasMembership = true;
        items.push({ kind: 'membership', label: 'Future Makers membership', qty: 1, unit_pence: 1000 });
        lineItems.push({ quantity: 1, price_data: { currency: 'gbp', unit_amount: 1000, recurring: { interval: 'month' }, product_data: { name: 'Future Makers — £10 a month' } } });
      } else if (it.kind === 'fifty') {
        const qty = int(it.qty);
        const term = currentTerm(settings?.fifty_term_label);
        if (!term) throw new Error('The 50:50 Club isn’t open for entries right now.');
        if (it.over18 !== true) throw new Error('You must be 18 or over to join the 50:50 Club.');
        if (!(qty >= 1 && qty <= 20)) throw new Error('Up to 20 numbers each.');
        items.push({ kind: 'fifty', label: '50:50 Club number', qty, unit_pence: 1000, term_label: term });
        lineItems.push({ quantity: qty, price_data: { currency: 'gbp', unit_amount: 1000, product_data: { name: `50:50 Club number — ${term}` } } });
      }
    }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (!items.length) return res.status(400).json({ error: 'Your basket is empty.' });

  // Optional Gift Aid declaration (applies to donations and Future Makers only)
  let giftAid = null;
  const ga = req.body.gift_aid;
  if (ga && items.some(i => i.kind === 'donation' || i.kind === 'membership')) {
    const full_name = str(ga.full_name, 120);
    const house = str(ga.house, 120);
    const postcode = str(ga.postcode, 12).toUpperCase();
    if (!full_name || !house || !postcode) return res.status(400).json({ error: 'Gift Aid needs your full name, house name or number, and postcode.' });
    giftAid = { full_name, house, postcode };
  }
  const wallName = hasMembership ? str(req.body.wall_name, 80) || null : null;

  const total = items.reduce((t, i) => t + i.unit_pence * i.qty, 0);
  const { data: order, error } = await db.from('orders')
    .insert({ items, gift_aid: giftAid, wall_name: wallName, total_pence: total })
    .select('id').single();
  if (error) return res.status(500).json({ error: 'Could not start checkout.' });

  const onlyDonation = items.every(i => i.kind === 'donation');
  const base = origin(req);
  try {
    const session = await stripe.checkout.sessions.create({
      mode: hasMembership ? 'subscription' : 'payment',
      payment_method_types: ['card'], // includes Apple Pay and Google Pay
      line_items: lineItems,
      client_reference_id: order.id,
      metadata: { order_id: order.id },
      success_url: `${base}/?paid=1#/thanks`,
      cancel_url: `${base}/#/${onlyDonation ? 'give' : 'basket'}`,
      ...(hasMembership ? {} : { submit_type: onlyDonation ? 'donate' : 'pay' }),
    });
    await db.from('orders').update({ stripe_session: session.id }).eq('id', order.id);
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout failed:', err.type, err.code, err.message);
    let msg = 'Could not reach the payment provider — please try again.';
    if (err.type === 'StripeAuthenticationError') msg = 'Payments are not set up correctly (the Stripe secret key was rejected). Please let finance@minstermore.org.uk know.';
    else if (err.type === 'StripePermissionError') msg = 'Payments are not set up correctly (the Stripe key does not have permission). Please let finance@minstermore.org.uk know.';
    else if (err.type === 'StripeInvalidRequestError') msg = `Stripe could not start checkout: ${err.message}`;
    res.status(502).json({ error: msg });
  }
});

// ---------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------
app.use('/vendor/supabase', express.static(path.dirname(require.resolve('@supabase/supabase-js/dist/umd/supabase.js')), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '5m' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`Minster More running on port ${PORT}`);
  if (!db) console.warn('⚠ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — content will not load.');
  if (!stripe) console.warn('⚠ STRIPE_SECRET_KEY not set — payments are switched off.');
});
