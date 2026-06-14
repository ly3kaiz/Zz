/* ================================================================
   BEAST MERGE – game.js (محسّن لنجاح 15 مرة إلى المستوى 11)
   جميع التحسينات مضمنة داخل Worker
   ================================================================ */

/* ----------------------------------------------------------------
   ANIMAL DATA
   ---------------------------------------------------------------- */
const ANIMALS = [
    null,
    { name: 'جمل', img: 'image/Camel.png', color: '#4caf50' },
    { name: 'نسر', img: 'image/Eagle.png', color: '#00bcd4' },
    { name: 'نمر', img: 'image/Panther.png', color: '#2196f3' },
    { name: 'أسد', img: 'image/Lion.png', color: '#3f51b5' },
    { name: 'ذئب', img: 'image/Wolf.png', color: '#9c27b0' },
    { name: 'حصان البحر', img: 'image/Seahorse.png', color: '#673ab7' },
    { name: 'حصان', img: 'image/Horse.png', color: '#ff8f00' },
    { name: 'دب', img: 'image/Bear.png', color: '#f4511e' },
    { name: 'فيل', img: 'image/Elephant.png', color: '#e53935' },
    { name: 'ثور', img: 'image/Bull.png', color: '#c2185b' },
    { name: 'روح', img: 'image/Spirit.png', color: '#ffd700' }
];

const SPAWN_PROBS = [0.35, 0.25, 0.20, 0.12, 0.08];

/* ================================================================
   PURE GAME LOGIC
   ================================================================ */
function slideRowLeft(row) {
    const tiles = row.filter(v => v !== 0);
    const merged = [];
    let i = 0;
    while (i < tiles.length) {
        if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
            merged.push(tiles[i] + 1);
            i += 2;
        } else {
            merged.push(tiles[i]);
            i++;
        }
    }
    while (merged.length < 4) merged.push(0);
    return merged;
}

function applyMove(board, direction) {
    const result = board.slice();
    let changed = false;

    if (direction === 'left' || direction === 'right') {
        for (let r = 0; r < 4; r++) {
            const row = result.slice(r * 4, r * 4 + 4);
            const newRow = direction === 'left' ? slideRowLeft(row) : slideRowLeft([...row].reverse()).reverse();
            for (let c = 0; c < 4; c++) {
                if (newRow[c] !== row[c]) changed = true;
                result[r * 4 + c] = newRow[c];
            }
        }
    } else {
        for (let c = 0; c < 4; c++) {
            const col = [result[c], result[4 + c], result[8 + c], result[12 + c]];
            const newCol = direction === 'up' ? slideRowLeft(col) : slideRowLeft([...col].reverse()).reverse();
            for (let r = 0; r < 4; r++) {
                if (newCol[r] !== col[r]) changed = true;
                result[r * 4 + c] = newCol[r];
            }
        }
    }

    let level11Count = 0;
    for (let i = 0; i < 16; i++) {
        if (result[i] === 11) {
            result[i] = 0;
            level11Count++;
            changed = true;
        }
    }
    return { board: result, changed, level11Count };
}

function isGameOver(board) {
    return ['left', 'right', 'up', 'down'].every(d => !applyMove(board, d).changed);
}

function generateRandomBoard() {
    const b = new Array(16).fill(0);
    const count = 4 + Math.floor(Math.random() * 5);
    const positions = [...Array(16).keys()].sort(() => Math.random() - 0.5).slice(0, count);
    positions.forEach(p => { b[p] = 1 + Math.floor(Math.random() * 6); });
    return b;
}

/* ================================================================
   AI WORKER – النسخة المحسّنة (عمق أعمق + عينة كاملة + تصفية أمان)
   ================================================================ */
