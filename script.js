"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const STORE_KEY = "finova_smart_money_v1";

const freshData = () => ({
  profile: { name: "", age: "", currency: "INR" },
  transactions: [],
  wallets: [{ id: 1, name: "Main Wallet", type: "Cash", balance: 0 }],
  budgets: [{ id: 1, category: "Food", limit: 5000 }],
  goals: [],
  loans: [],
  recurring: [],
  settings: { light: false, hideBalance: false },
  nextId: 2
});

function loadData() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (!saved) return freshData();
    const parsed = JSON.parse(saved);
    const defaults = freshData();
    return {
      ...defaults, ...parsed,
      profile: { ...defaults.profile, ...(parsed.profile || {}) },
      settings: { ...defaults.settings, ...(parsed.settings || {}) },
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      wallets: Array.isArray(parsed.wallets) ? parsed.wallets : defaults.wallets,
      budgets: Array.isArray(parsed.budgets) ? parsed.budgets : [],
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
      loans: Array.isArray(parsed.loans) ? parsed.loans : [],
      recurring: Array.isArray(parsed.recurring) ? parsed.recurring : []
    };
  } catch {
    return freshData();
  }
}

let db = loadData();
let currentPage = "dashboard";
let toastTimer;
let receiptData = "";
let chartInstance = null;

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch {
    toast("Storage is full. Export a backup and remove some data.");
  }
}

function nextId() {
  db.nextId = Number(db.nextId || 1) + 1;
  return db.nextId;
}

function money(value) {
  if (db.settings.hideBalance) return "₹ ••••••";
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: db.profile.currency || "INR",
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[char]);
}

function dateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function todayTransactions() {
  return db.transactions.filter(t => t.date === dateString());
}

function totalIncome() {
  return db.transactions.filter(t => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
}

function totalExpenses() {
  return db.transactions.filter(t => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
}

function totalBalance() {
  return db.wallets.reduce((sum, w) => sum + Number(w.balance || 0), 0);
}

function sumType(type) {
  return db.transactions.filter(t => t.type === type)
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2900);
}

function setProfileUI() {
  const name = db.profile.name || "My Finance";
  $("#sideName").textContent = name;
  $("#sideAvatar").textContent = name.charAt(0).toUpperCase();
  $("#topAvatar").textContent = name.charAt(0).toUpperCase();
}

function showScreen(id) {
  ["onboarding", "welcomeScreen", "appShell"].forEach(screenId => {
    $("#" + screenId).classList.toggle("hidden", screenId !== id);
  });
}

function startApp() {
  if (!db.profile.name) {
    showScreen("onboarding");
    return;
  }

  showScreen("appShell");
  setProfileUI();
  document.body.classList.toggle("light-theme", !!db.settings.light);
  renderPage(currentPage);
}

$("#profileForm").addEventListener("submit", event => {
  event.preventDefault();
  const name = $("#userName").value.trim();
  const age = Number($("#userAge").value);

  if (!name || !Number.isInteger(age) || age < 1 || age > 120) {
    toast("Please enter a name and a valid age.");
    return;
  }

  db.profile.name = name;
  db.profile.age = age;
  save();

  $("#welcomeScreen").querySelector("h1").innerHTML =
    `Welcome, ${escapeHTML(name)}.<br><span>Your next chapter starts here.</span>`;
  showScreen("welcomeScreen");
});

$("#enterAppBtn").addEventListener("click", () => {
  startApp();
  toast("Welcome to FINOVA, " + db.profile.name + "!");
});

function pageTitle(page) {
  const titles = {
    dashboard: "Dashboard", transactions: "Transactions",
    wallets: "Wallets", budgets: "Budgets", goals: "Savings goals",
    loans: "Loans & EMI", recurring: "Recurring",
    calendar: "Calendar", receipts: "Receipt scanner",
    analytics: "Analytics", reports: "Reports",
    pro: "FINOVA Pro", settings: "Settings"
  };
  return titles[page] || "Dashboard";
}

function navigate(page) {
  currentPage = page;
  $$(".nav-item[data-page]").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  $("#sidebar")?.classList.remove("open");
  $(".sidebar").classList.remove("open");
  renderPage(page);
}

$("#sideNav").addEventListener("click", event => {
  const button = event.target.closest("[data-page]");
  if (button) navigate(button.dataset.page);
});

$(".sidebar").addEventListener("click", event => {
  const button = event.target.closest("[data-page]");
  if (button) navigate(button.dataset.page);
});

$$("[data-home]").forEach(el => el.addEventListener("click", event => {
  event.preventDefault();
  navigate("dashboard");
}));

$("#mobileMenuBtn").addEventListener("click", () => {
  $(".sidebar").classList.toggle("open");
});

$("#themeBtn").addEventListener("click", () => {
  db.settings.light = !db.settings.light;
  document.body.classList.toggle("light-theme", db.settings.light);
  save();
  toast(db.settings.light ? "Light appearance enabled." : "Dark appearance enabled.");
});

$("#topAvatar").addEventListener("click", () => navigate("settings"));
$("#profileMenuBtn").addEventListener("click", () => navigate("settings"));

function pageHeader(title, description, actions = "") {
  return `<div class="page-heading">
    <div><div class="eyebrow-small">FINOVA / YOUR MONEY OS</div>
      <h1>${title}</h1><p>${description}</p></div>
    <div class="heading-actions">${actions}</div>
  </div>`;
}

function statCard(title, value, icon, note, positive = true) {
  return `<div class="panel stat-card">
    <div class="stat-top"><span>${title}</span><span class="stat-icon">${icon}</span></div>
    <div class="stat-value">${value}</div>
    <div class="stat-foot">${positive ? '<b>↗</b> ' : ""}${note}</div>
  </div>`;
}

function emptyState(title, message) {
  return `<div class="empty-state"><strong>${title}</strong>${message}</div>`;
}

function transactionRow(t) {
  const income = t.type === "income";
  return `<div class="transaction-row">
    <div class="tx-icon">${income ? "↙" : "↗"}</div>
    <div class="tx-info"><strong>${escapeHTML(t.name)}</strong>
      <small>${escapeHTML(t.category || "Other")} · ${escapeHTML(t.date || "")}</small></div>
    <div class="tx-amount ${income ? "positive" : "negative"}">
      ${income ? "+" : "−"}${money(t.amount)}
      <small>${escapeHTML(t.wallet || "Main Wallet")}</small>
    </div>
  </div>`;
}

function progressBar(percent) {
  const safe = Math.max(0, Math.min(100, Number(percent) || 0));
  return `<div class="progress-track"><div class="progress-fill" style="width:${safe}%"></div></div>`;
}

function recentTransactions(limit = 5) {
  const items = [...db.transactions]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, limit);
  return items.length
    ? `<div class="transaction-list">${items.map(transactionRow).join("")}</div>`
    : emptyState("No transactions yet", "Add your first income or expense to get started.");
}

