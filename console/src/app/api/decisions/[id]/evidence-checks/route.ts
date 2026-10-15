import { idSchema } from '../../../../../lib/decisions/contracts';
import { submitEvidenceCheck } from '../../../../../lib/decisions/backend/reviews';
import { decisionHttp,readBody } from '../../../../../lib/decisions/backend/http';
export const runtime='nodejs';
export function POST(request: Request,context: {params:Promise<{id:string}>}): Promise<Response> {return decisionHttp(request,async(runtime,principal)=>submitEvidenceCheck(runtime.repository,principal,idSchema.parse((await context.params).id),await readBody(request),runtime.config.policy));}