const WORKER_SOURCE = `
"use strict";

const DIRS = ["left", "right", "up", "down"];
const SPAWN_LEVELS = [1, 2, 3, 4, 5];

// Zobrist hashing
const Z = [];
for (let i = 0; i < 16; i++) {
    Z[i] = [];
    for (let v = 0; v <= 11; v++) {
        Z[i][v] = Math.floor(Math.random() * 2147483647);
    }
}
function hash(board) {
    let h = 0;
    for (let i = 0; i < 16; i++) h ^= Z[i][board[i]];
    return h;
}

// Transposition table (يُحتفظ بها بين التحليلات – تحسين)
const TT = new Map();
const TT_MAX_SIZE = 800000;

function ttGet(key, depth) {
    const entry = TT.get(key);
    return entry && entry.depth >= depth ? entry.value : null;
}
function ttSet(key, depth, value) {
    if (TT.size > TT_MAX_SIZE) TT.clear();
    TT.set(key, { depth, value });
}

function copyBoard(b) { return b.slice(); }
function emptyCells(board) {
    const e = [];
    for (let i = 0; i < 16; i++) if (board[i] === 0) e.push(i);
    return e;
}
function emptyCount(board) { let cnt = 0; for (let v of board) if (v === 0) cnt++; return cnt; }

function processLine(a, b, c, d) {
    const tiles = [];
    if (a) tiles.push(a);
    if (b) tiles.push(b);
    if (c) tiles.push(c);
    if (d) tiles.push(d);
    const merged = [];
    let i = 0, merges = 0, spirit = false;
    while (i < tiles.length) {
        if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
            const newVal = tiles[i] + 1;
            if (newVal === 11) spirit = true;
            else merged.push(newVal);
            merges++;
            i += 2;
        } else {
            merged.push(tiles[i]);
            i++;
        }
    }
    while (merged.length < 4) merged.push(0);
    return [merged[0], merged[1], merged[2], merged[3], merges, spirit];
}

function applyMove(board, dir) {
    const nb = copyBoard(board);
    let changed = false, totalMerges = 0, spiritAny = false;
    if (dir === 0) {
        for (let r = 0; r < 4; r++) {
            const idx = r * 4;
            const [v0,v1,v2,v3,m,sp] = processLine(nb[idx], nb[idx+1], nb[idx+2], nb[idx+3]);
            if (nb[idx]!==v0 || nb[idx+1]!==v1 || nb[idx+2]!==v2 || nb[idx+3]!==v3) changed = true;
            nb[idx]=v0; nb[idx+1]=v1; nb[idx+2]=v2; nb[idx+3]=v3;
            totalMerges += m;
            if (sp) spiritAny = true;
        }
    } else if (dir === 1) {
        for (let r = 0; r < 4; r++) {
            const idx = r * 4;
            const [v0,v1,v2,v3,m,sp] = processLine(nb[idx+3], nb[idx+2], nb[idx+1], nb[idx]);
            if (nb[idx]!==v3 || nb[idx+1]!==v2 || nb[idx+2]!==v1 || nb[idx+3]!==v0) changed = true;
            nb[idx]=v3; nb[idx+1]=v2; nb[idx+2]=v1; nb[idx+3]=v0;
            totalMerges += m;
            if (sp) spiritAny = true;
        }
    } else if (dir === 2) {
        for (let c = 0; c < 4; c++) {
            const [v0,v1,v2,v3,m,sp] = processLine(nb[c], nb[4+c], nb[8+c], nb[12+c]);
            if (nb[c]!==v0 || nb[4+c]!==v1 || nb[8+c]!==v2 || nb[12+c]!==v3) changed = true;
            nb[c]=v0; nb[4+c]=v1; nb[8+c]=v2; nb[12+c]=v3;
            totalMerges += m;
            if (sp) spiritAny = true;
        }
    } else {
        for (let c = 0; c < 4; c++) {
            const [v0,v1,v2,v3,m,sp] = processLine(nb[12+c], nb[8+c], nb[4+c], nb[c]);
            if (nb[c]!==v3 || nb[4+c]!==v2 || nb[8+c]!==v1 || nb[12+c]!==v0) changed = true;
            nb[c]=v3; nb[4+c]=v2; nb[8+c]=v1; nb[12+c]=v0;
            totalMerges += m;
            if (sp) spiritAny = true;
        }
    }
    for (let i = 0; i < 16; i++) if (nb[i] === 11) { nb[i] = 0; spiritAny = true; changed = true; }
    return [nb, changed, totalMerges, spiritAny];
}

const SNAKE_ORDERS = [
    [15,14,13,12,8,9,10,11,7,6,5,4,0,1,2,3],
    [12,13,14,15,11,10,9,8,4,5,6,7,3,2,1,0],
    [0,1,2,3,7,6,5,4,8,9,10,11,15,14,13,12],
    [3,2,1,0,4,5,6,7,11,10,9,8,12,13,14,15]
];

// دالة spawn متشائمة (تزيد احتمالية الرقم 5 في المراحل المتقدمة)
function getSpawnProbs(maxTile) {
    if (maxTile >= 10) return [0.10, 0.15, 0.20, 0.25, 0.30]; // المستوى 5 الأكثر شيوعاً
    if (maxTile >= 8)  return [0.15, 0.20, 0.20, 0.20, 0.25];
    if (maxTile >= 6)  return [0.20, 0.25, 0.25, 0.20, 0.10];
    if (maxTile >= 4)  return [0.30, 0.30, 0.20, 0.12, 0.08];
    return [0.50, 0.25, 0.15, 0.07, 0.03];
}

function randomSpawn(board) {
    let maxTile = 0;
    for (let v of board) if (v > maxTile) maxTile = v;
    const probs = getSpawnProbs(maxTile);
    const r = Math.random();
    let cum = 0;
    for (let i = 0; i < SPAWN_LEVELS.length; i++) {
        cum += probs[i];
        if (r < cum) return SPAWN_LEVELS[i];
    }
    return 1;
}

// دالة تقييم محسّنة مع عقوبات قاسية للجمود
function evaluate(board) {
    const empty = emptyCount(board);
    if (empty === 0 && !canMerge(board)) return -100000;

    let score = 0;
    score += empty * 2700;

    let bestSnake = -Infinity;
    for (const order of SNAKE_ORDERS) {
        let s = 0;
        for (let i = 0; i < 16; i++) s += board[i] * order[i];
        bestSnake = Math.max(bestSnake, s);
    }
    score += bestSnake * 10;

    let adj = 0;
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            const v = board[r*4 + c];
            if (v === 0) continue;
            if (c+1 < 4 && board[r*4 + c+1] === v) adj += v * 15;
            if (r+1 < 4 && board[(r+1)*4 + c] === v) adj += v * 15;
            if (c+1 < 4 && board[r*4 + c+1] > 0 && Math.abs(board[r*4 + c+1] - v) === 1) adj += v * 5;
            if (r+1 < 4 && board[(r+1)*4 + c] > 0 && Math.abs(board[(r+1)*4 + c] - v) === 1) adj += v * 5;
        }
    }
    score += adj;

    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            if (board[r*4 + c] === 10) {
                if (c+1 < 4 && board[r*4 + c+1] === 10) score += 5000;
                if (r+1 < 4 && board[(r+1)*4 + c] === 10) score += 5000;
            }
        }
    }

    let mono = 0;
    for (let r = 0; r < 4; r++) {
        let inc = 0, dec = 0;
        for (let c = 0; c < 3; c++) {
            const cur = board[r*4 + c], nxt = board[r*4 + c+1];
            if (cur > nxt) dec += cur - nxt;
            else inc += nxt - cur;
        }
        mono += Math.max(inc, dec);
    }
    for (let c = 0; c < 4; c++) {
        let inc = 0, dec = 0;
        for (let r = 0; r < 3; r++) {
            const cur = board[r*4 + c], nxt = board[(r+1)*4 + c];
            if (cur > nxt) dec += cur - nxt;
            else inc += nxt - cur;
        }
        mono += Math.max(inc, dec);
    }
    score += mono * 50;

    let smooth = 0;
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            const v = board[r*4 + c];
            if (v === 0) continue;
            if (c+1 < 4 && board[r*4 + c+1] > 0) smooth -= Math.abs(v - board[r*4 + c+1]);
            if (r+1 < 4 && board[(r+1)*4 + c] > 0) smooth -= Math.abs(v - board[(r+1)*4 + c]);
        }
    }
    score += smooth * 30;

    let maxVal = 0, maxPos = -1;
    for (let i = 0; i < 16; i++) if (board[i] > maxVal) { maxVal = board[i]; maxPos = i; }
    if ([0,3,12,15].includes(maxPos)) score += maxVal * 100;

    // عقوبة إضافية: إذا كان الفراغات قليلة جداً (≤2) ولا يوجد زوجان قابلان للدمج
    if (empty <= 2 && !canMerge(board)) score -= 50000;

    return score;
}

function canMerge(board) {
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            const v = board[r*4 + c];
            if (v === 0) return true;
            if (c+1 < 4 && board[r*4 + c+1] === v) return true;
            if (r+1 < 4 && board[(r+1)*4 + c] === v) return true;
        }
    }
    return false;
}

// Expectimax مع استخدام جميع الخلايا الفارغة (بدون اختصار)
function expectimax(board, depth, isChance) {
    if (depth === 0) return evaluate(board);
    const key = hash(board) + "_" + depth + "_" + isChance;
    const cached = ttGet(key, depth);
    if (cached !== null) return cached;

    if (isChance) { // MAX node
        let best = -Infinity;
        for (let d = 0; d < 4; d++) {
            const [nb, changed] = applyMove(board, d);
            if (!changed) continue;
            const val = expectimax(nb, depth - 1, false);
            if (val > best) best = val;
        }
        if (best === -Infinity) best = evaluate(board) - 50000;
        ttSet(key, depth, best);
        return best;
    } else { // CHANCE node – نستخدم جميع الخلايا الفارغة (لا عينة)
        const empty = emptyCells(board);
        if (empty.length === 0) return evaluate(board);
        let maxTile = 0;
        for (let v of board) if (v > maxTile) maxTile = v;
        const dynamicProbs = getSpawnProbs(maxTile);
        let total = 0, weightSum = 0;
        // نأخذ كل الخلايا الفارغة (لم نعد نقصر العينة)
        for (const pos of empty) {
            for (let i = 0; i < SPAWN_LEVELS.length; i++) {
                const lev = SPAWN_LEVELS[i];
                const prob = dynamicProbs[i];
                const nb = copyBoard(board);
                nb[pos] = lev;
                const val = expectimax(nb, depth - 1, true);
                total += val * prob;
                weightSum += prob;
            }
        }
        const result = weightSum > 0 ? total / weightSum : evaluate(board);
        ttSet(key, depth, result);
        return result;
    }
}

function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// محاكاة موجهة (تختار أفضل حركة وفق التقييم السطحي)
function guidedRollout(board, steps) {
    let b = copyBoard(board);
    for (let step = 0; step < steps; step++) {
        let bestScore = -Infinity, bestBoard = null;
        for (let d = 0; d < 4; d++) {
            const [nb, changed] = applyMove(b, d);
            if (changed) {
                const sc = evaluate(nb);
                if (sc > bestScore) {
                    bestScore = sc;
                    bestBoard = nb;
                }
            }
        }
        if (!bestBoard) return step;
        b = bestBoard;
        const empty = emptyCells(b);
        if (empty.length > 0) {
            b[empty[Math.floor(Math.random() * empty.length)]] = randomSpawn(b);
        }
    }
    return steps;
}

// دالة فحص أمان الحركة (محاكاة أسوأ سيناريوهات spawn)
function isSafeMove(board, direction, sims=20) {
    const [nb, changed] = applyMove(board, direction);
    if (!changed) return false;
    for (let i = 0; i < sims; i++) {
        let test = copyBoard(nb);
        // spawn أكثر المستويات خطورة (5) في أول خلية فارغة
        const empty = emptyCells(test);
        if (empty.length) test[empty[Math.floor(Math.random() * empty.length)]] = 5;
        let dead = false;
        for (let step = 0; step < 3; step++) {
            let moved = false;
            for (let d of [0,1,2,3]) {
                const [nnb, changed2] = applyMove(test, d);
                if (changed2) {
                    test = nnb;
                    moved = true;
                    break;
                }
            }
            if (!moved) { dead = true; break; }
            const e2 = emptyCells(test);
            if (e2.length) test[e2[Math.floor(Math.random() * e2.length)]] = 5;
        }
        if (dead) return false;
    }
    return true;
}

// التحليل الرئيسي مع تصفية الحركات غير الآمنة
function analyze(board) {
    const empty = emptyCount(board);
    let depth, sims, maxSteps;
    if (empty <= 3)      { depth = 8; sims = 1000; maxSteps = 50; }
    else if (empty <= 6) { depth = 7; sims = 600;  maxSteps = 40; }
    else                 { depth = 6; sims = 400;  maxSteps = 30; }

    TT.clear(); // نمسح الجدول بين التحليلات (يبقى سريعاً)

    const candidates = [];
    for (let d = 0; d < 4; d++) {
        const [nb, changed] = applyMove(board, d);
        if (!changed) {
            candidates.push({ dir: DIRS[d], expect: -Infinity, mono: 0, combined: -Infinity, valid: false });
            continue;
        }
        // فحص الأمان المسبق (إن لم يكن آمناً، نتجاهله)
        if (!isSafeMove(board, d, 15)) {
            candidates.push({ dir: DIRS[d], valid: false, combined: -Infinity });
            continue;
        }
        const expectScore = expectimax(nb, depth, false);
        let totalSteps = 0;
        for (let s = 0; s < sims; s++) {
            const simBoard = copyBoard(nb);
            const emptyNow = emptyCells(simBoard);
            if (emptyNow.length) simBoard[emptyNow[Math.floor(Math.random() * emptyNow.length)]] = randomSpawn(simBoard);
            totalSteps += guidedRollout(simBoard, maxSteps);
        }
        const avgSteps = totalSteps / sims;
        const combined = expectScore * 0.6 + avgSteps * 400 * 0.4;
        candidates.push({ dir: DIRS[d], expect: expectScore, mono: avgSteps, combined, valid: true });
    }

    let bestIdx = -1, bestScore = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
        if (candidates[i].valid && candidates[i].combined > bestScore) {
            bestScore = candidates[i].combined;
            bestIdx = i;
        }
    }

    let confidence = 0;
    if (bestIdx >= 0) {
        const validCands = candidates.filter(c => c.valid);
        if (validCands.length > 1) {
            const scores = validCands.map(c => c.combined).sort((a,b) => b - a);
            const gap = scores[0] - scores[1];
            const maxAbs = Math.abs(scores[0]) || 1;
            confidence = 40 + (gap / maxAbs) * 50 + (candidates[bestIdx].mono / maxSteps) * 30;
            confidence = Math.min(95, Math.max(10, confidence));
        } else {
            confidence = 50;
        }
        confidence = Math.min(99, confidence + empty * 2);
    }

    return {
        bestMove: bestIdx >= 0 ? DIRS[bestIdx] : "none",
        confidence: Math.round(confidence)
    };
}

self.onmessage = function(e) {
    const { type, board } = e.data;
    if (type === "analyze") {
        try {
            const result = analyze(board);
            self.postMessage({ direction: result.bestMove, confidence: result.confidence });
        } catch(err) {
            self.postMessage({ direction: null, confidence: 0 });
        }
    }
};
`;

