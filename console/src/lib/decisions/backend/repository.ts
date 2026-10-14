import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import type { AuditEvent, DecisionDetail, DecisionInput, DecisionList, DecisionPolicy, DecisionReport, DecisionRevision, DecisionSummary, EvidenceVerification, Principal, ReviewRecord, RunRecord } from '../contracts';
import { audit, decode, DecisionError, newId } from './database';
interface JsonRow { data_json: string }
interface Head { id: string; tenant_id: string; owner_id: string; question: string; revision: number; version: number; created_at: string }
export function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export class DecisionRepository {
  constructor(public readonly db: Database.Database) {}
  head(principal: Principal, id: string): Head {
    const row = this.db.prepare<[string,string],Head>('SELECT * FROM decision_heads WHERE tenant_id=? AND id=?').get(principal.tenantId,id);
    if (!row) throw new DecisionError('not_found','Decision not found.',404);
    return row;
  }
  requireWriter(principal: Principal, id?: string): void {
    if (principal.role === 'reviewer') throw new DecisionError('auth','Owner permission required.',403);
    if (id && principal.role !== 'admin' && this.head(principal,id).owner_id !== principal.actorId) throw new DecisionError('auth','Decision owner permission required.',403);
  }
  summary(head: Head): DecisionSummary { return {id:head.id,question:head.question,revision:head.revision,tenantId:head.tenant_id,ownerId:head.owner_id,createdAt:head.created_at}; }
  list(principal: Principal, limit: number, offset: number): DecisionList {
    const rows=this.db.prepare<[string,number,number],Head>('SELECT * FROM decision_heads WHERE tenant_id=? ORDER BY created_at DESC,id LIMIT ? OFFSET ?').all(principal.tenantId,limit,offset);
    const total=this.db.prepare<[string],{count:number}>('SELECT COUNT(*) count FROM decision_heads WHERE tenant_id=?').get(principal.tenantId)?.count ?? 0;
    return {items:rows.map(row=>this.summary(row)),total,limit,offset};
  }
  revision(principal: Principal,id: string, revision: number): DecisionRevision {
    this.head(principal,id);
    const row=this.db.prepare<[string,string,number],JsonRow>('SELECT data_json FROM decision_revisions WHERE tenant_id=? AND decision_id=? AND revision=?').get(principal.tenantId,id,revision);
    if(!row) throw new DecisionError('not_found','Revision not found.',404);
    return decode<DecisionRevision>(row.data_json);
  }
  create(principal: Principal,input: DecisionInput,key: string): DecisionSummary {
    this.requireWriter(principal);
    return this.db.transaction(()=>{
      const previous=this.db.prepare<[string,string],Head>('SELECT * FROM decision_heads WHERE tenant_id=? AND idempotency_key=?').get(principal.tenantId,key);
      if(previous) { if(hash(this.revision(principal,previous.id,1).input)!==hash(input)) throw new DecisionError('conflict','Idempotency key has a different input.',409); return this.summary(previous); }
      const id=newId(),createdAt=new Date().toISOString();
      this.db.prepare('INSERT INTO decision_heads(id,tenant_id,owner_id,question,revision,created_at,idempotency_key) VALUES(?,?,?,?,1,?,?)').run(id,principal.tenantId,principal.actorId,input.question,createdAt,key);
      this.insertRevision({decisionId:id,tenantId:principal.tenantId,ownerId:principal.actorId,revision:1,input,inputHash:hash(input),createdAt});
      audit(this.db,principal.tenantId,id,principal.actorId,'decision.created',{revision:1});
      return this.summary(this.head(principal,id));
    }).immediate();
  }
  insertRevision(revision: DecisionRevision): void { this.db.prepare('INSERT INTO decision_revisions(decision_id,tenant_id,revision,data_json) VALUES(?,?,?,?)').run(revision.decisionId,revision.tenantId,revision.revision,JSON.stringify(revision)); }
  revise(principal: Principal,id: string,input: DecisionInput,expected: number): DecisionRevision {
    return this.db.transaction(()=>{
      this.requireWriter(principal,id); const head=this.head(principal,id);
      if(head.revision!==expected) throw new DecisionError('conflict','Revision changed.',409);
      const revision={decisionId:id,tenantId:principal.tenantId,ownerId:head.owner_id,revision:expected+1,input,inputHash:hash(input),createdAt:new Date().toISOString()};
      this.insertRevision(revision);
      this.db.prepare('UPDATE decision_heads SET revision=?,question=?,version=version+1 WHERE tenant_id=? AND id=?').run(revision.revision,input.question,principal.tenantId,id);
      audit(this.db,principal.tenantId,id,principal.actorId,'decision.revised',{revision:revision.revision}); return revision;
    }).immediate();
  }
  run(principal: Principal,id: string,runId: string): RunRecord {
    this.head(principal,id);
    const row=this.db.prepare<[string,string,string],JsonRow>('SELECT data_json FROM decision_runs WHERE tenant_id=? AND decision_id=? AND id=?').get(principal.tenantId,id,runId);
    if(!row) throw new DecisionError('not_found','Run not found.',404); return decode<RunRecord>(row.data_json);
  }
  saveRun(run: RunRecord): void { this.db.prepare('UPDATE decision_runs SET data_json=? WHERE tenant_id=? AND id=?').run(JSON.stringify(run),run.tenantId,run.id); }
  start(principal: Principal,id: string,revision: number,key: string,policy: DecisionPolicy,maxTenantCalls: number): RunRecord {
    return this.db.transaction(()=>{
      this.requireWriter(principal,id); const head=this.head(principal,id); this.revision(principal,id,revision);
      const previous=this.db.prepare<[string,string,string],JsonRow>('SELECT data_json FROM decision_runs WHERE tenant_id=? AND decision_id=? AND idempotency_key=?').get(principal.tenantId,id,key);
      if(previous) {const run=decode<RunRecord>(previous.data_json); if(run.revision!==revision)throw new DecisionError('conflict','Idempotency key has a different revision.',409);return run;}
      if(head.revision!==revision)throw new DecisionError('conflict','Only the current revision can be evaluated.',409);
      this.db.prepare('INSERT OR IGNORE INTO decision_budgets(tenant_id,calls_reserved) VALUES(?,0)').run(principal.tenantId);
      const budget=this.db.prepare('UPDATE decision_budgets SET calls_reserved=calls_reserved+? WHERE tenant_id=? AND calls_reserved+?<=?').run(policy.maxCalls,principal.tenantId,policy.maxCalls,maxTenantCalls);
      if(budget.changes!==1)throw new DecisionError('rate_limited','Tenant call budget exhausted.',429);
      const now=new Date(),run:RunRecord={id:newId(),decisionId:id,revision,tenantId:principal.tenantId,policyVersion:policy.version,status:'queued',stage:'first',version:0,createdAt:now.toISOString(),updatedAt:now.toISOString(),deadlineAt:new Date(now.getTime()+policy.deadlineMs).toISOString(),callsReserved:policy.maxCalls,maxCalls:policy.maxCalls,evaluations:[],error:null};
      this.db.prepare('INSERT INTO decision_runs(id,decision_id,tenant_id,data_json,policy_json,idempotency_key) VALUES(?,?,?,?,?,?)').run(run.id,id,principal.tenantId,JSON.stringify(run),JSON.stringify(policy),key);
      this.db.prepare('INSERT INTO decision_outbox(run_id,tenant_id,available_at) VALUES(?,?,?)').run(run.id,principal.tenantId,now.getTime());
      audit(this.db,principal.tenantId,id,principal.actorId,'run.queued',{runId:run.id,callsReserved:run.callsReserved});return run;
    }).immediate();
  }
  cancel(principal: Principal,id: string,runId: string): RunRecord {
    return this.db.transaction(()=>{
      this.requireWriter(principal,id);const run=this.run(principal,id,runId);
      if(['completed','paused','cancelled'].includes(run.status))return run;
      const updated={...run,status:'cancelled' as const,version:run.version+1,updatedAt:new Date().toISOString()};this.saveRun(updated);
      this.db.prepare('DELETE FROM decision_outbox WHERE tenant_id=? AND run_id=?').run(principal.tenantId,runId);
      audit(this.db,principal.tenantId,id,principal.actorId,'run.cancelled',{runId});return updated;
    }).immediate();
  }
  detail(principal: Principal,id: string,currentPolicy: DecisionPolicy): DecisionDetail {
    const head=this.head(principal,id),tenant=principal.tenantId;
    const revisions=this.db.prepare<[string,string],JsonRow>('SELECT data_json FROM decision_revisions WHERE tenant_id=? AND decision_id=? ORDER BY revision').all(tenant,id).map(row=>decode<DecisionRevision>(row.data_json));
    const runs=this.db.prepare<[string,string],JsonRow>('SELECT data_json FROM decision_runs WHERE tenant_id=? AND decision_id=? ORDER BY rowid').all(tenant,id).map(row=>decode<RunRecord>(row.data_json));
    const reports=this.db.prepare<[string,string],JsonRow>('SELECT data_json FROM decision_reports WHERE tenant_id=? AND decision_id=? ORDER BY rowid').all(tenant,id).map(row=>decode<DecisionReport>(row.data_json));
    const latest=reports.at(-1);
    const reviews=this.db.prepare<[string,string],JsonRow>('SELECT data_json FROM decision_reviews WHERE tenant_id=? AND decision_id=? ORDER BY rowid').all(tenant,id).map(row=>decode<ReviewRecord>(row.data_json)).map(review=>({...review,valid:review.revision===head.revision&&review.policyVersion===currentPolicy.version&&review.reportHash===latest?.reportHash&&(!review.expiresAt||Date.parse(review.expiresAt)>Date.now())}));
    const evidenceChecks=this.db.prepare<[string,string],JsonRow>('SELECT data_json FROM decision_checks WHERE tenant_id=? AND decision_id=? ORDER BY rowid').all(tenant,id).map(row=>decode<EvidenceVerification>(row.data_json));
    const auditEvents=this.db.prepare<[string,string],{id:number;event:string;actor_id:string;created_at:string;data_json:string}>('SELECT * FROM decision_audit WHERE tenant_id=? AND decision_id=? ORDER BY id').all(tenant,id).map((row):AuditEvent=>({id:row.id,decisionId:id,event:row.event,actorId:row.actor_id,createdAt:row.created_at,data:decode<Record<string,unknown>>(row.data_json)}));
    const currentChecks=evidenceChecks.filter(check=>check.revision===head.revision);
    for(const review of reviews)review.valid=review.valid&&currentChecks.every(check=>latest?.evidenceChecks.some(recorded=>recorded.id===check.id));
    const input=revisions.at(-1)?.input;return {decision:this.summary(head),revisions,runs,reports,reviews,evidenceChecks,audit:auditEvents,capabilities:{identityMode:principal.identityMode,canReview:!(principal.identityMode==='local'&&input?.riskTier==='high'&&currentPolicy.twoReviewersForHighRisk),requiredReviewers:input?.riskTier==='high'&&currentPolicy.twoReviewersForHighRisk?2:1}};
  }
}
