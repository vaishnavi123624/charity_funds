(() => {
'use strict';

/* ---------- helpers ---------- */
const KEY = 'cfms.v1', SESS = 'cfms.session';
/* storage that never throws (falls back to memory if the browser blocks localStorage) */
const mem = {};
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return mem[k] ?? null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { mem[k] = String(v); } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { delete mem[k]; } }
};
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inr = n => '₹' + Number(n || 0).toLocaleString('en-IN');
const today = () => new Date().toISOString().slice(0, 10);
const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);
const pad = (n, l) => String(n).padStart(l, '0');

/* ---------- data layer (localStorage) ---------- */
let db;
const emptyDb = () => ({ seq: {}, users: [], donors: [], campaigns: [], donations: [], beneficiaries: [], allocations: [], expenses: [], receipts: [] });
const nid = t => (db.seq[t] = (db.seq[t] || 0) + 1);
const save = () => store.set(KEY, JSON.stringify(db));

function addUser(name, email, password, role) {
  const u = { user_id: nid('user'), name, email: email.toLowerCase(), password, role };
  db.users.push(u); return u;
}
function addDonor(name, email, password, phone, address) {
  const u = addUser(name, email, password, 'donor');
  const d = { donor_id: nid('donor'), user_id: u.user_id, phone, address };
  db.donors.push(d); return d;
}
function addCampaign(name, description, target, status = 'Active') {
  const c = { campaign_id: nid('campaign'), campaign_name: name, description, target_amount: +target, status };
  db.campaigns.push(c); return c;
}
function addDonation(donorId, campaignId, amount, method, date = today()) {
  const d = { donation_id: nid('donation'), txn: 'TXN' + Date.now().toString(36).toUpperCase() + pad(nid('txn'), 4), donor_id: donorId, campaign_id: campaignId, amount: +amount, method, date };
  db.donations.push(d);
  db.receipts.push({ receipt_id: nid('receipt'), donation_id: d.donation_id, receipt_number: 'RCP-' + new Date(date).getFullYear() + '-' + pad(d.donation_id, 4) });
  return d;
}
function addBeneficiary(userId, name, contact, need, requested) {
  const b = { beneficiary_id: nid('beneficiary'), user_id: userId, name, contact_details: contact, need, requested: +requested, status: 'Pending', date: today() };
  db.beneficiaries.push(b); return b;
}

function seed() {
  db = emptyDb();
  addUser('Asha Verma', 'admin@charity.org', 'admin123', 'admin');
  addUser('Kiran Reddy', 'finance@charity.org', 'finance123', 'finance');
  const d1 = addDonor('Ananya Rao', 'donor@charity.org', 'donor123', '9876543210', 'Guntur, Andhra Pradesh');
  const d2 = addDonor('Ravi Teja', 'ravi@example.com', 'donor123', '9123456780', 'Vijayawada, Andhra Pradesh');
  const d3 = addDonor('Sita Devi', 'sita@example.com', 'donor123', '9000011111', 'Tenali, Andhra Pradesh');
  const c1 = addCampaign('Education for Every Child', 'School fees, books and uniforms for children from low-income families.', 100000);
  const c2 = addCampaign('Clean Water for Villages', 'Borewells and water filters for villages without safe drinking water.', 80000);
  const c3 = addCampaign('Emergency Medical Aid', 'Surgery and treatment costs for patients who cannot afford care.', 60000);
  addDonation(d1.donor_id, c1.campaign_id, 10000, 'UPI', '2026-09-04');
  addDonation(d2.donor_id, c1.campaign_id, 15000, 'Net banking', '2026-09-18');
  addDonation(d3.donor_id, c2.campaign_id, 12000, 'UPI', '2026-10-02');
  addDonation(d1.donor_id, c2.campaign_id, 5000, 'Card', '2026-10-21');
  addDonation(d2.donor_id, c3.campaign_id, 8000, 'UPI', '2026-11-03');
  const bu = addUser('Lakshmi Prasad', 'beneficiary@charity.org', 'help123', 'beneficiary');
  const b1 = addBeneficiary(bu.user_id, 'Lakshmi Prasad', '9988776655', 'School fees for two children', 12000);
  b1.status = 'Approved';
  db.allocations.push({ allocation_id: nid('allocation'), campaign_id: c1.campaign_id, beneficiary_id: b1.beneficiary_id, amount: 12000, date: '2026-10-10', note: 'Annual school fees' });
  db.expenses.push({ expense_id: nid('expense'), campaign_id: c2.campaign_id, amount: 6000, date: '2026-10-28', description: 'Water filter units' });
  save();
}
(function load() {
  try { const r = store.get(KEY); if (r) { db = JSON.parse(r); return; } } catch (e) {}
  seed();
})();

