/** Read only the public HTML response. Never inspect hydration state behind login. */
export type LinkPreview={url:string;activityId?:string;name?:string;date?:string;distance?:number;seconds?:number;elevation?:number;source:'strava-link';status:'summary'|'partial'|'login-required';message:string;retrievedAt:string};
const hosts=new Set(['strava.com','www.strava.com','strava.app.link']);
export function validateStravaUrl(raw:string){let u:URL;try{u=new URL(raw.trim())}catch{throw new Error('Enter a valid Strava activity link.')}if(u.protocol!=='https:'||!hosts.has(u.hostname)||u.port||u.username||u.password)throw new Error('Only HTTPS Strava activity links are supported.');if(u.hostname==='strava.app.link'){if(!/^\/[A-Za-z0-9]+$/.test(u.pathname))throw new Error('Use the activity share link from Strava.')}else if(!/^\/activities\/\d+\/?$/.test(u.pathname))throw new Error('Use a Strava activity URL, not a profile or route.');u.hash='';return u}
function decode(s:string){return s.replace(/&#(?:x([0-9a-f]+)|(\d+));/gi,(_,h,n)=>{const c=parseInt(h||n,h?16:10);return c<=0x10ffff?String.fromCodePoint(c):''}).replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')}
export function publicActivityLink(html:string){for(const tag of html.match(/<a\b[^>]*>/gi)||[]){const href=tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];if(!href)continue;try{const u=validateStravaUrl(decode(href));if(u.hostname!=='strava.app.link')return u.toString()}catch{}}return null}
function meta(html:string,key:string){for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){const attrs:Record<string,string>={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g))attrs[m[1].toLowerCase()]=decode(m[2]);if(attrs.property===key||attrs.name===key)return attrs.content||''}return ''}
export function parsePublicStrava(html:string,rawUrl:string):LinkPreview{
 const u=validateStravaUrl(rawUrl);const activityId=u.pathname.match(/\/activities\/(\d+)/)?.[1];const url=activityId?`https://www.strava.com/activities/${activityId}`:u.toString();
 const name=(meta(html,'og:title')||meta(html,'title')||decode(html.match(/<title[^>]*>([^<]+)/i)?.[1]||'')).replace(/\s*\|\s*Strava\s*$/i,'').trim();
 const description=meta(html,'og:description')||meta(html,'description');const d=description.match(/\bon ([A-Za-z]+) (\d{1,2}), (\d{4})/);const months=['January','February','March','April','May','June','July','August','September','October','November','December'];let date:string|undefined;if(d&&months.includes(d[1]))date=`${d[3]}-${String(months.indexOf(d[1])+1).padStart(2,'0')}-${d[2].padStart(2,'0')}`;
 const visible=decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ');
 const gated=/log\s*in\s+to\s+(see|view)|sign\s*in\s+to\s+(see|view)/i.test(visible);
 const base={url,activityId,...(name&&name!=='Strava'?{name}:{}),...(date?{date}:{}),source:'strava-link' as const,retrievedAt:new Date().toISOString()};
 if(gated)return {...base,status:'login-required',message:'Strava exposes the title/date but requires login for activity measurements. Add screenshots or use an authorized import. No hidden activity data was read.'};
 const distanceMatch=visible.match(/\bDistance\s*([\d,.]+)\s*(km|mi)\b/i)||visible.match(/\b([\d,.]+)\s*(km|mi)\s*Distance\b/i);
 const timeMatch=visible.match(/\bMoving Time\s*(\d{1,3}:\d{2}(?::\d{2})?)/i)||visible.match(/\b(\d{1,3}:\d{2}(?::\d{2})?)\s*Moving Time\b/i);
 const elevationMatch=visible.match(/\bElevation Gain\s*([\d,.]+)\s*(m|ft)\b/i)||visible.match(/\b([\d,.]+)\s*(m|ft)\s*Elevation Gain\b/i);
 const distance=distanceMatch?Number(distanceMatch[1].replace(/,/g,''))*(distanceMatch[2].toLowerCase()==='mi'?1.609344:1):undefined;
 const seconds=timeMatch?timeMatch[1].split(':').map(Number).reduce((s,x)=>s*60+x,0):undefined;
 const elevation=elevationMatch?Number(elevationMatch[1].replace(/,/g,''))*(elevationMatch[2].toLowerCase()==='ft'?.3048:1):undefined;
 const enough=!!distance&&!!seconds;return {...base,...(distance?{distance}:{}),...(seconds?{seconds}:{}),...(elevation!==undefined?{elevation}:{}),status:enough?'summary':'partial',message:enough?'Public summary retrieved. Review these values before saving; detailed streams may still be unavailable.':'The public page does not expose enough labelled measurements. Add screenshots or an activity file to complete this run.'};
}
async function boundedHTML(r:Response){if(!r.body)throw new Error('The activity page was empty.');const reader=r.body.getReader();const chunks:Uint8Array[]=[];let bytes=0;while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1500000){await reader.cancel();throw new Error('The activity page is too large to read safely. Use a screenshot or export.')}chunks.push(value)}const out=new Uint8Array(bytes);let off=0;for(const chunk of chunks){out.set(chunk,off);off+=chunk.length}return new TextDecoder().decode(out)}
export async function readStravaLink(raw:string,fetcher:typeof fetch=fetch):Promise<LinkPreview>{
 let url=validateStravaUrl(raw).toString();const signal=AbortSignal.timeout(20000);
 for(let step=0;step<5;step++){
 const r=await fetcher(url,{redirect:'manual',headers:{Accept:'text/html','Accept-Language':'en-US,en;q=0.9'},signal});
 if(r.status>=300&&r.status<400){const location=r.headers.get('location');if(!location)throw new Error('Strava returned an incomplete redirect.');const target=new URL(location,url);if(hosts.has(target.hostname)&&/^\/(login|register|session)(\/|$)/.test(target.pathname))return {url,status:'login-required',source:'strava-link',message:'Strava requires sign-in. Add screenshots or use an authorized import.',retrievedAt:new Date().toISOString()};url=validateStravaUrl(target.toString()).toString();continue}
 if(!r.ok)throw new Error(`Strava did not make this page available (${r.status}). Use screenshots or an activity export.`);
 const html=await boundedHTML(r);if(/verify you are human|checking your browser|automated requests|access denied/i.test(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')))throw new Error('Strava is restricting automated access to this page. Use a screenshot or authorized import.');
 if(new URL(url).hostname==='strava.app.link'){const target=publicActivityLink(html);if(!target)return parsePublicStrava(html,url);url=target;continue}return parsePublicStrava(html,url)
 }throw new Error('Too many redirects. Paste the full strava.com/activities link.');
}