function monthlySeries() {
  const result = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const income = db.transactions.filter(t => t.type === "income" && t.date?.startsWith(key))
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const expense = db.transactions.filter(t => t.type === "expense" && t.date?.startsWith(key))
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    result.push({ label: date.toLocaleDateString("en-IN", { month: "short" }), income, expense });
  }
  return result;
}

function drawChart(canvasId, series = monthlySeries()) {
  const canvas = $("#" + canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(rect.width, 260);
  const height = 210;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const pad = { left: 8, right: 8, top: 20, bottom: 30 };
  const graphW = width - pad.left - pad.right;
  const graphH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...series.flatMap(s => [s.income, s.expense])) * 1.15;

  ctx.font = "10px DM Sans";
  ctx.textAlign = "left";
  ctx.strokeStyle = "rgba(150,170,195,.13)";
  ctx.fillStyle = "#8594a9";
  ctx.lineWidth = 1;

  for (let i = 0; i < 4; i++) {
    const y = pad.top + graphH * i / 3;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
  }

  const point = (i, value) => ({
    x: pad.left + graphW * (i + .5) / series.length,
    y: pad.top + graphH * (1 - value / max)
  });

  const drawLine = (key, color) => {
    ctx.beginPath();
    series.forEach((item, i) => {
      const p = point(i, item[key]);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    series.forEach((item, i) => {
      const p = point(i, item[key]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });
  };

  drawLine("income", "#c6ff4d");
  drawLine("expense", "#6ca9ff");

  ctx.textAlign = "center";
  series.forEach((item, i) => {
    ctx.fillStyle = "#8594a9";
    ctx.fillText(item.label, point(i, 0).x, height - 8);
  });
}

function dashboardPage() {
  const firstName = (db.profile.name || "there").split(" ")[0];
  const income = sumType("income");
  const expense = sumType("expense");
  const remaining = income - expense;

  return `${pageHeader(
    `Good to see you, ${escapeHTML(firstName)}. ✳`,
    "Here's what's happening with your money.",
    `<button class="btn btn-lime" data-action="add-transaction">＋ Add transaction</button>`
  )}
  <div class="stats-grid">
    ${statCard("TOTAL BALANCE", money(totalBalance()), "◈", "Across your wallets")}
    ${statCard("TOTAL INCOME", money(income), "↙", "Recorded income")}
    ${statCard("TOTAL EXPENSES", money(expense), "↗", "Recorded spending", false)}
    ${statCard("NET CASH FLOW", money(remaining), "⌁", "Income minus expenses", remaining >= 0)}
  </div>

  <div class="dashboard-grid">
    <div>
      <section class="panel balance-panel">
        <div class="balance-label">YOUR FINANCIAL OVERVIEW</div>
        <div class="balance-amount">${money(totalBalance())}</div>
        <div class="balance-change">✳ Keep your money moving with intention.</div>
        <div class="balance-bottom">
          <button class="btn" data-action="add-transaction">＋ Add transaction</button>
          <button class="btn" data-page="analytics">View analytics ↗</button>
        </div>
      </section>

      <section class="panel section-gap">
        <div class="panel-head"><div><h3>Money flow</h3><p>Your last six months of recorded activity</p></div><span class="tag">6 MONTHS</span></div>
        <div class="panel-body">
          <div class="chart-area"><canvas id="moneyChart" aria-label="Income and expenses chart"></canvas></div>
          <div class="chart-legend"><span><i></i> Income</span><span><i class="blue-dot"></i> Expenses</span></div>
        </div>
      </section>
    </div>

    <div>
      <section class="panel">
        <div class="panel-head"><div><h3>Recent activity</h3><p>Your latest transactions</p></div><button class="small-action" data-page="transactions">View all ↗</button></div>
        <div class="panel-body">${recentTransactions(5)}</div>
      </section>

      <section class="panel section-gap">
        <div class="panel-head"><div><h3>Budget pulse</h3><p>Spending against your limits</p></div><button class="small-action" data-page="budgets">Details ↗</button></div>
        <div class="panel-body">${budgetPreview()}</div>
      </section>
    </div>
  </div>`;
}

function budgetPreview() {
  if (!db.budgets.length) return emptyState("No budgets set", "Create a budget to keep track of spending.");
  return db.budgets.slice(0, 4).map(b => {
    const spent = db.transactions.filter(t => t.type === "expense" && t.category === b.category)
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const pct = b.limit > 0 ? spent / b.limit * 100 : 0;
    return `<div class="budget-row">
      <div class="budget-row-top"><span>${escapeHTML(b.category)}</span><small>${money(spent)} / ${money(b.limit)}</small></div>
      ${progressBar(pct)}
    </div>`;
  }).join("");
}

function transactionsPage() {
  const items = [...db.transactions].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return `${pageHeader("Transactions", "Every recorded income and expense in one place.",
    `<button class="btn btn-lime" data-action="add-transaction">＋ Add transaction</button>`)}
    <section class="panel">
      <div class="panel-head"><div><h3>All transactions</h3><p>${items.length} recorded entries</p></div>
        <button class="btn" data-action="export">Export backup</button></div>
      ${items.length ? `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>DESCRIPTION</th><th>CATEGORY</th><th>DATE</th><th>TYPE</th><th>AMOUNT</th><th>ACTION</th></tr></thead>
        <tbody>${items.map(t => `<tr>
          <td><strong>${escapeHTML(t.name)}</strong><br><span class="muted">${escapeHTML(t.wallet || "Main Wallet")}</span></td>
          <td>${escapeHTML(t.category || "Other")}</td><td>${escapeHTML(t.date || "")}</td>
          <td><span class="tag ${t.type === "income" ? "" : "neutral"}">${escapeHTML(t.type)}</span></td>
          <td class="${t.type === "income" ? "positive" : "negative"}">${t.type === "income" ? "+" : "−"}${money(t.amount)}</td>
          <td><button class="small-action" data-action="delete-transaction" data-id="${t.id}">Delete</button></td>
        </tr>`).join("")}</tbody></table></div>`
        : emptyState("Your story starts here", "Add a transaction to see your financial activity.")}</section>`;
}

function walletsPage() {
  return `${pageHeader("Your wallets", "Keep your cash and account balances organised.",
    `<button class="btn btn-lime" data-action="add-wallet">＋ Add wallet</button>`)}
    <div class="cards-grid">${db.wallets.map(w => `<section class="panel mini-card">
      <div class="wallet-visual"><div class="card-top"><span>FINOVA WALLET</span><span>✳</span></div>
      <div class="wallet-number">${money(w.balance)}</div><div class="card-bottom"><span>${escapeHTML(w.name)}</span><span>${escapeHTML(w.type)}</span></div></div>
      <div class="action-row"><button class="small-action" data-action="edit-wallet" data-id="${w.id}">Edit balance</button>
      ${w.id !== 1 ? `<button class="small-action" data-action="delete-wallet" data-id="${w.id}">Delete</button>` : ""}</div>
    </section>`).join("")}</div>`;
}

function budgetsPage() {
  return `${pageHeader("Budgets", "Set spending limits and keep an eye on your categories.",
    `<button class="btn btn-lime" data-action="add-budget">＋ Create budget</button>`)}
    <div class="stats-grid">${statCard("BUDGETS", db.budgets.length, "◴", "Active categories")}
      ${statCard("TOTAL LIMIT", money(db.budgets.reduce((s,b) => s + Number(b.limit),0)), "◎", "Combined budget")}
      ${statCard("TOTAL SPENT", money(totalExpenses()), "↗", "All recorded expenses", false)}
      ${statCard("LEFT IN BUDGETS", money(db.budgets.reduce((s,b) => s + Number(b.limit),0) - db.budgets.reduce((s,b) => s + db.transactions.filter(t => t.type === "expense" && t.category === b.category).reduce((a,t) => a + Number(t.amount),0),0)), "⌁", "Limit minus category spending")}
    </div>
    <div class="cards-grid">${db.budgets.map(b => {
      const spent = db.transactions.filter(t => t.type === "expense" && t.category === b.category)
        .reduce((s,t) => s + Number(t.amount),0);
      const pct = b.limit > 0 ? spent / b.limit * 100 : 0;
      return `<section class="panel feature-card"><div class="feature-icon">◴</div><h3>${escapeHTML(b.category)}</h3>
        <div class="big-number">${money(spent)}</div><p>of ${money(b.limit)} used</p>
        ${progressBar(pct)}<p>${Math.round(pct)}% used${pct > 100 ? " · Over budget" : ""}</p>
        <button class="small-action" data-action="delete-budget" data-id="${b.id}">Remove budget</button></section>`;
    }).join("") || emptyState("No budgets yet", "Create a budget to start tracking categories.")}</div>`;
}

function goalsPage() {
  return `${pageHeader("Savings goals", "Small steps toward the things that matter.",
    `<button class="btn btn-lime" data-action="add-goal">＋ New goal</button>`)}
    <div class="cards-grid">${db.goals.map(g => {
      const pct = g.target > 0 ? g.saved / g.target * 100 : 0;
      return `<section class="panel feature-card"><div class="goal-ring" style="--progress:${Math.min(100,pct)}%"><span>${Math.round(pct)}%</span></div>
        <h3>${escapeHTML(g.name)}</h3><p>Target: ${money(g.target)}</p><div class="big-number">${money(g.saved)}</div>
        <p>${money(Math.max(0,g.target-g.saved))} to go</p>${progressBar(pct)}
        <div class="action-row section-gap"><button class="btn btn-lime" data-action="contribute-goal" data-id="${g.id}">＋ Add savings</button>
        <button class="small-action" data-action="delete-goal" data-id="${g.id}">Remove</button></div></section>`;
    }).join("") || emptyState("Give your money a mission", "Create a savings goal and track your progress.")}</div>`;
}

function loansPage() {
  return `${pageHeader("Loans & EMI", "Track outstanding balances and record payments.",
    `<button class="btn btn-lime" data-action="add-loan">＋ Add loan</button>`)}
    <div class="cards-grid">${db.loans.map(l => {
      const paidPct = l.total > 0 ? l.paid / l.total * 100 : 0;
      return `<section class="panel feature-card"><div class="feature-icon">↗</div><h3>${escapeHTML(l.name)}</h3>
        <p>Original loan: ${money(l.total)}</p><div class="big-number">${money(Math.max(0,l.total-l.paid))}</div>
        <p>Outstanding balance</p>${progressBar(paidPct)}<p>${Math.round(paidPct)}% repaid · EMI ${money(l.emi)}</p>
        <div class="action-row section-gap"><button class="btn btn-lime" data-action="pay-emi" data-id="${l.id}">Pay EMI</button>
        <button class="small-action" data-action="delete-loan" data-id="${l.id}">Remove</button></div></section>`;
    }).join("") || emptyState("No loans added", "Add a loan to keep track of repayments.")}</div>
    <p class="muted section-gap">EMI entries are recorded locally in this demo; they do not transfer money to a lender.</p>`;
}

function recurringPage() {
  return `${pageHeader("Recurring", "Keep track of regular bills, subscriptions, and income.",
    `<button class="btn btn-lime" data-action="add-recurring">＋ Add recurring item</button>`)}
    <section class="panel"><div class="panel-head"><div><h3>Scheduled items</h3><p>These entries are reminders, not automatic payments.</p></div></div>
    ${db.recurring.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>ITEM</th><th>TYPE</th><th>AMOUNT</th><th>FREQUENCY</th><th>ACTION</th></tr></thead><tbody>
    ${db.recurring.map(r => `<tr><td><strong>${escapeHTML(r.name)}</strong></td><td>${escapeHTML(r.type)}</td><td>${money(r.amount)}</td><td>${escapeHTML(r.frequency)}</td>
    <td><button class="small-action" data-action="delete-recurring" data-id="${r.id}">Remove</button></td></tr>`).join("")}
    </tbody></table></div>` : emptyState("No recurring items", "Add a reminder for your regular money commitments.")}</section>`;
}

function calendarPage() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  ["S","M","T","W","T","F","S"].forEach(d => cells.push(`<div class="calendar-cell"><strong>${d}</strong></div>`));
  for (let i = 0; i < firstDay; i++) cells.push(`<div class="calendar-cell"></div>`);
  for (let day = 1; day <= days; day++) {
    const date = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const has = db.transactions.some(t => t.date === date);
    cells.push(`<div class="calendar-cell ${day === now.getDate() ? "today" : ""}"><strong>${day}</strong>${has ? '<span class="event-dot"></span>' : ""}</div>`);
  }

  return `${pageHeader("Money calendar", "A quick look at this month's activity.",
    `<button class="btn" data-page="transactions">View transactions</button>`)}
    <section class="panel"><div class="panel-head"><div><h3>${now.toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</h3><p>Dots mark days with recorded transactions.</p></div></div>
    <div class="panel-body"><div class="calendar-grid">${cells.join("")}</div></div></section>`;
}

function receiptsPage() {
  return `${pageHeader("Receipt scanner", "Choose a receipt image and attach it to an expense.",
    `<button class="btn" data-page="transactions">View expenses</button>`)}
    <section class="panel"><div class="panel-head"><div><h3>Scan a receipt</h3><p>Image preview and manual expense entry.</p></div></div>
    <div class="panel-body">
      <div class="drop-zone" id="receiptDrop"><div class="feature-icon" style="margin:auto">▤</div>
      <strong>Upload your receipt</strong><p>Choose an image from your device.</p>
      <button class="btn section-gap" type="button" data-action="choose-receipt">Choose image</button></div>
      <img id="receiptPreview" class="receipt-preview ${receiptData ? "" : "hidden"}" alt="Receipt preview" src="${receiptData}">
      <p class="muted">This version does not automatically read receipt text. Enter the details below manually.</p>
      <form id="receiptForm" class="inline-form">
        <div class="form-col"><label>Merchant / description</label><input class="field" name="name" required placeholder="e.g. Grocery store"></div>
        <div class="form-col"><label>Amount (₹)</label><input class="field" name="amount" required type="number" min="0.01" step="0.01"></div>
        <div class="form-col"><label>Category</label><select class="field" name="category">${categoryOptions()}</select></div>
        <div class="form-col"><label>Date</label><input class="field" name="date" type="date" value="${dateString()}" required></div>
        <button class="btn btn-lime" type="submit">Save expense</button>
      </form>
    </div></section>`;
}

function analyticsPage() {
  const categories = {};
  db.transactions.filter(t => t.type === "expense").forEach(t => {
    categories[t.category || "Other"] = (categories[t.category || "Other"] || 0) + Number(t.amount || 0);
  });
  const ranked = Object.entries(categories).sort((a,b) => b[1]-a[1]);

  return `${pageHeader("Analytics", "Understand the numbers behind your habits.",
    `<button class="btn" data-page="reports">Open reports ↗</button>`)}
    <div class="stats-grid">
      ${statCard("TOTAL INCOME",money(sumType("income")),"↙","All recorded income")}
      ${statCard("TOTAL SPENDING",money(totalExpenses()),"↗","All recorded expenses",false)}
      ${statCard("NET CASH FLOW",money(sumType("income")-totalExpenses()),"⌁","Income minus expenses")}
      ${statCard("TRANSACTIONS",db.transactions.length,"⇄","Recorded entries")}
    </div>
    <section class="panel section-gap"><div class="panel-head"><div><h3>Income vs expenses</h3><p>Recorded data from the last six months</p></div></div>
      <div class="panel-body"><div class="chart-area"><canvas id="analyticsChart"></canvas></div>
      <div class="chart-legend"><span><i></i> Income</span><span><i class="blue-dot"></i> Expenses</span></div></div></section>
    <section class="panel section-gap"><div class="panel-head"><div><h3>Spending by category</h3><p>Where your recorded expenses go</p></div></div>
    <div class="panel-body">${ranked.length ? ranked.map(([name,value]) => `<div class="budget-row">
      <div class="budget-row-top"><span>${escapeHTML(name)}</span><small>${money(value)} · ${totalExpenses() ? Math.round(value/totalExpenses()*100) : 0}%</small></div>
      ${progressBar(totalExpenses() ? value/totalExpenses()*100 : 0)}</div>`).join("") : emptyState("No spending data", "Add expenses to see category analytics.")}</div></section>`;
}

function reportsPage() {
  return `${pageHeader("Reports & backup", "Export your records for your own use.",
    `<button class="btn btn-lime" data-action="export">↓ Download backup</button>`)}
    <div class="cards-grid">
      <section class="panel feature-card"><div class="feature-icon">▥</div><h3>Financial snapshot</h3>
      <p>Overview of the records saved in this browser.</p><div class="big-number">${money(totalBalance())}</div><p>Total wallet balance</p>
      <button class="btn btn-lime" data-action="export">Export JSON backup</button></section>
      <section class="panel feature-card"><div class="feature-icon">⇄</div><h3>Transactions</h3>
      <p>Download your recorded transactions in a spreadsheet-friendly format.</p>
      <div class="big-number">${db.transactions.length}</div><p>Entries recorded</p>
      <button class="btn" data-action="export-csv">Export transactions CSV</button></section>
      <section class="panel feature-card"><div class="feature-icon">↻</div><h3>Restore records</h3>
      <p>Restore from a FINOVA JSON backup file.</p>
      <button class="btn section-gap" data-action="import">Choose backup file</button></section>
    </div>
    <section class="panel section-gap"><div class="panel-body">
      <h3>Important</h3><p class="muted">Data is stored in this browser. This is not cloud backup, and the export file is not encrypted. Keep your backup private.</p>
    </div></section>`;
}

function proPage() {
  return `${pageHeader("FINOVA Pro", "A premium plan concept for your financial workspace.",
    `<span class="tag">PRO EXPERIENCE</span>`)}
    <section class="pro-hero"><div class="eyebrow-small">✳ FINOVA PRO</div>
      <h2>More clarity.<br><span>More control.</span></h2>
      <p class="muted">Explore a premium toolkit designed around your financial life.</p>
      <div class="price">₹49 <small>/ month</small></div><p class="muted">Or ₹570 per year</p>
      <button class="btn btn-lime" data-action="pro-info">Explore subscription</button>
    </section>
    <div class="cards-grid">
      <section class="panel feature-card"><div class="feature-icon">⌁</div><h3>Advanced insights</h3><p>Review your recorded spending patterns and category breakdowns.</p></section>
      <section class="panel feature-card"><div class="feature-icon">▥</div><h3>Export reports</h3><p>Download a backup and transaction CSV from the reports section.</p></section>
      <section class="panel feature-card"><div class="feature-icon">◈</div><h3>Goal tracking</h3><p>Track savings goals and progress toward your targets.</p></section>
    </div>
    <section class="panel section-gap"><div class="panel-body">
      <h3>Before you subscribe</h3>
      <p class="muted">This screen is a front-end demo. It does not charge money or activate a paid subscription. Real subscriptions require a verified payment and entitlement system.</p>
    </div></section>`;
}

function settingsPage() {
  return `${pageHeader("Settings", "Manage your profile and the way FINOVA looks.",
    `<button class="btn" data-action="export">Export backup</button>`)}
    <section class="panel"><div class="panel-head"><div><h3>Your profile</h3><p>Details used in this browser</p></div></div><div class="panel-body">
      <form id="settingsForm">
        <div class="settings-row"><div style="flex:1"><label class="form-label">Name</label><input class="field" name="name" value="${escapeHTML(db.profile.name)}" required></div>
        <div style="flex:1"><label class="form-label">Age</label><input class="field" name="age" type="number" min="1" max="120" value="${escapeHTML(db.profile.age)}" required></div></div>
        <div class="settings-row"><div><strong>Light appearance</strong><p>Switch between dark and light themes.</p></div>
        <button class="toggle ${db.settings.light ? "on" : ""}" type="button" data-action="toggle-theme" aria-label="Toggle theme"></button></div>
        <div class="settings-row"><div><strong>Hide balances</strong><p>Conceal monetary amounts on screen.</p></div>
        <button class="toggle ${db.settings.hideBalance ? "on" : ""}" type="button" data-action="toggle-balance" aria-label="Toggle balance visibility"></button></div>
        <div class="settings-row"><div><strong>Local storage</strong><p>Records are stored in this browser on this device.</p></div><span class="tag">LOCAL</span></div>
        <button class="btn btn-lime section-gap" type="submit">Save profile</button>
      </form>
    </div></section>
    <section class="panel section-gap"><div class="panel-head"><div><h3>Data management</h3><p>Keep a backup before clearing records.</p></div></div>
      <div class="panel-body action-row"><button class="btn" data-action="export">Export backup</button>
      <button class="btn" data-action="import">Import backup</button>
      <button class="btn" data-action="reset">Reset all data</button></div>
    </section>`;
}

function renderPage(page) {
  const content = $("#pageContent");
  const renderers = {
    dashboard: dashboardPage, transactions: transactionsPage,
    wallets: walletsPage, budgets: budgetsPage, goals: goalsPage,
    loans: loansPage, recurring: recurringPage, calendar: calendarPage,
    receipts: receiptsPage, analytics: analyticsPage, reports: reportsPage,
    pro: proPage, settings: settingsPage
  };
  $("#pageCrumb").textContent = pageTitle(page);
  content.innerHTML = (renderers[page] || dashboardPage)();

  if (page === "dashboard") drawChart("moneyChart");
  if (page === "analytics") drawChart("analyticsChart");
}

function categoryOptions(selected = "Other") {
  const categories = ["Food","Transport","Shopping","Bills","Entertainment","Health","Education","Rent","Salary","Investment","Travel","Other"];
  return categories.map(c => `<option ${c === selected ? "selected" : ""}>${c}</option>`).join("");
}

function walletOptions(selected) {
  return db.wallets.map(w => `<option value="${w.id}" ${String(w.id) === String(selected) ? "selected" : ""}>${escapeHTML(w.name)}</option>`).join("");
}

function openModal(title, content, onSubmit) {
  const root = $("#modalRoot");
  root.innerHTML = `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">
    <div class="modal-head"><h2>${title}</h2><button class="modal-close" type="button" data-action="close-modal">✕</button></div>
    ${content}</div></div>`;

  const backdrop = $(".modal-backdrop", root);
  backdrop.addEventListener("click", event => {
    if (event.target === backdrop) closeModal();
  });

  const form = $("form", root);
  if (form && onSubmit) form.addEventListener("submit", event => {
    event.preventDefault();
    if (onSubmit(new FormData(form)) !== false) closeModal();
  });
  const firstInput = $("input,select,textarea", root);
  if (firstInput) firstInput.focus();
}

function closeModal() {
  $("#modalRoot").innerHTML = "";
}

function formField(label, name, options = {}) {
  const type = options.type || "text";
  const value = options.value ?? "";
  const required = options.required === false ? "" : "required";
  if (options.select) {
    return `<div class="form-col"><label>${label}</label><select class="field" name="${name}" ${required}>${options.select}</select></div>`;
  }
  return `<div class="form-col"><label>${label}</label><input class="field" name="${name}" type="${type}" value="${escapeHTML(value)}" placeholder="${options.placeholder || ""}" ${options.min !== undefined ? `min="${options.min}"` : ""} ${options.step ? `step="${options.step}"` : ""} ${required}></div>`;
}

function addTransaction() {
  const html = `<form id="transactionModalForm">
    ${formField("Description","name",{placeholder:"e.g. Lunch"})}
    <div class="form-col"><label>Type</label><select class="field" name="type"><option value="expense">Expense</option><option value="income">Income</option></select></div>
    <div class="form-col"><label>Amount (₹)</label><input class="field" name="amount" type="number" min="0.01" step="0.01" required></div>
    <div class="form-col"><label>Category</label><select class="field" name="category">${categoryOptions()}</select></div>
    <div class="form-col"><label>Wallet</label><select class="field" name="wallet">${walletOptions(db.wallets[0]?.id)}</select></div>
    ${formField("Date","date",{type:"date",value:dateString()})}
    <div class="modal-actions"><button class="btn btn-lime" type="submit">Save transaction</button></div>
  </form>`;

  openModal("Add transaction", html, data => {
    const amount = Number(data.get("amount"));
    const wallet = db.wallets.find(w => String(w.id) === data.get("wallet"));
    if (!data.get("name").trim() || !Number.isFinite(amount) || amount <= 0 || !wallet) {
      toast("Check the transaction details.");
      return false;
    }

    const type = data.get("type");
    wallet.balance += type === "income" ? amount : -amount;
    db.transactions.push({
      id: nextId(), name: data.get("name").trim(), type,
      amount, category: data.get("category"), wallet: wallet.name,
      walletId: wallet.id, date: data.get("date") || dateString()
    });
    save(); renderPage(currentPage); toast("Transaction saved.");
  });
}

function addWallet() {
  openModal("Add wallet", `<form>
    ${formField("Wallet name","name",{placeholder:"e.g. Savings account"})}
    <div class="form-col"><label>Wallet type</label><select class="field" name="type"><option>Cash</option><option>Bank</option><option>UPI</option><option>Savings</option><option>Other</option></select></div>
    ${formField("Opening balance (₹)","balance",{type:"number",value:"0",min:0,step:"0.01"})}
    <div class="modal-actions"><button class="btn btn-lime" type="submit">Create wallet</button></div>
  </form>`, data => {
    const name = data.get("name").trim(), balance = Number(data.get("balance"));
    if (!name || !Number.isFinite(balance) || balance < 0) { toast("Enter valid wallet details."); return false; }
    db.wallets.push({id:nextId(),name,type:data.get("type"),balance});
    save(); renderPage(currentPage); toast("Wallet created.");
  });
}

function addBudget() {
  openModal("Create budget", `<form>
    <div class="form-col"><label>Category</label><select class="field" name="category">${categoryOptions()}</select></div>
    ${formField("Budget limit (₹)","limit",{type:"number",min:1,step:"0.01"})}
    <div class="modal-actions"><button class="btn btn-lime" type="submit">Save budget</button></div>
  </form>`, data => {
    const limit = Number(data.get("limit")), category = data.get("category");
    if (!Number.isFinite(limit) || limit <= 0) { toast("Enter a valid limit."); return false; }
    if (db.budgets.some(b => b.category === category)) { toast("That category already has a budget."); return false; }
    db.budgets.push({id:nextId(),category,limit});
    save(); renderPage(currentPage); toast("Budget created.");
  });
}

function addGoal() {
  openModal("Create savings goal", `<form>
    ${formField("Goal name","name",{placeholder:"e.g. New laptop"})}
    ${formField("Target amount (₹)","target",{type:"number",min:1,step:"0.01"})}
    ${formField("Already saved (₹)","saved",{type:"number",value:"0",min:0,step:"0.01"})}
    <div class="modal-actions"><button class="btn btn-lime" type="submit">Create goal</button></div>
  </form>`, data => {
    const target=Number(data.get("target")), saved=Number(data.get("saved"));
    if (!data.get("name").trim() || target <= 0 || saved < 0 || !Number.isFinite(target) || !Number.isFinite(saved)) { toast("Check the goal details."); return false; }
    db.goals.push({id:nextId(),name:data.get("name").trim(),target,saved});
    save(); renderPage(currentPage); toast("Savings goal created.");
  });
}

function addLoan() {
  openModal("Add loan", `<form>
    ${formField("Loan name","name",{placeholder:"e.g. Education loan"})}
    ${formField("Original loan amount (₹)","total",{type:"number",min:1,step:"0.01"})}
    ${formField("Monthly EMI (₹)","emi",{type:"number",min:0.01,step:"0.01"})}
    ${formField("Already repaid (₹)","paid",{type:"number",value:"0",min:0,step:"0.01"})}
    <div class="modal-actions"><button class="btn btn-lime" type="submit">Save loan</button></div>
  </form>`, data => {
    const total=Number(data.get("total")), emi=Number(data.get("emi")), paid=Number(data.get("paid"));
    if (!data.get("name").trim() || total <= 0 || emi <= 0 || paid < 0 || paid > total) { toast("Check the loan amounts."); return false; }
    db.loans.push({id:nextId(),name:data.get("name").trim(),total,emi,paid});
    save(); renderPage(currentPage); toast("Loan added.");
  });
}

function addRecurring() {
  openModal("Add recurring item", `<form>
    ${formField("Description","name",{placeholder:"e.g. Monthly internet bill"})}
    <div class="form-col"><label>Type</label><select class="field" name="type"><option>Expense</option><option>Income</option></select></div>
    ${formField("Amount (₹)","amount",{type:"number",min:0.01,step:"0.01"})}
    <div class="form-col"><label>Frequency</label><select class="field" name="frequency"><option>Weekly</option><option>Monthly</option><option>Yearly</option></select></div>
    <div class="modal-actions"><button class="btn btn-lime" type="submit">Save reminder</button></div>
  </form>`, data => {
    const amount=Number(data.get("amount"));
    if (!data.get("name").trim() || !Number.isFinite(amount) || amount <= 0) { toast("Enter valid details."); return false; }
    db.recurring.push({id:nextId(),name:data.get("name").trim(),type:data.get("type"),amount,frequency:data.get("frequency")});
    save(); renderPage(currentPage); toast("Recurring reminder saved.");
  });
}

function deleteItem(collection, id, label) {
  const list = db[collection];
  const index = list.findIndex(item => String(item.id) === String(id));
  if (index < 0) return;
  if (!confirm(`Remove this ${label}?`)) return;
  list.splice(index,1);
  save(); renderPage(currentPage); toast(`${label} removed.`);
}

function payEMI(id) {
  const loan = db.loans.find(l => String(l.id) === String(id));
  if (!loan) return;
  const remaining = Math.max(0,loan.total-loan.paid);
  if (remaining <= 0) { toast("This loan is fully repaid."); return; }

  openModal("Record EMI payment", `<form>
    <p class="muted">Outstanding balance: ${money(remaining)}</p>
    ${formField("Payment amount (₹)","amount",{type:"number",value:String(Math.min(loan.emi,remaining)),min:0.01,step:"0.01"})}
    <div class="modal-actions"><button class="btn btn-lime" type="submit">Record payment</button></div>
  </form>`, data => {
    const amount=Number(data.get("amount"));
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) { toast("Enter an amount up to the remaining balance."); return false; }
    loan.paid = Math.min(loan.total,loan.paid+amount);
    save(); renderPage(currentPage);
    toast(loan.paid >= loan.total ? "Loan fully repaid in your records!" : "EMI payment recorded.");
  });
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(db,null,2)],{type:"application/json"});
  downloadBlob(blob,`finova-backup-${dateString()}.json`);
  toast("Backup exported.");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href=url; link.download=filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function exportCSV() {
  const columns = ["date","name","type","category","amount","wallet"];
  const rows = [columns.join(","), ...db.transactions.map(t =>
    columns.map(key => `"${String(t[key] ?? "").replace(/"/g,'""')}"`).join(",")
  )];
  downloadBlob(new Blob(["\uFEFF"+rows.join("\r\n")],{type:"text/csv;charset=utf-8;"}),`finova-transactions-${dateString()}.csv`);
  toast("Transactions exported.");
}

