const $=id=>document.getElementById(id);
if(chrome?.runtime?.sendMessage){chrome.runtime.sendMessage({type:"BLOCKED_ATTEMPT"});}
$("request").onclick=async()=>{
  const domain=$("domain").value.trim();
  const reason=$("reason").value.trim();
  try{
    const r=await chrome.runtime.sendMessage({type:"REQUEST_OVERRIDE",domain,reason,minutes:$("minutes").value});
    if(!r.ok){$("message").textContent=r.error;return;}
    $("message").textContent=r.message+" Opening the site…";
    setTimeout(()=>{location.href="https://"+domain;},900);
  }catch(e){$("message").textContent="Could not contact Focus Box extension.";}
};
