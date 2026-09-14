import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify, isDeepStrictEqual } from "node:util";
import { resolveType, type DatumEnvelope } from "./index.js";
import type { DirectAction, DirectCandidate, DirectContext, DirectProposal, DirectTransaction, DirectWorkItem, DirectProposalResult } from "./direct-contract.js";
import { selectedRepositoryPackage } from "./selected-package.js";
import { readRepositoryData, publishTransactionData, provisionalLifecycleRecord } from "./lifecycle-repository.js";
import { withRepositoryLock } from "./repository-lock.js";
import { resolvePrompt } from "./direct-prompt.js";
import { evaluateExpressionValue } from "./evaluator.js";
import { compileExpressionValue } from "./expression.js";
import { finalizeDirectDomain } from "./direct-domain.js";
import { validateDirectAuthority, buildDirectReviewContext, registerDirectReview } from "./direct-authority.js";
import { readVerificationReceiptBlob, validateVerificationReceipt, type VerificationBinding, runVerificationReceipt, verificationRef } from "./verification-receipt.js";
import { repositoryGitEnvironment } from "./git-environment.js";

const exec = promisify(execFile);
export const directDigest = (source: string) => `sha256:${createHash("sha256").update(source).digest("hex")}`;
const digest = (value: unknown) => directDigest(JSON.stringify(value));
const lock = "refs/mdlm/transaction-lock";
const txId = (operation: string) => `direct-${createHash("sha256").update(operation).digest("hex")}`;
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
function fail(message: string): never { throw new Error(message); }
function checkOperation(operation: string) { if (!/^[a-zA-Z0-9-]{1,80}$/.test(operation)) fail("Invalid operation identity"); }
export async function directState(root: string) {
  const selected = await selectedRepositoryPackage(root);
  if (!selected.ok) fail(JSON.stringify(selected.diagnostics));
  const loaded = await readRepositoryData(root, selected.processPackage);
  if (!loaded.ok) fail(JSON.stringify(loaded.diagnostics));
  const data = loaded.value.map(p => p.lifecycleDatum.datum).sort((a,b) => a.revision_id.localeCompare(b.revision_id));
  const {reference,digest: packageDigest,language} = selected.summary;
  const identity = {reference,digest:packageDigest,language};
  return {root,pkg:selected.processPackage,package:identity,snapshot:digest({package:identity,data}),data,parsed:loaded.value};
}
type State = Awaited<ReturnType<typeof directState>>;
function snapshot(current: State) { return {processRef:current.package.reference,records:current.parsed.map(p=>p.lifecycleDatum),dependencyComparisons:[]}; }
function expression(current: State, value: unknown, subject?: string): unknown {
  const bindings = subject ? {subject} : {};
  let compiled = value;
  if (typeof value === "string") {
    const result = compileExpressionValue(value, current.pkg, subject ? {subject:"entity"} : {});
    if (!result.expression) fail(JSON.stringify(result.diagnostics));
    compiled = result.expression;
  }
  return evaluateExpressionValue(current.pkg,snapshot(current),compiled,bindings);
}
function revision(value: any): string | undefined { return typeof value === "string" ? value : value?.identity?.revision_id ?? value?.revision_id; }
function values(value: unknown): string[] { return (Array.isArray(value)?value:value==null?[]:[value]).map(revision).filter((v):v is string=>!!v); }
function actionRef(action: DirectAction) { return `${action.id}@${action.version}`; }
function resolveAction(current: State, ref: string) {
  const [id,version] = ref.split("@");
  const action = current.pkg.actions[id!];
  if (!action || (version !== undefined && Number(version)!==action.version)) fail("Unknown package action or version");
  return action;
}
function available(current: State) {
  const items: DirectWorkItem[]=[];
  for (const action of Object.values(current.pkg.actions)) {
    const subjects: (string|undefined)[] = action.subjects === undefined ? [undefined] : values(expression(current,action.subjects));
    for (const subject of subjects) {
      if (action.when !== undefined && expression(current,action.when,subject)!==true) continue;
      const inputs = Object.fromEntries(Object.entries(action.inputs??{}).map(([name,value])=>[name,values(expression(current,value,subject))]));
      items.push({action:actionRef(action),...(subject?{subject}:{}),reason:action.description??action.id,inputs,...(action.optional?{optional:true}:{}),priority:action.priority??0});
    }
  }
  return items.sort((a,b)=>(a.priority??0)-(b.priority??0)||a.action.localeCompare(b.action)||(a.subject??"").localeCompare(b.subject??""));
}
export function directContext(current: State, reference: string, subject?: string): DirectContext {
  const action=resolveAction(current,reference);
  const work=available(current).find(item=>item.action===actionRef(action)&&item.subject===subject);
  if (!work) fail("This action is not currently eligible for this exact subject; refresh expectations");
  return {root:current.root,pkg:current.pkg,package:current.package,snapshot:current.snapshot,data:current.data,action,...(subject?{subject}:{}),inputs:work.inputs??{}};
}
function fixedLinks(context: DirectContext,type: string) {
  const rules=context.action.links?.[type]??{};
  return Object.entries(rules).flatMap(([link,input])=>(context.inputs[input]??[]).map(target=>({type:link,target})));
}
async function guidance(current: State,ref: string,subject?: string) {
  const context=directContext(current,ref,subject);
  const prompt=await resolvePrompt(current.pkg,context.action.prompt_ref);
  if (!prompt.prompt || prompt.diagnostics.length) fail(JSON.stringify(prompt.diagnostics));
  const schemas:Record<string,unknown>={}; const candidates:DirectCandidate[]=[];
  const trace=current.pkg.kernelCapabilities["requirement-trace@2"]??current.pkg.kernelCapabilities["requirement-trace@1"];
  for (const type of context.action.types) {
    if (type===trace?.scope_type) continue;
    const resolved=resolveType(current.pkg,type); if(!resolved.ok) fail(JSON.stringify(resolved.diagnostics));
    const schema=structuredClone(resolved.type.payloadSchema);
    for (const field of resolved.type.kernelManagedPayloadPaths) {delete schema.properties[field];schema.required=schema.required.filter(k=>k!==field);}
    schemas[type]=schema;
    const predecessorInput=context.action.revises?.[type];
    const predecessor=predecessorInput?context.inputs[predecessorInput]?.[0]:undefined;
    candidates.push({localId:type.toLowerCase(),type,...(predecessor?{predecessor}:{}),payload:{...(context.action.fixed_payload?.[type]??{})},links:fixedLinks(context,type),body:""});
  }
  const execution=["observation","verification-result"].includes(context.action.capability);
  const implementation=execution?executionSubject(context):undefined;
  return {ok:true,contract:"mdlm-direct-guidance@1",action:actionRef(context.action),...(subject?{subject}:{}),package:current.package,snapshot:current.snapshot,inputs:context.inputs,prompt:prompt.prompt,payloadSchemas:schemas,context:current.data.filter(d=>Object.values(context.inputs).flat().includes(d.revision_id)||d.revision_id===subject),candidates,...(context.action.authority?{authority:context.action.authority}:{}),...(implementation?{executionSubject:implementation.revision_id,executionCommand:`mdlm execution run ${implementation.revision_id} <operation> --json`,evidence:await availableReceipts(current,implementation),receiptDetails:await receiptDetails(current,implementation)}:{})};
}
export async function inspectDirectExpectations(root:string,action?:string,subject?:string) {
  const current=await directState(root);
  if(action) return guidance(current,action,subject);
  const all=available(current); const items=all.filter(i=>!i.optional); const optional=all.filter(i=>i.optional);
  const terminal=current.pkg.manifest.terminal as {when?:unknown;outcome?:string}|undefined;
  const completed=terminal?.when!==undefined && expression(current,terminal.when)===true;
  return {ok:true,contract:"mdlm-expectations@2",package:current.package,snapshot:current.snapshot,items,optional,outcome:completed?(terminal?.outcome??"profile-boundary-reached"):items.length?"work-available":"blocked"};
}
export function parseDirectProposal(source:string):DirectProposal {
  const p:unknown=JSON.parse(source);
  if(!object(p)||Object.keys(p).some(k=>!["operation","action","package","snapshot","subject","inputs","candidates","evidence"].includes(k))||typeof p.operation!=="string"||typeof p.action!=="string"||!object(p.package)||typeof p.snapshot!=="string"||!Array.isArray(p.candidates)||!p.candidates.length) fail("Expected operation, action, exact package/snapshot and candidate batch");
  checkOperation(p.operation);
  if(!p.candidates.every((c:unknown)=>object(c)&&Object.keys(c).every(k=>["localId","type","predecessor","payload","links","body"].includes(k))&&typeof c.localId==="string"&&/^[a-zA-Z0-9_-]+$/.test(c.localId)&&typeof c.type==="string"&&object(c.payload)&&Array.isArray(c.links)&&c.links.every((l:unknown)=>object(l)&&typeof l.type==="string"&&typeof l.target==="string"&&Object.keys(l).every(k=>["type","target"].includes(k)))&&typeof c.body==="string"&&(c.predecessor===undefined||typeof c.predecessor==="string"))) fail("Invalid candidate datum");
  return p as DirectProposal;
}
async function settlement(root:string,operation:string) {
  checkOperation(operation);const id=txId(operation);
  let tx:DirectTransaction;
  try {tx=JSON.parse(await fs.readFile(path.join(root,".lifecycle/data/.transactions",id,"execution.json"),"utf8"));} catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return undefined;throw error;}
  const current=await directState(root);
  if(tx.contract!=="mdlm-direct-transaction@1"||tx.operation!==operation||tx.id!==id||!tx.outputs.every(d=>current.data.some(existing=>isDeepStrictEqual(existing,d)))) fail("Settlement does not authenticate the published transaction");
  return {tx,result:{ok:true,contract:"mdlm-proposal-result@2",operation,outcome:"accepted",transaction:id,revisions:tx.outputs.map(d=>d.revision_id),proposalDigest:tx.proposalDigest} as DirectProposalResult};
}
export async function inspectDirectSettlement(root:string,operation:string){return (await settlement(root,operation))?.result??{ok:true,contract:"mdlm-proposal-result@2",operation,outcome:"not-published"};}
function outputData(context:DirectContext,proposal:DirectProposal,promptSkills:string[]):DatumEnvelope[]{
  const identities=new Map<string,{id:string;revision:number;revision_id:string}>();
  for(const c of proposal.candidates){
    if(identities.has(c.localId)||!context.action.types.includes(c.type))fail("Duplicate local identity or undeclared output type");
    const prior=c.predecessor?context.data.find(d=>d.revision_id===c.predecessor):undefined;
    if(c.predecessor&&(!prior||prior.type!==c.type||context.data.some(d=>d.id===prior.id&&d.revision>prior.revision)))fail("Revision requires its exact latest predecessor of the same type");
    const expectedInput=context.action.revises?.[c.type];
    if(expectedInput&&c.predecessor!==context.inputs[expectedInput]?.[0])fail("Candidate must revise the exact declared subject lineage");
    const id=prior?.id??`${c.type}-${createHash("sha256").update(`${proposal.operation}\0${c.localId}`).digest("hex").slice(0,12).toUpperCase()}`;
    const rev=(prior?.revision??0)+1;identities.set(c.localId,{id,revision:rev,revision_id:`${id}-r${String(rev).padStart(5,"0")}`});
  }
  const resolve=(v:unknown):any=>{if(typeof v==="string"&&v.startsWith("$")){const match=/^\$([a-zA-Z0-9_-]+)(\.id)?$/.exec(v);if(!match)return v;const id=identities.get(match[1]!);if(!id)fail("Unknown candidate local reference");return match[2]?id.id:id.revision_id;}if(Array.isArray(v))return v.map(resolve);if(object(v))return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,resolve(x)]));return v;};
  return proposal.candidates.map(c=>{
    const resolved=resolveType(context.pkg,c.type);if(!resolved.ok)fail(JSON.stringify(resolved.diagnostics));
    if(resolved.type.kernelManagedPayloadPaths.some(k=>k in c.payload))fail("Candidate may not author kernel-managed payload");
    const links=resolve(c.links) as DatumEnvelope["links"];
    for(const required of fixedLinks(context,c.type)){if(!links.some(l=>isDeepStrictEqual(l,required)))fail("Candidate omitted an exact required context link");if(links.some(l=>l.type===required.type&&l.target!==required.target))fail("Candidate context link differs from the declared exact input");}
    const fixed=context.action.fixed_payload?.[c.type]??{};
    for(const [k,v]of Object.entries(fixed))if(k in c.payload&&!isDeepStrictEqual(c.payload[k],v))fail("Candidate fixed payload differs from package contract");
    return {...identities.get(c.localId)!,type:c.type,payload:{...resolve(c.payload),...fixed},links,body:c.body,created_by:{transaction:"mdlm-direct-transaction@1",process_ref:`${context.package.reference}#${context.package.digest}`,prompt_ref:context.action.prompt_ref,loaded_skill_refs:promptSkills,policy_refs:[]}};
  });
}
export async function submitDirectProposal(root:string,source:string,authorities:string[]=[]){
  const proposal=parseDirectProposal(source);const proposalDigest=directDigest(source);
  if(!isDeepStrictEqual(proposal.evidence?.authority??[],authorities))fail("Stakeholder authority must match the explicitly supplied command authority");
  return withRepositoryLock(root,lock,async()=>{
    const saved=await settlement(root,proposal.operation);if(saved){if(saved.tx.proposalDigest!==proposalDigest)fail("Operation already published different candidate bytes");return saved.result;}
    const current=await directState(root);if(!isDeepStrictEqual(proposal.package,current.package)||proposal.snapshot!==current.snapshot)fail("Proposal package or snapshot changed; refresh guidance");
    const context=directContext(current,proposal.action,proposal.subject);
    if(proposal.inputs&&!isDeepStrictEqual(proposal.inputs,context.inputs))fail("Proposal exact inputs changed");
    const prompt=await resolvePrompt(current.pkg,context.action.prompt_ref);if(!prompt.prompt||prompt.diagnostics.length)fail("Package prompt unavailable");
    const authority=await validateDirectAuthority(context,proposal,source);
    const candidates=outputData(context,proposal,prompt.prompt.skills.map(s=>s.reference));
    const finalized=await finalizeDirectDomain({...context,proposal,outputs:candidates});
    if(["observation","verification-result"].includes(context.action.capability)){
      if(finalized.outputs.length!==1)fail("Evidence assessment publishes one result");
      const target=executionSubject(context);const receipt=await receiptFor(current,proposal.evidence?.receipt??"",target);
      const d=finalized.outputs[0]!;d.payload.outcome=receipt.outcome;d.payload.receipt=receipt.receipt;
      if(context.action.capability==="observation"&&receipt.outcome!=="pass"&&!["revise","drop"].includes(String(d.payload.recommendation)))fail("Failed execution allows revise or drop only");
      if(context.action.capability==="verification-result"&&((receipt.outcome==="pass")!==(d.payload.correction_target==="none")))fail("Result correction target must match execution outcome");
      finalized.managedOutputs.push(d);
    }
    const tx:DirectTransaction={contract:"mdlm-direct-transaction@1",id:txId(proposal.operation),operation:proposal.operation,action:actionRef(context.action),proposalDigest,package:current.package,snapshot:current.snapshot,...(proposal.subject?{subject:proposal.subject}:{}),inputs:context.inputs,outputs:finalized.outputs,...(proposal.evidence?{evidence:proposal.evidence}:{}),...(authority?{authority}: {})};
    const published=await publishTransactionData(root,current.pkg,current.parsed,current.data,finalized.outputs,tx.id,tx,finalized.managedOutputs.map(datum=>({capability:"requirement-trace@2" as const,datum})),async()=>{const fresh=await directState(root);return fresh.snapshot===current.snapshot?{ok:true as const,value:undefined,diagnostics:[] as []}:{ok:false as const,diagnostics:[{code:"proposal-conflict",message:"Repository changed before publication"}]};});
    if(!published.ok)fail(JSON.stringify(published.diagnostics));
    return {ok:true,contract:"mdlm-proposal-result@2",operation:proposal.operation,outcome:"accepted",transaction:tx.id,revisions:tx.outputs.map(d=>d.revision_id),proposalDigest};
  });
}
async function git(root:string,args:string[]){return(await exec("git",["-C",root,...args],{env:repositoryGitEnvironment(),maxBuffer:16*1024*1024})).stdout.trim();}
function executionSubject(context:DirectContext){const types=[context.pkg.kernelCapabilities["requirement-trace@2"]?.implementation_type,context.pkg.kernelCapabilities["direct-observation@2"]?.implementation_type];const d=context.data.find(d=>types.includes(d.type)&&([context.subject,...Object.values(context.inputs).flat()].includes(d.revision_id)));if(!d)fail("Execution requires one exact implementation/prototype");return d;}
function executionBinding(current:Pick<State,"pkg"|"package"|"data">,implementation:DatumEnvelope,operation:string):VerificationBinding{
  const exploratory=implementation.type===current.pkg.kernelCapabilities["direct-observation@2"]?.implementation_type;
  const link=exploratory?(current.pkg.kernelCapabilities["direct-observation@2"]?.input_link??"explores"):"implements";
  const context=implementation.links.filter(l=>l.type===link);if(context.length!==1)fail("Execution needs one exact requirements/experiment context");
  const p=implementation.payload;return {operation,package:current.package,inputs:[{name:exploratory?"trial":"implementation",revisions:[implementation.revision_id]},{name:exploratory?"experiment":"requirements",revisions:[context[0]!.target]}],repositoryPath:p.repository_path as string,sourceCommit:p.source_commit as string,image:p.verification_image as string,command:p.verification_command as string[],scriptPath:p.verification_script as string};
}
async function receiptFor(current:State,locator:string,implementation:DatumEnvelope){if(!/^git-blob:[a-f0-9]{40}$/.test(locator))fail("Evidence requires an exact receipt blob");const saved=await readVerificationReceiptBlob(current.root,locator.slice(9));const b=saved.receipt.binding;checkOperation(b.operation);const registered=await git(current.root,["rev-parse","--verify",`${verificationRef(b)}/attempt-${saved.receipt.attempt}-receipt`]);if(registered!==saved.oid)fail("Receipt is not registered to the original operation");return validateVerificationReceipt(executionBinding(current,implementation,b.operation),saved);}
async function availableReceipts(current:State,implementation:DatumEnvelope){const refs=await git(current.root,["for-each-ref","--format=%(objectname)","refs/mdlm/execution"]);const results:string[]=[];for(const oid of new Set(refs.split("\n").filter(Boolean))){try{await receiptFor(current,`git-blob:${oid}`,implementation);results.push(`git-blob:${oid}`);}catch{}}return results;}
export async function runDirectExecution(root:string,subject:string,operation:string){checkOperation(operation);return withRepositoryLock(root,lock,async()=>{const current=await directState(root);const implementation=current.data.find(d=>d.revision_id===subject);if(!implementation)fail("Unknown exact execution subject");const saved=await runVerificationReceipt(root,executionBinding(current,implementation,operation),false);return{ok:true,contract:"mdlm-execution-result@1",operation,value:{...saved,evidence:`git-blob:${saved.oid}`}};});}
export async function inspectDirectExecution(root:string,operation:string){checkOperation(operation);const current=await directState(root);const oid=await git(root,["rev-parse","--verify","--quiet",`refs/mdlm/execution/${operation}/latest`]).catch(e=>{if(e.code===1)return undefined;throw e;});if(!oid)return{ok:true,contract:"mdlm-execution-result@1",operation,value:{state:"not-started"}};const saved=await readVerificationReceiptBlob(root,oid);if(saved.receipt.binding.operation!==operation||!isDeepStrictEqual(saved.receipt.binding.package,current.package))fail("Execution settlement binding changed");return{ok:true,contract:"mdlm-execution-result@1",operation,value:{...saved,...(saved.receipt.state==="completed"?{evidence:`git-blob:${oid}`}:{})}};}
export async function inspectDirectReview(root:string,action:string,subject?:string){const current=await directState(root);return {ok:true,value:await buildDirectReviewContext(directContext(current,action,subject))};}
export async function registerDirectReviewFiles(root:string,source:string,verdict:string){return withRepositoryLock(root,lock,async()=>{const p=parseDirectProposal(source);const current=await directState(root);if(!isDeepStrictEqual(p.package,current.package)||p.snapshot!==current.snapshot)fail("Review registration package or snapshot changed");const context=directContext(current,p.action,p.subject);const value=await registerDirectReview(root,context,source,verdict);if((await directState(root)).snapshot!==current.snapshot)fail("Review context changed during registration");return{ok:true,value};});}

async function receiptDetails(current:State,implementation:DatumEnvelope){return Promise.all((await availableReceipts(current,implementation)).map(async evidence=>({evidence,...await readVerificationReceiptBlob(current.root,evidence.slice(9))})));}
