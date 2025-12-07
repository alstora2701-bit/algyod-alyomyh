// نظام محاسبي تفاعلي — app.js
// متطلبات: يعمل محلياً في المتصفح، يعتمد على localStorage للحفظ.
// واجهة: يعرض حسابات، يقيد دفاتر، يرحل، ينتج تقارير أساسية، ويدير مخزون واهلاك.

(() => {
  // --- Data Model & Persistence ---
  const STORAGE_KEY = 'acct_sys_v1';

  const defaultData = {
    accounts: [
      // كل حساب: id, name, type, balance (حساب جاري)
      { id: '1000', name: 'الصندوق', type: 'asset', normal: 'debit' },
      { id: '1100', name: 'المخزون', type: 'asset', normal: 'debit' },
      { id: '2000', name: 'الموردون', type: 'liability', normal: 'credit' },
      { id: '3000', name: 'رأس المال', type: 'equity', normal: 'credit' },
      { id: '4000', name: 'المبيعات', type: 'revenue', normal: 'credit' },
      { id: '5000', name: 'المشتريات', type: 'expense', normal: 'debit' },
      { id: '5100', name: 'تكلفة البضاعة المباعة', type: 'expense', normal: 'debit' },
      { id: '1600', name: 'الإهلاك المتراكم', type: 'contra_asset', normal: 'credit' },
      { id: '6100', name: 'مصاريف إهلاك', type: 'expense', normal: 'debit' }
    ],
    journals: [], // قائمة القيود: {id, date, ref, lines: [{accountId, dr, cr, memo}], posted:true}
    inventory: [], // بنود مخزون (لـ perpetual): [{id,name, layers:[{qty,cost,date,sourceTx}]}]
    settings: { inventoryMethod: 'FIFO' }
  };

  // Load/Save
  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultData));
        return JSON.parse(JSON.stringify(defaultData));
      }
      return JSON.parse(raw);
    } catch (e) {
      console.error('load error', e);
      return JSON.parse(JSON.stringify(defaultData));
    }
  }
  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  }

  const state = {
    data: loadData(),
    charts: {},
  };

  // --- Utilities ---
  function uid(prefix='id') { return prefix + '_' + Math.random().toString(36).slice(2,9); }
  function fmt(n) { return Number(n).toLocaleString('ar-EG'); }
  function sum(arr){ return arr.reduce((s,x)=>s+(Number(x)||0),0); }

  // --- Account Management ---
  function findAccountById(id){ return state.data.accounts.find(a=>a.id===id); }
  function ensureAccountOptions() {
    const sel = document.getElementById('ledger-account-select');
    const lists = document.getElementById('accounts-list');
    const admin = document.getElementById('accounts-admin');
    if (sel) {
      sel.innerHTML = state.data.accounts.map(a=>`<option value="${a.id}">${a.id} - ${a.name}</option>`).join('');
    }
    if (lists) {
      lists.innerHTML = state.data.accounts.slice(0,10).map(a=>`<div class="p-2 border rounded">${a.id} — ${a.name} <div class="text-xs text-gray-500">${a.type}</div></div>`).join('');
    }
    if (admin) {
      admin.innerHTML = state.data.accounts.map(a=>`<div class="flex justify-between items-center gap-3 p-2 border-b"><div>${a.id} — ${a.name} (${a.type})</div><div class="text-xs text-gray-500">عنصر</div></div>`).join('');
    }
  }

  function createAccountFromUI(){
    const name = document.getElementById('new-acc-name').value.trim();
    const type = document.getElementById('new-acc-type').value;
    if(!name){ alert('أدخل اسم الحساب'); return; }
    // generate id simple:
    const last = state.data.accounts[state.data.accounts.length-1];
    const next = (parseInt(last.id) + 10).toString();
    state.data.accounts.push({ id: next, name, type, normal: (type==='liability'||type==='equity'||type==='revenue' ? 'credit' : 'debit') });
    saveData(); ensureAccountOptions(); document.getElementById('new-acc-name').value='';
    renderDashboard();
  }

  // --- Journal UI & Logic ---
  function addJournalRow(pref={accountId:'', dr:'', cr:'', memo:''}) {
    const container = document.getElementById('journal-rows-container');
    const idx = container.children.length;
    const rowId = uid('jr');
    const accOptions = state.data.accounts.map(a=>`<option value="${a.id}">${a.id} - ${a.name}</option>`).join('');
    const row = document.createElement('div');
    row.className = 'grid grid-cols-12 gap-2 items-center';
    row.id = rowId;
    row.innerHTML = `
      <div class="col-span-5">
        <select class="w-full border rounded px-2 py-2 rtl-input" data-role="account">${accOptions}</select>
      </div>
      <div class="col-span-2">
        <input type="number" min="0" step="0.01" class="w-full border rounded px-2 py-2" placeholder="مدين" data-role="dr" />
      </div>
      <div class="col-span-2">
        <input type="number" min="0" step="0.01" class="w-full border rounded px-2 py-2" placeholder="دائن" data-role="cr" />
      </div>
      <div class="col-span-2">
        <input type="text" class="w-full border rounded px-2 py-2 rtl-input" placeholder="البيان" data-role="memo" />
      </div>
      <div class="col-span-1 text-left">
        <button type="button" class="text-red-500" onclick="this.closest('.grid').remove(); updateJournalTotals();">حذف</button>
      </div>
    `;
    container.appendChild(row);
    // fill pref
    if(pref.accountId) row.querySelector('[data-role="account"]').value = pref.accountId;
    if(pref.dr) row.querySelector('[data-role="dr"]').value = pref.dr;
    if(pref.cr) row.querySelector('[data-role="cr"]').value = pref.cr;
    if(pref.memo) row.querySelector('[data-role="memo"]').value = pref.memo;
    // events
    row.querySelectorAll('[data-role="dr"], [data-role="cr"]').forEach(el=>el.addEventListener('input', updateJournalTotals));
    row.querySelector('[data-role="account"]').addEventListener('change', updateJournalTotals);
    updateJournalTotals();
  }

  function updateJournalTotals() {
    const rows = Array.from(document.querySelectorAll('#journal-rows-container > .grid'));
    let totalDr = 0, totalCr = 0;
    rows.forEach(r=>{
      const dr = Number(r.querySelector('[data-role="dr"]').value) || 0;
      const cr = Number(r.querySelector('[data-role="cr"]').value) || 0;
      totalDr += dr; totalCr += cr;
    });
    document.getElementById('journal-total-status').innerText = `المدين: ${fmt(totalDr)} — الدائن: ${fmt(totalCr)}`;
    return { totalDr, totalCr };
  }

  function autoFillSample() {
    // مثال: استلام إيداع رأسمالي
    document.getElementById('journal-rows-container').innerHTML = '';
    addJournalRow({ accountId: '1000', dr: 5000, cr: '', memo: 'إيداع نقدي' });
    addJournalRow({ accountId: '3000', dr: '', cr: 5000, memo: 'زيادة رأس المال' });
    document.getElementById('journal-date').value = new Date().toISOString().slice(0,10);
    updateJournalTotals();
  }

  function saveJournal(e) {
    e.preventDefault();
    const date = document.getElementById('journal-date').value;
    if(!date){ alert('حدد تاريخ القيد'); return; }
    const ref = document.getElementById('journal-ref').value;
    const rows = Array.from(document.querySelectorAll('#journal-rows-container > .grid')).map(r=>{
      return {
        accountId: r.querySelector('[data-role="account"]').value,
        dr: Number(r.querySelector('[data-role="dr"]').value) || 0,
        cr: Number(r.querySelector('[data-role="cr"]').value) || 0,
        memo: r.querySelector('[data-role="memo"]').value || ''
      };
    }).filter(r=> r.dr||r.cr);
    if(rows.length===0){ alert('أدخل سطور قيود'); return; }
    const totalDr = sum(rows.map(r=>r.dr));
    const totalCr = sum(rows.map(r=>r.cr));
    if(totalDr !== totalCr){ alert('القيد غير متوازن — تأكد أن مجموع المدين = مجموع الدائن'); return; }

    const journal = { id: uid('tx'), date, ref, lines: rows, posted: true };
    state.data.journals.unshift(journal); // أحدث أولاً
    // ترحيل فوري: تحديث أرصدة الحسابات، وتحديث المخزون/COGS/اهلاك إن لزم
    postJournal(journal);
    saveData();
    renderJournalsList();
    clearJournalForm();
    renderDashboard();
    alert('تم حفظ القيد ورحلته');
  }

  function clearJournalForm() {
    document.getElementById('journal-ref').value='';
    document.getElementById('journal-rows-container').innerHTML='';
    addJournalRow();
    updateJournalTotals();
  }

  // --- Posting & Ledger logic ---
  function postJournal(journal) {
    // Update account balances (simple aggregated approach)
    journal.lines.forEach(line=>{
      const acc = findAccountById(line.accountId);
      if(!acc) { console.warn('مفقود حساب', line.accountId); return; }
      // We'll keep balances computed on the fly (not stored), but to allow ledger entries we store posting in account-level tx history:
      acc.history = acc.history || [];
      acc.history.push({ txId: journal.id, date: journal.date, dr: line.dr, cr: line.cr, memo: line.memo });
      // Special handling:
      // Inventory/perpetual: if transaction affects "المشتريات" أو "المبيعات" and uses inventory accounts, update layers
      // Implement simple heuristics:
      if(acc.name === 'المشتريات') {
        // treat as inventory incoming when there's an inventory asset affected in same journal
        const invLine = journal.lines.find(l => findAccountById(l.accountId)?.name === 'المخزون');
        if(invLine) {
          // add inventory layer
          const invItem = state.data.inventory[0] || createInventoryItem('بضاعة عامة');
          invItem.layers.push({ qty: invLine.dr, cost: invLine.dr / (invLine.qty || 1) || 0, date: journal.date, sourceTx: journal.id });
        }
      }
      // If sale: when cash/dr is صندوق and credit to المبيعات and reduce inventory
      if(acc.name === 'المبيعات' && line.cr > 0) {
        // try to find matching inventory decrease line in same journal (هناك سطور تشير إلى تكاليف)
        // If COGS line exists, reduce inventory:
        const cogsLine = journal.lines.find(l => findAccountById(l.accountId)?.name === 'تكلفة البضاعة المباعة' && l.dr>0);
        if(cogsLine) {
          reduceInventory(cogsLine.dr);
        }
      }
    });
  }

  // --- Inventory (Perpetual FIFO) ---
  function createInventoryItem(name){
    const item = { id: uid('inv'), name, layers: [] };
    state.data.inventory.push(item);
    saveData();
    return item;
  }
  function addInventoryLayer(){
    const name = document.getElementById('inv-item-name').value.trim() || 'بضاعة عامة';
    const qty = Number(document.getElementById('inv-qty').value) || 0;
    const cost = Number(document.getElementById('inv-cost').value) || 0;
    if(qty <= 0 || cost <= 0) { alert('ادخل كمية وتكلفة صحيحة'); return; }
    const item = createInventoryItem(name);
    item.layers.push({ qty, cost, date: new Date().toISOString().slice(0,10), sourceTx: 'manual' });
    saveData();
    alert('تمت إضافة المخزون');
  }

  function reduceInventory(amountNeeded) {
    // FIFO across items (simplified): consume from first item's layers until amount fulfilled.
    let remaining = amountNeeded;
    for(const item of state.data.inventory) {
      for(const layer of item.layers) {
        if(remaining <= 0) break;
        if(layer.qty <= 0) continue;
        const take = Math.min(layer.qty, remaining);
        layer.qty -= take;
        remaining -= take;
      }
      // remove zero layers
      item.layers = item.layers.filter(l => l.qty > 0);
      if(remaining <= 0) break;
    }
    if(remaining > 0) console.warn('لم يكفِ المخزون لتغطية COGS بمقدار', remaining);
    saveData();
  }

  // --- Reports: Trial Balance / Income Statement / Balance Sheet ---
  function computeAccountBalances() {
    // compute current balance for each account by summing history
    const result = state.data.accounts.map(acc => {
      const hist = acc.history || [];
      const debit = sum(hist.map(h => h.dr || 0));
      const credit = sum(hist.map(h => h.cr || 0));
      const balance = (acc.normal === 'debit') ? (debit - credit) : (credit - debit);
      return { ...acc, debit, credit, balance };
    });
    return result;
  }

  function renderTrialBalance() {
    const out = document.getElementById('reports-output');
    const balances = computeAccountBalances();
    let table = `<h3 class="font-bold mb-2">ميزان المراجعة</h3><table class="w-full text-sm border-collapse">`;
    table += `<tr class="bg-gray-100"><th class="p-2">الحساب</th><th class="p-2">مدين</th><th class="p-2">دائن</th></tr>`;
    let totalDr = 0, totalCr = 0;
    balances.forEach(b=>{
      const dr = b.debit; const cr = b.credit;
      totalDr += dr; totalCr += cr;
      table += `<tr><td class="p-2">${b.id} — ${b.name}</td><td class="p-2">${dr?fmt(dr):''}</td><td class="p-2">${cr?fmt(cr):''}</td></tr>`;
    });
    table += `<tr class="font-bold"><td class="p-2">الإجمالي</td><td class="p-2">${fmt(totalDr)}</td><td class="p-2">${fmt(totalCr)}</td></tr>`;
    table += `</table>`;
    out.innerHTML = table;
  }

  function renderIncomeStatement() {
    const out = document.getElementById('reports-output');
    const balances = computeAccountBalances();
    const revenue = balances.filter(b=>b.type==='revenue').reduce((s,b)=>s + (b.credit - b.debit),0);
    const expenses = balances.filter(b=>b.type==='expense' || b.type==='contra_expense').reduce((s,b)=>s + (b.debit - b.credit),0);
    const netProfit = revenue - expenses;
    let html = `<h3 class="font-bold mb-2">قائمة الدخل</h3>`;
    html += `<div>الإيرادات: ${fmt(revenue)}</div>`;
    html += `<div>المصروفات: ${fmt(expenses)}</div>`;
    html += `<div class="font-bold mt-2">صافي الربح/الخسارة: ${fmt(netProfit)}</div>`;
    out.innerHTML = html;
  }

  function renderBalanceSheet() {
    const out = document.getElementById('reports-output');
    const balances = computeAccountBalances();
    const assets = balances.filter(b=>b.type==='asset').reduce((s,b)=>s + (b.balance || 0),0);
    const liabilities = balances.filter(b=>b.type==='liability').reduce((s,b)=>s + (b.balance || 0),0);
    const equity = balances.filter(b=>b.type==='equity').reduce((s,b)=>s + (b.balance || 0),0);
    let html = `<h3 class="font-bold mb-2">قائمة المركز المالي (ميزانية)</h3>`;
    html += `<div>الأصول: ${fmt(assets)}</div>`;
    html += `<div>الخصوم: ${fmt(liabilities)}</div>`;
    html += `<div>حقوق الملكية: ${fmt(equity)}</div>`;
    html += `<div class="font-bold mt-2">مجموع الخصوم + حقوق الملكية: ${fmt(liabilities + equity)}</div>`;
    html += `<div class="text-sm text-gray-500 mt-2">ملاحظة: الأرقام مستمدة من أرصدة الحسابات المسجلة.</div>`;
    out.innerHTML = html;
  }

  // --- Ledger Rendering ---
  function renderLedger(){
    const sel = document.getElementById('ledger-account-select');
    const accId = sel.value;
    const acc = findAccountById(accId);
    const out = document.getElementById('ledger-entries');
    if(!acc){ out.innerHTML = 'اختر حساباً'; return; }
    const hist = acc.history || [];
    let html = `<h3 class="font-bold mb-2">${acc.id} — ${acc.name}</h3>`;
    html += `<table class="w-full text-sm"><tr class="bg-gray-100"><th class="p-2">التاريخ</th><th class="p-2">البيان</th><th class="p-2">مدين</th><th class="p-2">دائن</th><th class="p-2">الرصيد</th></tr>`;
    let running = 0;
    hist.forEach(h=>{
      running += (acc.normal==='debit') ? (h.dr - h.cr) : (h.cr - h.dr) * -1;
      // For simplicity: calculate running by summing dr-cr with sign
      html += `<tr><td class="p-2">${h.date}</td><td class="p-2">${h.memo || h.txId}</td><td class="p-2">${h.dr?fmt(h.dr):''}</td><td class="p-2">${h.cr?fmt(h.cr):''}</td><td class="p-2">${fmt(running)}</td></tr>`;
    });
    html += `</table>`;
    out.innerHTML = html;
  }

  // --- Journals list render ---
  function renderJournalsList() {
    const el = document.getElementById('journals-list');
    if(!el) return;
    if(state.data.journals.length===0) { el.innerHTML = '<div class="text-gray-500">لا قيود مسجلة بعد</div>'; return; }
    el.innerHTML = state.data.journals.slice(0,20).map(j=>{
      return `<div class="border-b py-2">
        <div class="flex justify-between items-center">
          <div><strong>${j.date}</strong> — ${j.ref || ''}</div>
          <div class="text-xs text-gray-500">${j.id}</div>
        </div>
        <div class="mt-1 text-xs">
          ${j.lines.map(l=>`<div>${findAccountById(l.accountId)?.name || l.accountId} — ${l.dr?fmt(l.dr):''} / ${l.cr?fmt(l.cr):''} <span class="text-gray-400">(${l.memo})</span></div>`).join('')}
        </div>
      </div>`;
    }).join('');
  }

  // --- Dashboard & Charts ---
  function renderDashboard(){
    // sums
    const balances = computeAccountBalances();
    const assets = balances.filter(b=>b.type==='asset').reduce((s,b)=>s + (b.balance || 0),0);
    const liabilities = balances.filter(b=>b.type==='liability').reduce((s,b)=>s + (b.balance || 0),0);
    const equity = balances.filter(b=>b.type==='equity').reduce((s,b)=>s + (b.balance || 0),0);
    document.getElementById('sum-assets').innerText = fmt(assets);
    document.getElementById('sum-liab').innerText = fmt(liabilities);
    document.getElementById('sum-equity').innerText = fmt(equity);

    // accounts list already updated
    ensureAccountOptions();

    // update chart
    const ctx = document.getElementById('dashboardChart').getContext('2d');
    if(state.charts.dashboard) {
      state.charts.dashboard.data.datasets[0].data = [assets, liabilities, equity];
      state.charts.dashboard.update();
    } else {
      state.charts.dashboard = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: ['الأصول','الخصوم','حقوق الملكية'], datasets:[{ data:[assets,liabilities,equity], backgroundColor:['#60a5fa','#ef4444','#10b981'] }] },
        options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}} }
      });
    }
  }

  // --- Import/Export & Utilities ---
  function exportData() {
    const dataStr = JSON.stringify(state.data, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'acct-data.json'; a.click();
    URL.revokeObjectURL(url);
  }

  function importDataPrompt(){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
      const f = e.target.files[0];
      if(!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try{
          const imported = JSON.parse(reader.result);
          state.data = imported;
          saveData();
          initUI();
          alert('تم استيراد البيانات');
        } catch(err){ alert('خطأ في الملف'); console.error(err); }
      };
      reader.readAsText(f);
    };
    input.click();
  }

  function clearAll(){
    if(!confirm('سيتم حذف جميع البيانات المحفوظة محلياً. هل أنت متأكد؟')) return;
    localStorage.removeItem(STORAGE_KEY);
    state.data = loadData();
    initUI();
    alert('تم مسح البيانات وإعادة الإعداد الافتراضي');
  }

  // --- Tabs & Initialization ---
  function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(t=> t.classList.add('hidden'));
    const el = document.getElementById('tab-'+tab);
    if(el) el.classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(n=> n.classList.remove('active'));
    const nav = document.getElementById('nav-'+tab);
    if(nav) nav.classList.add('active');
    // render dynamic content on show
    if(tab==='reports') document.getElementById('reports-output').innerHTML = '<div class="text-gray-500">اختر تقريراً</div>';
    if(tab==='ledger') renderLedger();
  }
  window.switchTab = switchTab;

  // Expose some functions to window for HTML onclick
  window.addJournalRow = addJournalRow;
  window.autoFillSample = autoFillSample;
  window.saveJournal = saveJournal;
  window.renderTrialBalance = renderTrialBalance;
  window.renderIncomeStatement = renderIncomeStatement;
  window.renderBalanceSheet = renderBalanceSheet;
  window.openNewJournalModal = () => { switchTab('journal'); window.scrollTo({top:0,behavior:'smooth'}); };
  window.createAccountFromUI = createAccountFromUI;
  window.addInventoryLayer = addInventoryLayer;
  window.exportData = exportData;
  window.importDataPrompt = importDataPrompt;
  window.clearAll = clearAll;

  // --- Initial render & helpers ---
  function initJournalForm() {
    document.getElementById('journal-rows-container').innerHTML = '';
    addJournalRow();
    document.getElementById('journal-date').value = new Date().toISOString().slice(0,10);
  }

  function initUI() {
    ensureAccountOptions();
    initJournalForm();
    renderJournalsList();
    renderDashboard();
  }

  // On load
  document.addEventListener('DOMContentLoaded', () => {
    // render nav default
    initUI();
    // build dashboard chart container height
    const chartCanvas = document.getElementById('dashboardChart');
    chartCanvas.parentElement.style.height = '260px';
  });

})();
