import { createDecisionRequestSchema } from '../../../lib/decisions/contracts';
import { parseDecisionInput } from '../../../lib/decisions/core/index';
import { decisionHttp,pagination,readBody } from '../../../lib/decisions/backend/http';
export const runtime='nodejs';
export function GET(request: Request): Promise<Response> {return decisionHttp(request,(runtime,principal)=>{const page=pagination(request);return runtime.repository.list(principal,page.limit,page.offset);});}
export function POST(request: Request): Promise<Response> {return decisionHttp(request,async(runtime,principal)=>{const body=createDecisionRequestSchema.parse(await readBody(request));return runtime.repository.create(principal,parseDecisionInput(body.input),body.idempotencyKey);});}
