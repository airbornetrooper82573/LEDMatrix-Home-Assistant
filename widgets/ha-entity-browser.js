(function () {
'use strict';
if (!window.LEDMatrixWidgets) return;
function esc(t){ return window.LEDEscape ? window.LEDEscape.html(String(t == null ? '' : t)) : String(t == null ? '' : t); }
function sid(t){ return String(t).replace(/[^a-zA-Z0-9_-]/g,'_'); }
function readField(name){
  var el=document.querySelector('[name="'+name+'"]');
  if(!el)return '';
  return el.type==='checkbox'?el.checked:(el.value||'');
}
function addToArray(pluginId,fieldKey,entity,kind){
  var fieldId=(pluginId+'-'+fieldKey).replace(/\./g,'-').replace(/_/g,'-');
  var addButton=document.querySelector('button[data-field-id="'+fieldId+'"]');
  if(!addButton||typeof window.addArrayTableRow!=='function'){
    window.showNotification('Could not find the '+fieldKey+' configuration table.','error'); return;
  }
  window.addArrayTableRow(addButton);
  var tbody=document.getElementById(fieldId+'_tbody');
  var rows=tbody?tbody.querySelectorAll('.array-table-row'):[];
  var row=rows.length?rows[rows.length-1]:null;
  if(!row){window.showNotification('Could not create a new configuration row.','error');return;}
  function set(prop,value){
    var input=row.querySelector('[name$=".'+prop+'"]');
    if(!input)return;
    if(input.type==='checkbox'){
      input.checked=Boolean(value);
      var hidden=input.previousElementSibling;
      if(hidden&&hidden.type==='hidden')hidden.value=String(Boolean(value));
    } else input.value=value==null?'':value;
  }
  set('entity_id',entity.entity_id);
  if(kind==='entity')set('label',entity.friendly_name||entity.entity_id);
  if(kind==='calendar')set('label',entity.friendly_name||'UPCOMING');
  if(kind==='notification'){
    set('title',(entity.friendly_name||'HOME ALERT').toUpperCase());
    set('message','{friendly_name}: {state}');
    if(entity.domain==='binary_sensor')set('to','on');
    set('priority',true);
  }
  window.showNotification(entity.entity_id+' added to '+fieldKey.replace(/_/g,' '),'success');
}
window.LEDMatrixWidgets.register('ha-entity-browser',{
  name:'Home Assistant Entity Browser',version:'1.0.0',
  render:function(container,config,value,options){
    var pluginId=options.pluginId||'home-assistant';
    var fieldId=sid(options.fieldId||container.id);
    container.innerHTML=
      '<style>'+
      '#'+fieldId+'_browser .ha-result{display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.6rem .7rem;border-bottom:1px solid #e5e7eb}'+
      '#'+fieldId+'_browser .ha-result:last-child{border-bottom:0}'+
      '#'+fieldId+'_browser .ha-meta{min-width:0;flex:1}'+
      '#'+fieldId+'_browser .ha-name{font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
      '#'+fieldId+'_browser .ha-id{font-size:.75rem;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
      '#'+fieldId+'_browser .ha-state{font-size:.75rem;color:#4b5563;margin-top:.15rem}'+
      '#'+fieldId+'_browser .ha-actions{display:flex;gap:.35rem;flex-wrap:wrap;justify-content:flex-end}'+
      '#'+fieldId+'_browser .ha-btn{border:1px solid #d1d5db;border-radius:.375rem;padding:.3rem .5rem;font-size:.75rem;background:#fff;cursor:pointer}'+
      '#'+fieldId+'_browser .ha-btn:hover{background:#f3f4f6}'+
      '#'+fieldId+'_browser .ha-grid{display:grid;grid-template-columns:minmax(0,1fr) 150px auto;gap:.5rem}'+
      '@media(max-width:700px){#'+fieldId+'_browser .ha-grid{grid-template-columns:1fr}}'+
      '</style>'+
      '<div id="'+fieldId+'_browser">'+
      '<div class="ha-grid">'+
      '<input id="'+fieldId+'_query" type="search" placeholder="Search by name, entity ID, state, device class..." class="form-input w-full rounded-md border-gray-300 shadow-sm bg-white text-black">'+
      '<select id="'+fieldId+'_domain" class="form-select rounded-md border-gray-300 bg-white text-black">'+
      '<option value="all">All domains</option><option value="sensor">Sensors</option><option value="binary_sensor">Binary sensors</option>'+
      '<option value="calendar">Calendars</option><option value="camera">Cameras</option><option value="cover">Covers</option>'+
      '<option value="lock">Locks</option><option value="light">Lights</option><option value="person">People</option>'+
      '<option value="device_tracker">Device trackers</option><option value="weather">Weather</option><option value="switch">Switches</option>'+
      '<option value="climate">Climate</option></select>'+
      '<button type="button" id="'+fieldId+'_search" class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md">Search Home Assistant</button>'+
      '</div><div id="'+fieldId+'_status" class="text-xs text-gray-500 mt-2">Enter your Home Assistant URL and token above, then search your entities.</div>'+
      '<div id="'+fieldId+'_results" class="mt-3 border border-gray-200 rounded-lg overflow-hidden bg-white" style="display:none"></div>'+
      '<input type="hidden" name="'+esc(options.fullKey||'entity_browser')+'" value=""></div>';
    var query=container.querySelector('#'+fieldId+'_query');
    var domain=container.querySelector('#'+fieldId+'_domain');
    var button=container.querySelector('#'+fieldId+'_search');
    var status=container.querySelector('#'+fieldId+'_status');
    var results=container.querySelector('#'+fieldId+'_results');
    async function runSearch(){
      var haUrl=readField('ha_url'),haToken=readField('ha_token'),verifySsl=readField('verify_ssl');
      if(!haUrl||!haToken){window.showNotification('Enter the Home Assistant URL and token first.','error');return;}
      button.disabled=true;button.textContent='Searching...';status.textContent='Connecting to Home Assistant...';results.style.display='none';results.innerHTML='';
      try{
        var resp=await fetch('/api/v3/plugins/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          plugin_id:pluginId,action_id:'discover-entities',params:{ha_url:haUrl,ha_token:haToken,verify_ssl:verifySsl!==false,query:query.value||'',domain:domain.value||'all'}
        })});
        var data=await resp.json();
        if(!resp.ok||data.status!=='success')throw new Error(data.message||data.output||'Entity discovery failed');
        var raw=String(data.output||'').trim(),payload=null,lines=raw.split(/\r?\n/).filter(Boolean);
        for(var i=lines.length-1;i>=0;i--){try{payload=JSON.parse(lines[i]);if(payload&&typeof payload==='object')break;}catch(e){}}
        if(!payload)throw new Error('Could not parse Home Assistant response');
        if(!payload.ok)throw new Error(payload.error||'Home Assistant entity search failed');
        var entities=Array.isArray(payload.entities)?payload.entities:[];
        status.textContent=entities.length+' matching '+(entities.length===1?'entity':'entities')+' shown'+(payload.count>entities.length?' of '+payload.count:'')+'.';
        if(!entities.length){results.innerHTML='<div class="p-3 text-sm text-gray-500">No entities matched your search.</div>';results.style.display='block';return;}
        entities.forEach(function(entity){
          var row=document.createElement('div');row.className='ha-result';
          var meta=document.createElement('div');meta.className='ha-meta';
          var nm=document.createElement('div');nm.className='ha-name';nm.textContent=entity.friendly_name||entity.entity_id;
          var id=document.createElement('div');id.className='ha-id';id.textContent=entity.entity_id;
          var st=document.createElement('div');st.className='ha-state';st.textContent='State: '+(entity.state==null?'':entity.state)+(entity.unit?' '+entity.unit:'')+(entity.device_class?' • '+entity.device_class:'');
          meta.append(nm,id,st);
          var actions=document.createElement('div');actions.className='ha-actions';
          function btn(label,fn){var b=document.createElement('button');b.type='button';b.className='ha-btn';b.textContent=label;b.onclick=fn;actions.appendChild(b);}
          btn('Add Entity',function(){addToArray(pluginId,'entities',entity,'entity');});
          if(entity.domain==='calendar')btn('Add Calendar',function(){addToArray(pluginId,'calendars',entity,'calendar');});
          btn('Add Alert Rule',function(){addToArray(pluginId,'event_notifications',entity,'notification');});
          row.append(meta,actions);results.appendChild(row);
        });
        results.style.display='block';
      }catch(err){status.textContent='Search failed.';window.showNotification('Home Assistant search failed: '+err.message,'error');}
      finally{button.disabled=false;button.textContent='Search Home Assistant';}
    }
    button.addEventListener('click',runSearch);
    query.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();runSearch();}});
  },
  getValue:function(){return '';},setValue:function(){},handlers:{}
});
})();