function importJSON() {
  const input = document.createElement("input");
  input.type="file"; input.accept=".json,application/json";
  input.addEventListener("change", async () => {
    const file=input.files?.[0]; if (!file) return;
    try {
      const imported=JSON.parse(await file.text());
      if (!imported || !imported.profile || !Array.isArray(imported.transactions) || !Array.isArray(imported.wallets)) {
        throw new Error("This file doesn't look like a FINOVA backup.");
      }
      if (!confirm("Replace the current FINOVA data with this backup? Export your current data first if you want to keep it.")) return;
      db={...freshData(),...imported,
        profile:{...freshData().profile,...imported.profile},
        settings:{...freshData().settings,...imported.settings}};
      save(); setProfileUI(); startApp(); toast("Backup restored.");
    } catch(error) { toast(error.message || "Could not read that backup."); }
  });
  input.click();
}

function editWallet(id) {
  const wallet=db.wallets.find(w=>String(w.id)===String(id));
  if(!wallet) return;
  openModal("Edit wallet balance", `<form>
    <p class="muted">This sets the wallet's balance directly. It does not create a transaction.</p>
    ${formField("Balance (₹)","balance",{type:"number",value:String(wallet.balance),step:"0.01"})}
    <div class="modal-actions"><button class="btn btn-lime" type="submit">Save balance</button></div>
  </form>`, data=>{
    const value=Number(data.get("balance"));
    if(!Number.isFinite(value)){toast("Enter a valid balance.");return false;}
    wallet.balance=value; save(); renderPage(currentPage); toast("Wallet balance updated.");
  });
}