/* ================================================================
   باقي كود اللعبة (بدون تعديل) – نسخة محفوظة كما هي
   ================================================================ */
const state = {
    board: new Array(16).fill(0),
    mode: 'idle',
    isEditMode: false,
    spawnTile: -1,
    editTile: -1,
    pendingDir: null,
    worker: null,
    aiResult: null,
    aiRunning: false,
    history: [],
};

const MAX_HISTORY = 10;

function pushHistory() {
    const snapshot = {
        board: state.board.slice(),
        mode: state.mode,
        isEditMode: state.isEditMode,
        aiResult: state.aiResult ? { ...state.aiResult } : null,
    };
    state.history.push(snapshot);
    if (state.history.length > MAX_HISTORY) state.history.shift();
}

function undo() {
    if (state.history.length === 0) return;
    const prev = state.history.pop();
    state.board = prev.board.slice();
    state.mode = prev.mode;
    state.isEditMode = prev.isEditMode;
    state.aiResult = prev.aiResult;
    state.aiRunning = false;
    renderBoard();
    setModeBar(state.isEditMode ? '✎ وضع التعديل – انقر على أي بلاطة لتحديد مستواها' : '');
    if (state.mode === 'spawn') {
        setAIStatus('في انتظار وضع الوحش…');
        setModeBar('⚡ وضع الإنبات – انقر على أي خلية فارغة لوضع وحش');
    } else {
        requestSolve();
    }
}

