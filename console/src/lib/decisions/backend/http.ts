import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { originVerdict } from '../../request-origin';
import { ensureDecisionRuntime } from '../runtime';
import { getDecisionRuntime } from './index';
import { principalFor } from './identity';
import { DecisionError } from './database';
import type { Principal } from '../contracts';
import type { DecisionRuntime } from './index';
export async function decisionHttp(request: Request,operation: (runtime: DecisionRuntime,principal: Principal)=>unknown|Promise<unknown>): Promise<Response> {
  const correlationId=randomUUID();
  try {
    if(originVerdict({method:request.method,host:request.headers.get('host'),origin:request.headers.get('origin'),secFetchSite:request.headers.get('sec-fetch-site')})!=='allow')throw new DecisionError('auth','Request origin refused.',403);
    ensureDecisionRuntime();const runtime=getDecisionRuntime();const principal=await principalFor(request,runtime.config.identityMode);
    return Response.json(await operation(runtime,principal),{headers:{'x-correlation-id':correlationId,'cache-control':'no-store'}});
  } catch(error){
    const known=error instanceof DecisionError,validation=error instanceof ZodError;
    const status=known?error.status:validation?400:500;
    return Response.json({error:{code:known?error.code:validation?'validation':'internal',message:known?error.message:validation?'Request validation failed.':'Decision operation failed.',correlationId}},{status,headers:{'x-correlation-id':correlationId,'cache-control':'no-store'}});
  }
}
export async function readBody(request: Request): Promise<unknown> {
  const maximum=524288;
  if(Number(request.headers.get('content-length')??0)>maximum)throw new DecisionError('validation','Request body exceeds limit.',413);
  if(!request.body)throw new DecisionError('validation','JSON request body required.');
  const reader=request.body.getReader(),decoder=new TextDecoder();let size=0,text='';
  try {for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>maximum){await reader.cancel();throw new DecisionError('validation','Request body exceeds limit.',413);}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}
  finally {reader.releaseLock();}
  try{return JSON.parse(text);}catch{throw new DecisionError('validation','Invalid JSON body.');}
}
export function pagination(request: Request): {limit:number;offset:number} {
  const url=new URL(request.url),limit=Number(url.searchParams.get('limit')??20),offset=Number(url.searchParams.get('offset')??0);
  if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>1000000)throw new DecisionError('validation','Invalid pagination.');return {limit,offset};
}
