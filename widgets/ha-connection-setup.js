(function () {
'use strict';
if (!window.LEDMatrixWidgets) return;
function sid(t){return String(t).replace(/[^a-zA-Z0-9_-]/g,'_');}
function field(name){return document.querySelector('[name="'+name+'"]');}
function value(name){var e=field(name);if(!e)return '';return e.type==='checkbox'?e.checked:(e.value||'');}
function setGate(open){
  window.__HA_CONNECTION_VALIDATED__=!!open;
  document.dispatchEvent(new CustomEvent('ha-connection-validation',{detail:{validated:!!open}}));
  var allow={enabled:1,ha_url:1,ha_token:1,verify_ssl:1,connection_setup:1};
  document.querySelectorAll('[data-setting-key]').forEach(function(group){
    var key=group.getAttribute('data-setting-key')||'';
    if(allow[key])return;
    group.querySelectorAll('input,select,textarea,button').forEach(function(el){
      if(el.closest('[data-ha-ignore-gate="true"]'))return;
      el.disabled=!open;
    });
    group.style.opacity=open?'':'0.55';
    group.style.pointerEvents=open?'':'none';
  });
}
function fingerprint(){return String(value('ha_url'))+'|'+String(value('ha_token'))+'|'+String(value('verify_ssl'));}
window.LEDMatrixWidgets.register('ha-connection-setup',{
 name:'Home Assistant Connection Setup',version:'1.0.0',
 render:function(container,config,current,options){
   var id=sid(options.fieldId||container.id);
   container.innerHTML='<div data-ha-ignore-gate="true" style="border:1px solid #d1d5db;border-radius:.5rem;padding:1rem;background:#f9fafb">'+
     '<div style="font-weight:600;margin-bottom:.35rem">Step 1: Validate Home Assistant</div>'+
     '<div id="'+id+'_status" style="font-size:.85rem;color:#6b7280;margin-bottom:.5rem">Enter the Home Assistant URL and Long-Lived Access Token above, then validate the connection.</div>'+
     '<div id="'+id+'_diag" style="font-size:.75rem;color:#6b7280;margin-bottom:.75rem;white-space:pre-wrap"></div>'+
     '<button type="button" id="'+id+'_validate" class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md">Validate Connection</button>'+
     '<input type="hidden" name="'+(options.fullKey||'connection_setup')+'" value=""></div>';
   var btn=container.querySelector('#'+id+'_validate');
   var status=container.querySelector('#'+id+'_status');
   var diag=container.querySelector('#'+id+'_diag');
   var lastValidated='';
   setGate(false);
   function invalidate(){
     if(lastValidated && fingerprint()!==lastValidated){
       lastValidated='';
       setGate(false);
       status.textContent='Connection settings changed. Validate again to unlock Home Assistant options.';
       status.style.color='#b45309';
     }
   }
   ['ha_url','ha_token','verify_ssl'].forEach(function(n){
     var e=field(n);if(e){e.addEventListener('input',invalidate);e.addEventListener('change',invalidate);}
   });
   btn.addEventListener('click',async function(){
     var url=value('ha_url'),token=value('ha_token'),verify=value('verify_ssl');
     if(!url){status.textContent='Enter your Home Assistant URL first.';status.style.color='#b91c1c';return;}
     if(!token){status.textContent='Enter a Home Assistant Long-Lived Access Token first.';status.style.color='#b91c1c';return;}
     btn.disabled=true;btn.textContent='Validating...';status.textContent='Connecting to Home Assistant...';status.style.color='#6b7280';diag.textContent='Target: '+String(url).replace(/\/$/,'')+'/api/';
     try{
       var resp=await fetch('/api/v3/plugins/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
         plugin_id:options.pluginId||'home-assistant',action_id:'discover-entities',
         params:{mode:'validate',ha_url:url,ha_token:token,verify_ssl:verify!==false}
       })});
       var data=await resp.json();
       var payload=null;
       if(data && typeof data==='object' && Object.prototype.hasOwnProperty.call(data,'ok')){
         payload=data;
       }else{
         var raw=String((data&&data.output)||'').trim(),lines=raw.split(/\r?\n/).filter(Boolean);
         for(var i=lines.length-1;i>=0;i--){try{payload=JSON.parse(lines[i]);if(payload&&typeof payload==='object')break;}catch(e){}}
       }
       if(!payload){
         var msg=(data&&data.message)||'Home Assistant validation failed.';
         throw new Error(msg);
       }
       diag.textContent='Endpoint: '+(payload.endpoint||String(url).replace(/\/$/,'')+'/api/')+
         (payload.http_status?'\nHTTP status: '+payload.http_status:'')+
         (payload.token_length!==undefined?'\nToken characters sent: '+payload.token_length:'')+
         (payload.token_whitespace_removed?'\nWhitespace trimmed from pasted token: yes':'')+
         (payload.message?'\nResponse: '+payload.message:'')+
         (payload.error?'\nError: '+payload.error:'');
       if(!payload.ok)throw new Error(payload.error||payload.message||'Home Assistant validation failed.');
       lastValidated=fingerprint();
       setGate(true);
       status.textContent='Connected to Home Assistant successfully. '+(payload.message||'Entity discovery and plugin options are now unlocked.');
       status.style.color='#15803d';
       window.showNotification('Home Assistant connection validated','success');
     }catch(err){
       lastValidated='';setGate(false);
       status.textContent=err.message||'Home Assistant validation failed.';
       status.style.color='#b91c1c';
       if(!diag.textContent)diag.textContent='Validation failed before a response was returned.';
       window.showNotification(status.textContent,'error');
     }finally{btn.disabled=false;btn.textContent='Validate Connection';}
   });
 },
 getValue:function(){return '';},setValue:function(){},handlers:{}
});
})();