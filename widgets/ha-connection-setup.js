(function () {
'use strict';
if (!window.LEDMatrixWidgets) return;
function sid(t){return String(t).replace(/[^a-zA-Z0-9_-]/g,'_');}
function field(root,name){return root ? root.querySelector('[name="'+name+'"]') : null;}
function value(root,name){var e=field(root,name);if(!e)return '';return e.type==='checkbox'?e.checked:(e.value||'');}
function setGate(root,open){
  window.__HA_CONNECTION_VALIDATED__=!!open;
  document.dispatchEvent(new CustomEvent('ha-connection-validation',{detail:{validated:!!open}}));
  var allow={enabled:1,ha_url:1,ha_token:1,verify_ssl:1,connection_setup:1};
  (root||document).querySelectorAll('[data-setting-key]').forEach(function(group){
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
function fingerprintLocal(urlInput,tokenInput,sslInput){return String(urlInput.value||'')+'|'+String(tokenInput.value||'')+'|'+String(sslInput.checked);}
window.LEDMatrixWidgets.register('ha-connection-setup',{
 name:'Home Assistant Connection Setup',version:'1.0.0',
 render:function(container,config,current,options){
   var id=sid(options.fieldId||container.id);
   var pluginId=options.pluginId||'home-assistant';
   var root=container.closest('form')||document.getElementById('plugin-config-form-'+pluginId)||container.parentElement;
   container.innerHTML='<style>'+
     '#'+id+'_box{border:1px solid var(--border-color,#4b5563);border-radius:.5rem;padding:1rem;background:var(--card-bg,transparent);color:inherit}'+
     '#'+id+'_box input,#'+id+'_box select,#'+id+'_box button{color:inherit}'+
     '#'+id+'_box input[type="url"],#'+id+'_box input[type="password"],#'+id+'_box input[type="text"]{background:var(--input-bg,#111827);color:var(--text-color,#f9fafb);border-color:var(--border-color,#4b5563)}'+
     '#'+id+'_toggle{background:transparent!important;color:inherit!important}'+
     '#plugin-config-form-'+pluginId+' input,#plugin-config-form-'+pluginId+' select,#plugin-config-form-'+pluginId+' textarea{background:var(--input-bg,#111827);color:var(--text-color,#f9fafb);border-color:var(--border-color,#4b5563)}'+
     '#plugin-config-form-'+pluginId+' table,#plugin-config-form-'+pluginId+' td,#plugin-config-form-'+pluginId+' th{color:inherit;border-color:var(--border-color,#4b5563)}'+
     '#plugin-config-form-'+pluginId+' .bg-white,#plugin-config-form-'+pluginId+' .bg-gray-50{background:var(--card-bg,transparent)!important}'+
     '#plugin-config-form-'+pluginId+' .text-gray-500,#plugin-config-form-'+pluginId+' .text-gray-600,#plugin-config-form-'+pluginId+' .text-gray-700,#plugin-config-form-'+pluginId+' .text-gray-900{color:inherit!important}'+
     '#array-row-editor-modal .bg-white,#array-row-editor-modal .bg-gray-50{background:#111827!important;color:#f9fafb!important}'+
     '#array-row-editor-modal label,#array-row-editor-modal h3,#array-row-editor-modal h4{color:#f9fafb!important}'+
     '#array-row-editor-modal input,#array-row-editor-modal select,#array-row-editor-modal textarea{background:#1f2937!important;color:#f9fafb!important;border-color:#4b5563!important}'+
     '</style>'+
     '<div id="'+id+'_box" data-ha-ignore-gate="true">'+
     '<div style="font-weight:600;margin-bottom:.75rem">Step 1: Connect Home Assistant</div>'+
     '<label style="display:block;font-size:.8rem;font-weight:600;margin-bottom:.25rem">Home Assistant URL</label>'+
     '<input type="url" name="ha_url" id="'+id+'_url" placeholder="https://homeassistant.example.com" autocomplete="url" class="form-input w-full rounded-md shadow-sm" style="margin-bottom:.65rem">'+
     '<label style="display:block;font-size:.8rem;font-weight:600;margin-bottom:.25rem">Long-Lived Access Token</label>'+
     '<div style="display:flex;gap:.4rem;margin-bottom:.65rem">'+
       '<input type="password" name="ha_token" id="'+id+'_token" autocomplete="new-password" spellcheck="false" class="form-input w-full rounded-md shadow-sm">'+
       '<button type="button" id="'+id+'_toggle" class="px-3 py-2 text-sm border rounded-md">Show</button>'+
     '</div>'+
     '<label style="display:flex;align-items:center;gap:.45rem;font-size:.8rem;margin-bottom:.75rem">'+
       '<input type="checkbox" name="verify_ssl" id="'+id+'_ssl" value="true" checked> Verify SSL certificate'+
     '</label>'+
     '<div id="'+id+'_status" style="font-size:.85rem;color:#6b7280;margin-bottom:.5rem">Enter the URL and token above, then validate the connection.</div>'+
     '<div id="'+id+'_diag" style="font-size:.75rem;color:#6b7280;margin-bottom:.75rem;white-space:pre-wrap"></div>'+
     '<div id="'+id+'_save_error" style="display:none;font-size:.78rem;color:#ef4444;margin:.5rem 0 .75rem;white-space:pre-wrap"></div>'+
     '<button type="button" id="'+id+'_validate" class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md">Validate Connection</button>'+
     '<input type="hidden" name="'+(options.fullKey||'connection_setup')+'" value=""></div>';
   var urlInput=container.querySelector('#'+id+'_url');
   var tokenInput=container.querySelector('#'+id+'_token');
   var sslInput=container.querySelector('#'+id+'_ssl');
   var toggleBtn=container.querySelector('#'+id+'_toggle');
   var btn=container.querySelector('#'+id+'_validate');
   var status=container.querySelector('#'+id+'_status');
   var diag=container.querySelector('#'+id+'_diag');
   var saveError=container.querySelector('#'+id+'_save_error');
   var lastValidated='';
   async function loadSavedConnection(){
     try{
       var resp=await fetch('/api/v3/plugins/config?plugin_id='+encodeURIComponent(pluginId),{cache:'no-store'});
       var data=await resp.json();
       var cfg=(data&&data.data&&data.data.config)?data.data.config:
               (data&&data.data)?data.data:
               (data&&data.config)?data.config:null;
       if(!cfg||typeof cfg!=='object')return;
       if(cfg.ha_url&&!urlInput.value)urlInput.value=cfg.ha_url;
       if(cfg.ha_token&&!tokenInput.value)tokenInput.value=cfg.ha_token;
       if(Object.prototype.hasOwnProperty.call(cfg,'verify_ssl'))sslInput.checked=!!cfg.verify_ssl;
     }catch(e){}
   }
   loadSavedConnection();
   setGate(root,false);
   function invalidate(){
     if(lastValidated && fingerprintLocal(urlInput,tokenInput,sslInput)!==lastValidated){
       lastValidated='';
       setGate(root,false);
       status.textContent='Connection settings changed. Validate again to unlock Home Assistant options.';
       status.style.color='#b45309';
     }
   }
   [urlInput,tokenInput,sslInput].forEach(function(e){
     if(e){e.addEventListener('input',invalidate);e.addEventListener('change',invalidate);}
   });
   toggleBtn.addEventListener('click',function(){
     var showing=tokenInput.type==='text';
     tokenInput.type=showing?'password':'text';
     toggleBtn.textContent=showing?'Show':'Hide';
   });
   if(root){
     root.addEventListener('htmx:beforeRequest',function(){
       saveError.style.display='none';
       saveError.textContent='';
     });
     root.addEventListener('htmx:responseError',function(e){
       try{
         var xhr=e.detail&&e.detail.xhr;
         var body=xhr&&xhr.responseText?JSON.parse(xhr.responseText):null;
         var details=(body&&body.error&&body.error.details)||
                     (body&&body.details)||
                     (body&&body.error&&body.error.context&&body.error.context.validation_errors&&body.error.context.validation_errors.join('\n'))||
                     (body&&body.context&&body.context.validation_errors&&body.context.validation_errors.join('\n'))||
                     (xhr&&xhr.responseText)||'Configuration save failed.';
         saveError.textContent='Save validation details:\n'+details;
       }catch(err){
         saveError.textContent='Save validation details:\n'+((e.detail&&e.detail.xhr&&e.detail.xhr.responseText)||'Configuration save failed.');
       }
       saveError.style.display='block';
     });
   }
   btn.addEventListener('click',async function(){
     var url=urlInput.value||'',token=tokenInput.value||'',verify=sslInput.checked;
     if(!url){status.textContent='Enter your Home Assistant URL first.';status.style.color='#b91c1c';return;}
     if(!token){status.textContent='Enter a Home Assistant Long-Lived Access Token first.';status.style.color='#b91c1c';return;}
     btn.disabled=true;btn.textContent='Validating...';status.textContent='Connecting to Home Assistant...';status.style.color='#6b7280';diag.textContent='Target: '+String(url).replace(/\/$/,'')+'/api/';
     try{
       var resp=await fetch('/api/v3/plugins/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
         plugin_id:pluginId,action_id:'discover-entities',
         params:{mode:'validate',ha_url:url,ha_token:token,verify_ssl:(verify!==false?'true':'false')}
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
         (payload.verify_ssl!==undefined?'\nVerify SSL: '+(payload.verify_ssl?'enabled':'disabled'):'')+
         (payload.message?'\nResponse: '+payload.message:'')+
         (payload.error?'\nError: '+payload.error:'');
       if(!payload.ok)throw new Error(payload.error||payload.message||'Home Assistant validation failed.');
       lastValidated=fingerprintLocal(urlInput,tokenInput,sslInput);
       setGate(root,true);
       status.textContent='Connected to Home Assistant successfully. '+(payload.message||'Entity discovery and plugin options are now unlocked.');
       status.style.color='#15803d';
       window.showNotification('Home Assistant connection validated','success');
     }catch(err){
       lastValidated='';setGate(root,false);
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