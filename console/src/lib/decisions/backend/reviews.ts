import type { EvidenceVerification, Principal, ReviewRecord, ReviewRequest } from '../contracts';
import { evidenceVerificationRequestSchema } from '../contracts';
import type { DecisionPolicy } from '../contracts';
import { audit, DecisionError, newId } from './database';
import { DecisionRepository } from './repository';

export function submitReview(repo: DecisionRepository,principal: Principal,id: string,request: ReviewRequest,policy: DecisionPolicy): ReviewRecord {
  return repo.db.transaction(()=>{
    const detail=repo.detail(principal,id,policy),report=detail.reports.at(-1);
    if(!report||request.revision!==detail.decision.revision||report.revision!==request.revision||report.reportHash!==request.reportHash||report.policyVersion!==request.policyVersion||policy.version!==request.policyVersion)throw new DecisionError('conflict','Review binding is stale.',409);
    if(detail.evidenceChecks.some(check=>check.revision===request.revision&&!report.evidenceChecks.some(recorded=>recorded.id===check.id)))throw new DecisionError('conflict','Evidence checks changed; run a fresh evaluation before review.',409);
    if(principal.identityMode==='local'&&detail.capabilities.requiredReviewers>1)throw new DecisionError('auth','Two distinct trusted reviewers are required; local identity cannot satisfy this policy.',403);
    const run=repo.run(principal,id,report.runId);
    if(run.version!==request.expectedVersion)throw new DecisionError('conflict','Run changed; reload before reviewing.',409);
    if(run.status!=='completed'||['PAUSED','BLOCKED','NEEDS_EVIDENCE'].includes(report.outcome))throw new DecisionError('conflict','This report cannot be approved.',409);
    if(!report.scores.some(score=>score.optionId===request.selectedOptionId&&score.eligibility==='eligible'))throw new DecisionError('validation','Selected option must be eligible.');
    if(request.expiresAt&&Date.parse(request.expiresAt)<=Date.now())throw new DecisionError('validation','Review expiration must be in the future.');
    if(detail.reviews.some(review=>review.reportHash===request.reportHash&&review.reviewerId===principal.actorId))throw new DecisionError('conflict','This reviewer already submitted a review for the report.',409);
    const review:ReviewRecord={...request,id:newId(),decisionId:id,tenantId:principal.tenantId,reviewerId:principal.actorId,createdAt:new Date().toISOString(),valid:true};
    repo.db.prepare('INSERT INTO decision_reviews(id,decision_id,tenant_id,report_hash,reviewer_id,data_json) VALUES(?,?,?,?,?,?)').run(review.id,id,principal.tenantId,request.reportHash,principal.actorId,JSON.stringify(review));
    repo.saveRun({...run,version:run.version+1,updatedAt:review.createdAt});
    audit(repo.db,principal.tenantId,id,principal.actorId,`review.${request.disposition}`,{reportHash:request.reportHash,selectedOptionId:request.selectedOptionId,requiredReviewers:detail.capabilities.requiredReviewers});return review;
  }).immediate();
}
export function submitEvidenceCheck(repo: DecisionRepository,principal: Principal,id: string,value: unknown,policy: DecisionPolicy): EvidenceVerification {
  const request=evidenceVerificationRequestSchema.parse(value);
  return repo.db.transaction(()=>{
    const detail=repo.detail(principal,id,policy),revision=repo.revision(principal,id,request.revision),input=revision.input;
    if(detail.decision.revision!==request.revision)throw new DecisionError('conflict','Evidence verification revision is stale.',409);
    if(!input.options.some(option=>option.id===request.optionId)||!input.evidence.some(evidence=>evidence.id===request.evidenceId))throw new DecisionError('validation','Unknown evidence or option.');
    const validTarget=request.targetType==='criterion'?input.criteria.some(item=>item.id===request.targetId):request.targetType==='constraint'?input.constraints.some(item=>item.id===request.targetId):detail.reports.some(report=>report.revision===request.revision&&report.evaluations.some(evaluation=>evaluation.evaluation.materialClaims.some(claim=>claim.id===request.targetId&&claim.optionId===request.optionId&&claim.evidenceIds.includes(request.evidenceId))));
    if(!validTarget)throw new DecisionError('validation','Unknown verification target.');
    const existing=detail.evidenceChecks.find(check=>check.revision===request.revision&&check.optionId===request.optionId&&check.evidenceId===request.evidenceId&&check.targetType===request.targetType&&check.targetId===request.targetId);
    if(existing)throw new DecisionError('conflict','Verification already recorded; revise evidence to change the verification.',409);
    const check:EvidenceVerification={...request,id:newId(),reviewerId:principal.actorId,createdAt:new Date().toISOString()};
    repo.db.prepare('INSERT INTO decision_checks(id,decision_id,tenant_id,data_json) VALUES(?,?,?,?)').run(check.id,id,principal.tenantId,JSON.stringify(check));
    audit(repo.db,principal.tenantId,id,principal.actorId,'evidence.checked',{verificationId:check.id,revision:request.revision});return check;
  }).immediate();
}
