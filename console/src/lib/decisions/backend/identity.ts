import { userInfo } from 'node:os';
import type { Principal } from '../contracts';
import { DecisionError } from './database';
export type TrustedIdentityResolver = (request: Request) => Promise<Principal | null>;
let resolver: TrustedIdentityResolver | null = null;
export function setTrustedIdentityResolver(value: TrustedIdentityResolver): void { resolver = value; }
export async function principalFor(request: Request, mode: 'local' | 'trusted'): Promise<Principal> {
  if (mode === 'local') return { tenantId: 'local', actorId: `local-${userInfo().uid}`, role: 'owner', identityMode: 'local' };
  const principal = resolver ? await resolver(request) : null;
  if (!principal || principal.identityMode !== 'trusted' || !principal.tenantId || !principal.actorId || !['owner','reviewer','admin'].includes(principal.role)) throw new DecisionError('auth', 'A trusted identity adapter is required.', 403);
  return principal;
}
