const $ = id => document.getElementById(id);
let state = null;
let timerInterval = null;
let bleDevice = null;
let bleCharacteristic = null;
const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_WRITE = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";

const isExtension = !!(globalThis.chrome && chrome.runtime && chrome.runtime.sendMessage);
async function command(type, payload={}) {
  if (isExtension) {
    return await chrome.runtime.sendMessage({type, ...payload});
  }
  return localCommand(type, payload);
}
function defaultLocal() {
  return JSON.parse(localStorage.getItem("focusbox-demo") || "null") || {
    sites:["youtube.com","instagram.com","tiktok.com"],
    selectedMode:"STUDY",durationMinutes:45,sessionActive:false,sessionEndAt:null,sessionStartedAt:null,
    stats:{totalSessions:0,completedSessions:0,blockedAttempts:0,overrideRequests:0,focusMinutes:0},history:[]
  };
}
function saveLocal(s){localStorage.setItem("focusbox-demo",JSON.stringify(s));}
async function localCommand(type,p={}) {
  let s=defaultLocal();
  if(type==="GET_STATE") return {ok:true,state:s};
  if(type==="START_SESSION"){let m=Math.max(1,Number(p.minutes)||45);s.selectedMode=p.mode;s.durationMinutes=m;s.sessionActive=true;s.sessionStartedAt=Date.now();s.sessionEndAt=Date.now()+m*60000;saveLocal(s);return{ok:true,state:s};}
  if(type==="END_SESSION"){if(s.sessionActive){let elapsed=Math.max(0,Math.round((Date.now()-s.sessionStartedAt)/60000));s.stats.totalSessions++;s.stats.focusMinutes+=elapsed;s.history.unshift({date:new Date().toISOString(),mode:s.selectedMode,minutes:elapsed,result:"ended-early"});}s.sessionActive=false;s.sessionEndAt=null;saveLocal(s);return{ok:true,state:s};}
  if(type==="ADD_SITE"){let d=cleanDomain(p.domain);if(!s.sites.includes(d))s.sites.push(d);saveLocal(s);return{ok:true,state:s};}
  if(type==="REMOVE_SITE"){s.sites=s.sites.filter(x=>x!==cleanDomain(p.domain));saveLocal(s);return{ok:true,state:s};}
  if(type==="UPDATE_SETTINGS"){s.selectedMode=p.mode;s.durationMinutes=Number(p.minutes)||45;saveLocal(s);return{ok:true,state:s};}
  if(type==="REQUEST_OVERRIDE"){return{ok:false,error:"Website blocking is available only after installing the browser extension."};}
  return{ok:false,error:"Unsupported in standalone preview."};
}
function cleanDomain(v){return String(v||"").trim().toLowerCase().replace(/^https?:\/\//,"").replace(/\/.*$/,"");}
function notify(message){$("sessionMessage").textContent=message;}
async function refresh(){
  const result=await command("GET_STATE");
  if(!result.ok){notify(result.error);return;}
  state=result.state;
  $("mode").value=state.selectedMode||"STUDY";
  $("duration").value=state.durationMinutes||45;
  $("sessionPill").textContent=state.sessionActive?"SESSION ACTIVE":"SESSION INACTIVE";
  $("liveIndicator").textContent=state.sessionActive?"● FOCUSING":"● READY";
  $("sessionTitle").textContent=state.sessionActive?`${state.selectedMode} session`:"Ready when you are";
  $("focusTime").textContent=`${Math.floor((state.stats.focusMinutes||0)/60)}h ${(state.stats.focusMinutes||0)%60}m`;
  $("blockedCount").textContent=state.stats.blockedAttempts||0;
  $("completedCount").textContent=state.stats.completedSessions||0;
  $("totalSessions").textContent=state.stats.totalSessions||0;
  $("overrideCount").textContent=state.stats.overrideRequests||0;
  $("focusMinutes").textContent=state.stats.focusMinutes||0;
  $("siteList").innerHTML="";
  (state.sites||[]).forEach(domain=>{
    const chip=document.createElement("div");chip.className="site-chip";
    const label=document.createElement("span");label.textContent=domain;
    const remove=document.createElement("button");remove.textContent="×";remove.title="Remove domain";
    remove.onclick=async()=>{const r=await command("REMOVE_SITE",{domain});if(r.ok){state=r.state;renderSites();refresh();}else notify(r.error);};
    chip.append(label,remove);$("siteList").append(chip);
  });
  $("history").innerHTML="";
  if(!(state.history||[]).length){$("history").innerHTML='<p class="muted">No sessions recorded yet.</p>';}
  (state.history||[]).slice(0,8).forEach(item=>{
    const row=document.createElement("div");row.className="history-item";
    const left=document.createElement("span");left.textContent=`${item.mode||"Focus"} · ${item.result||"activity"}`;
    const right=document.createElement("small");right.textContent=`${item.minutes||0} min · ${new Date(item.date).toLocaleString()}`;
    row.append(left,right);$("history").append(row);
  });
  updateTimer();
}
function renderSites(){refresh();}
function updateTimer(){
  if(!state)return;
  let seconds=state.sessionActive?Math.max(0,Math.ceil((state.sessionEndAt-Date.now())/1000)):Number($("duration").value||45)*60;
  $("timer").textContent=`${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
  $("timerCaption").textContent=state.sessionActive?"MINUTES REMAINING":"READY TO START";
  if(state.sessionActive && seconds<=0){refresh();}
}
$("startBtn").onclick=async()=>{
  const minutes=Number($("duration").value);
  if(!Number.isInteger(minutes)||minutes<1||minutes>240){notify("Choose a duration between 1 and 240 minutes.");return;}
  const r=await command("START_SESSION",{mode:$("mode").value,minutes});
  if(!r.ok){notify(r.error);return;}state=r.state;notify("Focus session started. Website rules are active.");refresh();
};
$("endBtn").onclick=async()=>{const r=await command("END_SESSION");if(!r.ok){notify(r.error);return;}state=r.state;notify("Session ended.");refresh();};
$("addSiteBtn").onclick=async()=>{const domain=$("siteInput").value;if(!domain.trim())return;const r=await command("ADD_SITE",{domain});if(!r.ok){notify(r.error);return;}$("siteInput").value="";notify("Website added to your blocklist.");refresh();};
$("refreshBtn").onclick=refresh;
$("mode").onchange=saveSettings;
$("duration").onchange=saveSettings;
async function saveSettings(){const r=await command("UPDATE_SETTINGS",{mode:$("mode").value,minutes:$("duration").value});if(r.ok){state=r.state;updateTimer();}}
$("bleConnect").onclick=async()=>{
  if(!navigator.bluetooth){$("bleMessage").textContent="Web Bluetooth is not available in this browser. Try Chrome on Android or desktop Chrome.";return;}
  try{
    bleDevice=await navigator.bluetooth.requestDevice({filters:[{services:[NUS_SERVICE]}]});
    const server=await bleDevice.gatt.connect();
    const service=await server.getPrimaryService(NUS_SERVICE);
    bleCharacteristic=await service.getCharacteristic(NUS_WRITE);
    $("bleStatus").textContent="CONNECTED";$("bleSend").disabled=false;
    $("bleMessage").textContent=`Connected to ${bleDevice.name||"ESP32"}.`;
    bleDevice.addEventListener("gattserverdisconnected",()=>{$("bleStatus").textContent="DISCONNECTED";$("bleSend").disabled=true;});
  }catch(e){$("bleMessage").textContent=e.message||"Bluetooth connection cancelled.";}
};
$("bleSend").onclick=async()=>{
  if(!bleCharacteristic)return;
  const line=`MODE=${$("mode").value};MINUTES=${$("duration").value};ACTION=${state?.sessionActive?"START":"CONFIG"}\n`;
  try{await bleCharacteristic.writeValue(new TextEncoder().encode(line));$("bleMessage").textContent="Settings sent to ESP32.";}
  catch(e){$("bleMessage").textContent="Could not send: "+e.message;}
};
document.querySelectorAll(".nav-link").forEach(link=>link.addEventListener("click",()=>{document.querySelectorAll(".nav-link").forEach(x=>x.classList.remove("active"));link.classList.add("active");}));
refresh();
timerInterval=setInterval(updateTimer,1000);
