// ============================================================
// engine.js — pure poker logic. No DOM here on purpose:
// keeping rules/math separate from rendering makes both easier
// to reason about and test.
// ============================================================

const SUITS = ['s', 'h', 'd', 'c']; // spades, hearts, diamonds, clubs
const RANKS = [2,3,4,5,6,7,8,9,10,11,12,13,14]; // 11=J 12=Q 13=K 14=A

function makeDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ rank: r, suit: s });
  return deck;
}

function shuffle(deck) {
  const d = deck.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

const RANK_NAME = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
function rankLabel(r) { return RANK_NAME[r] || String(r); }
function suitSymbol(s) { return { s: '♠', h: '♥', d: '♦', c: '♣' }[s]; }

// ---- Hand evaluation --------------------------------------
// Category numbers, higher is better:
// 8 straight flush, 7 quads, 6 full house, 5 flush, 4 straight,
// 3 trips, 2 two pair, 1 pair, 0 high card
const CATEGORY_NAMES = [
  'High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight',
  'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'
];

function evaluate5(cards) {
  // cards: array of 5 {rank, suit}
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);

  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  // groups: [ [rank, count], ... ] sorted by count desc, then rank desc
  const groups = Object.entries(counts)
    .map(([r, c]) => [Number(r), c])
    .sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));

  // straight check (handles wheel A-2-3-4-5)
  const uniqueRanksDesc = [...new Set(ranks)];
  let straightHigh = null;
  if (uniqueRanksDesc.length === 5) {
    if (uniqueRanksDesc[0] - uniqueRanksDesc[4] === 4) {
      straightHigh = uniqueRanksDesc[0];
    } else if (uniqueRanksDesc.join(',') === '14,5,4,3,2') {
      straightHigh = 5; // wheel: A counts low, straight "high card" is 5
    }
  }

  if (straightHigh && isFlush) return [8, straightHigh];
  if (groups[0][1] === 4) {
    const kicker = groups[1][0];
    return [7, groups[0][0], kicker];
  }
  if (groups[0][1] === 3 && groups[1][1] === 2) {
    return [6, groups[0][0], groups[1][0]];
  }
  if (isFlush) return [5, ...ranks];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][1] === 3) {
    const kickers = groups.slice(1).map(g => g[0]).sort((a, b) => b - a);
    return [3, groups[0][0], ...kickers];
  }
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairRanks = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    const kicker = groups[2][0];
    return [2, ...pairRanks, kicker];
  }
  if (groups[0][1] === 2) {
    const kickers = groups.slice(1).map(g => g[0]).sort((a, b) => b - a);
    return [1, groups[0][0], ...kickers];
  }
  return [0, ...ranks];
}

function compareScores(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0, bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function combinations5(arr) {
  // arr has 7 items -> all C(7,5) = 21 combos of index sets
  const results = [];
  const n = arr.length;
  const combo = [];
  function rec(start) {
    if (combo.length === 5) { results.push(combo.slice()); return; }
    for (let i = start; i < n; i++) {
      combo.push(arr[i]);
      rec(i + 1);
      combo.pop();
    }
  }
  rec(0);
  return results;
}

// Best hand out of holeCards (2) + community (up to 5). Works for
// any total of 5,6,7 cards.
function evaluateBest(holeCards, communityCards) {
  const all = [...holeCards, ...communityCards];
  if (all.length < 5) throw new Error('need at least 5 cards to evaluate');
  const combos = all.length === 5 ? [all] : combinations5(all);
  let best = null;
  for (const combo of combos) {
    const score = evaluate5(combo);
    if (!best || compareScores(score, best.score) > 0) {
      best = { score, cards: combo };
    }
  }
  return best; // { score: [cat, ...tiebreaks], cards: [5 cards] }
}

function describeScore(score) {
  return CATEGORY_NAMES[score[0]];
}

// ---- Side pots ----------------------------------------------
// players: [{ id, folded, totalContributed }]
// Returns [{ amount, eligibleIds: [id,...] }] ordered main pot first.
function computeSidePots(players) {
  const contributors = players.filter(p => p.totalContributed > 0);
  if (contributors.length === 0) return [];
  const levels = [...new Set(contributors.map(p => p.totalContributed))].sort((a, b) => a - b);
  const pots = [];
  let prevLevel = 0;
  for (const level of levels) {
    let amount = 0;
    for (const p of players) {
      amount += Math.max(0, Math.min(p.totalContributed, level) - prevLevel);
    }
    const eligibleIds = players
      .filter(p => !p.folded && p.totalContributed >= level)
      .map(p => p.id);
    if (amount > 0 && eligibleIds.length > 0) {
      pots.push({ amount, eligibleIds });
    }
    prevLevel = level;
  }
  return pots;
}

if (typeof module !== 'undefined') {
  module.exports = {
    makeDeck, shuffle, rankLabel, suitSymbol,
    evaluate5, evaluateBest, compareScores, describeScore,
    computeSidePots, CATEGORY_NAMES
  };
}
