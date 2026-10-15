import { idSchema,startRunRequestSchema } from '../../../../../lib/decisions/contracts';
import { decisionHttp,readBody } from '../../../../../lib/decisions/backend/http';
export const runtime='nodejs';
export function POST(request: Request,context: {params:Promise<{id:string}>}): Promise<Response> {return decisionHttp(request,async(runtime,principal)=>{const body=startRunRequestSchema.parse(await readBody(request));return runtime.repository.start(principal,idSchema.parse((await context.params).id),body.revision,body.idempotencyKey,runtime.config.policy,runtime.config.maxTenantCalls);});}