/* ---------- calculations (Available = Donations − Allocations − Expenses) ---------- */
const totals = () => {
  const d = sum(db.donations, x => x.amount), a = sum(db.allocations, x => x.amount), e = sum(db.expenses, x => x.amount);
  return { d, a, e, bal: d - a - e };
};
const cStats = id => {
  const d = sum(db.donations.filter(x => x.campaign_id === id), x => x.amount);
  const a = sum(db.allocations.filter(x => x.campaign_id === id), x => x.amount);
  const e = sum(db.expenses.filter(x => x.campaign_id === id), x => x.amount);
  return { d, a, e, bal: d - a - e };
};
const camp = id => db.campaigns.find(c => c.campaign_id === +id);
const donorById = id => db.donors.find(d => d.donor_id === +id);
const userById = id => db.users.find(u => u.user_id === +id);
const donorName = id => { const d = donorById(id); return d ? userById(d.user_id).name : '—'; };
const benById = id => db.beneficiaries.find(b => b.beneficiary_id === +id);
const me = () => { const id = +store.get(SESS); return db.users.find(u => u.user_id === id) || null; };
const myDonor = () => { const u = me(); return u && db.donors.find(d => d.user_id === u.user_id); };
const myBen = () => { const u = me(); return u && db.beneficiaries.find(b => b.user_id === u.user_id); };

