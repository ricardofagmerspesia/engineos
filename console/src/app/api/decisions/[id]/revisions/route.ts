import { idSchema, revisionRequestSchema } from '../../../../../lib/decisions/contracts';
import { parseDecisionInput } from '../../../../../lib/decisions/core/index';
import { decisionHttp,readBody } from '../../../../../lib/decisions/backend/http';
export const runtime='nodejs';
export function POST(request: Request,context: {params:Promise<{id:string}>}): Promise<Response> {return decisionHttp(request,async(runtime,principal)=>{const body=revisionRequestSchema.parse(await readBody(request));return runtime.repository.revise(principal,idSchema.parse((await context.params).id),parseDecisionInput(body.input),body.expectedRevision);});}
