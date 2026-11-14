(async()=>{
 const r=await chrome.runtime.sendMessage({type:"GET_STATE"});
 document.getElementById("status").textContent=r?.state?.sessionActive
 ? `Active · ${r.state.selectedMode} · ${Math.max(0,Math.ceil((r.state.sessionEndAt-Date.now())/60000))} min left`
 : "No active focus session";
})();
document.getElementById("open").onclick=()=>chrome.runtime.openOptionsPage();
