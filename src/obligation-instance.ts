const obligationReferencePattern = /^[a-z][a-z0-9-]*@[1-9][0-9]*$/;
const revisionSubjectPattern =
  /^[A-Z]{3,8}-[0-9A-HJKMNP-TV-Z]{10,12}-r[0-9]{5}$/;
const phaseSubjectPattern = /^(phase-[0-9]+-[a-z0-9-]+)@([1-9][0-9]*)$/;
const processSubjectPattern =
  /^process@(phase-[0-9]+-[a-z0-9-]+)@([1-9][0-9]*)$/;

export type ObligationInstanceSubject =
  | { kind: "phase"; identity: string; phaseId: string; version: number }
  | {
      kind: "process";
      identity: string;
      phaseId: string;
      phaseVersion: number;
    }
  | { kind: "revision"; identity: string };

export interface ObligationInstanceIdentity {
  obligationReference: string;
  subject: ObligationInstanceSubject;
  processRef: string;
}

export function phaseObligationSubjectIdentity(
  phaseId: string,
  version: number,
): string {
  return `${phaseId}@${version}`;
}

export function processObligationSubjectIdentity(
  phaseId: string,
  phaseVersion: number,
): string {
  return `process@${phaseId}@${phaseVersion}`;
}

export function formatObligationInstanceIdentity(
  obligationReference: string,
  subjectIdentity: string,
  processRef: string,
): string {
  return `${obligationReference}:${subjectIdentity}:${processRef}`;
}

export function parseObligationInstanceIdentity(
  identity: string,
): ObligationInstanceIdentity | undefined {
  const match = /^([^:]+):([^:]+):(.+)$/.exec(identity);
  const obligationReference = match?.[1];
  const subjectIdentity = match?.[2];
  const processRef = match?.[3];
  if (
    !obligationReference ||
    !obligationReferencePattern.test(obligationReference) ||
    !subjectIdentity ||
    !processRef
  ) {
    return undefined;
  }
  if (revisionSubjectPattern.test(subjectIdentity)) {
    return {
      obligationReference,
      subject: { kind: "revision", identity: subjectIdentity },
      processRef,
    };
  }
  const process = processSubjectPattern.exec(subjectIdentity);
  if (process?.[1] && process[2]) {
    return {
      obligationReference,
      subject: {
        kind: "process",
        identity: subjectIdentity,
        phaseId: process[1],
        phaseVersion: Number(process[2]),
      },
      processRef,
    };
  }
  const phase = phaseSubjectPattern.exec(subjectIdentity);
  if (!phase?.[1] || !phase[2]) return undefined;
  return {
    obligationReference,
    subject: {
      kind: "phase",
      identity: subjectIdentity,
      phaseId: phase[1],
      version: Number(phase[2]),
    },
    processRef,
  };
}

export function isObligationInstanceIdentity(identity: string): boolean {
  return parseObligationInstanceIdentity(identity) !== undefined;
}
