import {test} from 'node:test';import assert from 'node:assert/strict';
import {trainingBrief,answerTraining} from '../lib/intelligence.ts';
const a={id:'a',name:'Run',date:'2026-10-05',distance:10,seconds:3600,source:'manual'};
test('zero prior period does not invent a percentage trend',()=>{const b=trainingBrief([a],a);assert.match(b.findings[0].detail,/no percentage comparison/)});
test('selected-run analysis excludes future activities',()=>{const b=trainingBrief([a,{...a,id:'b',date:'2026-10-06',distance:100}],a);assert.equal(b.coverage.km28,10)});
test('partial splits are identified',()=>{const b=trainingBrief([{...a,splits:[300,300,300,300,300,300]}],{...a,splits:[300,300,300,300,300,300]});assert.ok(b.findings.some(f=>f.title==='Incomplete pacing evidence'))});
test('compares distance and consistent time basis',()=>{const b=trainingBrief([a,{...a,id:'b',date:'2026-10-03',seconds:3700},{...a,id:'c',date:'2026-10-01',seconds:3800},{...a,id:'d',date:'2026-09-30',seconds:500,timeBasis:'elapsed'}],a);assert.match(b.findings.find(f=>f.title==='Compared with similar distances')!.detail,/2 earlier runs/)});
test('recovery baseline needs prior observations',()=>{const b=trainingBrief([a],a,[{date:'2026-10-05',sleep:7,fatigue:2,soreness:1,restingHR:60}]);assert.ok(!b.findings.some(f=>f.title==='Resting heart-rate baseline'))});
test('unsupported questions do not masquerade as answered',()=>assert.match(answerTraining('Who won the world cup?',[a],a,[]),/not a general-purpose language model/));
