import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { once } from 'node:events';
import dgram from 'node:dgram';
import net from 'node:net';
import WebSocket from 'ws';
import { toDsuFrame } from '../server/dsu/transform.js';
import { encodeDataRequest, decodeResponse, MSG } from '../server/dsu/packets.js';
import { validateMessage } from '../server/validate.js';
import { MAPPINGS } from '../server/mappings.js';

const raw = { t:'motion', ax:0.25, ay:-0.75, az:-0.5, gx:90, gy:30, gz:-60, ts:1000000, seq:0 };
test('dance mapping keeps physical magnitudes and uses a proper rotation for both sensors', () => {
  const s=toDsuFrame(raw,'portrait','just-dance');
  assert.deepEqual(s,{ax:0.25,ay:-0.5,az:0.75,pitch:90,yaw:-60,roll:-30,tsUs:1000000});
  assert.equal(Math.hypot(s.pitch,s.yaw,s.roll),Math.hypot(raw.gx,raw.gy,raw.gz));
  const basis=[[1,0,0],[0,1,0],[0,0,1]].map(([gx,gy,gz])=>{
    const s=toDsuFrame({...raw,gx,gy,gz},'portrait','just-dance');
    return [s.pitch,s.yaw,s.roll];
  });
  const [x,y,z]=basis;
  const cross=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
  assert.ok(cross.every((v,i)=>v===z[i]));
});
test('unknown motion profiles fail validation instead of falling back to steering',()=>{
  assert.equal(validateMessage({t:'config',motionProfile:'typo'},MAPPINGS[1]),null);
  assert.deepEqual(validateMessage({t:'config',motionProfile:'just-dance',orientation:'portrait'},MAPPINGS[1]),{t:'config',motionProfile:'just-dance',orientation:'portrait'});
});

async function freePort(udp=false) {
  const s=udp?dgram.createSocket('udp4'):net.createServer();
  if(udp)s.bind(0,'127.0.0.1');else s.listen(0,'127.0.0.1');
  await once(s,'listening');const port=s.address().port;await new Promise(r=>s.close(r));return port;
}
async function until(fn,label,timeout=5000) {
  const end=Date.now()+timeout;
  while(Date.now()<end){const value=fn();if(value)return value;await sleep(10);}
  throw new Error(`Timed out: ${label}`);
}
test('native WebSocket samples become ordered DSU packets, pause safely and reconnect', {timeout:15000}, async t=>{
  const port=await freePort(), dsuPort=await freePort(true);
  let log='';
  const proc=spawn(process.execPath,['server/index.js'],{
    cwd:new URL('../',import.meta.url),env:{...process.env,FORCE_LOG:'1',PORT:String(port),DSU_PORT:String(dsuPort),GYRO_GAIN:'2.2',JOYPAD_LANG:'en'},stdio:['ignore','pipe','pipe'],
  });
  proc.stdout.on('data',s=>log+=s);proc.stderr.on('data',s=>log+=s);
  t.after(()=>proc.kill('SIGTERM'));
  await until(()=>log.includes('server running'),'server startup');
  const udp=dgram.createSocket('udp4');t.after(()=>udp.close());
  const packets=[];udp.on('message',b=>{const p=decodeResponse(b);if(p?.type===MSG.DATA)packets.push(p);});
  udp.connect(dsuPort,'127.0.0.1');await once(udp,'connect');
  const tick=setInterval(()=>udp.send(encodeDataRequest(0,0)),30);t.after(()=>clearInterval(tick));
  let ws;
  async function connect(){
    ws=new WebSocket(`ws://127.0.0.1:${port}/?p=1`);const mine=ws;t.after(()=>mine.terminate());
    const messages=[];ws.on('message',s=>messages.push(JSON.parse(s)));
    const hello=await until(()=>messages.find(m=>m.t==='hello'),'hello');
    assert.ok(hello.motionProfiles.includes('just-dance'));
    ws.send(JSON.stringify({t:'config',motion:true,motionProfile:'just-dance',orientation:'portrait'}));
    const ack=await until(()=>messages.find(m=>m.t==='config-ack'),'config-ack');
    assert.deepEqual(ack,{t:'config-ack',motionProfile:'just-dance',motion:true,orientation:'portrait'});
  }
  await connect();await sleep(50);
  ws.send(JSON.stringify(raw));
  const first=await until(()=>packets[0],'first DSU packet');
  assert.equal(first.crcOk,true);assert.equal(first.size,100);
  assert.deepEqual([first.ax,first.ay,first.az,first.pitch,first.yaw,first.roll],[0.25,-0.5,0.75,90,-60,-30]);
  ws.send(JSON.stringify({...raw,seq:0,gx:999}));
  ws.send(JSON.stringify({...raw,seq:1,ts:1016666,gx:45}));
  await until(()=>packets.length===2,'second sample');assert.equal(packets[1].pitch,45);
  assert.ok(packets[1].tsUs>first.tsUs);
  const idle=await until(()=>packets.find(p=>p.pitch===0 && p.yaw===0 && p.roll===0),'stale-sensor neutral packet',1000);
  assert.ok(idle.tsUs>packets[1].tsUs);
  const status=await (await fetch(`http://127.0.0.1:${port}/status`)).json();
  assert.equal(status.dsu.slots[0],null);assert.equal(status.players[1].motionDropped,1);
  const count=packets.length;
  ws.send(JSON.stringify({t:'config',motion:false}));ws.send(JSON.stringify({...raw,seq:2}));
  await sleep(60);assert.equal(packets.length,count);
  ws.close();await once(ws,'close');await connect();
  ws.send(JSON.stringify({...raw,seq:0,ts:100}));
  await until(()=>packets.length>count,'reconnected sample');
  assert.ok(packets.at(-1).tsUs>idle.tsUs,'published clock cannot go backwards after reconnect');
  assert.ok(packets.every(p=>p.crcOk));
});

test('strict dance startup stops when the DSU port belongs to another process', {timeout:6000}, async t=>{
  const occupied=dgram.createSocket('udp4');occupied.bind(0,'127.0.0.1');await once(occupied,'listening');
  t.after(()=>occupied.close());
  const port=await freePort();let log='';
  const proc=spawn(process.execPath,['server/index.js'],{
    cwd:new URL('../',import.meta.url),env:{...process.env,FORCE_LOG:'1',PORT:String(port),DSU_PORT:String(occupied.address().port),JOYPAD_STRICT_PORTS:'1',JOYPAD_LANG:'en'},stdio:['ignore','pipe','pipe'],
  });
  t.after(()=>proc.kill('SIGTERM'));proc.stdout.on('data',s=>log+=s);proc.stderr.on('data',s=>log+=s);
  const [code]=await once(proc,'exit');assert.equal(code,1);assert.match(log,/already in use/);
});