function contributeGoal(id) {
  const goal=db.goals.find(g=>String(g.id)===String(id));
  if(!goal) return;
  const remaining=Math.max(0,goal.target-goal.saved);
  openModal("Add savings",`<form>
    <p class="muted">${escapeHTML(goal.name)} · ${money(remaining)} remaining</p>
    ${formField("Contribution (₹)","amount",{type:"number",min:0.01,step:"0.01"})}
    <div class="modal-actions"><button class="btn btn-lime" type="submit">Add savings</button></div>
  </form>`,data=>{
    const amount=Number(data.get("amount"));
    if(!Number.isFinite(amount)||amount<=0){toast("Enter a valid contribution.");return false;}
    goal.saved+=amount; save(); renderPage(currentPage); toast("Goal progress updated.");
  });
}

$("#pageContent").addEventListener("click", event => {
  const pageButton=event.target.closest("[data-page]");
  if(pageButton){navigate(pageButton.dataset.page);return;}

  const button=event.target.closest("[data-action]");
  if(!button)return;

  const action=button.dataset.action, id=button.dataset.id;

  switch(action) {
    case "add-transaction": addTransaction(); break;
    case "add-wallet": addWallet(); break;
    case "edit-wallet": editWallet(id); break;
    case "delete-wallet":
      if(db.wallets.length<=1){toast("Keep at least one wallet.");break;}
      deleteItem("wallets",id,"wallet"); break;
    case "add-budget": addBudget(); break;
    case "delete-budget": deleteItem("budgets",id,"budget"); break;
    case "add-goal": addGoal(); break;
    case "contribute-goal": contributeGoal(id); break;
    case "delete-goal": deleteItem("goals",id,"goal"); break;
    case "add-loan": addLoan(); break;
    case "pay-emi": payEMI(id); break;
    case "delete-loan": deleteItem("loans",id,"loan"); break;
    case "add-recurring": addRecurring(); break;
    case "delete-recurring": deleteItem("recurring",id,"recurring item"); break;
    case "delete-transaction": {
      const tx=db.transactions.find(t=>String(t.id)===String(id));
      if(!tx)break;
      if(!confirm("Delete this transaction and reverse its wallet balance change?"))break;
      const wallet=db.wallets.find(w=>String(w.id)===String(tx.walletId));
      if(wallet) wallet.balance += tx.type==="income" ? -Number(tx.amount) : Number(tx.amount);
      db.transactions=db.transactions.filter(t=>String(t.id)!==String(id));
      save();renderPage(currentPage);toast("Transaction deleted.");break;
    }
    case "export": exportJSON(); break;
    case "export-csv": exportCSV(); break;
    case "import": importJSON(); break;
    case "reset":
      if(confirm("This permanently clears FINOVA data stored in this browser. Export a backup first. Continue?")){
        db=freshData();save();showScreen("onboarding");$("#userName").value="";$("#userAge").value="";toast("Data cleared.");
      }
      break;
    case "close-modal": closeModal(); break;
    case "choose-receipt": $("#receiptFile").click(); break;
    case "toggle-theme":
      db.settings.light=!db.settings.light;
      document.body.classList.toggle("light-theme",db.settings.light);
      save();renderPage(currentPage);break;
    case "toggle-balance":
      db.settings.hideBalance=!db.settings.hideBalance;
      save();renderPage(currentPage);break;
    case "pro-info":
      openModal("FINOVA Pro",`<p>Pro pricing shown in this demo:</p><div class="panel feature-card"><h3>Monthly</h3><div class="big-number">₹49</div><p>Per month</p><hr><h3>Annual</h3><div class="big-number">₹570</div><p>Per year</p></div>
      <p class="muted">No payment has been taken. To accept real subscriptions, connect a payment provider and configure secure purchase verification before launch.</p>
      <button class="btn btn-lime" type="button" data-action="close-modal">Got it</button>`,null);break;
  }
});

