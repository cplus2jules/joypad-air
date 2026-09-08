import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { request } from 'node:https';
import { request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import dgram from 'node:dgram';
import WebSocket from 'ws';
import { createPairingAuthority, loadPairingIdentity, startPairingServer } from '../server/pairing.js';

const fixture = t => { const dir=mkdtempSync(join(tmpdir(),'joypad-pairing-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir; };
async function until(fn,label,timeout=5000) { const end=Date.now()+timeout;while(Date.now()<end){const r=fn();if(r)return r;await sleep(10);}throw new Error(`Timed out: ${label}`); }
async function freePort(udp=false) { const s=udp?dgram.createSocket('udp4'):net.createServer();if(udp)s.bind(0,'127.0.0.1');else s.listen(0,'127.0.0.1');await once(s,'listening');const port=s.address().port;await new Promise(r=>s.close(r));return port; }

test('pairing codes expire, are single use, and tokens persist only as hashes', t=>{
  const dir=fixture(t), identity=loadPairingIdentity(dir);let now=1000000;
  const authority=createPairingAuthority(identity,()=>now);
  const invitation=authority.current();const old=invitation.code;
  now=invitation.expiresAt+1;
  assert.equal(authority.claim(old,'Phone','127.0.0.1').status,403);
  const code=authority.current().code;
  const result=authority.claim(code,'My phone','127.0.0.1');assert.equal(result.status,200);
  assert.equal(authority.claim(code,'Replay','127.0.0.1').status,403);
  assert.equal(authority.authorize('wrong'),null);
  assert.equal(authority.authorize(result.body.token).name,'My phone');
  const reloaded=loadPairingIdentity(dir);assert.equal(reloaded.fingerprint,identity.fingerprint);
  const remembered=createPairingAuthority(reloaded);assert.ok(remembered.authorize(result.body.token));
  assert.ok(!readFileSync(join(dir,'identity.json'),'utf8').includes(result.body.token));
  assert.equal(statSync(join(dir,'key.pem')).mode & 0o777,0o600);assert.equal(statSync(dir).mode & 0o777,0o700);
  remembered.revoke(result.body.clientID);assert.equal(remembered.authorize(result.body.token),null);
});
test('pairing limits per-peer and distributed guesses, then permits a new time window',()=>{
  let now=0;const identity={state:{id:'mac',name:'Mac',paired:[]},save(){}};
  let a=createPairingAuthority(identity,()=>now);a.current();
  for(let i=0;i<5;i++)assert.equal(a.claim('bad','Phone','peer').status,403);
  assert.equal(a.claim('bad','Phone','peer').status,429);
  a=createPairingAuthority(identity,()=>now);a.current();
  for(let i=0;i<30;i++)assert.equal(a.claim('bad','Phone',`peer${i}`).status,403);
  for(let i=30;i<200;i++)assert.equal(a.claim('bad','Phone',`peer${i}`).status,429);
  now+=300001;const code=a.current().code;assert.equal(a.claim(code,'Phone','peer').status,200);
});

test('TLS pairing authenticates the actual bridge, rejects replay and revokes live sessions', {timeout:20000}, async t=>{
  const dir=fixture(t), upstreamPort=await freePort(), dsuPort=await freePort(true);let log='';
  const child=spawn(process.execPath,['server/index.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,FORCE_LOG:'1',PORT:String(upstreamPort),DSU_PORT:String(dsuPort),JOYPAD_BIND_HOST:'127.0.0.1',JOYPAD_QUIET_STARTUP:'1',JOYPAD_STRICT_PORTS:'1'},stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill('SIGTERM'));child.stdout.on('data',s=>log+=s);child.stderr.on('data',s=>log+=s);
  await until(()=>log.includes('Internal bridge listening'),'loopback bridge');
  const server=await startPairingServer({directory:dir,httpsPort:0,setupPort:0,upstreamPort,advertise:false,hosts:['127.0.0.1'],heartbeatMs:100});
  t.after(()=>server.close());
  const pin=server.identity.fingerprint;
  const tls={ca:server.identity.cert,checkServerIdentity(_host,cert){return createHash('sha256').update(cert.raw).digest('hex')===pin?undefined:new Error('Certificate pin mismatch');}};
  const api=(path,body,extra={})=>new Promise((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',port:server.httpsPort,path,method:'POST',...tls,...extra,headers:{'content-type':'application/json',...extra.headers}},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));});
    req.on('error',reject);req.end(JSON.stringify(body));
  });
  const state=await(await fetch(server.setupURL+'api/state')).json();
  const qr=JSON.parse(Buffer.from(new URL(state.invitation).searchParams.get('data'),'base64url'));
  assert.equal(qr.fingerprint,pin);assert.equal(qr.port,server.httpsPort);
  const wrongHost = await new Promise((resolve,reject)=>{const req=httpRequest(server.setupURL+'api/state',{headers:{host:`evil.invalid:${server.setupPort}`}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});
  assert.equal(wrongHost,403);
  assert.equal((await fetch(server.setupURL+'api/renew',{method:'POST',headers:{origin:'https://evil.invalid','x-joypad-pairing':'1'}})).status,403);
  assert.equal((await api('/api/pairing/claim',{code:qr.code},{headers:{origin:'https://evil.invalid'}})).status,403);
  await assert.rejects(api('/api/pairing/claim',{code:qr.code},{checkServerIdentity(){return new Error('Certificate pin mismatch');}}),/pin mismatch/);
  const claimed=await api('/api/pairing/claim',{code:qr.code,name:'Contract iPhone'});assert.equal(claimed.status,200);
  assert.equal((await api('/api/pairing/claim',{code:qr.code})).status,403);
  const unauthorized=new WebSocket(`wss://127.0.0.1:${server.httpsPort}/controller`,tls);unauthorized.on('error',()=>{});
  assert.match((await once(unauthorized,'error'))[0].message,/401/);
  const messages=[];
  const client=new WebSocket(`wss://127.0.0.1:${server.httpsPort}/controller`,{...tls,headers:{authorization:`Bearer ${claimed.body.token}`}});
  t.after(()=>client.terminate());client.on('message',b=>messages.push(JSON.parse(b)));client.on('error',()=>{});
  await until(()=>messages.find(m=>m.t==='hello'),'authenticated hello');
  client.send(JSON.stringify({t:'config',motionProfile:'just-dance',orientation:'portrait',motion:true}));
  await until(()=>messages.find(m=>m.t==='config-ack'),'profile ack');
  client.send(JSON.stringify({t:'btn',k:'a',d:true}));
  await until(()=>log.includes('DOWN Z'),'button through authenticated relay');
  const closed=once(client,'close');
  const removed=await fetch(server.setupURL+'api/revoke',{method:'POST',headers:{origin:server.setupURL.slice(0,-1),'x-joypad-pairing':'1','content-type':'application/json'},body:JSON.stringify({id:claimed.body.clientID})});
  assert.equal(removed.status,200);await closed;
  await until(()=>log.includes('UP   Z')||log.includes('UP Z'),'revoke releases held A');
  assert.equal(server.authority.authorize(claimed.body.token),null);

  // Simulate a phone that stays TCP-connected but stops answering WS pings.
  const nextCode=server.authority.current().code;const next=await api('/api/pairing/claim',{code:nextCode});
  const silent=new WebSocket(`wss://127.0.0.1:${server.httpsPort}/controller`,{...tls,headers:{authorization:`Bearer ${next.body.token}`},autoPong:false});
  t.after(()=>silent.terminate());silent.on('error',()=>{});
  const start=Date.now();await once(silent,'close');assert.ok(Date.now()-start<1500,'relay expires a silent phone without waiting for TCP timeout');
});
