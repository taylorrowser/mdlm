# Operator contract v2 fixtures

These files freeze the cutover seam before implementation. Each JSON fixture is
one canonical `JSON.stringify` value followed by one LF. Key order is part of
the fixture bytes.

The public contract uses `mdlm-next@2`. The included packet is
`mdlm-assignment-packet@3` because `@2` belongs to the removed
`scenario prepare` choreography. Agent responses use
`mdlm-assignment-response@2`. Submission introduces one discriminated
`mdlm-submission-outcome@1` contract.

The deep module has three interfaces:

```ts
deriveOperatorOutcome(authenticatedSnapshot, exactProcessPackage): OperatorOutcome
claimNextWork(repositoryRoot): Promise<OperatorOutcome>
submitAssignmentResponse(repositoryRoot, response): Promise<SubmissionOutcome>
```

`deriveOperatorOutcome` is pure. Its Assignment decision names exact work but
has no generated Assignment or execution identity. `claimNextWork`
authenticates inputs, derives the outcome, recovers or acquires the exact lease,
and returns the public fixture shape with the complete packet.
`submitAssignmentResponse` validates proposal bytes without mutation, then
allocates identities, resolves symbolic output handles, binds authority and
required links, and publishes once atomically. After publication starts,
uncertain closure returns `settlement-required`; callers inspect that identity
and never replay submission.

Fixture IDs, digests, and content are stable test literals, not generated
examples. `assignment.json` and `attention-required.json` deliberately repeat
the full packet. That makes the six public outcomes independently executable
fixtures. Packet deduplication is measured inside one packet, not across files.