function initWorker() {
    try {
        const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        state.worker = new Worker(url);
        state.worker.onmessage = handleWorkerMessage;
        state.worker.onerror = (e) => {
            console.error("AI worker crashed", e);
            state.aiRunning = false;
            setAIStatus("إعادة تشغيل...");
            try { state.worker.terminate(); } catch { }
            initWorker();
        };
    } catch (err) {
        console.warn('Web Worker unavailable:', err);
    }
}

function requestSolve() {
    if (!state.worker) initWorker();
    if (state.aiRunning) return;
    state.aiRunning = true;
    setAIStatus('جارٍ التحليل العميق…');
    state.worker.postMessage({ type: "analyze", board: state.board.slice() });
}

function handleWorkerMessage(e) {
    state.aiRunning = false;
    state.aiResult = e.data;
    renderAIPanel(e.data);
}

function handleMove(direction) {
    if (state.mode !== 'idle') return;
    pushHistory();
    const { board, changed, level11Count } = applyMove(state.board, direction);
    if (!changed) { state.history.pop(); return; }
    state.board = board;
    if (level11Count > 0) showMergeBanner();
    const empties = state.board.map((v,i) => v === 0 ? i : -1).filter(i => i >= 0);
    if (empties.length > 0) {
        state.mode = 'spawn';
        state.aiResult = null;
        setAIArrow('…', false);
        setAIStatus('في انتظار وضع الوحش…');
        setModeBar('⚡ وضع الإنبات – انقر على أي خلية فارغة لوضع وحش');
        renderBoard();
    } else {
        renderBoard();
        if (isGameOver(state.board)) {
            setTimeout(() => alert('⚔ اللوحة مغلقة – لا توجد حركات متبقية! استخدم وضع التعديل.'), 80);
        } else {
            requestSolve();
        }
    }
}

