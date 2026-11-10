/* 开心岛 V2: parent reviews both versions before resolving a conflict.
 * Pure data helper. Caller must durably store decision, submit with latest CAS
 * revision, read back confirmation, and ONLY THEN acknowledge old outbox entry.
 */
(() => {
'use strict';
const ops = typeof module !== 'undefined' && module.exports
  ? require('./v2-operation-engine.js') : window.KaixinV2Operations;
const clone = value => JSON.parse(JSON.stringify(value));
const entities = ['homework','events','classes','recurringTasks'];
function fail(code) { const e = new Error(code); e.code = code; throw e; }
function record(payload, op) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !entities.includes(op?.entity)) fail('invalid_review');
  const list = payload[op.entity];
  if (list !== undefined && !Array.isArray(list)) fail('invalid_entity_array');
  const matches = (list || []).filter(item => item?.id === op.id);
  if (matches.length > 1) fail('duplicate_record_id');
  return matches.length ? clone(matches[0]) : null;
}
function proposed(op, remote) {
  if (op.action === 'add') return clone(op.next);
  if (op.action === 'remove') return null;
  if (op.action !== 'patch' || !op.changes || Array.isArray(op.changes) || !remote) fail('unsupported_review');
  const output = clone(remote);
  for (const [field, delta] of Object.entries(op.changes)) {
    if (['id','__proto__','prototype','constructor'].includes(field) || !delta || typeof delta.nextHas !== 'boolean')
      fail('invalid_patch');
    if (delta.nextHas) output[field] = clone(delta.next);
    else delete output[field];
  }
  return output;
}
function prepare({payload, operation, revision}) {
  if (!Number.isInteger(revision) || revision < 1 || !operation || typeof operation.operationId !== 'string') fail('invalid_review');
  const conflict = ops.apply(payload, operation);
  if (conflict.outcome !== 'conflict') fail('not_a_conflict');
  const remote = record(payload, operation);
  const local = proposed(operation, remote);
  return {schema:1, status:'awaiting_parent', operation:clone(operation), revision,
    conflictingFields:clone(conflict.fields), remote, local, decision:null};
}
function choose(review, side, newOperationId) {
  if (!review || review.schema !== 1 || review.status !== 'awaiting_parent') fail('invalid_review');
  if (!['remote','local'].includes(side)) fail('invalid_parent_choice');
  if (side === 'remote') return {status:'parent_selected_remote', baseRevision:review.revision,
    originalOperationId:review.operation.operationId,
    preservedAlternative:clone(review.local), selected:clone(review.remote), operation:null};
  if (typeof newOperationId !== 'string' || !newOperationId || newOperationId === review.operation.operationId)
    fail('invalid_resolution_id');
  const operation = ops.make({entity:review.operation.entity, before:review.remote, after:review.local,
    operationId:newOperationId});
  return {status:'parent_selected_local', baseRevision:review.revision,
    originalOperationId:review.operation.operationId,
    preservedAlternative:clone(review.remote), selected:clone(review.local), operation};
}
const api=Object.freeze({prepare,choose});
if (typeof module !== 'undefined' && module.exports) module.exports=api;
if (typeof window !== 'undefined') window.KaixinV2ConflictReview=api;
})();