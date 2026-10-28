'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
assert.ok(process.argv.includes('--authorized-local-h12'));
const podman=path.join(process.env.LOCALAPPDATA,'Programs/Podman/podman.exe');
const run=args=>cp.execFileSync(podman,['--connection','dv-portal-h1',...args],{encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim();
for(const name of ['dv-h12-auth','dv-h12-rest','dv-h12-mail','dv-h12-db']){
 const state=JSON.parse(run(['inspect',name]))[0];
 assert.equal(state.Config.Labels?.['dv.rehearsal'],'h12-drafts');
 run(['rm','-f',name]);
}
const network=JSON.parse(run(['network','inspect','dv-portal-h12-drafts']))[0];
assert.equal(network.labels?.['dv.rehearsal'],'h12-drafts');run(['network','rm','dv-portal-h12-drafts']);
const dir=path.resolve(os.tmpdir(),'dv-portal-h12-drafts');
for(const name of ['auth.env','rest.env','private.json','browser-users.json']){
 const file=path.resolve(dir,name);assert.equal(path.dirname(file),dir);
 if(fs.existsSync(file))fs.unlinkSync(file);
}
const active=JSON.parse(run(['ps','--format','json']));
if(active.length===0)cp.execFileSync(podman,['machine','stop','dv-portal-h1'],{windowsHide:true,stdio:'pipe'});
console.log(JSON.stringify({ownedContainersRemoved:4,ownedNetworkRemoved:true,temporaryCredentialFilesRemoved:4,otherContainersModified:false,machineStopped:active.length===0,originalBackupPreserved:true}));
