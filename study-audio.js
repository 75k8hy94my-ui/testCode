(()=>{
function resolveSpeech(options={}){const synth=Object.prototype.hasOwnProperty.call(options,'synth')?options.synth:(typeof speechSynthesis!=='undefined'?speechSynthesis:null),Utterance=Object.prototype.hasOwnProperty.call(options,'Utterance')?options.Utterance:(typeof SpeechSynthesisUtterance!=='undefined'?SpeechSynthesisUtterance:null);return{synth,Utterance}}
function isSupported(env=globalThis){return Boolean(env&&env.speechSynthesis&&env.SpeechSynthesisUtterance)}
function speak(text,options={}){const value=String(text||'').trim(),{synth,Utterance}=resolveSpeech(options);if(!value||!synth||typeof synth.speak!=='function'||!Utterance)return false;try{if(typeof synth.cancel==='function')synth.cancel();const u=new Utterance(value);u.lang=options.lang||'ja-JP';u.rate=Number(options.rate)>0?Number(options.rate):1;synth.speak(u);return true}catch(_){return false}}
function speakDefinition(definition,target='title',options={}){if(!definition)return false;const reading=definition.pronunciation&&definition.pronunciation[target],visible=definition[target];return speak(String(reading||'').trim()||visible||'',options)}
function stop(options={}){const{synth}=resolveSpeech(options);if(!synth||typeof synth.cancel!=='function')return false;try{synth.cancel();return true}catch(_){return false}}
const api={isSupported,speak,speakDefinition,stop};if(typeof window!=='undefined')window.StudyAudio=api;if(typeof module!=='undefined')module.exports=api;
})();
