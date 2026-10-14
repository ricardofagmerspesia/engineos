import type { DecisionPolicy, DecisionReport, Evaluation, Principal, ProviderId, ProviderResult, ProviderSuccess, RunRecord } from '../contracts';
import { createReport, needsChallenge } from '../core/index';
import type { DecisionRuntime } from './index';
import { audit, decode, newId } from './database';
interface Job { run_id: string; tenant_id: string; lease_token: string | null }
interface Attempt { provider: ProviderId; round: number; attempt: number; result_json: string | null }
interface WorkerOptions { now?: () => number; random?: () => number; signal?: AbortSignal }
const providers: ProviderId[]=['openai','anthropic'];
function principal(tenantId: string): Principal { return {tenantId,actorId:'decision-worker',role:'admin',identityMode:'trusted'}; }
function log(event: string,run: RunRecord,started: number,fields: Record<string,unknown>={}): void {
  console.info(JSON.stringify({timestamp:new Date().toISOString(),level:'info',event,correlationId:run.id,service:'decisions-worker',durationMs:Date.now()-started,decisionId:run.decisionId,runId:run.id,...fields}));
}
function attempts(runtime: DecisionRuntime,run: RunRecord): Attempt[] { return runtime.repository.db.prepare<[string,string],Attempt>('SELECT provider,round,attempt,result_json FROM decision_attempts WHERE tenant_id=? AND run_id=? ORDER BY round,provider,attempt').all(run.tenantId,run.id); }
function successful(rows: Attempt[],round: number): ProviderSuccess[] {
  return providers.flatMap(provider=>{const row=rows.filter(candidate=>candidate.round===round&&candidate.provider===provider&&candidate.result_json).find(candidate=>decode<ProviderResult>(candidate.result_json??'null').ok);return row?.result_json?[decode<ProviderSuccess>(row.result_json)]:[];});
}
function failed(provider: ProviderId,kind: 'timeout'|'provider_error',message: string): ProviderResult { return {ok:false,provider,kind,retryable:false,message,retryAfterMs:null}; }
export async function processOne(runtime: DecisionRuntime,options: WorkerOptions={}): Promise<boolean> {
  const repo=runtime.repository,db=repo.db,now=options.now??Date.now,random=options.random??Math.random,started=now(),token=newId();
  const job=db.transaction(()=>{
    const candidate=db.prepare<[number,number],Job>('SELECT run_id,tenant_id,lease_token FROM decision_outbox WHERE available_at<=? AND (lease_until IS NULL OR lease_until<=?) ORDER BY available_at,run_id LIMIT 1').get(started,started);
    if(!candidate)return undefined;
    const acquired=db.prepare('UPDATE decision_outbox SET lease_token=?,lease_until=? WHERE run_id=? AND tenant_id=? AND (lease_until IS NULL OR lease_until<=?)').run(token,started+300000,candidate.run_id,candidate.tenant_id,started);
    return acquired.changes===1?candidate:undefined;
  }).immediate();
  if(!job)return false;
  const stored=db.prepare<[string,string],{data_json:string;policy_json:string}>('SELECT data_json,policy_json FROM decision_runs WHERE tenant_id=? AND id=?').get(job.tenant_id,job.run_id);
  if(!stored){db.prepare('DELETE FROM decision_outbox WHERE tenant_id=? AND run_id=? AND lease_token=?').run(job.tenant_id,job.run_id,token);return true;}
  let run=decode<RunRecord>(stored.data_json);const policy=decode<DecisionPolicy>(stored.policy_json),scope=principal(run.tenantId),input=repo.revision(scope,run.decisionId,run.revision).input;
  const deadline=Date.parse(run.deadlineAt);
  function owned(): boolean { return Boolean(db.prepare('SELECT run_id FROM decision_outbox WHERE tenant_id=? AND run_id=? AND lease_token=?').get(run.tenantId,run.id,token)); }
  function fresh(): RunRecord { return repo.run(scope,run.decisionId,run.id); }
  function persist(status: RunRecord['status'],stage: string,error: string|null): void {
    const current=fresh();if(current.status==='cancelled'||!owned())return;
    run={...current,status,stage,error,version:current.version+1,updatedAt:new Date(now()).toISOString(),evaluations:attempts(runtime,current).flatMap(row=>row.result_json?[decode<ProviderResult>(row.result_json)]:[])};repo.saveRun(run);
  }
  function finish(report: DecisionReport): void {
    db.transaction(()=>{
      if(fresh().status==='cancelled'||!owned())return;
      db.prepare('INSERT OR IGNORE INTO decision_reports(id,decision_id,tenant_id,run_id,data_json) VALUES(?,?,?,?,?)').run(report.id,run.decisionId,run.tenantId,run.id,JSON.stringify(report));
      persist(report.outcome==='PAUSED'?'paused':'completed','final',report.outcome==='PAUSED'?'Evaluation paused; inspect gate reasons.':null);
      db.prepare('DELETE FROM decision_outbox WHERE tenant_id=? AND run_id=? AND lease_token=?').run(run.tenantId,run.id,token);
      audit(db,run.tenantId,run.decisionId,'decision-worker','run.reported',{runId:run.id,outcome:report.outcome,reportHash:report.reportHash});
    }).immediate();
    log('decision.reported',run,started,{outcome:report.outcome});
  }
  function report(evaluations: ProviderResult[],round: number,original: ProviderSuccess[]): DecisionReport {
    const checks=repo.detail(scope,run.decisionId,policy).evidenceChecks.filter(check=>check.revision===run.revision);
    return createReport(input,evaluations,checks,policy,{id:newId(),decisionId:run.decisionId,runId:run.id,revision:run.revision,createdAt:new Date(now()).toISOString(),challengeRounds:round,originalEvaluations:original});
  }
  if(['cancelled','completed','paused'].includes(run.status)){db.prepare('DELETE FROM decision_outbox WHERE tenant_id=? AND run_id=? AND lease_token=?').run(run.tenantId,run.id,token);return true;}
  const oldAttempts=attempts(runtime,run);
  if(deadline<=now()||oldAttempts.some(row=>row.result_json===null)) {
    finish(report([...successful(oldAttempts,0),failed('openai','timeout',deadline<=now()?'Run deadline exhausted.':'An interrupted provider call has unknown outcome; its budget remains consumed.')],0,successful(oldAttempts,0)));return true;
  }
  // Lease spans the remaining hard deadline so another worker cannot overlap calls.
  db.prepare('UPDATE decision_outbox SET lease_until=? WHERE tenant_id=? AND run_id=? AND lease_token=?').run(deadline+5000,run.tenantId,run.id,token);
  persist('running',run.stage,null);log('decision.job.started',run,started);
  const controller=new AbortController();const abort=():void=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});
  const timeout=setTimeout(abort,Math.max(1,deadline-now()));
  const cancelPoll=setInterval(()=>{if(fresh().status==='cancelled'||!owned())controller.abort();},250);
  try {
    let round=run.stage==='challenge'?1:0;
    for(;;){
      const before=attempts(runtime,run),original=successful(before,0),existing=successful(before,round);
      const missing=providers.filter(provider=>!existing.some(item=>item.metadata.provider===provider));
      const results=await Promise.allSettled(missing.map(async provider=>{
        const attemptCount=before.filter(row=>row.provider===provider&&row.round===round).length;
        if(attemptCount>=policy.maxAttemptsPerProvider||before.length+missing.indexOf(provider)>=run.maxCalls)return {ok:false,provider,kind:'budget_exhausted',retryable:false,message:'Allowed call attempts exhausted.',retryAfterMs:null} satisfies ProviderResult;
        const attemptId=newId();
        const reserved=db.transaction(()=>{
          if(fresh().status==='cancelled'||!owned())return false;
          const count=db.prepare<[string,string],{count:number}>('SELECT COUNT(*) count FROM decision_attempts WHERE tenant_id=? AND run_id=?').get(run.tenantId,run.id)?.count??0;
          if(count>=run.maxCalls)return false;
          db.prepare('INSERT INTO decision_attempts(id,run_id,tenant_id,provider,round,attempt,started_at) VALUES(?,?,?,?,?,?,?)').run(attemptId,run.id,run.tenantId,provider,round,attemptCount+1,new Date(now()).toISOString());return true;
        }).immediate();
        if(!reserved)return failed(provider,'provider_error','Run cancelled or call budget exhausted.');
        const counter:Evaluation|undefined=round===1?original.find(item=>item.metadata.provider!==provider)?.evaluation:undefined;
        let result:ProviderResult;
        try {result=await runtime.evaluator.evaluate(provider,input,{signal:controller.signal,deadlineAt:deadline,outputTokenLimit:policy.outputTokenLimit,...(counter?{counterAssessment:counter}:{})});}
        catch {result={ok:false,provider,kind:'transport_error',retryable:true,message:'Evaluator transport failed.',retryAfterMs:null};}
        db.transaction(()=>{db.prepare('UPDATE decision_attempts SET result_json=? WHERE id=? AND tenant_id=? AND result_json IS NULL').run(JSON.stringify(result),attemptId,run.tenantId);persist('running',round?'challenge':'first',null);audit(db,run.tenantId,run.decisionId,'decision-worker','provider.completed',{runId:run.id,provider,round,ok:result.ok,...(result.ok?{model:result.metadata.model,inputTokens:result.metadata.inputTokens,outputTokens:result.metadata.outputTokens,costMicros:result.metadata.costMicros}:{kind:result.kind})});}).immediate();
        log('decision.provider.completed',run,started,{provider,ok:result.ok});return result;
      }));
      if(fresh().status==='cancelled'||!owned())return true;
      const current:ProviderResult[]=[...existing,...results.map((result,index)=>result.status==='fulfilled'?result.value:failed(missing[index]??'openai','provider_error','Provider task failed.'))];
      const failures=current.filter(result=>!result.ok);
      const after=attempts(runtime,run);
      const retryable=failures.length>0&&failures.every(result=>!result.ok&&result.retryable&&after.filter(row=>row.round===round&&row.provider===result.provider).length<policy.maxAttemptsPerProvider)&&after.length<run.maxCalls&&now()<deadline;
      if(retryable){
        const attempt=Math.max(...after.filter(row=>row.round===round).map(row=>row.attempt),1);
        const delay=Math.min(30000,1000*2**(attempt-1))*(0.5+random());
        const retryAfter=Math.max(delay,...failures.map(result=>!result.ok?result.retryAfterMs??0:0));
        if(now()+retryAfter<deadline){persist('queued',round?'challenge':'first','Retryable provider failure; retry scheduled.');db.prepare('UPDATE decision_outbox SET available_at=?,lease_token=NULL,lease_until=NULL WHERE tenant_id=? AND run_id=? AND lease_token=?').run(now()+retryAfter,run.tenantId,run.id,token);return true;}
      }
      const originalComplete=round===0?current.filter((item):item is ProviderSuccess=>item.ok):original;
      const preliminary=report(current,round,originalComplete);
      if(round===0&&failures.length===0&&needsChallenge(preliminary)&&policy.maxChallengeRounds>0&&after.length+2<=run.maxCalls&&now()<deadline){round=1;persist('running','challenge',null);continue;}
      finish(preliminary);return true;
    }
  } finally {clearTimeout(timeout);clearInterval(cancelPoll);options.signal?.removeEventListener('abort',abort);}
}
export async function runWorker(runtime: DecisionRuntime,options: {signal:AbortSignal;pollMs?:number}): Promise<void> {
  while(!options.signal.aborted){const consumed=await processOne(runtime,{signal:options.signal});if(!consumed)await new Promise<void>(resolve=>{const done=():void=>{clearTimeout(timer);options.signal.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,options.pollMs??1000);options.signal.addEventListener('abort',done,{once:true});});}
}
