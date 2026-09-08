// The per-check code registry. Empty on purpose: each family declares its own
// codes beside its checks and augments this interface, so `finding()` compiles
// only for a code that check actually declares.
//
//   declare module './codes' { interface CheckCodes { C16: typeof C16_FINDINGS[number] } }
//
// One global union of ~260 names was rejected in the design: it would be one
// file every family edits, and check prefixes on every code.
export interface CheckCodes {}
