/* 开心岛 V2：无损操作合并核心
 * 纯数据规则；不连接网络，不读写本机存储，也不修改线上页面。
 * 调用者必须先将 operation 持久化，再提交经身份验证的 family_save_v2。
 * 注意：当前 SQL 对孩子的全量写入仍禁止；孩子完成任务须由后续专用授权 RPC 实现。
 */
(() => {
  'use strict';
  const ENTITIES = Object.freeze(['homework', 'events', 'classes', 'recurringTasks']);
  const ACTIONS = Object.freeze(['add', 'patch', 'remove']);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const clone = value => JSON.parse(JSON.stringify(value));
  const stable = value => {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
    }
    return JSON.stringify(value);
  };
  const same = (a, b) => stable(a) === stable(b);
  const record = item => !!item && typeof item === 'object' && !Array.isArray(item)
    && typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 128;
  const allowedField = key => !['id', '__proto__', 'prototype', 'constructor'].includes(key);
  function invalid(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }
  function make({ entity, before = null, after = null, operationId, createdAt }) {
    if (!ENTITIES.includes(entity)) throw invalid('unsupported_entity');
    if (typeof operationId !== 'string' || !operationId || operationId.length > 128)
      throw invalid('invalid_operation_id');
    if (before === null && after === null) throw invalid('missing_change');
    if (before !== null && !record(before)) throw invalid('invalid_base_record');
    if (after !== null && !record(after)) throw invalid('invalid_target_record');
    if (before && after && before.id !== after.id) throw invalid('id_cannot_change');

    const id = (after || before).id;
    const envelope = { schema: 1, entity, id, operationId, createdAt: createdAt || new Date().toISOString() };
    if (before === null) return { ...envelope, action: 'add', next: clone(after) };
    if (after === null) return { ...envelope, action: 'remove', base: clone(before) };

    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter(key => key !== 'id' && !same(before[key], after[key]));
    if (!keys.length) throw invalid('no_change');
    if (keys.some(key => !allowedField(key))) throw invalid('unsafe_field');
    const changes = {};
    for (const key of keys) {
      changes[key] = {
        baseHas: own(before, key), base: own(before, key) ? clone(before[key]) : null,
        nextHas: own(after, key), next: own(after, key) ? clone(after[key]) : null
      };
    }
    return { ...envelope, action: 'patch', changes };
  }
  function apply(payload, operation) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || !operation || operation.schema !== 1 || !ENTITIES.includes(operation.entity)
      || !ACTIONS.includes(operation.action) || typeof operation.id !== 'string') {
      throw invalid('invalid_operation');
    }
    const list = payload[operation.entity];
    if (list !== undefined && !Array.isArray(list)) throw invalid('invalid_entity_array');
    const items = list || [];
    const positions = [];
    for (let i = 0; i < items.length; i++) if (items[i]?.id === operation.id) positions.push(i);
    const conflict = fields => ({ outcome: 'conflict', reason: 'concurrent_edit', fields });
    if (positions.length > 1) return conflict(['id']);
    const pos = positions.length ? positions[0] : -1;
    const current = pos >= 0 ? items[pos] : null;
    let replacement;

    if (operation.action === 'add') {
      if (!record(operation.next) || operation.next.id !== operation.id) throw invalid('invalid_add_record');
      if (current) return same(current, operation.next)
        ? { outcome: 'already_applied' } : conflict(['id']);
      replacement = [...items, clone(operation.next)];
    } else if (operation.action === 'remove') {
      if (!record(operation.base) || operation.base.id !== operation.id) throw invalid('invalid_remove_record');
      if (!current) return { outcome: 'already_applied' };
      // A changed record cannot be removed without explicit conflict resolution.
      if (!same(current, operation.base)) return conflict(['record']);
      replacement = items.filter((_, index) => index !== pos);
    } else {
      if (!current || !record(current)) return conflict(['missing_record']);
      const edits = operation.changes;
      if (!edits || typeof edits !== 'object' || Array.isArray(edits)
        || !Object.keys(edits).length || Object.keys(edits).some(key => !allowedField(key)))
        throw invalid('invalid_patch');
      const candidates = {};
      const conflicts = [];
      let changed = false;
      for (const [key, delta] of Object.entries(edits)) {
        if (!delta || typeof delta !== 'object'
          || typeof delta.baseHas !== 'boolean' || typeof delta.nextHas !== 'boolean')
          throw invalid('invalid_patch_field');
        const has = own(current, key);
        const base = delta.baseHas && has && same(current[key], delta.base);
        const sameBase = has === delta.baseHas && (!has || base);
        const sameTarget = has === delta.nextHas && (!has || same(current[key], delta.next));
        if (sameTarget) continue;
        if (!sameBase) { conflicts.push(key); continue; }
        candidates[key] = delta;
        changed = true;
      }
      if (conflicts.length) return conflict(conflicts);
      if (!changed) return { outcome: 'already_applied' };
      const newItem = clone(current);
      for (const [key, delta] of Object.entries(candidates)) {
        if (delta.nextHas) newItem[key] = clone(delta.next);
        else delete newItem[key];
      }
      replacement = [...items];
      replacement[pos] = newItem;
    }
    // Never mutate the supplied payload; leave unrelated fields, including historical
    // rewards, inventory, and other family state untouched.
    return { outcome: 'changed', payload: { ...payload, [operation.entity]: replacement } };
  }
  function applyBatch(payload, operations) {
    if (!Array.isArray(operations)) throw invalid('invalid_batch');
    let state = payload;
    const applied = [];
    for (const op of operations) {
      const result = apply(state, op);
      if (result.outcome === 'conflict') {
        return { outcome: 'conflict', operationId: op.operationId, fields: result.fields,
          applied: applied.slice(), payload: state };
      }
      if (result.outcome === 'changed') state = result.payload;
      applied.push({ operationId: op.operationId, outcome: result.outcome });
    }
    return { outcome: 'ready', payload: state, applied };
  }
  const api = Object.freeze({ entities: ENTITIES, make, apply, applyBatch });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.KaixinV2Operations = api;
})();
