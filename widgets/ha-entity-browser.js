(function () {
'use strict';
if (!window.LEDMatrixWidgets) return;
function esc(t){ return window.LEDEscape ? window.LEDEscape.html(String(t == null ? '' : t)) : String(t == null ? '' : t); }
function sid(t){ return String(t).replace(/[^a-zA-Z0-9_-]/g,'_'); }
function readField(root,name){
  var el=root ? root.querySelector('[name="'+name+'"]') : null;
  if(!el)return '';
  return el.type==='checkbox'?el.checked:(el.value||'');
}
function smartLocation(entity){
  var text=((entity.friendly_name||'')+' '+(entity.entity_id||'')).toLowerCase();
  var words=['person','people','vehicle','car','package','parcel','animal','pet','motion','occupancy','presence','detected','detection','camera','sensor','binary','doorbell'];
  var name=(entity.friendly_name||entity.entity_id||'Home').replace(/[_-]+/g,' ');
  words.forEach(function(w){name=name.replace(new RegExp('\\b'+w+'\\b','ig'),' ');});
  name=name.replace(/\s+/g,' ').trim();
  if(!name || name.length>28){
    if(text.indexOf('driveway')>=0)return 'Driveway';
    if(text.indexOf('front door')>=0||text.indexOf('front_door')>=0)return 'Front Door';
    if(text.indexOf('back door')>=0||text.indexOf('back_door')>=0)return 'Back Door';
    if(text.indexOf('garage')>=0)return 'Garage';
    return entity.friendly_name||'Home';
  }
  return name;
}
function detectionKind(entity){
  var text=((entity.friendly_name||'')+' '+(entity.entity_id||'')+' '+(entity.device_class||'')).toLowerCase();
  if(/package|parcel/.test(text))return 'Package';
  if(/vehicle|car|auto/.test(text))return 'Vehicle';
  if(/person|people|occupancy|presence/.test(text))return 'Person';
  if(/animal|pet|dog|cat/.test(text))return 'Animal';
  if(/motion/.test(text))return 'Motion';
  return '';
}
function entityDefaults(entity){
  var d={label:entity.friendly_name||entity.entity_id,unit:entity.unit||'',value_template:'{value}{unit}',subtitle_template:''};
  var dc=String(entity.device_class||'').toLowerCase(), domain=String(entity.domain||'');
  if(domain==='sensor' && (dc==='temperature'||/temperature/.test(entity.entity_id||''))) d.unit=entity.unit||'°F';
  if(domain==='sensor' && dc==='battery') d.unit=entity.unit||'%';
  if(domain==='sensor' && (dc==='humidity'||/humidity/.test(entity.entity_id||''))) d.unit=entity.unit||'%';
  if(domain==='person'||domain==='device_tracker') d.subtitle_template='Presence';
  if(domain==='cover' && /garage/.test((entity.friendly_name||'')+' '+(entity.entity_id||''))) d.label='Garage Door';
  return d;
}
function notificationDefaults(entity){
  var location=smartLocation(entity), kind=detectionKind(entity), title=location.toUpperCase();
  var msg='{friendly_name}: {state}';
  if(kind && kind!=='Motion') msg=kind+' detected'+(location?' in '+location.toLowerCase():'');
  else if(kind==='Motion') msg='Motion detected'+(location?' in '+location.toLowerCase():'');
  else if(entity.domain==='cover') msg='{friendly_name} is {state}';
  else if(entity.domain==='lock') msg='{friendly_name} is {state}';
  return {title:title||'HOME ALERT',message:msg,to:entity.domain==='binary_sensor'?'on':'',priority:true};
}
function addToArray(root,pluginId,fieldKey,entity,kind){
  var fieldId=(pluginId+'-'+fieldKey).replace(/\./g,'-').replace(/_/g,'-');
  var addButton=(root||document).querySelector('button[data-field-id="'+fieldId+'"]');
  if(!addButton||typeof window.addArrayTableRow!=='function'){
    window.showNotification('Could not find the '+fieldKey+' configuration table.','error'); return;
  }
  window.addArrayTableRow(addButton);
  var tbody=(root||document).querySelector('#'+fieldId+'_tbody');
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
  if(kind==='entity'){
    var ed=entityDefaults(entity);
    set('label',ed.label);set('unit',ed.unit);set('value_template',ed.value_template);set('subtitle_template',ed.subtitle_template);
  }
  if(kind==='calendar')set('label',entity.friendly_name||'UPCOMING');
  if(kind==='notification'){
    var nd=notificationDefaults(entity);
    set('title',nd.title);set('message',nd.message);set('to',nd.to);set('priority',nd.priority);
  }
  window.showNotification(entity.entity_id+' added with smart defaults','success');
}
window.LEDMatrixWidgets.register('ha-entity-browser',{
  name:'Home Assistant Entity Browser',version:'1.0.0',
  render:function(container,config,value,options){
    var pluginId=options.pluginId||'home-assistant';
    var root=container.closest('form')||document.getElementById('plugin-config-form-'+pluginId)||container.parentElement;
    var fieldId=sid(options.fieldId||container.id);
    container.innerHTML=
      '<style>'+
      '#'+fieldId+'_browser .ha-result{display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.6rem .7rem;border-bottom:1px solid #e5e7eb}'+
      '#'+fieldId+'_browser .ha-result:last-child{border-bottom:0}'+
      '#'+fieldId+'_browser .ha-meta{min-width:0;flex:1}'+
      '#'+fieldId+'_browser{color:inherit}'+
      '#'+fieldId+'_browser .ha-name{font-weight:600;color:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
      '#'+fieldId+'_browser .ha-id{font-size:.75rem;color:var(--muted-text,#9ca3af);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
      '#'+fieldId+'_browser .ha-state{font-size:.75rem;color:var(--muted-text,#9ca3af);margin-top:.15rem}'+
      '#'+fieldId+'_browser .ha-actions{display:flex;gap:.35rem;flex-wrap:wrap;justify-content:flex-end}'+
      '#'+fieldId+'_browser .ha-btn{border:1px solid var(--border-color,#4b5563);border-radius:.375rem;padding:.3rem .5rem;font-size:.75rem;background:transparent;color:inherit;cursor:pointer}'+
      '#'+fieldId+'_browser .ha-btn:hover{background:rgba(127,127,127,.15)}'+
      '#'+fieldId+'_browser .ha-grid{display:grid;grid-template-columns:minmax(0,1fr) 150px auto;gap:.5rem}'+
      '@media(max-width:700px){#'+fieldId+'_browser .ha-grid{grid-template-columns:1fr}}'+
      '</style>'+
      '<div id="'+fieldId+'_browser">'+
      '<div class="ha-grid">'+
      '<input id="'+fieldId+'_query" type="search" placeholder="Search by name, entity ID, state, device class..." class="form-input w-full rounded-md shadow-sm" style="background:var(--input-bg,#111827);color:var(--text-color,#f9fafb);border-color:var(--border-color,#4b5563)">'+
      '<select id="'+fieldId+'_domain" class="form-select rounded-md" style="background:var(--input-bg,#111827);color:var(--text-color,#f9fafb);border-color:var(--border-color,#4b5563)">'+
      '<option value="all">All domains</option><option value="sensor">Sensors</option><option value="binary_sensor">Binary sensors</option>'+
      '<option value="calendar">Calendars</option><option value="camera">Cameras</option><option value="cover">Covers</option>'+
      '<option value="lock">Locks</option><option value="light">Lights</option><option value="person">People</option>'+
      '<option value="device_tracker">Device trackers</option><option value="weather">Weather</option><option value="switch">Switches</option>'+
      '<option value="climate">Climate</option></select>'+
      '<button type="button" id="'+fieldId+'_search" class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md">Search Home Assistant</button>'+
      '</div><div id="'+fieldId+'_status" class="text-xs text-gray-500 mt-2">Enter your Home Assistant URL and token above, then search your entities.</div>'+
      '<div id="'+fieldId+'_results" class="mt-3 border rounded-lg overflow-hidden" style="display:none;background:var(--card-bg,transparent);border-color:var(--border-color,#4b5563)"></div>'+
      '<input type="hidden" name="'+esc(options.fullKey||'entity_browser')+'" value=""></div>';
    var query=container.querySelector('#'+fieldId+'_query');
    var domain=container.querySelector('#'+fieldId+'_domain');
    var button=container.querySelector('#'+fieldId+'_search');
    var status=container.querySelector('#'+fieldId+'_status');
    var results=container.querySelector('#'+fieldId+'_results');
    function syncValidationState(validated){
      var ok=!!validated;
      query.disabled=!ok;domain.disabled=!ok;button.disabled=!ok;
      if(!ok){
        status.textContent='Step 1 must be validated before entity discovery is available.';
        results.style.display='none';
      }else{
        status.textContent='Connection validated. Search Home Assistant entities below.';
      }
    }
    syncValidationState(window.__HA_CONNECTION_VALIDATED__===true);
    document.addEventListener('ha-connection-validation',function(e){syncValidationState(e.detail&&e.detail.validated);});
    async function runSearch(){
      var haUrl=readField(root,'ha_url'),haToken=readField(root,'ha_token'),verifySsl=readField(root,'verify_ssl');
      if(!haUrl||!haToken){window.showNotification('Enter the Home Assistant URL and token first.','error');return;}
      button.disabled=true;button.textContent='Searching...';status.textContent='Connecting to Home Assistant...';results.style.display='none';results.innerHTML='';
      try{
        var resp=await fetch('/api/v3/plugins/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          plugin_id:pluginId,action_id:'discover-entities',params:{mode:'discover',ha_url:haUrl,ha_token:haToken,verify_ssl:(verifySsl!==false?'true':'false'),query:query.value||'',domain:domain.value||'all'}
        })});
        var data=await resp.json();
        var payload=null;
        if(data && typeof data==='object' && Object.prototype.hasOwnProperty.call(data,'ok')){
          payload=data;
        }else{
          if(!resp.ok||(data&&data.status==='error'))throw new Error((data&&data.message)||(data&&data.output)||'Entity discovery failed');
          var raw=String((data&&data.output)||'').trim(),lines=raw.split(/\r?\n/).filter(Boolean);
          for(var i=lines.length-1;i>=0;i--){try{payload=JSON.parse(lines[i]);if(payload&&typeof payload==='object')break;}catch(e){}}
        }
        if(!payload)throw new Error('Could not parse Home Assistant response');
        if(!payload.ok)throw new Error(payload.error||payload.message||'Home Assistant entity search failed');
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
          btn('Add Entity',function(){addToArray(root,pluginId,'entities',entity,'entity');});
          if(entity.domain==='calendar')btn('Add Calendar',function(){addToArray(root,pluginId,'calendars',entity,'calendar');});
          btn('Add Alert Rule',function(){addToArray(root,pluginId,'event_notifications',entity,'notification');});
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