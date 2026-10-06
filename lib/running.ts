export type Run={id?:string;name:string;date:string;distance:number;seconds:number;hr?:number|null;elevation?:number|null;cadence?:number|null;rpe?:number|null;source:string;url?:string;splits?:number[];notes?:string;files?:string[];timeBasis?:string};
export function duration(s:number){s=Math.round(s);return s>=3600?`${Math.floor(s/3600)}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`:`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}
export function pace(s:number){return Number.isFinite(s)&&s>0?duration(s):'—'}
export function parseTime(s:string){const a=s.trim().split(':').map(Number);if(!a.length||a.length>3||a.some(x=>!Number.isFinite(x)||x<0)||a.slice(1).some(x=>x>=60))return NaN;return a.reduce((v,x)=>v*60+x,0)}
export function analyze(run:Run){
 const out=[`${run.distance.toFixed(2)} km in ${duration(run.seconds)}: ${pace(run.seconds/run.distance)}/km average ${run.timeBasis==='elapsed'?'elapsed':'moving'} pace.`];
 if(run.splits&&run.splits.length>=6){const n=Math.floor(run.splits.length/3),start=run.splits.slice(0,n),end=run.splits.slice(-n);const a=start.reduce((s,v)=>s+v,0)/n,b=end.reduce((s,v)=>s+v,0)/n;out.push(`First ${n} visible kilometres: ${pace(a)}/km. Last ${n}: ${pace(b)}/km. ${Math.abs(b-a).toFixed(0)} sec/km ${b>a?'slower':'faster'} at the end. This comparison does not establish the cause.`)}else out.push('Complete kilometre splits are not available. Pacing drift cannot be assessed from the average alone.');
 if(run.hr)out.push(`Average heart rate: ${run.hr} bpm. Without your measured zones and the heart-rate stream, intensity zones and cardiac drift remain unknown.`);else out.push('No heart-rate measurement supplied. Heart-rate zones and cardiac drift are unavailable.');
 if(run.rpe)out.push(`Reported effort: ${run.rpe}/10. Use this alongside sleep, soreness and your recent training before deciding on another demanding session.`);
 return out;
}
export function predict(distance:number,seconds:number,target:number,exponent=1.06){return seconds*Math.pow(target/distance,exponent)}
export function extractText(text:string):Partial<Run>{
 const clean=text.replace(/,/g,'.');const result:Partial<Run>={source:'screenshot',notes:'OCR draft: all extracted values require review.'};
 const d=clean.match(/(?:Distance\s*)?(\d{1,3}(?:\.\d{1,3})?)\s*km\b/i);if(d)result.distance=Number(d[1]);
 const t=clean.match(/Moving\s*Time[^\n\d]*\s*(\d{1,2}:\d{2}(?::\d{2})?)/i);if(t)result.seconds=parseTime(t[1]);
 const hr=clean.match(/(?:Avg(?:erage)?\s*Heart\s*Rate\s*)?(\d{2,3})\s*bpm/i);if(hr)result.hr=Number(hr[1]);
 const ca=clean.match(/(\d{2,3})\s*spm/i);if(ca)result.cadence=Number(ca[1]);
 const el=clean.match(/Elevation\s*Gain[^\n]*\n(?:\s*\d{1,2}:\d{2}(?::\d{2})?)?\s*(\d{1,5})\s*m\b/i)||clean.match(/Elevation\s*Gain\s*(\d{1,5})\s*m\b/i);if(el)result.elevation=Number(el[1]);
 const splits=[...clean.matchAll(/^\s*\d{1,2}\s+(\d{1,2}:\d{2})\b/gm)].map(m=>parseTime(m[1]));if(splits.length)result.splits=splits;
 return result;
}
export const examples:Run[]=[{id:'example-1',name:'Progression run',date:'2026-10-04',distance:8,seconds:2880,hr:151,elevation:32,source:'example',rpe:6,splits:[400,390,375,365,350,340,330,330]},{id:'example-2',name:'Sunday long run',date:'2026-09-27',distance:20,seconds:8400,source:'example',rpe:5,splits:[420,425,415,410,420,420,415,410,415,420,420,425,420,415,420,425,430,420,425,425]}];
