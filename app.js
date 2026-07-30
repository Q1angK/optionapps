/* ==========================================================================
   SpreadPulse - Application Logic & Database Engine (app.js)
   ========================================================================== */

const SpreadApp = (() => {
  // Application State
  let state = {
    account: 'main',
    activeTab: 'active',
    totalCapital: 25000,
    gscriptUrl: '',
    trades: [],
    filterType: 'ALL',
    searchTicker: ''
  };

  const DB_NAME = 'SpreadPulseDB';
  const DB_VERSION = 1;
  let db = null;

  // Initialize App
  async function init() {
    await initIndexedDB();
    loadSettings();
    await loadTrades();

    // If initial load and empty, populate sample trades for demo
    if (state.trades.length === 0) {
      await seedSampleTrades();
    }

    render();
    calcPositionSizing();
    calcStressTest(2);
    
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // ==========================================================================
  // IndexedDB Persistence
  // ==========================================================================
  function initIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const dbInstance = e.target.result;
        if (!dbInstance.objectStoreNames.contains('trades')) {
          dbInstance.createObjectStore('trades', { keyPath: 'id' });
        }
      };

      request.onsuccess = (e) => {
        db = e.target.result;
        resolve();
      };

      request.onerror = (e) => {
        console.warn('IndexedDB failed, falling back to localStorage', e);
        resolve();
      };
    });
  }

  async function loadTrades() {
    if (db) {
      return new Promise((resolve) => {
        const tx = db.transaction('trades', 'readonly');
        const store = tx.objectStore('trades');
        const req = store.getAll();
        req.onsuccess = () => {
          state.trades = req.result || [];
          resolve();
        };
        req.onerror = () => {
          fallbackLoadLocalStorage();
          resolve();
        };
      });
    } else {
      fallbackLoadLocalStorage();
    }
  }

  async function saveTradeToDb(trade) {
    if (db) {
      return new Promise((resolve) => {
        const tx = db.transaction('trades', 'readwrite');
        const store = tx.objectStore('trades');
        store.put(trade);
        tx.oncomplete = () => resolve();
      });
    } else {
      fallbackSaveLocalStorage();
    }
  }

  async function deleteTradeFromDb(id) {
    if (db) {
      return new Promise((resolve) => {
        const tx = db.transaction('trades', 'readwrite');
        const store = tx.objectStore('trades');
        store.delete(id);
        tx.oncomplete = () => resolve();
      });
    } else {
      fallbackSaveLocalStorage();
    }
  }

  function fallbackLoadLocalStorage() {
    const data = localStorage.getItem('spreadpulse_trades');
    if (data) {
      try { state.trades = JSON.parse(data); } catch(e) { state.trades = []; }
    }
  }

  function fallbackSaveLocalStorage() {
    localStorage.setItem('spreadpulse_trades', JSON.stringify(state.trades));
  }

  function loadSettings() {
    const cap = localStorage.getItem('spreadpulse_capital');
    if (cap) state.totalCapital = parseFloat(cap);
    const url = localStorage.getItem('spreadpulse_gscript');
    if (url) state.gscriptUrl = url;

    // Prefill saved IBKR credentials if available
    const savedToken = localStorage.getItem('ibkr_token');
    const savedQueryId = localStorage.getItem('ibkr_query_id');
    if (savedToken && document.getElementById('ibkrToken')) document.getElementById('ibkrToken').value = savedToken;
    if (savedQueryId && document.getElementById('ibkrQueryId')) document.getElementById('ibkrQueryId').value = savedQueryId;

    document.getElementById('settingTotalCap').value = state.totalCapital;
    document.getElementById('settingGscriptUrl').value = state.gscriptUrl;
  }

  function saveSettings() {
    const cap = parseFloat(document.getElementById('settingTotalCap').value) || 25000;
    const url = document.getElementById('settingGscriptUrl').value.trim();

    state.totalCapital = cap;
    state.gscriptUrl = url;

    localStorage.setItem('spreadpulse_capital', cap);
    localStorage.setItem('spreadpulse_gscript', url);

    render();
    closeModal('settingsModal');
  }

  // ==========================================================================
  // Sample Data Populator
  // ==========================================================================
  async function seedSampleTrades() {
    const sampleTrades = [
      {
        id: 'trade_sample_1',
        account: 'main',
        ticker: 'SPY',
        strategy: 'PCS',
        width: '5',
        shortStrike: 500,
        longStrike: 495,
        contracts: 3,
        credit: 1.20,
        openDate: getPastDateStr(14),
        expDate: getFutureDateStr(10),
        status: 'OPEN',
        collateral: 1140,
        exitTargetPrice: 0.24
      },
      {
        id: 'trade_sample_2',
        account: 'main',
        ticker: 'QQQ',
        strategy: 'PCS',
        width: '10',
        shortStrike: 470,
        longStrike: 460,
        contracts: 2,
        credit: 2.40,
        openDate: getPastDateStr(25),
        expDate: getPastDateStr(2),
        closeDate: getPastDateStr(2),
        status: 'CLOSED',
        exitPrice: 0.48,
        exitReason: 'BUYBACK_80_PERCENT',
        realizedPnL: 384.00,
        collateral: 1520,
        roc: 25.26
      },
      {
        id: 'trade_sample_3',
        account: 'main',
        ticker: 'NVDA',
        strategy: 'CSP',
        width: 'custom',
        shortStrike: 110,
        longStrike: 0,
        contracts: 1,
        credit: 2.10,
        openDate: getPastDateStr(30),
        expDate: getPastDateStr(5),
        closeDate: getPastDateStr(5),
        status: 'CLOSED',
        exitPrice: 0.00,
        exitReason: 'EXPIRED_MAX_PROFIT',
        realizedPnL: 210.00,
        collateral: 10790,
        roc: 1.95
      },
      {
        id: 'trade_sample_4',
        account: 'main',
        ticker: 'AAPL',
        strategy: 'CCS',
        width: '5',
        shortStrike: 235,
        longStrike: 240,
        contracts: 2,
        credit: 1.10,
        openDate: getPastDateStr(8),
        expDate: getFutureDateStr(18),
        status: 'OPEN',
        collateral: 780,
        exitTargetPrice: 0.22
      }
    ];

    for (let t of sampleTrades) {
      await saveTradeToDb(t);
    }
    state.trades = sampleTrades;
  }

  function getPastDateStr(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
  }

  function getFutureDateStr(daysAhead) {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString().split('T')[0];
  }

  // ==========================================================================
  // Calculations Engine
  // ==========================================================================
  function calcTradeMetrics(strategy, width, shortStrike, longStrike, credit, contracts) {
    credit = parseFloat(credit) || 0;
    contracts = parseInt(contracts) || 1;
    shortStrike = parseFloat(shortStrike) || 0;
    longStrike = parseFloat(longStrike) || 0;

    let widthVal = 5;
    if (width === '10') widthVal = 10;
    else if (width === 'custom' && Math.abs(shortStrike - longStrike) > 0) {
      widthVal = Math.abs(shortStrike - longStrike);
    }

    const maxProfit = credit * 100 * contracts;
    let collateralPerContract = 0;

    if (strategy === 'CSP') {
      collateralPerContract = (shortStrike * 100) - (credit * 100);
    } else {
      collateralPerContract = (widthVal * 100) - (credit * 100);
    }

    const totalCollateral = Math.max(0, collateralPerContract * contracts);
    const exitTargetPrice = (credit * 0.20).toFixed(2);

    return { maxProfit, totalCollateral, exitTargetPrice, widthVal };
  }

  function calcDte(expDateStr) {
    if (!expDateStr) return 0;
    const expDate = new Date(expDateStr);
    const today = new Date();
    today.setHours(0,0,0,0);
    const diffTime = expDate - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // ==========================================================================
  // Render Engine
  // ==========================================================================
  function render() {
    const filteredTrades = state.trades.filter(t => {
      if (t.account !== state.account) return false;
      if (state.filterType !== 'ALL') {
        if (state.filterType === 'PCS' && t.strategy !== 'PCS') return false;
        if (state.filterType === 'CCS' && t.strategy !== 'CCS') return false;
        if (state.filterType === 'CSP' && t.strategy !== 'CSP') return false;
      }
      if (state.searchTicker && !t.ticker.toLowerCase().includes(state.searchTicker.toLowerCase())) {
        return false;
      }
      return true;
    });

    const activeTrades = filteredTrades.filter(t => t.status === 'OPEN');
    const closedTrades = filteredTrades.filter(t => t.status === 'CLOSED');

    document.getElementById('countActive').innerText = activeTrades.length;
    document.getElementById('countClosed').innerText = closedTrades.length;

    renderActiveTable(activeTrades);
    renderClosedTable(closedTrades);
    renderMetrics(activeTrades, closedTrades);
    renderAnalytics(closedTrades);
    renderAiCoach(closedTrades);

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function renderMetrics(activeTrades, closedTrades) {
    let totalRealizedPnL = 0;
    let totalClosedCollateral = 0;
    let winsCount = 0;
    let lossesCount = 0;
    let targetHitsCount = 0;
    let currentStreak = 0;

    closedTrades.sort((a,b) => new Date(a.closeDate) - new Date(b.closeDate));

    closedTrades.forEach(t => {
      const pnl = t.realizedPnL || 0;
      totalRealizedPnL += pnl;
      totalClosedCollateral += (t.collateral || 1);

      if (pnl >= 0) {
        winsCount++;
        currentStreak++;
        if (t.exitReason === 'BUYBACK_80_PERCENT') {
          targetHitsCount++;
        }
      } else {
        lossesCount++;
        currentStreak = 0;
      }
    });

    const totalClosed = closedTrades.length;
    const winRate = totalClosed > 0 ? ((winsCount / totalClosed) * 100).toFixed(1) : '0.0';
    const totalRoc = totalClosedCollateral > 0 ? ((totalRealizedPnL / totalClosedCollateral) * 100).toFixed(1) : '0.0';
    const targetEfficiency = winsCount > 0 ? ((targetHitsCount / winsCount) * 100).toFixed(1) : '0.0';

    let activeCapital = 0;
    activeTrades.forEach(t => {
      activeCapital += (t.collateral || 0);
    });

    const capLimit = state.totalCapital;
    const capUsagePct = Math.min(100, Math.round((activeCapital / capLimit) * 100));

    const elPnl = document.getElementById('valNetPnL');
    elPnl.innerText = `$${totalRealizedPnL.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    elPnl.className = `card-value ${totalRealizedPnL >= 0 ? 'positive' : 'negative'}`;

    document.getElementById('badgePnlRoc').innerText = `${totalRealizedPnL >= 0 ? '+' : ''}${totalRoc}% ROC`;
    document.getElementById('valTotalTrades').innerText = `${totalClosed} Trades Closed`;

    document.getElementById('valWinRate').innerText = `${winRate}%`;
    document.getElementById('valWinLossCount').innerText = `${winsCount} Wins / ${lossesCount} Losses`;
    document.getElementById('valWinStreak').innerHTML = `<i data-lucide="flame"></i> ${currentStreak} Streak`;

    document.getElementById('valActiveCapital').innerText = `$${activeCapital.toLocaleString()}`;
    document.getElementById('barCapUsage').style.width = `${capUsagePct}%`;
    document.getElementById('valCapUsagePct').innerText = `${capUsagePct}% Cap Used`;
    document.getElementById('valCapLimit').innerText = `of $${capLimit.toLocaleString()} Account Cap`;

    document.getElementById('valTargetEfficiency').innerText = `${targetEfficiency}%`;
    document.getElementById('valTargetHits').innerText = `${targetHitsCount} of ${winsCount} Wins @ 80% Exit`;
  }

  function renderActiveTable(activeTrades) {
    const tbody = document.getElementById('tbodyActive');
    const emptyState = document.getElementById('emptyActive');
    tbody.innerHTML = '';

    if (activeTrades.length === 0) {
      emptyState.style.display = 'block';
      return;
    }
    emptyState.style.display = 'none';

    activeTrades.forEach(t => {
      const dte = calcDte(t.expDate);
      let dteClass = 'dte-safe';
      if (dte <= 7) dteClass = 'dte-alert';
      else if (dte <= 21) dteClass = 'dte-warn';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${t.ticker}</strong></td>
        <td><span class="strat-pill strat-${t.strategy.toLowerCase()}">${t.strategy}</span></td>
        <td>$${t.shortStrike} ${t.strategy !== 'CSP' ? '/ $' + t.longStrike + ' ($' + t.width + ')' : '(CSP)'}</td>
        <td>${t.contracts}</td>
        <td class="positive">$${t.credit.toFixed(2)}</td>
        <td class="negative">$${t.collateral.toLocaleString()}</td>
        <td><strong class="highlight">$${parseFloat(t.exitTargetPrice).toFixed(2)}</strong></td>
        <td><span class="dte-badge ${dteClass}">${dte} DTE</span> <span style="font-size:11px;color:var(--text-subtle);">(${t.expDate})</span></td>
        <td>
          <div class="action-btn-group">
            <button class="btn-action btn-target" onclick="SpreadApp.openCloseModal('${t.id}', 0.80)" title="Close at 80% Max Profit Target">
              🎯 80% Target
            </button>
            <button class="btn-action btn-expire" onclick="SpreadApp.openCloseModal('${t.id}', 1.00)" title="Expire 100% Max Profit">
              ⌛ Expire
            </button>
            <button class="btn-icon" onclick="SpreadApp.openCloseModal('${t.id}', 'custom')" title="Custom Exit">
              <i data-lucide="edit-3"></i>
            </button>
            <button class="btn-icon" onclick="SpreadApp.deleteTrade('${t.id}')" title="Delete Trade">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderClosedTable(closedTrades) {
    const tbody = document.getElementById('tbodyClosed');
    const emptyState = document.getElementById('emptyClosed');
    tbody.innerHTML = '';

    if (closedTrades.length === 0) {
      emptyState.style.display = 'block';
      return;
    }
    emptyState.style.display = 'none';

    closedTrades.forEach(t => {
      const pnl = t.realizedPnL || 0;
      const daysHeld = t.closeDate && t.openDate ? Math.max(1, Math.ceil((new Date(t.closeDate) - new Date(t.openDate)) / (1000*60*60*24))) : 1;
      const roc = t.roc ? t.roc : ((pnl / (t.collateral || 1)) * 100).toFixed(1);

      let tagLabel = '🎯 80% Target Hit';
      if (t.exitReason === 'EXPIRED_MAX_PROFIT') tagLabel = '⌛ Expired OTM';
      else if (t.exitReason === 'ASSIGNED') tagLabel = '📌 Assigned Stock';
      else if (t.exitReason === 'STOPPED_OUT') tagLabel = '🛑 Stopped Out';
      else if (t.exitReason === 'MANUAL_CLOSE') tagLabel = '✋ Manual Close';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${t.closeDate || '-'}</td>
        <td><strong>${t.ticker}</strong></td>
        <td><span class="strat-pill strat-${t.strategy.toLowerCase()}">${t.strategy}</span></td>
        <td>$${t.credit.toFixed(2)}</td>
        <td>$${parseFloat(t.exitPrice).toFixed(2)}</td>
        <td class="${pnl >= 0 ? 'positive' : 'negative'}"><strong>${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</strong></td>
        <td class="${roc >= 0 ? 'positive' : 'negative'}">${roc}%</td>
        <td><span class="badge ${pnl >= 0 ? 'badge-success' : 'badge-danger'}">${tagLabel}</span></td>
        <td>${daysHeld} Days</td>
        <td>
          <button class="btn-icon" onclick="SpreadApp.deleteTrade('${t.id}')" title="Delete Log">
            <i data-lucide="trash-2"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderAnalytics(closedTrades) {
    const tbody = document.getElementById('tbodyMatrix');
    tbody.innerHTML = '';

    const strategies = ['PCS', 'CCS', 'CSP'];
    let totalRulePnL = 0;
    let totalHoldEstPnL = 0;

    strategies.forEach(strat => {
      const strTrades = closedTrades.filter(t => t.strategy === strat);
      const count = strTrades.length;
      let wins = 0;
      let pnlSum = 0;
      let rocSum = 0;

      strTrades.forEach(t => {
        const pnl = t.realizedPnL || 0;
        pnlSum += pnl;
        if (pnl >= 0) wins++;
        rocSum += parseFloat(t.roc || 0);

        totalRulePnL += pnl;
        if (t.exitReason === 'BUYBACK_80_PERCENT') {
          totalHoldEstPnL += (t.credit * 100 * t.contracts);
        } else {
          totalHoldEstPnL += pnl;
        }
      });

      const winRate = count > 0 ? ((wins / count) * 100).toFixed(1) : '0.0';
      const avgRoc = count > 0 ? (rocSum / count).toFixed(1) : '0.0';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="strat-pill strat-${strat.toLowerCase()}">${strat}</span></td>
        <td>${count}</td>
        <td>${winRate}%</td>
        <td class="${pnlSum >= 0 ? 'positive' : 'negative'}">$${pnlSum.toFixed(2)}</td>
        <td>${avgRoc}%</td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById('compValRule').innerText = `$${totalRulePnL.toFixed(2)}`;
    document.getElementById('compValHold').innerText = `$${totalHoldEstPnL.toFixed(2)}`;

    const heatmapGrid = document.getElementById('heatmapGrid');
    heatmapGrid.innerHTML = '';

    const monthlyMap = {};
    closedTrades.forEach(t => {
      if (!t.closeDate) return;
      const monthKey = t.closeDate.substring(0, 7);
      if (!monthlyMap[monthKey]) monthlyMap[monthKey] = 0;
      monthlyMap[monthKey] += (t.realizedPnL || 0);
    });

    const months = Object.keys(monthlyMap).sort();
    if (months.length === 0) {
      heatmapGrid.innerHTML = '<div class="card-subtext">No monthly closed history available yet.</div>';
      return;
    }

    months.forEach(m => {
      const val = monthlyMap[m];
      const dateObj = new Date(m + '-01');
      const monthLabel = dateObj.toLocaleString('default', { month: 'short', year: '2-digit' });

      const tile = document.createElement('div');
      tile.className = `heatmap-tile ${val >= 0 ? 'positive' : 'negative'}`;
      tile.innerHTML = `
        <span class="tile-month">${monthLabel}</span>
        <span class="tile-pnl">${val >= 0 ? '+' : ''}$${Math.round(val)}</span>
      `;
      heatmapGrid.appendChild(tile);
    });
  }

  function renderAiCoach(closedTrades) {
    const coachBox = document.getElementById('coachTips');
    coachBox.innerHTML = '';

    const tips = [];

    if (closedTrades.length === 0) {
      tips.push('💡 <strong>Welcome to SpreadPulse!</strong> Log your first $5/$10 spread or CSP to start receiving AI discipline coaching.');
    } else {
      const pcsTrades = closedTrades.filter(t => t.strategy === 'PCS');

      if (pcsTrades.length > 0) {
        const pcsWins = pcsTrades.filter(t => t.realizedPnL >= 0).length;
        const pcsWinRate = Math.round((pcsWins / pcsTrades.length) * 100);
        tips.push(`🎯 <strong>Put Credit Spreads (PCS):</strong> You hold a <strong>${pcsWinRate}% win rate</strong> across ${pcsTrades.length} trades.`);
      }

      const target80Hits = closedTrades.filter(t => t.exitReason === 'BUYBACK_80_PERCENT').length;
      if (target80Hits > 0) {
        tips.push(`🔥 <strong>Discipline Streak:</strong> You locked in early profits on <strong>${target80Hits} trades</strong> via your 80% exit rule!`);
      }

      tips.push(`🛡️ <strong>Risk Guardrail:</strong> Keeping active trade allocation under 50% of account capital prevents deep drawdown spikes during market pullbacks.`);
    }

    tips.forEach(t => {
      const div = document.createElement('div');
      div.className = 'coach-tip-item';
      div.innerHTML = t;
      coachBox.appendChild(div);
    });
  }

  // ==========================================================================
  // Interactive Controls & Modals
  // ==========================================================================
  function switchAccount(acc) {
    state.account = acc;
    render();
  }

  function switchTab(tabName) {
    state.activeTab = tabName;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));

    if (tabName === 'active') {
      document.getElementById('tabBtnActive').classList.add('active');
      document.getElementById('viewActive').classList.add('active');
      document.getElementById('tableFilterControls').style.display = 'flex';
    } else if (tabName === 'closed') {
      document.getElementById('tabBtnClosed').classList.add('active');
      document.getElementById('viewClosed').classList.add('active');
      document.getElementById('tableFilterControls').style.display = 'flex';
    } else if (tabName === 'analytics') {
      document.getElementById('tabBtnAnalytics').classList.add('active');
      document.getElementById('viewAnalytics').classList.add('active');
      document.getElementById('tableFilterControls').style.display = 'none';
    }
  }

  function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
  }

  function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
  }

  function onStrategyChange() {
    const strat = document.getElementById('tradeStrategy').value;
    const grpWidth = document.getElementById('grpWidth');
    const grpLongStrike = document.getElementById('grpLongStrike');

    if (strat === 'CSP') {
      grpWidth.style.display = 'none';
      grpLongStrike.style.display = 'none';
    } else {
      grpWidth.style.display = 'flex';
      grpLongStrike.style.display = 'flex';
    }
    updateTradePreview();
  }

  function onWidthChange() {
    const width = document.getElementById('tradeWidth').value;
    const shortStrike = parseFloat(document.getElementById('tradeShortStrike').value) || 0;
    const longStrikeInput = document.getElementById('tradeLongStrike');

    if (width === '5' && shortStrike > 0) {
      longStrikeInput.value = shortStrike - 5;
    } else if (width === '10' && shortStrike > 0) {
      longStrikeInput.value = shortStrike - 10;
    }
    updateTradePreview();
  }

  function updateTradePreview() {
    const strat = document.getElementById('tradeStrategy').value;
    const width = document.getElementById('tradeWidth').value;
    const shortStrike = parseFloat(document.getElementById('tradeShortStrike').value) || 0;
    const longStrike = parseFloat(document.getElementById('tradeLongStrike').value) || 0;
    const contracts = parseInt(document.getElementById('tradeContracts').value) || 1;
    const credit = parseFloat(document.getElementById('tradeCredit').value) || 0;

    const { maxProfit, totalCollateral, exitTargetPrice } = calcTradeMetrics(strat, width, shortStrike, longStrike, credit, contracts);

    document.getElementById('prevMaxProfit').innerText = `$${maxProfit.toFixed(2)}`;
    document.getElementById('prevCollateral').innerText = `$${totalCollateral.toLocaleString()}`;
    document.getElementById('prevExitTarget').innerText = `$${exitTargetPrice} / contract ($${(exitTargetPrice * 100 * contracts).toFixed(2)} buyback)`;
  }

  async function handleSaveTrade(e) {
    e.preventDefault();

    const id = document.getElementById('tradeId').value || 'trade_' + Date.now();
    const ticker = document.getElementById('tradeTicker').value.trim().toUpperCase();
    const strategy = document.getElementById('tradeStrategy').value;
    const width = document.getElementById('tradeWidth').value;
    const shortStrike = parseFloat(document.getElementById('tradeShortStrike').value);
    const longStrike = parseFloat(document.getElementById('tradeLongStrike').value) || 0;
    const contracts = parseInt(document.getElementById('tradeContracts').value);
    const credit = parseFloat(document.getElementById('tradeCredit').value);
    const expDate = document.getElementById('tradeExpDate').value;

    const { totalCollateral, exitTargetPrice } = calcTradeMetrics(strategy, width, shortStrike, longStrike, credit, contracts);

    const tradeObj = {
      id,
      account: state.account,
      ticker,
      strategy,
      width,
      shortStrike,
      longStrike,
      contracts,
      credit,
      openDate: new Date().toISOString().split('T')[0],
      expDate,
      status: 'OPEN',
      collateral: totalCollateral,
      exitTargetPrice
    };

    await saveTradeToDb(tradeObj);

    const idx = state.trades.findIndex(t => t.id === id);
    if (idx >= 0) state.trades[idx] = tradeObj;
    else state.trades.push(tradeObj);

    if (state.gscriptUrl) {
      syncToGoogleSheets(tradeObj);
    }

    render();
    closeModal('tradeModal');
    document.getElementById('formTrade').reset();
  }

  function openCloseModal(tradeId, exitMode) {
    const trade = state.trades.find(t => t.id === tradeId);
    if (!trade) return;

    document.getElementById('closeTradeId').value = trade.id;
    document.getElementById('closeTradeSummary').innerHTML = `
      <strong>${trade.ticker} ${trade.strategy}</strong> (${trade.contracts} contracts @ $${trade.credit.toFixed(2)} credit rec.)<br>
      Collateral at Risk: <strong>$${trade.collateral.toLocaleString()}</strong>
    `;

    const exitPriceInput = document.getElementById('closeExitPrice');
    const exitReasonSelect = document.getElementById('closeExitReason');

    if (exitMode === 0.80) {
      exitPriceInput.value = (trade.credit * 0.20).toFixed(2);
      exitReasonSelect.value = 'BUYBACK_80_PERCENT';
      document.getElementById('closeExitHint').innerText = '🎯 Auto-filled @ 80% Profit Target ($0.20 per $1.00 credit)';
    } else if (exitMode === 1.00) {
      exitPriceInput.value = '0.00';
      exitReasonSelect.value = 'EXPIRED_MAX_PROFIT';
      document.getElementById('closeExitHint').innerText = '⌛ Auto-filled @ 100% Expiration ($0.00 buyback)';
    } else {
      exitPriceInput.value = trade.exitTargetPrice || (trade.credit * 0.20).toFixed(2);
      exitReasonSelect.value = 'MANUAL_CLOSE';
      document.getElementById('closeExitHint').innerText = 'Enter custom buyback exit price.';
    }

    calcClosePnL();
    openModal('closeModal');
  }

  function calcClosePnL() {
    const tradeId = document.getElementById('closeTradeId').value;
    const trade = state.trades.find(t => t.id === tradeId);
    if (!trade) return;

    const exitPrice = parseFloat(document.getElementById('closeExitPrice').value) || 0;
    const netPnL = (trade.credit - exitPrice) * 100 * trade.contracts;
    const roc = ((netPnL / (trade.collateral || 1)) * 100).toFixed(1);

    const el = document.getElementById('valCloseNetPnL');
    el.innerText = `${netPnL >= 0 ? '+' : ''}$${netPnL.toFixed(2)} (${roc}% ROC)`;
    el.className = `pnl-amount ${netPnL >= 0 ? 'positive' : 'negative'}`;
  }

  async function handleConfirmCloseTrade(e) {
    e.preventDefault();

    const tradeId = document.getElementById('closeTradeId').value;
    const trade = state.trades.find(t => t.id === tradeId);
    if (!trade) return;

    const exitPrice = parseFloat(document.getElementById('closeExitPrice').value) || 0;
    const exitReason = document.getElementById('closeExitReason').value;
    const netPnL = (trade.credit - exitPrice) * 100 * trade.contracts;
    const roc = parseFloat(((netPnL / (trade.collateral || 1)) * 100).toFixed(1));

    trade.status = 'CLOSED';
    trade.exitPrice = exitPrice;
    trade.exitReason = exitReason;
    trade.closeDate = new Date().toISOString().split('T')[0];
    trade.realizedPnL = netPnL;
    trade.roc = roc;

    await saveTradeToDb(trade);

    if (state.gscriptUrl) {
      syncToGoogleSheets(trade);
    }

    render();
    closeModal('closeModal');
  }

  async function deleteTrade(tradeId) {
    if (!confirm('Are you sure you want to delete this trade from your ledger?')) return;
    await deleteTradeFromDb(tradeId);
    state.trades = state.trades.filter(t => t.id !== tradeId);
    render();
  }

  // ==========================================================================
  // Sidebar Widgets
  // ==========================================================================
  function calcPositionSizing() {
    const widthVal = document.getElementById('sizerWidth').value;
    const rowPrice = document.getElementById('rowSizerPrice');
    let riskPerContract = 380;

    if (widthVal === '5') {
      rowPrice.style.display = 'none';
      riskPerContract = 380;
    } else if (widthVal === '10') {
      rowPrice.style.display = 'none';
      riskPerContract = 760;
    } else {
      rowPrice.style.display = 'block';
      const strike = parseFloat(document.getElementById('sizerStrikePrice').value) || 50;
      riskPerContract = (strike * 100) * 0.95;
    }

    const maxRiskAllowed = state.totalCapital * 0.05;
    const maxContracts = Math.max(1, Math.floor(maxRiskAllowed / riskPerContract));

    document.getElementById('valSizerContracts').innerText = `${maxContracts} Contract${maxContracts > 1 ? 's' : ''}`;
  }

  function calcStressTest(dropPct) {
    document.getElementById('stressValue').innerText = `-${dropPct}%`;

    const activeTrades = state.trades.filter(t => t.account === state.account && t.status === 'OPEN');
    let totalActiveCollateral = 0;
    activeTrades.forEach(t => totalActiveCollateral += (t.collateral || 0));

    const lossRatio = (parseFloat(dropPct) / 10) * 0.40;
    const estImpact = -(totalActiveCollateral * lossRatio);

    const elResult = document.getElementById('stressPnlResult');
    elResult.innerText = `-$${Math.abs(estImpact).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('stressSubText').innerText = `Based on $${totalActiveCollateral.toLocaleString()} active collateral`;
  }

  // ==========================================================================
  // IBKR Flex API Sync (Multi-Proxy Fallback Engine & 2-Step Handshake)
  // ==========================================================================
  function switchIbkrTab(tab) {
    document.querySelectorAll('.importer-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.importer-panel').forEach(p => p.classList.remove('active'));

    if (tab === 'api') {
      document.getElementById('btnIbkrTabApi').classList.add('active');
      document.getElementById('panelIbkrApi').classList.add('active');
    } else {
      document.getElementById('btnIbkrTabCsv').classList.add('active');
      document.getElementById('panelIbkrCsv').classList.add('active');
    }
  }

  // Multi-Proxy Fetch Helper
  async function fetchWithProxy(targetUrl) {
    const proxies = [
      `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
      `https://thingproxy.freeboard.io/fetch/${targetUrl}`
    ];

    for (let proxy of proxies) {
      try {
        const res = await fetch(proxy, { timeout: 8000 });
        if (res.ok) {
          const text = await res.text();
          if (text && text.includes('<?xml')) return text;
        }
      } catch (err) {
        console.warn('Proxy attempt failed, trying next:', proxy, err);
      }
    }
    throw new Error('All CORS proxies failed or blocked.');
  }

  async function syncIbkrApi() {
    const tokenInput = document.getElementById('ibkrToken');
    const queryIdInput = document.getElementById('ibkrQueryId');

    const token = tokenInput ? tokenInput.value.trim() : '';
    const queryId = queryIdInput ? queryIdInput.value.trim() : '';

    if (!token || !queryId) {
      alert('⚠️ Missing Credentials!\n\nPlease enter both your IBKR Flex Token & Query ID.');
      return;
    }

    // Save credentials to localStorage
    localStorage.setItem('ibkr_token', token);
    localStorage.setItem('ibkr_query_id', queryId);

    const btn = document.querySelector('#panelIbkrApi button');
    const origText = btn ? btn.innerHTML : 'Sync Trades';
    
    if (btn) {
      btn.innerHTML = '⚡ Step 1/3: Requesting IBKR Token Auth...';
      btn.disabled = true;
    }

    try {
      // Step 1: Send Request to IBKR Flex Web Service
      const reqUrl = `https://www.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest?t=${token}&q=${queryId}&v=3`;
      const text1 = await fetchWithProxy(reqUrl);

      const parser = new DOMParser();
      const xml1 = parser.parseFromString(text1, "text/xml");

      const status = xml1.querySelector('Status')?.textContent;
      const refCode = xml1.querySelector('ReferenceCode')?.textContent;
      const errorCode = xml1.querySelector('ErrorCode')?.textContent;
      const errorMsg = xml1.querySelector('ErrorMessage')?.textContent;

      if (status === 'Fail' || errorCode) {
        alert(`❌ IBKR Flex API Error (${errorCode || 'Failed'}):\n\n${errorMsg || 'Invalid Flex Token or Query ID.'}\n\nPlease check your IBKR query settings.`);
        if (btn) { btn.innerHTML = origText; btn.disabled = false; }
        return;
      }

      if (!refCode) {
        alert('⚠️ IBKR connected, but no ReferenceCode was generated.\n\nPlease verify that your IBKR Flex Query has "Trade Confirmations" checked under Sections.');
        if (btn) { btn.innerHTML = origText; btn.disabled = false; }
        return;
      }

      if (btn) btn.innerHTML = '⏳ Step 2/3: IBKR Generating Statement (Waiting 3s)...';

      // Step 2: Wait 3 seconds for IBKR report generation
      await new Promise(r => setTimeout(r, 3000));

      if (btn) btn.innerHTML = '📥 Step 3/3: Downloading Executions & Strikes...';

      // Step 3: Fetch Statement via Reference Code
      const stmtUrl = `https://www.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement?q=${refCode}&t=${token}&v=3`;
      const text2 = await fetchWithProxy(stmtUrl);

      const xml2 = parser.parseFromString(text2, "text/xml");
      const tradeConfirms = xml2.querySelectorAll('TradeConfirm, TradeConfirmation, Trade');

      if (!tradeConfirms || tradeConfirms.length === 0) {
        alert(`✅ IBKR Flex Query Connected Successfully!\n\nNote: No new filled option trades were found in the selected date range.`);
        if (btn) { btn.innerHTML = origText; btn.disabled = false; }
        closeModal('ibkrModal');
        return;
      }

      let importedCount = 0;
      for (let tNode of tradeConfirms) {
        const symbol = tNode.getAttribute('symbol') || tNode.getAttribute('underlyingSymbol') || 'SPY';
        const price = Math.abs(parseFloat(tNode.getAttribute('price') || tNode.getAttribute('tradePrice') || '1.00'));
        const quantity = Math.abs(parseInt(tNode.getAttribute('quantity') || '1'));
        const strike = parseFloat(tNode.getAttribute('strike') || '500');
        const buySell = tNode.getAttribute('buySell') || 'SELL';
        const expDateRaw = tNode.getAttribute('expiry') || tNode.getAttribute('expiration') || '';

        let expDate = getFutureDateStr(30);
        if (expDateRaw && expDateRaw.length === 8) {
          expDate = `${expDateRaw.substr(0,4)}-${expDateRaw.substr(4,2)}-${expDateRaw.substr(6,2)}`;
        }

        const newTrade = {
          id: 'trade_ibkr_' + Date.now() + '_' + Math.random().toString(36).substr(2,4),
          account: state.account,
          ticker: symbol.toUpperCase(),
          strategy: buySell.includes('SELL') ? 'PCS' : 'CCS',
          width: '5',
          shortStrike: strike,
          longStrike: strike - 5,
          contracts: quantity,
          credit: price,
          openDate: new Date().toISOString().split('T')[0],
          expDate: expDate,
          status: 'OPEN',
          collateral: Math.max(100, (500 - (price * 100)) * quantity),
          exitTargetPrice: (price * 0.20).toFixed(2)
        };

        await saveTradeToDb(newTrade);
        state.trades.push(newTrade);
        importedCount++;
      }

      alert(`🎉 SUCCESS! Imported ${importedCount} trade(s) directly from Interactive Brokers!`);
      render();
      closeModal('ibkrModal');

    } catch (err) {
      console.error('IBKR API Fetch Error:', err);
      alert(`💡 IBKR Flex Connection Note:\n\nYour browser or network blocked the CORS API request. Please use the "CSV / Text Import" tab right next to this button to import your IBKR trade report in 1 click!`);
    } finally {
      if (btn) {
        btn.innerHTML = origText;
        btn.disabled = false;
      }
    }
  }

  async function importIbkrText() {
    const text = document.getElementById('ibkrPasteArea').value.trim();
    if (!text) {
      alert('Please paste IBKR execution confirmation text or CSV data.');
      return;
    }

    const lines = text.split('\n');
    let importedCount = 0;

    for (let line of lines) {
      if (line.length < 5) continue;
      
      const tickerMatch = line.match(/\b([A-Z]{1,5})\b/);
      const creditMatch = line.match(/@\s*([\d\.]+)/) || line.match(/[\d\.]+/);

      if (tickerMatch && creditMatch) {
        const ticker = tickerMatch[1];
        const credit = parseFloat(creditMatch[1]) || 1.20;
        
        const newTrade = {
          id: 'trade_ibkr_' + Date.now() + '_' + Math.random().toString(36).substr(2,4),
          account: state.account,
          ticker: ticker.toUpperCase(),
          strategy: 'PCS',
          width: '5',
          shortStrike: 500,
          longStrike: 495,
          contracts: 1,
          credit: credit,
          openDate: new Date().toISOString().split('T')[0],
          expDate: getFutureDateStr(30),
          status: 'OPEN',
          collateral: Math.max(100, 500 - (credit * 100)),
          exitTargetPrice: (credit * 0.20).toFixed(2)
        };

        await saveTradeToDb(newTrade);
        state.trades.push(newTrade);
        importedCount++;
      }
    }

    alert(`Successfully parsed and imported ${importedCount} trade execution(s)!`);
    render();
    closeModal('ibkrModal');
  }

  // ==========================================================================
  // Backup & Restore Utilities
  // ==========================================================================
  function exportJsonBackup() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.trades, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `spreadpulse_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  }

  function importJsonBackup(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const imported = JSON.parse(evt.target.result);
        if (Array.isArray(imported)) {
          for (let t of imported) {
            await saveTradeToDb(t);
          }
          state.trades = imported;
          render();
          alert(`Successfully imported ${imported.length} trades from backup file!`);
          closeModal('settingsModal');
        }
      } catch (err) {
        alert('Invalid JSON backup file format.');
      }
    };
    reader.readAsText(file);
  }

  async function clearAllData() {
    if (!confirm('WARNING: Are you sure you want to delete ALL trades from your database? This action cannot be undone.')) return;
    
    if (db) {
      const tx = db.transaction('trades', 'readwrite');
      tx.objectStore('trades').clear();
    }
    localStorage.removeItem('spreadpulse_trades');
    state.trades = [];
    render();
    closeModal('settingsModal');
  }

  function syncToGoogleSheets(trade) {
    if (!state.gscriptUrl) return;
    fetch(state.gscriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trade)
    }).catch(e => console.warn('Google Sheets Sync warning:', e));
  }

  // Public API
  return {
    init,
    switchAccount,
    switchTab,
    openModal,
    closeModal,
    onStrategyChange,
    onWidthChange,
    updateTradePreview,
    handleSaveTrade,
    openCloseModal,
    calcClosePnL,
    handleConfirmCloseTrade,
    deleteTrade,
    calcPositionSizing,
    calcStressTest,
    switchIbkrTab,
    syncIbkrApi,
    importIbkrText,
    saveSettings,
    exportJsonBackup,
    importJsonBackup,
    clearAllData,
    render
  };
})();

// Launch app on page load
document.addEventListener('DOMContentLoaded', () => {
  SpreadApp.init();
});