$("#modalRoot").addEventListener("click", event => {
  if(event.target.closest('[data-action="close-modal"]')) closeModal();
});

$("#pageContent").addEventListener("submit", event => {
  if(event.target.id==="settingsForm"){
    event.preventDefault();
    const data=new FormData(event.target);
    const name=String(data.get("name")||"").trim();
    const age=Number(data.get("age"));
    if(!name||!Number.isInteger(age)||age<1||age>120){toast("Enter a valid name and age.");return;}
    db.profile.name=name;db.profile.age=age;
    save();setProfileUI();renderPage(currentPage);toast("Profile saved.");
  }

  if(event.target.id==="receiptForm"){
    event.preventDefault();
    const data=new FormData(event.target);
    const amount=Number(data.get("amount"));
    if(!String(data.get("name")||"").trim()||!Number.isFinite(amount)||amount<=0){toast("Enter a valid description and amount.");return;}
    const wallet=db.wallets[0];
    wallet.balance-=amount;
    db.transactions.push({
      id:nextId(),name:String(data.get("name")).trim(),
      type:"expense",amount,category:data.get("category"),
      wallet:wallet.name,walletId:wallet.id,date:data.get("date")||dateString()
    });
    save();receiptData="";renderPage("receipts");toast("Expense saved and wallet balance updated.");
  }
});

