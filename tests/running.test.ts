import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractText,parseTime,duration,predict,analyze} from '../lib/running.ts';
test('extracts two-column Strava summary without confusing pace for duration',()=>{const x=extractText('Distance AvgPace\n7.07 km 6:00 /km\nMoving Time Elevation Gain\n42:24 108 m\nAvg Heart Rate Avg Cadence\n157 bpm 160 spm');assert.equal(x.distance,7.07);assert.equal(x.seconds,2544);assert.equal(x.elevation,108);assert.equal(x.hr,157);assert.equal(x.cadence,160)});
test('missing measurements stay missing',()=>{const x=extractText('Long run\n30.00 km');assert.equal(x.seconds,undefined);assert.equal(x.hr,undefined)});
test('invalid clock fields are rejected',()=>{assert.ok(Number.isNaN(parseTime('4:99')));assert.equal(parseTime('3:50:09'),13809);assert.equal(duration(13809),'3:50:09')});
test('same-distance race equivalent preserves time',()=>assert.equal(predict(5,1637,5),1637));
test('split comparison reports observed slowdown, without attributing cause',()=>{const t=analyze({name:'Long',date:'2026-01-01',distance:6,seconds:2700,source:'manual',splits:[400,400,450,450,500,500]});assert.match(t[1],/100 sec\/km slower/);assert.match(t[1],/does not establish the cause/)});