function handleTileClick(index) {
    if (state.mode === 'spawn') {
        if (state.board[index] !== 0) return;
        state.spawnTile = index;
        openModal('spawn');
    } else if (state.isEditMode) {
        state.editTile = index;
        openModal('edit');
    }
}

function confirmSpawn(level) {
    closeModal('spawn');
    if (state.spawnTile < 0) return;
    pushHistory();
    state.board[state.spawnTile] = level;
    state.spawnTile = -1;
    state.mode = 'idle';
    setModeBar('');
    renderBoard();
    if (isGameOver(state.board)) {
        setTimeout(() => alert('⚔ اللوحة مغلقة – لا توجد حركات! رتّب البلاطات للمتابعة.'), 80);
    } else {
        requestSolve();
    }
}

function cancelSpawn() { closeModal('spawn'); }
function confirmEdit(level) {
    closeModal('edit');
    if (state.editTile < 0) return;
    pushHistory();
    if (level === 11) {
        showMergeBanner();
        state.board[state.editTile] = 0;
    } else {
        state.board[state.editTile] = level;
    }
    state.editTile = -1;
    renderBoard();
    requestSolve();
}
function cancelEdit() { closeModal('edit'); state.editTile = -1; }
function clearBoard() {
    if (!confirm('هل تريد مسح اللوحة والبداية من جديد؟')) return;
    pushHistory();
    state.board.fill(0);
    state.mode = 'idle';
    state.aiResult = null;
    setModeBar('');
    clearSavedGame();
    renderBoard();
    setAIArrow('?', false);
    setAIStatus('تم مسح اللوحة – جاهز للعبة جديدة');
}
function randomBoard() {
    pushHistory();
    state.board = generateRandomBoard();
    state.mode = 'idle';
    setModeBar('');
    renderBoard();
    requestSolve();
}
function toggleEditMode() {
    state.isEditMode = !state.isEditMode;
    document.getElementById('btn-edit-mode').classList.toggle('active', state.isEditMode);
    setModeBar(state.isEditMode ? '✎ وضع التعديل – انقر على أي بلاطة لتحديد مستواها' : '');
    renderBoard();
}

