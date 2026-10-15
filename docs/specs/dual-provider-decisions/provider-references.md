# Verified provider contracts

Verified against official provider documentation on 2026-10-11 before adapter implementation.

- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses): Responses uses `text.format` with `json_schema`, `name`, `schema`, `strict: true`; root objects have required properties and forbid additional properties. Refusal content and incomplete status are distinct failures.
- [OpenAI TypeScript SDK](https://developers.openai.com/api/reference/typescript): current SDK runtime requirements exceed EngineOS's CLI Node floor. Native fetch avoids adding an SDK or altering the existing CLI runtime contract.
- [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs): Messages uses `output_config.format` with `type: json_schema`. Numeric bounds and many cardinality/string assertions are enforced locally because the provider subset does not support them.
- [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create): use top-level `system`; distinguish truncation and refusal, including `stop_details.type: refusal`, from schema-invalid responses.
- [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching) and [Anthropic prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching): provider usage fields have different accounting semantics. Missing usage/rates are unknown, not zero.

Models are required configurable IDs, not guessed defaults. Native fetch has no SDK retry multiplier; durable worker attempts own retries and reserve each call. Prices are optional explicitly configured dated/versioned tariffs. Unknown tariffs produce null cost. Aborting the client does not prove the remote inference stopped or incurred no cost.

One Zod structural evaluation contract yields a provider-compatible JSON Schema projection; semantic matrix validation remains application-owned. Both providers independently receive the same redacted, frozen evidence snapshot. Anonymized counter-assessments are supplied only in the bounded challenge round. Model agreement after challenge is not independent factual verification.
