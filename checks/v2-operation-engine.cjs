const assert = require('node:assert/strict');
const ops = require('../dist/v2-operation-engine.js');
let seq = 0;
const id = () => 'qa-op-' + ++seq;
const op = (entity, before, after) => ops.make({ entity, before, after, operationId: id(), createdAt:'2026-11-10T00:00:00Z' });
const original = {
  kidName:'QA-CHILD', points:356, rewardsUnlocked:['test-history'],
  demoGrowth:{room:{desk:'toy'},receipts:{preserved:true}},
  homework:[{id:'h1',subject:'语文',content:'写字',done:false,attachments:[],createdAt:'2026-11-09'}],
  events:[{id:'e1',title:'游泳',date:'2026-11-10',start:'15:30',checklist:[{name:'泳帽',done:false}],owner:'parent'}],
  classes:[{id:'c1',name:'钢琴',days:[1],bring:['课本'],active:true}],
  recurringTasks:[{id:'r1',subject:'英语',frequency:'weekly',active:true}]
};
const starting=JSON.parse(JSON.stringify(original));
const newHomework={id:'h2',subject:'数学',content:'练习题',done:false,attachments:[]};
const add=op('homework',null,newHomework);
const added=ops.apply(original,add);
assert.equal(added.outcome,'changed');
assert.deepEqual(added.payload.homework.map(x=>x.id),['h1','h2']);
assert.deepEqual(original,starting,'apply must never mutate original state');
assert.equal(ops.apply(added.payload,add).outcome,'already_applied','ACK lost then retry must be idempotent');
const changedSameId={...newHomework,content:'另一个设备不同内容'};
assert.deepEqual(ops.apply({...original,homework:[...original.homework,changedSameId]},add).fields,['id'],
  'existing ID with different content must not overwrite');

const base=original.homework[0];
const parent=op('homework',base,{...base,content:'改成写三行'});
const child=op('homework',base,{...base,done:true,completedAt:'2026-11-10T16:00:00Z'});
const afterParent=ops.apply(original,parent);
const afterChild=ops.apply(afterParent.payload,child);
assert.equal(afterChild.outcome,'changed','non-overlapping child completion should merge with parent title edit');
assert.equal(afterChild.payload.homework[0].content,'改成写三行');
assert.equal(afterChild.payload.homework[0].done,true);
assert.equal(afterChild.payload.homework[0].completedAt,'2026-11-10T16:00:00Z');
assert.equal(afterChild.payload.demoGrowth.receipts.preserved,true);
assert.equal(afterChild.payload.points,356,'no unintended new points or balance changes');

const reverse=ops.apply(ops.apply(original,child).payload,parent);
assert.equal(reverse.payload.homework[0].content,'改成写三行');
assert.equal(reverse.payload.homework[0].done,true);

const conflictEdit=op('homework',base,{...base,content:'家长另改一版'});
const conflict=ops.apply(afterParent.payload,conflictEdit);
assert.equal(conflict.outcome,'conflict','same field concurrent edits must never silently win');
assert.deepEqual(conflict.fields,['content']);
assert.equal(afterParent.payload.homework[0].content,'改成写三行');

const already=ops.apply(afterParent.payload,parent);
assert.equal(already.outcome,'already_applied');
const partialBase={...base,completedAt:null};
const patch=op('homework',partialBase,{...partialBase,content:'写完整',done:true});
const partial=ops.apply({...original,homework:[{...partialBase,content:'写完整'}]},patch);
assert.equal(partial.outcome,'changed');
assert.equal(partial.payload.homework[0].done,true);
assert.equal(partial.payload.homework[0].content,'写完整');

const eventBase=original.events[0];
const eventMemo=op('events',eventBase,{...eventBase,note:'爸爸接'});
const eventPacking=op('events',eventBase,{...eventBase,checklist:[...eventBase.checklist,{name:'水杯',done:false}]});
const ev1=ops.apply(original,eventMemo);
const ev2=ops.apply(ev1.payload,eventPacking);
assert.equal(ev2.payload.events[0].note,'爸爸接');
assert.deepEqual(ev2.payload.events[0].checklist.map(x=>x.name),['泳帽','水杯']);
const conflictPacking=op('events',eventBase,{...eventBase,checklist:[{name:'泳衣',done:false}]});
assert.deepEqual(ops.apply(ev2.payload,conflictPacking).fields,['checklist'],
  'two different edits of the same packing list require manual conflict handling');

const classBase=original.classes[0];
const classBring=op('classes',classBase,{...classBase,bring:['课本','围棋']});
const classShift=op('classes',classBase,{...classBase,start:'16:00'});
const mergedClass=ops.apply(ops.apply(original,classBring).payload,classShift);
assert.deepEqual(mergedClass.payload.classes[0].bring,['课本','围棋']);
assert.equal(mergedClass.payload.classes[0].start,'16:00');
const recurringBase=original.recurringTasks[0];
const r=op('recurringTasks',recurringBase,{...recurringBase,active:false});
assert.equal(ops.apply(original,r).payload.recurringTasks[0].active,false);

const deleteBase=original.events[0];
const removal=op('events',deleteBase,null);
const deleted=ops.apply(original,removal);
assert.deepEqual(deleted.payload.events,[]);
assert.equal(ops.apply(deleted.payload,removal).outcome,'already_applied');
assert.deepEqual(ops.apply(ev2.payload,removal).fields,['record'],
  'stale delete must not remove a new schedule note or packing item');
assert.deepEqual(ops.apply({...original,events:[]},eventMemo).fields,['missing_record'],
  'stale edit must not resurrect deleted event');
assert.equal(original.events.length,1);

const batch=ops.applyBatch(original,[add,eventMemo,classBring,r]);
assert.equal(batch.outcome,'ready');
assert.equal(batch.applied.length,4);
assert.equal(batch.payload.homework.length,2);
assert.equal(batch.payload.events[0].note,'爸爸接');
assert.deepEqual(batch.payload.classes[0].bring,['课本','围棋']);
assert.equal(batch.payload.recurringTasks[0].active,false);
const batchConflict=ops.applyBatch(afterParent.payload,[eventMemo,conflictEdit]);
assert.equal(batchConflict.outcome,'conflict');
assert.equal(batchConflict.operationId,conflictEdit.operationId);
assert.deepEqual(batchConflict.fields,['content']);
assert.equal(batchConflict.payload.homework[0].content,'改成写三行');

assert.throws(()=>op('demoGrowth',null,{id:'xyz'}),/unsupported_entity/);
assert.throws(()=>op('homework',{id:'1'},{id:'2'}),/id_cannot_change/);
assert.throws(()=>op('homework',base,{...base}),/no_change/);
assert.throws(()=>ops.apply(original,{schema:1,entity:'events',id:'e1',action:'patch',
  changes:{id:{baseHas:true,nextHas:true,base:'e1',next:'oops'}}}),/invalid_patch/);
assert.equal(ops.apply({...original,homework:[base,base]},parent).outcome,'conflict');
assert.throws(()=>ops.apply({...original,events:'not-array'},eventMemo),/invalid_entity_array/);
const malicious=JSON.parse('{"id":"h1","__proto__":{"hacked":true}}');
assert.throws(()=>op('homework',base,malicious),/unsafe_field/);
assert.equal({}.hacked,undefined);

console.log('PASS 36+ V2 operation assertions: add/patch/delete across homework/events/classes/recurring, idempotency, independent field merge, conflict blocking, stale deletes, family history preservation, malicious input and batch integrity');