function renderBoard() {
    const boardEl = document.getElementById('board');
    for (let i = 0; i < 16; i++) {
        const tile = boardEl.children[i];
        const val = state.board[i];
        tile.dataset.level = val;
        tile.classList.remove('spawn-target', 'edit-highlight');
        const img = tile.querySelector('.tile-img');
        if (val > 0 && val <= 11) {
            const animal = ANIMALS[val];
            img.src = animal.img;
            img.alt = animal.name;
            img.style.display = '';
            tile.title = animal.name + ' (مستوى ' + val + ')';
            tile.querySelector('.tile-name').textContent = animal.name;
            tile.querySelector('.tile-num').textContent = val;
        } else {
            img.src = '';
            img.alt = '';
            img.style.display = 'none';
            tile.title = '';
            tile.querySelector('.tile-name').textContent = '';
            tile.querySelector('.tile-num').textContent = '';
        }
        if (state.mode === 'spawn' && val === 0) tile.classList.add('spawn-target');
        if (state.isEditMode) tile.classList.add('edit-highlight');
    }
    highlightSuggestedBtn();
    saveGameState();
}

function highlightSuggestedBtn() {
    document.querySelectorAll('.dir-btn').forEach(b => b.classList.remove('suggested'));
    if (state.aiResult && state.aiResult.direction) {
        const btn = document.querySelector(`.dir-btn[data-dir="${state.aiResult.direction}"]`);
        if (btn) btn.classList.add('suggested');
    }
}

