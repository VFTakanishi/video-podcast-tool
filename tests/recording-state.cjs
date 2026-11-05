const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const elements = new Map();
const track = () => ({stop(){}, readyState:'live', enabled:true});
function element(id) {
  if (!elements.has(id)) elements.set(id, {value:'',dataset:{},textContent:'',disabled:false,hidden:true,options:[],getContext:()=>({}),addEventListener(){},appendChild(o){this.options.push(o)},captureStream:()=>({getVideoTracks:()=>[track()]})});
  return elements.get(id);
}
let now = 10000, count = 0, fail = false;
class Recorder {
  static isTypeSupported(){return true}
  constructor(){count++; this.state='inactive'}
  start(){if(fail) throw Error('simulated failure');this.state='recording'}
  pause(){assert.equal(this.state,'recording');this.state='paused'}
  resume(){assert.equal(this.state,'paused');this.state='recording'}
  stop(){this.state='inactive';this.ondataavailable({data:new Blob(['take '+count],{type:'video/mp4'})});queueMicrotask(()=>this.onstop())}
}
class TestDate extends Date { static now(){return now} }
const context = vm.createContext({document:{getElementById:element,createElement:()=>({})},window:{addEventListener(){},setInterval:()=>1},clearInterval(){},navigator:{mediaDevices:{enumerateDevices:async()=>[]}},console:{error(){}},MediaRecorder:Recorder,MediaStream:class {constructor(tracks=[]){this.tracks=tracks}getAudioTracks(){return this.tracks}},Blob,Date:TestDate});
vm.runInContext(fs.readFileSync('docs/app.js','utf8')+'\n globalThis.test = {state,startRecording,stopRecording,togglePause,selectTake,updateRecordingBadge,setButtons};',context);
const t=context.test;
(async()=>{
 t.state.cameraStream={};
 await Promise.all([t.startRecording(),t.startRecording()]);
 assert.equal(count,1,'double click starts only one recorder');
 now+=3000;t.togglePause();
 assert.equal(t.state.recorder.state,'paused');
 assert.equal(element('recordButton').disabled,true);
 assert.equal(element('stopButton').disabled,false);
 now+=60000;t.updateRecordingBadge();
 assert.match(element('recordingBadge').textContent,/00:03/);
 t.togglePause();now+=2000;t.updateRecordingBadge();
 assert.match(element('recordingBadge').textContent,/00:05/);
 t.togglePause();t.stopRecording();await new Promise(setImmediate);
 assert.equal(t.state.takes.length,1,'stop while paused produces a take');
 const first=t.state.recordedBlob;
 await t.startRecording(); assert.equal(t.state.recordedBlob,first,'starting preserves previous take');
 t.stopRecording();await new Promise(setImmediate);
 assert.equal(t.state.takes.length,2);
 t.selectTake(0);assert.equal(t.state.recordedBlob,first);assert.equal(await first.text(),'take 1');
 fail=true;await t.startRecording();
 assert.equal(t.state.recordedBlob,first,'failed start preserves selected recording');
 assert.equal(element('saveButton').disabled,false);
 t.state.saving=true;await t.startRecording();assert.equal(count,3,'save blocks recording');
 console.log('PASS: pause/resume timer, stop while paused, double click guard, take preservation, failed start, saving lock');
})().catch(e=>{console.error(e);process.exitCode=1});