/* ---------- UI helpers ---------- */
let toastTimer;
function toast(msg, isErr) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = '', 3200);
}
const go = h => { location.hash = h; };
const tag = (txt, kind = '') => `<span class="tag ${kind}">${esc(txt)}</span>`;
const statusTag = s => tag(s, { Approved: '', Active: '', Pending: 'warn', Rejected: 'bad', Closed: 'off' }[s] || '');
function table(heads, rows, numCols = []) {
  if (!rows.length) return '<div class="tw"><p class="empty">Nothing here yet.</p></div>';
  return `<div class="tw"><table><thead><tr>${heads.map((h, i) => `<th class="${numCols.includes(i) ? 'n' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${
    rows.map(r => `<tr${r.attr ? ' ' + r.attr : ''}>${r.cells.map((c, i) => `<td class="${numCols.includes(i) ? 'n' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
const row = (cells, attr) => ({ cells, attr });
const progress = (v, max) => `<div class="prog" role="progressbar" aria-valuenow="${Math.round(Math.min(100, v / max * 100))}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.min(100, v / max * 100)}%"></i></div>`;
const campOptions = (onlyActive = true) => db.campaigns.filter(c => !onlyActive || c.status === 'Active').map(c => `<option value="${c.campaign_id}">${esc(c.campaign_name)}</option>`).join('');

function ledger(t) {
  const base = t.d || 1;
  return `<div class="ledger">
    <h2>Total raised</h2>
    <div class="big">${inr(t.d)}</div>
    <div class="bar" role="img" aria-label="Share of donations still available, allocated and spent">
      <i class="seg-rem" style="width:${t.bal / base * 100}%"></i><i class="seg-alloc" style="width:${t.a / base * 100}%"></i><i class="seg-exp" style="width:${t.e / base * 100}%"></i>
    </div>
    <ul class="legend">
      <li><span class="dot seg-rem"></span>Still available<b>${inr(t.bal)}</b></li>
      <li><span class="dot seg-alloc"></span>Given to beneficiaries<b>${inr(t.a)}</b></li>
      <li><span class="dot seg-exp"></span>Spent on expenses<b>${inr(t.e)}</b></li>
    </ul>
    <p class="formula">Available balance = Total donations − (Allocations + Expenses)</p>
  </div>`;
}

function csv(name, heads, rows) {
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  const blob = new Blob([[heads, ...rows].map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}

/* ---------- views ---------- */
function home() {
  const t = totals(), u = me();
  const cards = db.campaigns.filter(c => c.status === 'Active').map(campCard).join('');
  return `
  <section class="hero">
    <div>
      <h1>See where every rupee goes.</h1>
      <p class="lead">Give to a campaign, get a receipt straight away, and watch your donation move from the collection to the people it helps.</p>
      <div class="row">
        ${u ? `<a class="btn gold" href="#/dashboard">Open my dashboard</a>` : `<a class="btn gold" href="#/register">Create a donor account</a><a class="btn ghost" href="#/login">Log in</a>`}
      </div>
    </div>
    ${ledger(t)}
  </section>

  <section class="sec">
    <div class="sec-head"><h2>Campaigns you can support</h2><p>${db.campaigns.filter(c => c.status === 'Active').length} active</p></div>
    <div class="grid">${cards || '<p class="empty">No active campaigns right now.</p>'}</div>
  </section>

  <section class="sec">
    <h2>How a donation travels</h2>
    <ol class="steps">
      <li><b>Donor gives</b><span>Pick a campaign and enter an amount.</span></li>
      <li><b>Receipt issued</b><span>Every donation gets a unique receipt number.</span></li>
      <li><b>Funds allocated</b><span>Finance staff assign money to approved beneficiaries.</span></li>
      <li><b>Expenses recorded</b><span>Spending is logged against the campaign.</span></li>
      <li><b>Reports published</b><span>The balance is recalculated and visible to all.</span></li>
    </ol>
  </section>`;
}
function campCard(c) {
  const s = cStats(c.campaign_id), u = me();
  const act = !u || u.role === 'donor'
    ? `<a class="btn sm gold" href="#/${u ? 'donate/' + c.campaign_id : 'login'}">Donate</a>` : '';
  return `<article class="card camp">
    <div class="row" style="justify-content:space-between"><h3>${esc(c.campaign_name)}</h3>${statusTag(c.status)}</div>
    <p>${esc(c.description)}</p>
    <div class="meta"><span><b>${inr(s.d)}</b> raised</span><span>Goal ${inr(c.target_amount)}</span></div>
    ${progress(s.d, c.target_amount)}
    <div class="row" style="margin-top:14px">${act}</div>
  </article>`;
}

function login() {
  return `<div class="narrow"><h2>Log in</h2>
  <form class="card" data-form="login">
    <label>Email<input name="email" type="email" required autocomplete="username"></label>
    <label>Password<input name="password" type="password" required autocomplete="current-password"></label>
    <button class="btn" type="submit">Log in</button>
    <p style="margin:0">New here? <a href="#/register">Create an account</a></p>
  </form>
  <div class="demo"><b>Demo accounts</b><br>
    Admin: <code>admin@charity.org</code> / <code>admin123</code><br>
    Finance: <code>finance@charity.org</code> / <code>finance123</code><br>
    Donor: <code>donor@charity.org</code> / <code>donor123</code><br>
    Beneficiary: <code>beneficiary@charity.org</code> / <code>help123</code></div></div>`;
}
function register() {
  return `<div class="narrow"><h2>Create an account</h2>
  <form class="card" data-form="register">
    <label>I am a<select name="role"><option value="donor">Donor</option><option value="beneficiary">Beneficiary seeking help</option></select></label>
    <label>Full name<input name="name" required minlength="2"></label>
    <label>Email<input name="email" type="email" required></label>
    <label>Password<input name="password" type="password" required minlength="6"><span class="hint">At least 6 characters</span></label>
    <label>Phone<input name="phone" inputmode="tel" pattern="[0-9+ ]{10,14}" required title="10 to 14 digits"></label>
    <label>Address<input name="address" required></label>
    <button class="btn" type="submit">Create account</button>
  </form></div>`;
}

function dashboard() {
  const u = me();
  if (u.role === 'donor') {
    const d = myDonor(), mine = db.donations.filter(x => x.donor_id === d.donor_id);
    return `<h2>Welcome, ${esc(u.name)}</h2>
    <div class="strip" style="grid-template-columns:repeat(2,1fr)"><div><small>You have given</small><b>${inr(sum(mine, x => x.amount))}</b></div><div><small>Donations made</small><b>${mine.length}</b></div></div>
    <div class="sec"><div class="sec-head"><h2>Active campaigns</h2></div><div class="grid">${db.campaigns.filter(c => c.status === 'Active').map(campCard).join('')}</div></div>`;
  }
  if (u.role === 'beneficiary') return benView();
  const t = totals();
  const rows = db.campaigns.map(c => { const s = cStats(c.campaign_id); return row([esc(c.campaign_name), inr(c.target_amount), inr(s.d), inr(s.a + s.e), inr(s.bal)]); });
  const recent = [...db.donations].reverse().slice(0, 5).map(x => row([x.date, esc(donorName(x.donor_id)), esc(camp(x.campaign_id)?.campaign_name), inr(x.amount)]));
  return `<h2>Dashboard</h2>
  <div class="strip"><div><small>Total donations</small><b>${inr(t.d)}</b></div><div><small>Allocated to beneficiaries</small><b>${inr(t.a)}</b></div><div><small>Expenses</small><b>${inr(t.e)}</b></div><div><small>Available balance</small><b>${inr(t.bal)}</b></div></div>
  <div class="sec"><h3>Campaign funds</h3>${table(['Campaign', 'Goal', 'Collected', 'Used', 'Available'], rows, [1, 2, 3, 4])}</div>
  <div class="sec"><h3>Latest donations</h3>${table(['Date', 'Donor', 'Campaign', 'Amount'], recent, [3])}</div>`;
}

function campaigns() {
  const u = me(), admin = u.role === 'admin';
  const form = admin ? `<form class="card" data-form="campaign" style="margin-bottom:24px"><h3>Create a campaign</h3>
    <div class="fgrid"><label>Name<input name="name" required></label><label>Target amount (₹)<input name="target" type="number" min="1" required></label></div>
    <label>Description<textarea name="description" required></textarea></label>
    <div><button class="btn" type="submit">Create campaign</button></div></form>` : '';
  const list = admin
    ? table(['Campaign', 'Goal', 'Collected', 'Status', 'Actions'], db.campaigns.map(c => row([esc(c.campaign_name), inr(c.target_amount), inr(cStats(c.campaign_id).d), statusTag(c.status),
        `<button class="btn sm ghost" data-act="toggle-camp" data-id="${c.campaign_id}">${c.status === 'Active' ? 'Close' : 'Reopen'}</button> <button class="btn sm danger" data-act="del-camp" data-id="${c.campaign_id}">Delete</button>`])), [1, 2])
    : `<div class="grid">${db.campaigns.filter(c => c.status === 'Active').map(campCard).join('')}</div>`;
  return `<h2>Campaigns</h2>${form}${list}`;
}

function donate(id) {
  const c = camp(id);
  if (!c || c.status !== 'Active') return `<p class="empty">This campaign isn't accepting donations. <a href="#/campaigns">See campaigns</a></p>`;
  const s = cStats(c.campaign_id);
  return `<div class="narrow"><h2>Donate to ${esc(c.campaign_name)}</h2><p>${esc(c.description)}</p>
  <div class="card" style="margin-bottom:16px"><div class="meta row" style="justify-content:space-between"><span><b>${inr(s.d)}</b> raised</span><span>Goal ${inr(c.target_amount)}</span></div>${progress(s.d, c.target_amount)}</div>
  <form class="card" data-form="donate" data-id="${c.campaign_id}">
    <label>Amount (₹)<input name="amount" id="amt" type="number" min="1" step="1" required inputmode="numeric"></label>
    <div class="chips">${[500, 1000, 2500, 5000].map(v => `<button type="button" class="chip" data-act="amt" data-v="${v}">${inr(v)}</button>`).join('')}</div>
    <label>Payment method<select name="method"><option>UPI</option><option>Card</option><option>Net banking</option></select><span class="hint">Demo only. No real payment is taken.</span></label>
    <button class="btn gold" type="submit">Donate and get receipt</button>
  </form></div>`;
}

function myDonations() {
  const d = myDonor(), mine = db.donations.filter(x => x.donor_id === d.donor_id).reverse();
  return `<h2>My donations</h2>${table(['Date', 'Campaign', 'Amount', 'Transaction', 'Receipt'], mine.map(x => row([x.date, esc(camp(x.campaign_id)?.campaign_name), inr(x.amount), x.txn,
    `<button class="btn sm ghost" data-act="receipt" data-id="${x.donation_id}">View receipt</button>`])), [2])}`;
}

function donors() {
  const form = `<form class="card" data-form="donor" style="margin-bottom:24px"><h3>Add a donor</h3>
    <div class="fgrid"><label>Name<input name="name" required></label><label>Email<input name="email" type="email" required></label>
    <label>Phone<input name="phone" pattern="[0-9+ ]{10,14}" required></label><label>Address<input name="address" required></label>
    <label>Temporary password<input name="password" minlength="6" required value="donor123"></label></div>
    <div><button class="btn" type="submit">Add donor</button></div></form>`;
  const rows = db.donors.map(d => {
    const u = userById(d.user_id), n = db.donations.filter(x => x.donor_id === d.donor_id);
    return row([esc(u.name), esc(u.email), esc(d.phone), esc(d.address), n.length, inr(sum(n, x => x.amount))], `data-s="${esc((u.name + u.email + d.phone + d.address).toLowerCase())}"`);
  });
  return `<h2>Donors</h2>${form}<label class="search">Search donors<input type="search" data-search placeholder="Name, email, phone or place"></label>
  ${table(['Name', 'Email', 'Phone', 'Address', 'Gifts', 'Total given'], rows, [4, 5])}<p class="empty" id="nomatch" hidden>No matching donor.</p>`;
}

function donations() {
  const rows = [...db.donations].reverse().map(x => row([x.date, esc(donorName(x.donor_id)), esc(camp(x.campaign_id)?.campaign_name), inr(x.amount), x.method, x.txn,
    `<button class="btn sm ghost" data-act="receipt" data-id="${x.donation_id}">Receipt</button>`]));
  return `<h2>Donations</h2>${table(['Date', 'Donor', 'Campaign', 'Amount', 'Method', 'Transaction', ''], rows, [3])}`;
}

function beneficiaries() {
  const rows = db.beneficiaries.map(b => row([esc(b.name), esc(b.contact_details), esc(b.need), inr(b.requested), statusTag(b.status),
    b.status === 'Pending' ? `<button class="btn sm" data-act="ben" data-s="Approved" data-id="${b.beneficiary_id}">Approve</button> <button class="btn sm danger" data-act="ben" data-s="Rejected" data-id="${b.beneficiary_id}">Reject</button>` : '']));
  return `<h2>Beneficiaries</h2>${table(['Name', 'Contact', 'Need', 'Requested', 'Status', 'Decision'], rows, [3])}`;
}

function benView() {
  const b = myBen(), u = me();
  if (!b) return `<div class="narrow"><h2>Ask for support</h2><form class="card" data-form="ben-submit">
    <label>Contact details<input name="contact" required placeholder="Phone number or address"></label>
    <label>What help do you need?<textarea name="need" required></textarea></label>
    <label>Amount requested (₹)<input name="requested" type="number" min="1" required></label>
    <button class="btn" type="submit">Submit request</button></form></div>`;
  const got = db.allocations.filter(a => a.beneficiary_id === b.beneficiary_id);
  const msg = { Pending: 'Your request is being reviewed by the charity team.', Approved: 'Your request is approved. Funds are released by the finance team.', Rejected: 'Your request was not approved. Contact the charity office for details.' }[b.status];
  return `<h2>Hello, ${esc(u.name)}</h2><div class="card"><h3>Your request ${statusTag(b.status)}</h3><p>${msg}</p>
  <p><b>Need:</b> ${esc(b.need)}<br><b>Requested:</b> ${inr(b.requested)}<br><b>Submitted:</b> ${b.date}</p></div>
  <div class="sec"><h3>Support received</h3>${table(['Date', 'Campaign', 'Amount', 'Note'], got.map(a => row([a.date, esc(camp(a.campaign_id)?.campaign_name), inr(a.amount), esc(a.note)])), [2])}</div>`;
}

function allocations() {
  const t = totals(), appr = db.beneficiaries.filter(b => b.status === 'Approved');
  const form = `<form class="card" data-form="alloc" style="margin-bottom:24px"><h3>Allocate funds</h3>
    <p style="margin:0">Available balance: <b>${inr(t.bal)}</b></p>
    <div class="fgrid"><label>Campaign<select name="campaign" required>${campOptions(false)}</select></label>
    <label>Beneficiary<select name="ben" required>${appr.map(b => `<option value="${b.beneficiary_id}">${esc(b.name)}</option>`).join('') || '<option value="">No approved beneficiaries</option>'}</select></label>
    <label>Amount (₹)<input name="amount" type="number" min="1" required></label><label>Note<input name="note"></label></div>
    <div><button class="btn" type="submit">Save allocation</button></div></form>`;
  const rows = [...db.allocations].reverse().map(a => row([a.date, esc(camp(a.campaign_id)?.campaign_name), esc(benById(a.beneficiary_id)?.name), inr(a.amount), esc(a.note)]));
  return `<h2>Fund allocation</h2>${form}${table(['Date', 'Campaign', 'Beneficiary', 'Amount', 'Note'], rows, [3])}`;
}

function expenses() {
  const form = `<form class="card" data-form="expense" style="margin-bottom:24px"><h3>Record an expense</h3>
    <div class="fgrid"><label>Campaign<select name="campaign" required>${campOptions(false)}</select></label>
    <label>Amount (₹)<input name="amount" type="number" min="1" required></label>
    <label>Date<input name="date" type="date" value="${today()}" required></label>
    <label>Description<input name="description" required></label></div>
    <div><button class="btn" type="submit">Save expense</button></div></form>`;
  const rows = [...db.expenses].reverse().map(e => row([e.date, esc(camp(e.campaign_id)?.campaign_name), esc(e.description), inr(e.amount)]));
  return `<h2>Expenses</h2>${form}${table(['Date', 'Campaign', 'Description', 'Amount'], rows, [3])}`;
}

function reports() {
  const t = totals();
  const byC = db.campaigns.map(c => { const s = cStats(c.campaign_id); return [c.campaign_name, s.d, s.a, s.e, s.bal]; });
  const byD = db.donors.map(d => { const n = db.donations.filter(x => x.donor_id === d.donor_id); return [donorName(d.donor_id), n.length, sum(n, x => x.amount)]; });
  return `<div class="sec-head no-print"><h2>Reports</h2><div class="row">
      <button class="btn sm ghost" data-act="csv-camp">Download campaign report (CSV)</button>
      <button class="btn sm ghost" data-act="csv-donor">Download donor report (CSV)</button>
      <button class="btn sm" data-act="print">Print</button></div></div>
  <div class="strip"><div><small>Total donations</small><b>${inr(t.d)}</b></div><div><small>Allocations</small><b>${inr(t.a)}</b></div><div><small>Expenses</small><b>${inr(t.e)}</b></div><div><small>Remaining balance</small><b>${inr(t.bal)}</b></div></div>
  <div class="sec"><h3>Campaign-wise collections and use of funds</h3>${table(['Campaign', 'Collected', 'Allocated', 'Expenses', 'Available'], byC.map(r => row([esc(r[0]), inr(r[1]), inr(r[2]), inr(r[3]), inr(r[4])])), [1, 2, 3, 4])}</div>
  <div class="sec"><h3>Donor-wise donation history</h3>${table(['Donor', 'Gifts', 'Total given'], byD.map(r => row([esc(r[0]), r[1], inr(r[2])])), [1, 2])}</div>
  <div class="sec"><h3>Expense details</h3>${table(['Date', 'Campaign', 'Description', 'Amount'], db.expenses.map(e => row([e.date, esc(camp(e.campaign_id)?.campaign_name), esc(e.description), inr(e.amount)])), [3])}</div>`;
}

/* ---------- routing and access control ---------- */
const ALL = ['admin', 'finance', 'donor', 'beneficiary'];
const ROUTES = {
  '': { view: home },
  login: { view: login }, register: { view: register },
  dashboard: { view: dashboard, roles: ALL },
  campaigns: { view: campaigns, roles: ['admin', 'donor'] },
  donate: { view: donate, roles: ['donor'] },
  'my-donations': { view: myDonations, roles: ['donor'] },
  donors: { view: donors, roles: ['admin'] },
  donations: { view: donations, roles: ['admin', 'finance'] },
  beneficiaries: { view: beneficiaries, roles: ['admin'] },
  allocations: { view: allocations, roles: ['admin', 'finance'] },
  expenses: { view: expenses, roles: ['admin', 'finance'] },
  reports: { view: reports, roles: ['admin', 'finance'] }
};
const NAV = {
  admin: [['dashboard', 'Dashboard'], ['donors', 'Donors'], ['campaigns', 'Campaigns'], ['donations', 'Donations'], ['beneficiaries', 'Beneficiaries'], ['allocations', 'Allocations'], ['expenses', 'Expenses'], ['reports', 'Reports']],
  finance: [['dashboard', 'Dashboard'], ['donations', 'Donations'], ['allocations', 'Allocations'], ['expenses', 'Expenses'], ['reports', 'Reports']],
  donor: [['dashboard', 'Dashboard'], ['campaigns', 'Campaigns'], ['my-donations', 'My donations']],
  beneficiary: [['dashboard', 'My request']]
};

function renderNav(page) {
  const u = me();
  const links = u ? NAV[u.role] : [['', 'Home'], ['login', 'Log in'], ['register', 'Register']];
  $('#nav').innerHTML = links.map(([p, l]) => `<a href="#/${p}"${p === page ? ' aria-current="page"' : ''}>${l}</a>`).join('') +
    (u ? `<span class="spacer"></span><span class="who">${esc(u.name)} (${u.role})</span><button data-act="logout">Log out</button>` : '');
}

function render() {
  const [, page = '', arg] = location.hash.split('/');
  const route = ROUTES[page];
  const u = me();
  const app = $('#app');
  renderNav(page);
  document.body.classList.remove('pr-receipt');
  if (!route) { app.innerHTML = '<p class="empty">Page not found. <a href="#/">Go home</a></p>'; return; }
  if (route.roles && !u) { go('#/login'); toast('Please log in first.', true); return; }
  if (route.roles && !route.roles.includes(u.role)) {
    app.innerHTML = '<div class="narrow card"><h2>Access denied</h2><p>Your role does not have permission to open this page.</p><a class="btn" href="#/dashboard">Back to dashboard</a></div>';
    return;
  }
  if ((page === 'login' || page === 'register') && u) { go('#/dashboard'); return; }
  app.innerHTML = route.view(arg);
  app.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

/* ---------- actions ---------- */
function openReceipt(donationId) {
  const d = db.donations.find(x => x.donation_id === +donationId), r = db.receipts.find(x => x.donation_id === d.donation_id);
  const m = $('#modal');
  m.innerHTML = `<div class="receipt"><h2>Donation receipt</h2><span class="tag">${esc(r.receipt_number)}</span>
    <dl><dt>Donor</dt><dd>${esc(donorName(d.donor_id))}</dd><dt>Campaign</dt><dd>${esc(camp(d.campaign_id)?.campaign_name)}</dd>
    <dt>Amount</dt><dd>${inr(d.amount)}</dd><dt>Date</dt><dd>${d.date}</dd><dt>Method</dt><dd>${esc(d.method)}</dd><dt>Transaction</dt><dd>${d.txn}</dd></dl>
    <p>Thank you for your generosity.</p>
    <div class="row no-print"><button class="btn" data-act="print-receipt">Print receipt</button><button class="btn ghost" data-act="close">Close</button></div></div>`;
  m.showModal();
}

const handlers = {
  logout() { store.del(SESS); go('#/'); render(); toast('You are logged out.'); },
  close() { $('#modal').close(); },
  print() { window.print(); },
  'print-receipt'() { document.body.classList.add('pr-receipt'); window.print(); },
  receipt(el) { openReceipt(el.dataset.id); },
  amt(el) { $('#amt').value = el.dataset.v; $('#amt').focus(); },
  'toggle-camp'(el) { const c = camp(el.dataset.id); c.status = c.status === 'Active' ? 'Closed' : 'Active'; save(); render(); },
  'del-camp'(el) {
    const id = +el.dataset.id;
    if (db.donations.some(x => x.campaign_id === id) || db.allocations.some(x => x.campaign_id === id) || db.expenses.some(x => x.campaign_id === id))
      return toast('This campaign has money records. Close it instead of deleting.', true);
    if (!confirm('Delete this campaign?')) return;
    db.campaigns = db.campaigns.filter(c => c.campaign_id !== id); save(); render();
  },
  ben(el) { benById(el.dataset.id).status = el.dataset.s; save(); render(); toast('Beneficiary ' + el.dataset.s.toLowerCase() + '.'); },
  'csv-camp'() { csv('campaign-report.csv', ['Campaign', 'Collected', 'Allocated', 'Expenses', 'Available'], db.campaigns.map(c => { const s = cStats(c.campaign_id); return [c.campaign_name, s.d, s.a, s.e, s.bal]; })); },
  'csv-donor'() { csv('donor-report.csv', ['Donor', 'Gifts', 'Total given'], db.donors.map(d => { const n = db.donations.filter(x => x.donor_id === d.donor_id); return [donorName(d.donor_id), n.length, sum(n, x => x.amount)]; })); }
};

const forms = {
  login(f) {
    const u = db.users.find(x => x.email === f.email.trim().toLowerCase() && x.password === f.password);
    if (!u) return toast('Wrong email or password. Check both and try again.', true);
    store.set(SESS, u.user_id); go('#/dashboard'); render(); toast('Welcome, ' + u.name + '.');
  },
  register(f) {
    if (db.users.some(x => x.email === f.email.trim().toLowerCase())) return toast('That email already has an account. Log in instead.', true);
    let u;
    if (f.role === 'donor') { addDonor(f.name.trim(), f.email.trim(), f.password, f.phone, f.address); u = db.users[db.users.length - 1]; }
    else { u = addUser(f.name.trim(), f.email.trim(), f.password, 'beneficiary'); }
    save(); store.set(SESS, u.user_id); go('#/dashboard'); render(); toast('Account created.');
  },
  campaign(f) {
    if (+f.target <= 0) return toast('Target must be more than zero.', true);
    addCampaign(f.name.trim(), f.description.trim(), f.target); save(); render(); toast('Campaign created.');
  },
  donor(f) {
    if (db.users.some(x => x.email === f.email.trim().toLowerCase())) return toast('A user with this email already exists.', true);
    addDonor(f.name.trim(), f.email.trim(), f.password, f.phone, f.address); save(); render(); toast('Donor added.');
  },
  donate(f, el) {
    const amount = +f.amount;
    if (!Number.isFinite(amount) || amount <= 0) return toast('Enter an amount greater than zero.', true);
    const d = addDonation(myDonor().donor_id, +el.dataset.id, amount, f.method);
    save(); go('#/my-donations'); render(); toast('Donation saved. Receipt ready.'); openReceipt(d.donation_id);
  },
  'ben-submit'(f) {
    if (+f.requested <= 0) return toast('Requested amount must be more than zero.', true);
    addBeneficiary(me().user_id, me().name, f.contact.trim(), f.need.trim(), f.requested); save(); render(); toast('Request submitted.');
  },
  alloc(f) {
    const amount = +f.amount;
    if (!f.ben) return toast('Approve a beneficiary first.', true);
    if (!(amount > 0)) return toast('Enter an amount greater than zero.', true);
    const s = cStats(+f.campaign);
    if (amount > s.bal) return toast('Only ' + inr(s.bal) + ' is available in this campaign.', true);
    db.allocations.push({ allocation_id: nid('allocation'), campaign_id: +f.campaign, beneficiary_id: +f.ben, amount, date: today(), note: f.note.trim() });
    save(); render(); toast('Allocation saved. Balance updated.');
  },
  expense(f) {
    const amount = +f.amount;
    if (!(amount > 0)) return toast('Enter an amount greater than zero.', true);
    const s = cStats(+f.campaign);
    if (amount > s.bal) return toast('Only ' + inr(s.bal) + ' is available in this campaign.', true);
    db.expenses.push({ expense_id: nid('expense'), campaign_id: +f.campaign, amount, date: f.date, description: f.description.trim() });
    save(); render(); toast('Expense saved. Balance updated.');
  }
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && handlers[el.dataset.act]) handlers[el.dataset.act](el);
});
document.addEventListener('submit', e => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  forms[form.dataset.form](Object.fromEntries(new FormData(form)), form);
});
document.addEventListener('input', e => {
  if (!e.target.matches('[data-search]')) return;
  const q = e.target.value.trim().toLowerCase();
  let shown = 0;
  document.querySelectorAll('tbody tr[data-s]').forEach(tr => { const m = tr.dataset.s.includes(q); tr.hidden = !m; shown += m; });
  $('#nomatch').hidden = shown > 0;
});
$('#modal').addEventListener('close', () => document.body.classList.remove('pr-receipt'));
window.addEventListener('hashchange', render);
render();
})();
