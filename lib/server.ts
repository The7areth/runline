import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
export async function owner(){const u=await getChatGPTUser();if(!u)throw new Error('AUTH');return u.userId}
export function db(){const d=(env as any).DB;if(!d)throw new Error('STORAGE');return d as D1Database}
export function bucket(){const b=(env as any).BUCKET;if(!b)throw new Error('STORAGE');return b as R2Bucket}
export function fail(e:unknown){const s=e instanceof Error?e.message:'';return Response.json({error:s==='AUTH'?'Sign in to save or connect your data.':s==='STORAGE'?'Storage is temporarily unavailable. Your input has not been cleared.':s.startsWith('INPUT:')?s.slice(6):'The request could not be completed. Please try again.'},{status:s==='AUTH'?401:s.startsWith('INPUT:')?400:503})}
export function originCheck(req:Request){const o=req.headers.get('origin');if(o&&o!==new URL(req.url).origin)throw new Error('INPUT:This request must come from Runline.')}
