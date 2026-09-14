import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";

// A caller may pin the already installed executable. Qualification's installed
// mode packages this exact tree and exercises its installation in a fresh root.
for (const processName of ["tiny", "exploratory"] as const) {
  test(`direct public ${processName} lifecycle preserves decisions, corrections and history`, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), `mdlm-direct-${processName}-`));
    let executable = process.env.MDLM_DIRECT_EXECUTABLE ?? path.join(process.cwd(), "dist/mdlm.js");
    const command = (file: string, args: string[], cwd = root) => {
      const result = spawnSync(file,args,{cwd,encoding:"utf8",timeout:240_000,maxBuffer:30*1024*1024,env:process.env});
      expect(result.error).toBeUndefined();
      expect(result.status, result.stdout + result.stderr).toBe(0);
      return result.stdout;
    };
    if (process.env.MDLM_DIRECT_INSTALLED === "1" && !process.env.MDLM_DIRECT_EXECUTABLE) {
      const packed = path.join(root,"packed"); await fs.mkdir(packed);
      const output = command("npm",["pack","--pack-destination",packed,"--silent"],process.cwd());
      const archive = path.join(packed,output.trim().split("\n").at(-1)!);
      const install = path.join(root,"install");
      command("npm",["install","--prefix",install,"--ignore-scripts","--no-audit","--no-fund","--offline",archive]);
      executable = path.join(install,"node_modules/mdlm/dist/mdlm.js");
    }
    const journeyRoot = path.join(root,"journey");
    const invocation = spawnSync(process.execPath,[path.join(process.cwd(),"scripts/direct-lifecycle-walkthrough.mjs"),"--process",processName,"--executable",executable,"--root",journeyRoot],{
      cwd:root,encoding:"utf8",timeout:240_000,maxBuffer:30*1024*1024,env:process.env,
    });
    const mode = process.env.MDLM_DIRECT_EXECUTABLE ? "supplied-executable" : process.env.MDLM_DIRECT_INSTALLED === "1" ? "installed" : "source";
    const evidenceFile = path.join(`${journeyRoot}-evidence`,"result.json");
    // The driver writes the same durable result before returning or throwing.
    // Emit its location before assertions so failed operation stays discoverable.
    const captured = await fs.readFile(evidenceFile,"utf8").then(source=>JSON.parse(source)).catch(()=>undefined);
    console.log(`DIRECT_JOURNEY_CONTEXT ${JSON.stringify({process:processName,mode,executable,status:invocation.status})}`);
    if (captured) console.log(`DIRECT_JOURNEY_EVIDENCE ${captured.evidenceFile}`);
    else console.log(`DIRECT_JOURNEY_CAPTURE_MISSING ${evidenceFile}`);
    expect(invocation.error).toBeUndefined();
    expect(invocation.status, invocation.stdout + invocation.stderr).toBe(0);
    const result = JSON.parse(invocation.stdout.trim().split("\n").at(-1)!);
    expect(captured?.evidenceFile).toBe(result.evidenceFile);
    expect(result.outcome).toBe(processName === "tiny" ? "lifecycle-complete" : "profile-boundary-reached");
    expect(result.publications.length).toBeGreaterThan(0);
    expect(result.receipts.length).toBeGreaterThan(0);
    expect(result.commands.length).toBeGreaterThan(0);
    expect(await fs.stat(result.evidenceFile)).toMatchObject({size:expect.any(Number)});
    // Preserve the full source/lifecycle/evidence on success and failure for audit.
  }, 300_000);
}