$("#receiptFile").addEventListener("change", event => {
  const file=event.target.files?.[0];
  if(!file)return;
  if(!file.type.startsWith("image/")){toast("Choose an image file.");return;}
  if(file.size>5*1024*1024){toast("Choose an image smaller than 5 MB.");return;}
  const reader=new FileReader();
  reader.onload=()=>{
    receiptData=reader.result;
    const preview=$("#receiptPreview");
    if(preview){preview.src=receiptData;preview.classList.remove("hidden");}
    toast("Receipt image loaded. Enter its details below.");
  };
  reader.onerror=()=>toast("Could not read that image.");
  reader.readAsDataURL(file);
  event.target.value="";
});

$("#pageContent").addEventListener("dragover",event=>{
  if(event.target.closest("#receiptDrop"))event.preventDefault();
});
$("#pageContent").addEventListener("drop",event=>{
  if(!event.target.closest("#receiptDrop"))return;
  event.preventDefault();
  const file=event.dataTransfer.files?.[0];
  if(!file)return;
  if(!file.type.startsWith("image/")||file.size>5*1024*1024){toast("Choose an image under 5 MB.");return;}
  const reader=new FileReader();
  reader.onload=()=>{receiptData=reader.result;renderPage("receipts");toast("Image loaded. Enter receipt details manually.");};
  reader.readAsDataURL(file);
});

let resizeTimer;
window.addEventListener("resize",()=>{
  clearTimeout(resizeTimer);
  resizeTimer=setTimeout(()=>{
    if(currentPage==="dashboard")drawChart("moneyChart");
    if(currentPage==="analytics")drawChart("analyticsChart");
  },100);
});

if(db.settings.light)document.body.classList.add("light-theme");
startApp();
