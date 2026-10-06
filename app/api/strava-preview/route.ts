import {owner,originCheck,fail} from '@/lib/server';
import {readStravaLink} from '@/lib/strava-link';
export async function POST(req:Request){try{originCheck(req);await owner();const body=await req.json() as {url?:unknown};if(typeof body.url!=='string'||body.url.length>1500)throw new Error('INPUT:Enter a Strava activity link.');try{return Response.json(await readStravaLink(body.url),{headers:{'Cache-Control':'no-store'}})}catch(e){throw new Error('INPUT:'+(e instanceof Error?e.message:'Strava could not be reached.'))}}catch(e){return fail(e)}}
