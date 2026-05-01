/**
 * Transaction reconciliation engine.
 *
 * Matches user-reported transactions against exchange-reported transactions
 * using (type family, asset, timestamp proximity, quantity proximity) to pair
 * candidates, then classifies each pair:
 *   • matched    — every field (except transactionId) is identical
 *   • discrepancy — paired within tolerance but at least one field differs
 *
 * Type families (BUY ↔ SELL, TRANSFER_IN ↔ TRANSFER_OUT) are interchangeable
 * for pairing; a type mismatch within the family is reported as a discrepancy.
 */

// ── Default tolerance thresholds (used when the caller omits values) ────────

const DEFAULT_TOLERANCES = {
  /** Maximum timestamp gap (ms) to consider two txns as candidate pairs. */
  timestampToleranceMs: 5 * 60 * 1000, // 5 minutes
  /** Maximum relative quantity difference to consider two txns as candidate pairs. */
  quantityTolerancePct: 0.001, // 0.1 %
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * BUY / SELL belong to the TRADE family.
 * TRANSFER_IN / TRANSFER_OUT belong to the TRANSFER family.
 * Transactions within the same family are eligible for pairing; a type
 * difference within the family is flagged as a discrepancy rather than
 * leaving both sides unmatched.
 */
const TYPE_FAMILY = {
  BUY: 'TRADE',
  SELL: 'TRADE',
  TRANSFER_IN: 'TRANSFER',
  TRANSFER_OUT: 'TRANSFER',
};

function getMatchKey(type, asset) {
  return `${TYPE_FAMILY[type] || type}:${asset}`;
}

function relDiff(a, b) {
  if (a === b) return 0;
  const max = Math.max(Math.abs(a), Math.abs(b));
  if (max === 0) return 0;
  return Math.abs(a - b) / max;
}

// ── Discrepancy detection ───────────────────────────────────────────────────

/**
 * Compare every field (except transactionId) for strict equality.
 * Any difference — no matter how small — produces a discrepancy entry.
 */
function findDiscrepancies(userTxn, exchTxn) {
  const diffs = [];

  // Type
  if (userTxn.type !== exchTxn.type) {
    diffs.push({ field: 'type', userValue: userTxn.type, exchangeValue: exchTxn.type });
  }

  // Timestamp
  const userTime = new Date(userTxn.timestamp).getTime();
  const exchTime = new Date(exchTxn.timestamp).getTime();
  if (userTime !== exchTime) {
    diffs.push({ field: 'timestamp', userValue: userTxn.timestamp, exchangeValue: exchTxn.timestamp });
  }

  // Quantity
  if (userTxn.quantity !== exchTxn.quantity) {
    diffs.push({ field: 'quantity', userValue: userTxn.quantity, exchangeValue: exchTxn.quantity });
  }

  // Price
  const uPrice = userTxn.priceUsd ?? null;
  const ePrice = exchTxn.priceUsd ?? null;
  if (uPrice !== ePrice) {
    diffs.push({ field: 'priceUsd', userValue: uPrice, exchangeValue: ePrice });
  }

  // Fee
  if (userTxn.fee !== exchTxn.fee) {
    diffs.push({ field: 'fee', userValue: userTxn.fee, exchangeValue: exchTxn.fee });
  }

  return diffs;
}

// ── Core matching algorithm ─────────────────────────────────────────────────

/**
 * Pair user transactions with exchange transactions.
 *
 * Strategy (greedy, per-group):
 *  1. Bucket both sides by (type family, asset).
 *  2. Sort user bucket by timestamp.
 *  3. For each user txn, find the best available exchange candidate whose
 *     timestamp and quantity are both within the configured tolerances.
 *     "Best" = smallest composite score (timeDiff + scaled quantityDiff).
 *  4. Classify the pair: all fields identical → matched, else → discrepancy.
 *  5. Any leftovers are unmatched.
 *
 * @param {Array}  userTxns
 * @param {Array}  exchangeTxns
 * @param {Object} [tolerances] — { timestampToleranceMs, quantityTolerancePct }
 */
function matchTransactions(userTxns, exchangeTxns, tolerances = {}) {
  const tsToleranceMs =
    tolerances.timestampToleranceMs ?? DEFAULT_TOLERANCES.timestampToleranceMs;
  const qtyTolerancePct =
    tolerances.quantityTolerancePct ?? DEFAULT_TOLERANCES.quantityTolerancePct;

  // ── group by match key ──
  const userGroups = {};
  for (const txn of userTxns) {
    const key = getMatchKey(txn.type, txn.asset);
    (userGroups[key] = userGroups[key] || []).push(txn);
  }

  const exchangeGroups = {};
  for (const txn of exchangeTxns) {
    const key = getMatchKey(txn.type, txn.asset);
    (exchangeGroups[key] = exchangeGroups[key] || []).push(txn);
  }

  const matched = [];
  const discrepancies = [];
  const matchedUserIds = new Set();
  const matchedExchangeIds = new Set();

  for (const [key, userGroup] of Object.entries(userGroups)) {
    const exchangeGroup = exchangeGroups[key];
    if (!exchangeGroup) continue;

    const available = [...exchangeGroup]; // mutable copy
    userGroup.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    for (const userTxn of userGroup) {
      const userTime = new Date(userTxn.timestamp).getTime();
      let bestIdx = -1;
      let bestScore = Infinity;

      for (let i = 0; i < available.length; i++) {
        const exchTime = new Date(available[i].timestamp).getTime();
        const timeDiff = Math.abs(userTime - exchTime);
        if (timeDiff > tsToleranceMs) continue;

        const qtyDiff = relDiff(userTxn.quantity, available[i].quantity);
        if (qtyDiff > qtyTolerancePct) continue;

        // Composite score: time proximity (ms) + scaled quantity divergence
        const score = timeDiff + qtyDiff * 1e9;

        if (score < bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      if (bestIdx === -1) continue;

      const exchTxn = available[bestIdx];
      available.splice(bestIdx, 1);

      const diffs = findDiscrepancies(userTxn, exchTxn);
      const pair = {
        userTransactionId: userTxn._id,
        exchangeTransactionId: exchTxn._id,
        discrepancies: diffs,
      };

      if (diffs.length > 0) {
        discrepancies.push(pair);
      } else {
        matched.push(pair);
      }

      matchedUserIds.add(userTxn._id.toString());
      matchedExchangeIds.add(exchTxn._id.toString());
    }
  }

  const unmatchedUser = userTxns
    .filter((t) => !matchedUserIds.has(t._id.toString()))
    .map((t) => t._id);

  const unmatchedExchange = exchangeTxns
    .filter((t) => !matchedExchangeIds.has(t._id.toString()))
    .map((t) => t._id);

  return { matched, discrepancies, unmatchedUser, unmatchedExchange };
}

// ── Orchestrator ────────────────────────────────────────────────────────────

/**
 * Run a full reconciliation for two already-ingested files.
 *
 * @param {Object}   opts
 * @param {ObjectId} opts.userFileId
 * @param {ObjectId} opts.exchangeFileId
 * @param {Object}   [opts.tolerances] — optional overrides for matching window
 * @param {Object}   opts.models — { Transaction, ReconciliationReport, ReconciliationResult }
 * @returns {Promise<Document>} the saved ReconciliationReport
 */
async function reconcile({ userFileId, exchangeFileId, tolerances, models }) {
  const { Transaction, ReconciliationReport, ReconciliationResult } = models;

  // Resolve effective tolerances (request overrides + defaults)
  const effective = {
    timestampToleranceMs:
      tolerances?.timestampToleranceMs ?? DEFAULT_TOLERANCES.timestampToleranceMs,
    quantityTolerancePct:
      tolerances?.quantityTolerancePct ?? DEFAULT_TOLERANCES.quantityTolerancePct,
  };

  const report = await ReconciliationReport.create({
    userFileId,
    exchangeFileId,
    tolerances: effective,
    status: 'processing',
  });

  try {
    const [userTxns, exchangeTxns] = await Promise.all([
      Transaction.find({ fileId: userFileId }).lean(),
      Transaction.find({ fileId: exchangeFileId }).lean(),
    ]);

    const { matched, discrepancies, unmatchedUser, unmatchedExchange } =
      matchTransactions(userTxns, exchangeTxns, effective);

    // Build result docs
    const results = [];

    for (const m of matched) {
      results.push({ reportId: report._id, status: 'matched', ...m });
    }
    for (const d of discrepancies) {
      results.push({ reportId: report._id, status: 'discrepancy', ...d });
    }
    for (const id of unmatchedUser) {
      results.push({ reportId: report._id, status: 'unmatched_user', userTransactionId: id });
    }
    for (const id of unmatchedExchange) {
      results.push({
        reportId: report._id,
        status: 'unmatched_exchange',
        exchangeTransactionId: id,
      });
    }

    if (results.length > 0) {
      await ReconciliationResult.insertMany(results, { ordered: false });
    }

    report.summary = {
      totalUserTransactions: userTxns.length,
      totalExchangeTransactions: exchangeTxns.length,
      matchedCount: matched.length,
      discrepancyCount: discrepancies.length,
      unmatchedUserCount: unmatchedUser.length,
      unmatchedExchangeCount: unmatchedExchange.length,
    };
    report.status = 'completed';
    await report.save();

    return report;
  } catch (err) {
    report.status = 'failed';
    report.error = err.message;
    await report.save().catch(() => {});
    throw err;
  }
}

module.exports = { matchTransactions, findDiscrepancies, reconcile, DEFAULT_TOLERANCES };
