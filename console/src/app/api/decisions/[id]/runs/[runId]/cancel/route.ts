import { idSchema } from '../../../../../../../lib/decisions/contracts';
import { decisionHttp } from '../../../../../../../lib/decisions/backend/http';
export const runtime='nodejs';
export function POST(request: Request,context: {params:Promise<{id:string;runId:string}>}): Promise<Response> {return decisionHttp(request,async(runtime,principal)=>{const params=await context.params;return runtime.repository.cancel(principal,idSchema.parse(params.id),idSchema.parse(params.runId));});}