function renderAIPanel(result) {
    const arrows = { left: '⬅', right: '➡', up: '⬆', down: '⬇' };
    const arrow = result.direction ? arrows[result.direction] : '✕';
    setAIArrow(arrow, !!result.direction);
    const conf = result.confidence || 0;
    const fill = document.getElementById('confidence-fill');
    fill.style.width = conf + '%';
    document.getElementById('confidence-label').textContent = `Survival: ${conf}٪`;
    setAIStatus(result.direction ? `أفضل حركة: ${arrow}  (ثقة ${conf}٪)` : 'لا توجد حركة صالحة');
    highlightSuggestedBtn();
}

function setAIArrow(text, hasResult) {
    const el = document.getElementById('ai-direction');
    el.textContent = text;
    el.classList.toggle('has-result', hasResult);
}
function setAIStatus(text) { document.getElementById('ai-status').textContent = text; }
function setModeBar(text) { document.getElementById('mode-bar').textContent = text; }
function openModal(type) { document.getElementById(type === 'spawn' ? 'spawn-overlay' : 'edit-overlay').classList.remove('hidden'); }
function closeModal(type) { document.getElementById(type === 'spawn' ? 'spawn-overlay' : 'edit-overlay').classList.add('hidden'); }

function buildPicker(containerId, levels) {
    const el = document.getElementById(containerId);
    el.innerHTML = '';
    levels.forEach(lv => {
        const btn = document.createElement('button');
        btn.className = 'level-btn';
        btn.dataset.level = lv;
        if (lv === 0) {
            btn.textContent = '✕';
            btn.title = 'Empty';
        } else {
            const animal = ANIMALS[lv];
            btn.innerHTML = `<img src="${animal.img}" alt="${animal.name}" class="picker-img"><span class="lbnum">${lv}</span>`;
            btn.style.background = `radial-gradient(circle at 38% 38%, ${lighten(animal.color)}, ${animal.color})`;
            btn.style.boxShadow = `0 0 10px ${animal.color}88`;
            btn.title = animal.name;
        }
        el.appendChild(btn);
    });
}
function lighten(hex) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    const mix = (c, t=220) => Math.round(c + (t-c)*0.45);
    return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

function showMergeBanner() {
    const banner = document.getElementById('merge-banner');
    banner.classList.add('hidden');
    void banner.offsetWidth;
    banner.classList.remove('hidden');
    clearTimeout(showMergeBanner._timer);
    showMergeBanner._timer = setTimeout(() => banner.classList.add('hidden'), 1900);
}

const KEY_MAP = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    a: 'left', d: 'right', w: 'up', s: 'down',
    A: 'left', D: 'right', W: 'up', S: 'down',
};

function initBoardDOM() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';
    for (let i = 0; i < 16; i++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.dataset.level = '0';
        tile.innerHTML = `<img class="tile-img" src="" alt="" draggable="false" onerror="this.style.display='none'"><span class="tile-name"></span><span class="tile-num"></span>`;
        tile.addEventListener('click', () => handleTileClick(i));
        boardEl.appendChild(tile);
    }
}

function init() {
    initBoardDOM();
    buildPicker('spawn-picker', [1,2,3,4,5]);
    buildPicker('edit-picker', [0,1,2,3,4,5,6,7,8,9,10,11]);
    document.getElementById('spawn-picker').addEventListener('click', e => {
        const btn = e.target.closest('.level-btn');
        if (btn) confirmSpawn(parseInt(btn.dataset.level));
    });
    document.getElementById('edit-picker').addEventListener('click', e => {
        const btn = e.target.closest('.level-btn');
        if (btn) confirmEdit(parseInt(btn.dataset.level));
    });
    document.getElementById('spawn-cancel').addEventListener('click', cancelSpawn);
    document.getElementById('edit-cancel').addEventListener('click', cancelEdit);
    document.querySelectorAll('.dir-btn').forEach(btn => {
        btn.addEventListener('click', () => handleMove(btn.dataset.dir));
    });
    document.getElementById('btn-edit-mode').addEventListener('click', toggleEditMode);
    document.getElementById('btn-clear').addEventListener('click', clearBoard);
    document.getElementById('btn-random').addEventListener('click', randomBoard);
    document.getElementById('btn-analyze').addEventListener('click', requestSolve);
    const undoBtn = document.getElementById('btn-undo');
    if (undoBtn) undoBtn.addEventListener('click', undo);
    document.addEventListener('keydown', e => {
        if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) e.preventDefault();
        const dir = KEY_MAP[e.key];
        if (dir) handleMove(dir);
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
    });
    initWorker();
    const hadSave = loadGameState();
    renderBoard();
    if (!hadSave) setAIStatus('Ready – Press Analyze or Make a Move');
    else if (state.mode === 'idle') requestSolve();
}

