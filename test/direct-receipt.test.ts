import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
vi.mock("../src/docker-verification.js", () => ({executeDockerVerification:vi.fn(),authenticateVerificationSource:vi.fn()}));
import { executeDockerVerification } from "../src/docker-verification.js";
import { runVerificationReceipt, validateVerificationReceipt, verificationRef, type VerificationBinding } from "../src/verification-receipt.js";

test("durable started or completed executions cannot be silently replayed or rebound", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(),"mdlm-receipt-settlement-"));
  const git = (...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
  const binding:VerificationBinding = {operation:"same-operation",package:{reference:"fixture@1"},inputs:["TRY-exact-r00001"],repositoryPath:root,sourceCommit:"a".repeat(40),image:"pinned-image",command:["python3","verify.py"],scriptPath:"verify.py"};
  try {
    git("init","-q");
    const file = path.join(root,"receipt.json");
    const save = async(receipt:object) => {
      await writeFile(file,JSON.stringify(receipt));
      const oid = git("hash-object","-w",file); git("update-ref",`${verificationRef(binding)}/latest`,oid);return oid;
    };
    await save({binding,attempt:1,state:"started"});
    await expect(runVerificationReceipt(root,binding,false)).rejects.toThrow("must not be replayed automatically");
    expect(executeDockerVerification).not.toHaveBeenCalled();
    const result = {started:true,outcome:"fail",sourceTree:null,scriptSha256:null};
    const oid = await save({binding,attempt:1,state:"completed",result});
    expect((await runVerificationReceipt(root,binding,false)).oid).toBe(oid);
    expect((await runVerificationReceipt(root,binding,true)).oid).toBe(oid);
    await expect(runVerificationReceipt(root,{...binding,sourceCommit:"b".repeat(40)},false)).rejects.toThrow("do not match");
    await expect(validateVerificationReceipt({...binding,inputs:["TRY-other-r00001"]},await runVerificationReceipt(root,binding,false))).rejects.toThrow("exact execution");
    await expect(validateVerificationReceipt({...binding,formalFiles:["verify.py"]},await runVerificationReceipt(root,binding,false))).rejects.toThrow("exact execution");
    expect(executeDockerVerification).not.toHaveBeenCalled();
  } finally {await rm(root,{recursive:true,force:true});}
});
