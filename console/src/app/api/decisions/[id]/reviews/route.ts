import { idSchema,reviewRequestSchema } from '../../../../../lib/decisions/contracts';
import { submitReview } from '../../../../../lib/decisions/backend/reviews';
import { decisionHttp,readBody } from '../../../../../lib/decisions/backend/http';
export const runtime='nodejs';
export function POST(request: Request,context: {params:Promise<{id:string}>}): Promise<Response> {return decisionHttp(request,async(runtime,principal)=>submitReview(runtime.repository,principal,idSchema.parse((await context.params).id),reviewRequestSchema.parse(await readBody(request)),runtime.config.policy));}
