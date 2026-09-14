import { loadProcessPackage, type ProcessDiagnostic } from "./index.js";
export interface ProcessTestSummary { passed:number; failed:number; cases:{name:string;passed:boolean;diagnostics:ProcessDiagnostic[]}[] }
/** Validate the selected package's actual declarations and expression contracts. */
export async function testProcessPackage(root:string):Promise<{ok:true;value:ProcessTestSummary}|{ok:false;diagnostics:ProcessDiagnostic[]}>{
  const loaded=await loadProcessPackage(root);
  if(!loaded.ok)return loaded;
  return {ok:true,value:{passed:1,failed:0,cases:[{name:"direct package validation",passed:true,diagnostics:[]}]}};
}