function currentUsername() {
    try {
        const sess = JSON.parse(localStorage.getItem('bm_session') || 'null');
        return sess?.username || null;
    } catch(_){ return null; }
}
function saveGameState() {
    const user = currentUsername();
    if (!user) return;
    try {
        localStorage.setItem('bm_save_'+user, JSON.stringify({
            board: state.board.slice(),
            mode: state.mode === 'spawn' ? 'spawn' : 'idle',
            savedAt: Date.now()
        }));
    } catch(_){}
}
function loadGameState() {
    const user = currentUsername();
    if (!user) return false;
    try {
        const raw = localStorage.getItem('bm_save_'+user);
        if (!raw) return false;
        const saved = JSON.parse(raw);
        if (!saved?.board || saved.board.length !== 16) return false;
        state.board = saved.board.map(v => Number(v) || 0);
        if (saved.mode === 'spawn') {
            state.mode = 'spawn';
            setAIArrow('…', false);
            setAIStatus('في انتظار وضع الحيوان…');
            setModeBar('⚡   انقر على أي خلية فارغة لوضع حيوان');
        }
        setAIStatus('تم استعادة اللعبة – اضغط تحليل');
        return true;
    } catch(_){ return false; }
}
function clearSavedGame() {
    const user = currentUsername();
    if (user) localStorage.removeItem('bm_save_'+user);
}
function logoutGame() {
    if (confirm('هل تريد العودة إلى شاشة تسجيل الدخول؟\n\nاللوحة محفوظة تلقائياً وستجدها عند عودتك.')) {
        localStorage.removeItem('bm_session');
        window.location.replace('login.html');
    }
}
function getRemainingInfo(expiresAt) {
    if (!expiresAt) return null;
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (remaining <= 0) return { text: '⛔ انتهت الصلاحية', color: '#ef5350', expired: true };
    const days = Math.floor(remaining / 86400000);
    const hours = Math.floor((remaining % 86400000) / 3600000);
    const mins = Math.floor((remaining % 3600000) / 60000);
    if (days >= 2) return { text: '⏳ ' + days + ' أيام', color: '#81c784', expired: false };
    if (days === 1) return { text: '⏳ يوم و' + hours + ' ساعة', color: '#ffe082', expired: false };
    if (hours > 0) return { text: '⚠ ' + hours + ' ساعة!', color: '#ffab40', expired: false };
    return { text: '🔴 ' + mins + ' دقيقة!', color: '#ef5350', expired: false };
}
function updateSessionTime() {
    try {
        const sess = JSON.parse(localStorage.getItem('bm_session') || 'null');
        const users = JSON.parse(localStorage.getItem('bm_users') || '[]');
        if (!sess) return;
        const user = users.find(u => u.username === sess.username);
        if (!user?.expiresAt) return;
        const info = getRemainingInfo(user.expiresAt);
        const el = document.getElementById('session-time');
        if (!el || !info) return;
        if (info.expired) {
            localStorage.removeItem('bm_session');
            alert('انتهت صلاحية حسابك. سيتم تسجيل خروجك.');
            window.location.replace('login.html');
            return;
        }
        el.textContent = info.text;
        el.style.color = info.color;
    } catch(_){}
}
function initSessionDisplay() {
    try {
        const sess = JSON.parse(localStorage.getItem('bm_session') || 'null');
        if (sess?.username) {
            const el = document.getElementById('session-user');
            if (el) el.textContent = '⚔ ' + sess.username;
        }
    } catch(_){}
    updateSessionTime();
    setInterval(updateSessionTime, 60000);
}

document.addEventListener('DOMContentLoaded', () => {
    init();
    initSessionDisplay();
});