// Successful and unsuccessful observations stay in separate collections. The
// content tree identifies the exact staged product tree that npm test exercised;
// this evidence record itself is the only later addition to that tree.
export const QUALIFICATION_GATE_TIMING_EVIDENCE = Object.freeze({
  successful: Object.freeze([
    Object.freeze({
      baseCommit: "6b922dd902c556d0f0350c2ad738208336e5393b",
      command: "/usr/bin/time -f 'FAST_GATE_WALL_SECONDS=%e FAST_GATE_MAX_RSS_KB=%M EXIT=%x' npm test",
      contentTree: "749fcd81d6d2ada87532a52a64acc2cbd948d5af",
      gate: "pr",
      host: "ip-172-31-12-5 Linux 6.17.0-1019-aws x86_64",
      maximumResidentSetKb: 800_932,
      measuredAt: "2026-08-26T11:56:22Z",
      mdlmPiFiles: 8,
      rootFiles: 25,
      status: 0,
      wallMs: 492_870,
    }),
  ]),
  failedOrCensored: Object.freeze([]),
});
