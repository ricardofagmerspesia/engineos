import { idSchema } from '../../../../lib/decisions/contracts';
import { decisionHttp } from '../../../../lib/decisions/backend/http';
export const runtime='nodejs';
export function GET(request: Request,context: {params:Promise<{id:string}>}): Promise<Response> {return decisionHttp(request,async(runtime,principal)=>runtime.repository.detail(principal,idSchema.parse((await context.params).id),runtime.config.policy));}
