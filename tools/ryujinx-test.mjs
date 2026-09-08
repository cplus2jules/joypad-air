import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProfile, inspectRyujinx, configureRyujinx } from '../server/ryujinx.js';
const stopped = { isRunning: () => false };
function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), 'joypad-ryujinx-'));
  try { run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
const save = (dir, config) => writeFileSync(join(dir, 'Config.json'), JSON.stringify(config));
const read = dir => JSON.parse(readFileSync(join(dir, 'Config.json'), 'utf8'));
const base = () => ({ version:70, enable_keyboard:true, use_input_global_config:true, input_config:[buildProfile(1,'ProController',false), buildProfile(2,'ProController',false)] });
test('check accepts Ryujinx-added defaults, reordered players and custom names', () => fixture(dir => {
  const c=base();c.input_config.reverse();c.input_config[0].rumble={enabled:false};c.input_config[0].name='My pad';save(dir,c);
  assert.equal(inspectRyujinx(dir).synced,true);
}));
test('checks sideways layouts and catches a real mismatched button', () => fixture(dir => {
  const c=base();c.input_config=[buildProfile(1,'JoyconLeft',false),buildProfile(2,'JoyconRight',false)];save(dir,c);
  assert.equal(inspectRyujinx(dir).synced,true);
  c.input_config[1].right_joycon.button_a='Z';save(dir,c);
  assert.equal(inspectRyujinx(dir).players[1].synced,false);
}));
test('setup backs up the exact config and preserves unrelated players/settings', () => fixture(dir => {
  const c=base();c.graphics_backend='Vulkan';c.game_dirs=['/my/games'];c.input_config.push({player_index:'Player3',backend:'GamepadSDL2',id:'keep-me'});save(dir,c);
  const before=readFileSync(join(dir,'Config.json'),'utf8');
  const result=configureRyujinx({configDir:dir},stopped);
  assert.equal(readFileSync(join(dir,result.backup),'utf8'),before);
  assert.equal(read(dir).input_config[2].id,'keep-me');assert.deepEqual(read(dir).game_dirs,['/my/games']);
  assert.equal(result.synced,true);assert.equal(readdirSync(join(dir,'profiles','keyboard')).length,2);
}));
test('a running emulator blocks all writes', () => fixture(dir => {
  save(dir,base());const before=readFileSync(join(dir,'Config.json'),'utf8');
  assert.throws(()=>configureRyujinx({configDir:dir},{isRunning:()=>true}),{code:'ryujinx_running'});
  assert.equal(readFileSync(join(dir,'Config.json'),'utf8'),before);assert.equal(readdirSync(dir).length,1);
}));
test('unknown schema and corrupt config fail without touching files', () => fixture(dir => {
  save(dir,{...base(),version:999});
  assert.throws(()=>configureRyujinx({configDir:dir},stopped),{code:'unsupported_config'});
  assert.equal(readdirSync(dir).length,1);
  writeFileSync(join(dir,'Config.json'),'{bad');
  assert.throws(()=>configureRyujinx({configDir:dir},stopped),{code:'config_unreadable'});
  assert.equal(inspectRyujinx(dir).synced,false);
}));
test('missing config and disabled global mappings cannot report ready', () => fixture(dir => {
  assert.equal(inspectRyujinx(dir).found,false);save(dir,{...base(),use_input_global_config:false});
  assert.equal(inspectRyujinx(dir).synced,false);
}));
test('Just Dance preset uses one right Joy-Con and verifies motion endpoint and slot', () => fixture(dir => {
  const c=base();c.input_config.push({player_index:'Player3'});save(dir,c);
  const result=configureRyujinx({configDir:dir,preset:'just-dance',dsuPort:26800},stopped);
  assert.equal(result.synced,true);assert.equal(result.preset,'just-dance');
  const configured=read(dir);assert.equal(configured.input_config.length,1);
  const p=configured.input_config[0];assert.equal(p.controller_type,'JoyconRight');
  assert.equal(p.motion.slot,0);assert.equal(p.motion.gyro_deadzone,0);
  assert.equal(p.motion.sensitivity,100);assert.equal(p.motion.dsu_server_port,26800);
  assert.equal(inspectRyujinx(dir,{preset:'just-dance',dsuPort:26760}).synced,false);
  p.motion.slot=1;save(dir,configured);
  assert.equal(inspectRyujinx(dir,{preset:'just-dance',dsuPort:26800}).synced,false);
  assert.equal(JSON.parse(readFileSync(join(dir,result.backup),'utf8')).input_config.length,3);
}));
test('bad DSU port fails before creating any backup or changing config',()=>fixture(dir=>{
  save(dir,base());assert.throws(()=>configureRyujinx({configDir:dir,preset:'just-dance',dsuPort:NaN},stopped),{code:'invalid_dsu_port'});
  assert.equal(readdirSync(dir).length,1);
}));
