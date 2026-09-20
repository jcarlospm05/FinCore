(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const nowISO = () => new Date().toISOString();
  const todayISO = () => new Date().toISOString().slice(0,10);
  const uid = p => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const num = v => Number(v || 0);
  const clamp = (v,a,b)=>Math.min(b,Math.max(a,v));
  const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  const state = { data:null, fileHandle:null, fileName:'Guardado local', dirty:false, calendarCursor:new Date(), currentView:'dashboard', reportFilters:{from:'',to:'',lenderId:'',loanId:'',type:'',status:''} };


  const LOCAL_DB='FinCoreLocalDB', LOCAL_STORE='state', LOCAL_KEY='primary-user';
  function openLocalDb(){
    return new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)) return reject(new Error('IndexedDB no disponible'));
      const req=indexedDB.open(LOCAL_DB,1);
      req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(LOCAL_STORE))db.createObjectStore(LOCAL_STORE);};
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }
  async function loadLocalData(){
    try{
      const db=await openLocalDb();
      const value=await new Promise((resolve,reject)=>{
        const tx=db.transaction(LOCAL_STORE,'readonly');
        const req=tx.objectStore(LOCAL_STORE).get(LOCAL_KEY);
        req.onsuccess=()=>resolve(req.result||null);
        req.onerror=()=>reject(req.error);
      });
      db.close();
      return value;
    }catch(e){
      try{const raw=localStorage.getItem('fincore-local-fallback');return raw?JSON.parse(raw):null;}catch(_){return null;}
    }
  }
  async function persistLocalData(){
    if(!state.data)return;
    state.data.updatedAt=nowISO();
    try{
      const snapshot=JSON.parse(JSON.stringify(state.data));
      const db=await openLocalDb();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(LOCAL_STORE,'readwrite');
        tx.objectStore(LOCAL_STORE).put(snapshot,LOCAL_KEY);
        tx.oncomplete=()=>resolve();
        tx.onerror=()=>reject(tx.error);
      });
      db.close();
      state.dirty=false;
      renderSaveState();
    }catch(e){
      try{
        localStorage.setItem('fincore-local-fallback',JSON.stringify(state.data));
        state.dirty=false;
        renderSaveState();
      }catch(_){
        state.dirty=true;
        renderSaveState();
        toast('No se pudo guardar en el dispositivo.','error');
      }
    }
  }
  async function clearLocalData(){
    try{
      const db=await openLocalDb();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(LOCAL_STORE,'readwrite');
        tx.objectStore(LOCAL_STORE).delete(LOCAL_KEY);
        tx.oncomplete=()=>resolve();
        tx.onerror=()=>reject(tx.error);
      });
      db.close();
    }catch(e){}
    try{localStorage.removeItem('fincore-local-fallback');}catch(e){}
  }

  function defaultData(profile={}){
    const name = profile.name || 'Usuario';
    return {
      app:'FinCore', schemaVersion:'2.0.0', createdAt:nowISO(), updatedAt:nowISO(),
      profile:{ id:uid('usr'), name, email:profile.email||'', notes:'' },
      settings:{ currency:profile.currency||'DOP', currencySymbol:profile.currencySymbol||'RD$', locale:profile.locale||'es-DO', firstFortnightDay:num(profile.firstFortnightDay)||15, secondFortnightRule:'last-day', projectionYear:new Date().getFullYear(), loanTypes:['Bancario','Personal','Informal','Tarjeta','Vehículo','Hipotecario','Otro'], commitmentCategories:['Casa','Servicios','Alimentación','Educación','Transporte','Seguros','Familia','Otros'], incomeCategories:['Salario','Extra','Bono','Negocio','Otro'] },
      lenders:[], loans:[], payments:[], incomes:[], commitments:[], goals:[], audit:[]
    };
  }

  function validateData(d){
    if(!d || d.app!=='FinCore') throw new Error('El archivo no corresponde a FinCore.');
    ['lenders','loans','payments','incomes','commitments','goals','audit'].forEach(k=>{ if(!Array.isArray(d[k])) d[k]=[]; });
    d.settings = Object.assign(defaultData().settings, d.settings||{});
    d.profile = Object.assign(defaultData().profile, d.profile||{});
    // Migración compatible: los JSON v1.0/v1.1 continúan funcionando.
    d.loans.forEach(l=>{
      if(!('interestFrequency' in l)) l.interestFrequency = num(l.interestRate)>0 ? 'annual' : 'none';
      if(!('interestLastSettledDate' in l)) l.interestLastSettledDate = '';
    });
    d.payments.forEach(p=>{
      if(!('paymentType' in p)) p.paymentType = num(p.principal)===0 && num(p.interest)>0 ? 'interest-only' : 'mixed';
    });
    d.schemaVersion = '2.0.0';
    return d;
  }

  function money(v){
    const d=state.data||defaultData();
    return `${d.settings.currencySymbol||'RD$'} ${num(v).toLocaleString(d.settings.locale||'es-DO',{maximumFractionDigits:2})}`;
  }
  function fmtDate(v){ if(!v) return '—'; const [y,m,d]=v.slice(0,10).split('-').map(Number); return new Date(y,m-1,d).toLocaleDateString(state.data?.settings?.locale||'es-DO',{day:'2-digit',month:'short',year:'numeric'}); }
  function localISO(date){ return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
  function lastDay(y,m){ return new Date(y,m+1,0).getDate(); }
  function initials(name){ return (name||'FC').trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join(''); }
  function interestFrequencyLabel(v){ return ({none:'Sin interés',daily:'Diario',fortnightly:'Quincenal',monthly:'Mensual',annual:'Anual'})[v]||'Sin interés'; }
  function interestPeriodAmount(loan){ const rate=num(loan?.interestRate); if(!loan||rate<=0||loan.interestFrequency==='none') return 0; return num(loan.currentBalance)*(rate/100); }
  function wholeMonthsBetween(a,b){ let m=(b.getFullYear()-a.getFullYear())*12+(b.getMonth()-a.getMonth()); if(b.getDate()<a.getDate())m--; return Math.max(0,m); }
  function interestAccruedEstimate(loan,toDate){
    if(!loan||num(loan.interestRate)<=0||!loan.interestFrequency||loan.interestFrequency==='none') return 0;
    const fromStr=loan.interestLastSettledDate||loan.startDate; if(!fromStr||!toDate) return interestPeriodAmount(loan);
    const a=new Date(fromStr+'T12:00:00'),b=new Date(toDate+'T12:00:00'); if(Number.isNaN(a.getTime())||Number.isNaN(b.getTime())||b<=a)return 0;
    const days=Math.max(0,Math.floor((b-a)/86400000)); let periods=0;
    if(loan.interestFrequency==='daily') periods=days;
    else if(loan.interestFrequency==='fortnightly') periods=Math.floor((days+1)/15);
    else if(loan.interestFrequency==='monthly') periods=wholeMonthsBetween(a,b);
    else if(loan.interestFrequency==='annual') periods=days/365;
    return num(loan.currentBalance)*(num(loan.interestRate)/100)*periods;
  }

  function audit(action, detail){ if(!state.data) return; state.data.audit.unshift({id:uid('aud'),at:nowISO(),action,detail}); state.data.audit=state.data.audit.slice(0,300); }
  function markDirty(action,detail){ state.dirty=true; state.data.updatedAt=nowISO(); if(action) audit(action,detail||''); renderSaveState(); persistLocalData(); }
  function renderSaveState(){ const el=$('#saveState'); if(!el)return; el.className=`save-state ${state.dirty?'unsaved':'saved'}`; el.textContent=state.dirty?'● Guardando...':'✓ Guardado automáticamente'; }
  function toast(msg,type='success'){ const e=document.createElement('div'); e.className=`toast ${type}`; e.textContent=msg; $('#toastContainer').appendChild(e); setTimeout(()=>e.remove(),3300); }

  async function openJson(){
    if(window.showOpenFilePicker){
      try{
        const [handle]=await showOpenFilePicker({types:[{description:'FinCore JSON',accept:{'application/json':['.json']}}],multiple:false});
        const file=await handle.getFile(); const text=await file.text(); loadJsonText(text,file.name,handle); return;
      }catch(e){ if(e.name==='AbortError') return; }
    }
    $('#jsonFileInput').click();
  }
  function loadJsonText(text,fileName,handle=null){
    try{ state.data=validateData(JSON.parse(text)); state.fileName=fileName||'fincore.json'; state.fileHandle=handle; state.dirty=false; enterApp(); toast('Archivo FinCore cargado.'); }
    catch(e){ toast(e.message||'No se pudo abrir el JSON.','error'); }
  }
  async function savePrimary(){
    if(!state.data) return;
    const text=JSON.stringify(state.data,null,2);
    if(state.fileHandle){
      try{ const w=await state.fileHandle.createWritable(); await w.write(text); await w.close(); state.dirty=false; renderSaveState(); toast('Archivo actualizado.'); return; }catch(e){}
    }
    if(window.showSaveFilePicker){
      try{
        const suggested=state.fileName||`FinCore_${safeName(state.data.profile.name)}.json`;
        const h=await showSaveFilePicker({suggestedName:suggested,types:[{description:'FinCore JSON',accept:{'application/json':['.json']}}]});
        const w=await h.createWritable(); await w.write(text); await w.close(); state.fileHandle=h; state.fileName=(await h.getFile()).name; state.dirty=false; renderSaveState(); updateTopbar(); toast('Archivo guardado.'); return;
      }catch(e){ if(e.name==='AbortError') return; }
    }
    downloadJson(`FinCore_${safeName(state.data.profile.name)}_${todayISO()}.json`); state.dirty=false; renderSaveState();
  }
  function safeName(s){ return String(s||'usuario').trim().replace(/[^a-z0-9áéíóúñ_-]+/gi,'_').replace(/^_+|_+$/g,''); }
  function downloadJson(name){ const blob=new Blob([JSON.stringify(state.data,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1500); toast('Copia JSON generada.'); }

  function enterApp(){ $('#welcomeScreen').classList.add('hidden'); $('#appShell').classList.remove('hidden'); updateTopbar(); renderAll(); navigate('dashboard'); }
  function closeUser(){ if(state.dirty&&!confirm('Hay cambios sin guardar. ¿Cerrar de todos modos?')) return; state.data=null; state.fileHandle=null; state.fileName=''; state.dirty=false; $('#appShell').classList.add('hidden'); $('#welcomeScreen').classList.remove('hidden'); }
  function updateTopbar(){ if(!state.data)return; $('#userNameLabel').textContent=state.data.profile.name; $('#userInitials').textContent=initials(state.data.profile.name); $('#userFileLabel').textContent='Guardado local'; renderSaveState(); }

  function showModal(title,html,onReady){ $('#modalTitle').textContent=title; $('#modalBody').innerHTML=html; $('#modalBackdrop').classList.remove('hidden'); setTimeout(()=>onReady?.(),0); }
  function closeModal(){ $('#modalBackdrop').classList.add('hidden'); $('#modalBody').innerHTML=''; }
  function formVal(id){ return document.getElementById(id)?.value ?? ''; }
  function checked(id){ return !!document.getElementById(id)?.checked; }
  function selectOptions(items,value=''){ return items.map(x=>`<option value="${esc(x)}" ${x===value?'selected':''}>${esc(x)}</option>`).join(''); }
  function entityOptions(items,value=''){ return `<option value="">— Seleccionar —</option>`+items.map(x=>`<option value="${x.id}" ${x.id===value?'selected':''}>${esc(x.name)}</option>`).join(''); }

  function newUserModal(){
    showModal('Crear nuevo usuario',`
      <form id="newUserForm"><div class="form-grid">
        <div class="field full"><label>Nombre del usuario</label><input id="nuName" required placeholder="Ej. Juan Pérez"></div>
        <div class="field"><label>Moneda</label><select id="nuCurrency"><option value="DOP">Peso dominicano (DOP)</option><option value="USD">Dólar estadounidense (USD)</option><option value="EUR">Euro (EUR)</option></select></div>
        <div class="field"><label>Símbolo</label><input id="nuSymbol" value="RD$"></div>
        <div class="field"><label>Primera quincena</label><input id="nuFortnight" type="number" min="1" max="28" value="15"></div>
        <div class="field"><label>Segunda quincena</label><input value="Último día del mes" disabled></div>
      </div><div class="form-actions"><button type="button" class="btn btn-ghost" data-close>Cerrar</button><button class="btn btn-primary">Crear dashboard</button></div></form>`,()=>{
        $('#newUserForm').onsubmit=e=>{ e.preventDefault(); const name=formVal('nuName').trim(); if(!name)return; state.data=defaultData({name,currency:formVal('nuCurrency'),currencySymbol:formVal('nuSymbol')||'RD$',firstFortnightDay:num(formVal('nuFortnight'))}); state.fileHandle=null; state.fileName='Guardado local'; state.dirty=true; audit('Usuario creado',name); closeModal(); enterApp(); persistLocalData(); toast('FinCore configurado. Tus datos se guardan automáticamente.'); };
    });
  }

  function navigate(view){ state.currentView=view; $$('.view').forEach(v=>v.classList.toggle('active-view',v.id===`view-${view}`)); $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view)); renderView(view); }
  function renderAll(){ ['dashboard','loans','payments','income','commitments','calendar','lenders','goals','forecast','reports','settings'].forEach(renderView); }
  function renderView(v){ if(!state.data)return; const fn={dashboard:renderDashboard,loans:renderLoans,payments:renderPayments,income:renderIncome,commitments:renderCommitments,calendar:renderCalendar,lenders:renderLenders,goals:renderGoals,forecast:renderForecast,reports:renderReports,settings:renderSettings}[v]; fn?.(); }

  function pageHeader(title,sub,actions=''){ return `<div class="page-header"><div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div><div class="action-row">${actions}</div></div>`; }
  function badge(status){ const s=(status||'').toLowerCase(); let c=s.includes('liquid')?'gray':s.includes('mantenimiento')?'green':s.includes('paus')?'orange':s.includes('pend')?'red':'blue'; return `<span class="badge badge-${c}">${esc(status||'—')}</span>`; }
  function loanStatus(l){ if(l.currentBalance<=0)return 'Liquidado'; if(l.status==='paused')return 'Pausado'; return l.maintenance?'En mantenimiento':'Sin mantenimiento'; }

  function computeMetrics(){
    const loans=state.data.loans; const total=loans.reduce((s,l)=>s+num(l.currentBalance),0); const maint=loans.filter(l=>l.maintenance&&num(l.currentBalance)>0).reduce((s,l)=>s+num(l.currentBalance),0); const off=total-maint;
    const next=nextFortnightRange(new Date()); const ev=eventsForRange(next.start,next.end); const commitments=ev.filter(e=>['commitment','loan'].includes(e.type)).reduce((s,e)=>s+e.amount,0); const income=ev.filter(e=>e.type==='income').reduce((s,e)=>s+e.amount,0);
    return {total,maint,off,next,commitments,income,available:income-commitments};
  }
  function nextFortnightRange(date){ const d=new Date(date.getFullYear(),date.getMonth(),date.getDate()); const first=num(state.data.settings.firstFortnightDay)||15; let end;if(d.getDate()<=first)end=new Date(d.getFullYear(),d.getMonth(),first);else end=new Date(d.getFullYear(),d.getMonth(),lastDay(d.getFullYear(),d.getMonth()));return {start:d,end}; }

  function renderDashboard(){
    const m=computeMetrics();
    const now=new Date();
    const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
    const monthEnd=new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59);
    const monthPayments=state.data.payments.filter(p=>{const d=new Date(p.date+'T12:00:00');return d>=monthStart&&d<=monthEnd;});
    const paidMonth=monthPayments.reduce((s,p)=>s+num(p.amount),0);
    const principalMonth=monthPayments.reduce((s,p)=>s+num(p.principal),0);
    const interestMonth=monthPayments.reduce((s,p)=>s+num(p.interest),0);
    const activeLoans=state.data.loans.filter(l=>num(l.currentBalance)>0);
    const maintenanceCount=activeLoans.filter(l=>l.maintenance&&l.status!=='paused').length;
    const noMaintenanceCount=activeLoans.filter(l=>!l.maintenance||l.status==='paused').length;
    const upcoming=eventsForRange(new Date(),new Date(Date.now()+31*864e5)).filter(e=>['loan','commitment'].includes(e.type)).slice(0,6);

    $('#view-dashboard').innerHTML=`${pageHeader(`Hola, ${state.data.profile.name.split(' ')[0]}`,'Tu resumen financiero, sin complicaciones.','<button class="btn btn-primary" data-action="add-payment">+ Registrar pago</button>')}
      <div class="simple-summary-grid">
        <div class="summary-card summary-primary"><span>Deuda total</span><strong>${money(m.total)}</strong><small>Saldo pendiente actual</small></div>
        <div class="summary-card"><span>Próxima quincena</span><strong>${money(m.commitments)}</strong><small>Hasta ${fmtDate(localISO(m.next.end))}</small></div>
        <div class="summary-card"><span>Ingresos próxima quincena</span><strong>${money(m.income)}</strong><small>Ingresos programados</small></div>
        <div class="summary-card ${m.available<0?'summary-alert':''}"><span>Disponible estimado</span><strong>${money(m.available)}</strong><small>Después de compromisos</small></div>
      </div>

      <div class="simple-dashboard-grid">
        <div class="card simple-panel">
          <div class="simple-panel-head"><div><h3>Próximos pagos</h3><p>Lo que viene en los próximos 31 días.</p></div></div>
          ${upcoming.length?`<div class="upcoming-list">${upcoming.map(e=>`<div class="upcoming-row"><div><strong>${esc(e.name)}</strong><small>${fmtDate(e.date)} · ${e.type==='loan'?'Préstamo':'Compromiso'}</small></div><b>${money(e.amount)}</b></div>`).join('')}</div>`:empty('Nada pendiente','No tienes pagos programados en los próximos 31 días.')}
        </div>

        <div class="card simple-panel">
          <div class="simple-panel-head"><div><h3>Este mes</h3><p>Pagos que ya registraste.</p></div></div>
          <div class="simple-metrics">
            <div><span>Total pagado</span><strong>${money(paidMonth)}</strong></div>
            <div><span>A capital</span><strong>${money(principalMonth)}</strong></div>
            <div><span>Intereses</span><strong>${money(interestMonth)}</strong></div>
          </div>
        </div>

        <div class="card simple-panel simple-chart-panel">
          <div class="simple-panel-head"><div><h3>Cómo va tu deuda</h3><p>Evolución de los últimos 6 meses.</p></div></div>
          <div class="chart-wrap simple-chart"><canvas id="debtLine" class="chart-canvas"></canvas></div>
        </div>

        <div class="card simple-panel">
          <div class="simple-panel-head"><div><h3>Préstamos</h3><p>Estado general de tus deudas.</p></div></div>
          <div class="simple-metrics">
            <div><span>Activos</span><strong>${activeLoans.length}</strong></div>
            <div><span>En mantenimiento</span><strong>${maintenanceCount}</strong></div>
            <div><span>Sin mantenimiento / pausados</span><strong>${noMaintenanceCount}</strong></div>
          </div>
        </div>
      </div>`;
    requestAnimationFrame(drawDashboardCharts);
  }
  function kpi(label,value,sub,icon){ return `<div class="kpi-card"><div class="kpi-accent">${icon}</div><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`; }
  function empty(a,b){ return `<div class="empty"><strong>${esc(a)}</strong>${esc(b)}</div>`; }
  function tableUpcoming(arr){ return `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Tipo</th><th>Monto</th></tr></thead><tbody>${arr.map(e=>`<tr><td>${fmtDate(e.date)}</td><td>${esc(e.name)}</td><td>${esc(e.type==='loan'?'Préstamo':'Compromiso')}</td><td>${money(e.amount)}</td></tr>`).join('')}</tbody></table></div>`; }
  function goalCard(g){ const p=goalProgress(g); return `<div style="margin:0 0 14px"><div class="metric-line"><strong>${esc(g.name)}</strong><span>${p}%</span></div><div class="progress"><span style="width:${p}%"></span></div><div class="card-sub" style="margin-top:6px">Meta: ${g.targetDate?fmtDate(g.targetDate):'sin fecha'}</div></div>`; }
  function goalProgress(g){ if(g.type==='debt-total'){const cur=state.data.loans.reduce((s,l)=>s+num(l.currentBalance),0),base=num(g.startValue)||cur,target=num(g.targetValue); if(base<=target)return 100; return clamp(Math.round((base-cur)/(base-target)*100),0,100);} if(g.type==='loan'){const l=state.data.loans.find(x=>x.id===g.loanId); if(!l)return 0; return clamp(Math.round((1-num(l.currentBalance)/Math.max(1,num(l.initialAmount)))*100),0,100);} return clamp(num(g.progress),0,100); }

  function drawDashboardCharts(){
    const months=lastTwelveMonths().slice(-6);
    const balances=debtHistory(months);
    if($('#debtLine')) FinCharts.line($('#debtLine'),months.map(x=>x.label),balances,{color:FinCharts.colors.blue});
  }

  function lastTwelveMonths(){ const out=[]; const d=new Date(); for(let i=11;i>=0;i--){const x=new Date(d.getFullYear(),d.getMonth()-i,1);out.push({y:x.getFullYear(),m:x.getMonth(),label:monthNames[x.getMonth()]});} return out; }
  function debtHistory(months){ const current=state.data.loans.reduce((s,l)=>s+num(l.currentBalance),0); return months.map(({y,m})=>{const end=new Date(y,m+1,0,23,59,59); const after=state.data.payments.filter(p=>new Date(p.date)>end).reduce((s,p)=>s+num(p.principal),0); return current+after; }); }

  function renderLoans(){ const rows=state.data.loans; $('#view-loans').innerHTML=`${pageHeader('Préstamos','Deudas personales, informales, bancarias y otras.','<button class="btn btn-primary" data-action="add-loan">+ Nuevo préstamo</button>')}${rows.length?`<div class="card"><div class="table-wrap"><table><thead><tr><th>Concepto</th><th>Acreedor</th><th>Tipo</th><th>Monto original</th><th>Saldo</th><th>Interés</th><th>Pago planificado</th><th>Estado</th><th></th></tr></thead><tbody>${rows.map(l=>`<tr><td><strong>${esc(l.name)}</strong></td><td>${esc(lenderName(l.lenderId))}</td><td>${esc(l.type)}</td><td>${money(l.initialAmount)}</td><td>${money(l.currentBalance)}</td><td>${num(l.interestRate)>0?`${num(l.interestRate).toLocaleString(state.data.settings.locale)}% · ${interestFrequencyLabel(l.interestFrequency)}`:'—'}</td><td>${money(l.scheduledAmount)}</td><td>${badge(loanStatus(l))}</td><td><button class="btn btn-secondary btn-compact" data-action="report-loan" data-id="${l.id}">Resumen</button> <button class="btn btn-ghost btn-compact" data-action="edit-loan" data-id="${l.id}">Editar</button> <button class="btn btn-danger btn-compact" data-action="delete-loan" data-id="${l.id}">Eliminar</button></td></tr>`).join('')}</tbody></table></div></div>`:empty('No hay préstamos','Registra la primera deuda para comenzar.')}`; }

  function lenderName(id){ return state.data.lenders.find(x=>x.id===id)?.name||'—'; }

  function loanModal(editId=''){
    const l=state.data.loans.find(x=>x.id===editId)||{}; const s=state.data.settings;
    const interestFreq=l.interestFrequency||(num(l.interestRate)>0?'annual':'none');
    showModal(editId?'Editar préstamo':'Nuevo préstamo',`<form id="loanForm"><div class="form-grid">
      <div class="field full"><label>Nombre / concepto</label><input id="lnName" required value="${esc(l.name||'')}"></div>
      <div class="field"><label>Acreedor / institución</label><select id="lnLender">${entityOptions(state.data.lenders,l.lenderId)}</select></div>
      <div class="field"><label>Tipo</label><select id="lnType">${selectOptions(s.loanTypes,l.type)}</select></div>
      <div class="field"><label>Monto original</label><input id="lnInitial" type="number" min="0" step="0.01" required value="${l.initialAmount??''}"></div>
      <div class="field"><label>Saldo actual</label><input id="lnBalance" type="number" min="0" step="0.01" required value="${l.currentBalance??l.initialAmount??''}"></div>
      <div class="field"><label>Fecha de inicio</label><input id="lnStart" type="date" value="${l.startDate||todayISO()}"></div>
      <div class="field"><label>Tasa de interés %</label><input id="lnRate" type="number" min="0" step="0.0001" value="${l.interestRate??''}" placeholder="Ej. 5"></div>
      <div class="field"><label>Periodicidad del interés</label><select id="lnInterestFreq"><option value="none" ${interestFreq==='none'?'selected':''}>Sin interés</option><option value="daily" ${interestFreq==='daily'?'selected':''}>Diario</option><option value="fortnightly" ${interestFreq==='fortnightly'?'selected':''}>Quincenal</option><option value="monthly" ${interestFreq==='monthly'?'selected':''}>Mensual</option><option value="annual" ${interestFreq==='annual'?'selected':''}>Anual</option></select></div>
      <div class="field"><label>Intereses cubiertos hasta</label><input id="lnInterestSettled" type="date" value="${l.interestLastSettledDate||''}"></div>
      <div class="field"><label>Pago planificado</label><input id="lnScheduled" type="number" min="0" step="0.01" value="${l.scheduledAmount??''}"></div>
      <div class="field"><label>Frecuencia de pago</label><select id="lnFreq"><option value="quincenal" ${l.frequency==='quincenal'?'selected':''}>Quincenal</option><option value="mensual" ${l.frequency==='mensual'?'selected':''}>Mensual</option><option value="manual" ${l.frequency==='manual'?'selected':''}>Manual</option></select></div>
      <div class="field"><label>Próximo pago</label><input id="lnNext" type="date" value="${l.nextPaymentDate||todayISO()}"></div>
      <div class="field"><label>Estado</label><select id="lnStatus"><option value="active" ${l.status!=='paused'?'selected':''}>Activo</option><option value="paused" ${l.status==='paused'?'selected':''}>Pausado</option></select></div>
      <div class="field full"><label class="check-line"><input id="lnMaintenance" type="checkbox" ${l.maintenance!==false?'checked':''}> Incluir en mantenimiento y calendario de pagos</label></div>
      <div class="field full"><div class="card-sub">La tasa se interpreta según la periodicidad seleccionada. Ejemplo: 5% mensual = 5% del saldo por cada período mensual.</div></div>
      <div class="field full"><label>Notas</label><textarea id="lnNotes">${esc(l.notes||'')}</textarea></div>
    </div><div class="form-actions"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary">Guardar</button></div></form>`,()=>{
      $('#loanForm').onsubmit=e=>{e.preventDefault();const initial=num(formVal('lnInitial')),balance=num(formVal('lnBalance')); const rate=num(formVal('lnRate')),interestFrequency=rate>0?formVal('lnInterestFreq'):'none'; const rec={id:l.id||uid('loan'),name:formVal('lnName').trim(),lenderId:formVal('lnLender'),type:formVal('lnType'),initialAmount:initial,currentBalance:balance,startDate:formVal('lnStart'),interestRate:rate,interestFrequency,interestLastSettledDate:formVal('lnInterestSettled'),scheduledAmount:num(formVal('lnScheduled')),frequency:formVal('lnFreq'),nextPaymentDate:formVal('lnNext'),status:formVal('lnStatus'),maintenance:checked('lnMaintenance'),notes:formVal('lnNotes'),createdAt:l.createdAt||nowISO(),updatedAt:nowISO()}; if(editId) Object.assign(l,rec); else state.data.loans.push(rec); markDirty(editId?'Préstamo editado':'Préstamo creado',rec.name); closeModal(); renderAll();};
    });
  }


  function renderPayments(){ const arr=[...state.data.payments].sort((a,b)=>b.date.localeCompare(a.date)); $('#view-payments').innerHTML=`${pageHeader('Pagos','Registra abonos a capital, pagos mixtos o pagos solamente de intereses.','<button class="btn btn-primary" data-action="add-payment">+ Registrar pago</button>')}${arr.length?`<div class="card"><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Préstamo</th><th>Tipo de pago</th><th>Total</th><th>Capital</th><th>Interés</th><th>Saldo resultante</th><th>Nota</th><th></th></tr></thead><tbody>${arr.map(p=>`<tr><td>${fmtDate(p.date)}</td><td>${esc(state.data.loans.find(l=>l.id===p.loanId)?.name||'Préstamo eliminado')}</td><td>${p.paymentType==='interest-only'?badge('Solo intereses'):badge(num(p.interest)>0?'Capital + interés':'Capital')}</td><td>${money(p.amount)}</td><td>${money(p.principal)}</td><td>${money(p.interest)}</td><td>${money(p.newBalance)}</td><td>${esc(p.note||'')}</td><td><button class="btn btn-danger" data-action="delete-payment" data-id="${p.id}">Revertir</button></td></tr>`).join('')}</tbody></table></div></div>`:empty('Sin pagos registrados','Registra un pago para iniciar el historial.')}`; }
  function paymentModal(){
    const loans=state.data.loans.filter(l=>num(l.currentBalance)>0); if(!loans.length){toast('Primero registra un préstamo con saldo.','error');return;}
    showModal('Registrar pago',`<form id="paymentForm"><div class="form-grid">
      <div class="field full"><label>Préstamo</label><select id="pmLoan" required>${entityOptions(loans.map(l=>({id:l.id,name:`${l.name} — ${money(l.currentBalance)}`})))}</select></div>
      <div class="field"><label>Tipo de pago</label><select id="pmMode"><option value="mixed">Capital / capital + interés</option><option value="interest-only">Solo intereses</option></select></div>
      <div class="field"><label>Fecha</label><input id="pmDate" type="date" value="${todayISO()}" required></div>
      <div class="field full"><div id="pmInterestInfo" class="report-box">Selecciona un préstamo para ver el cálculo de intereses.</div></div>
      <div class="field"><label>Pago total</label><input id="pmAmount" type="number" min="0.01" step="0.01" required></div>
      <div class="field"><label>Capital</label><input id="pmPrincipal" type="number" min="0" step="0.01" required value="0"></div>
      <div class="field"><label>Interés / cargos</label><input id="pmInterest" type="number" min="0" step="0.01" value="0"></div>
      <div class="field full"><div class="action-row"><button type="button" id="pmUsePeriod" class="btn btn-secondary">Usar interés de 1 período</button><button type="button" id="pmUseAccrued" class="btn btn-ghost">Usar interés acumulado estimado</button></div></div>
      <div class="field full"><label class="check-line"><input id="pmSettleInterest" type="checkbox" checked> Marcar intereses como cubiertos hasta la fecha de este pago</label></div>
      <div class="field full"><label>Nota</label><textarea id="pmNote" placeholder="Ej. Pago de intereses de septiembre"></textarea></div>
    </div><div class="form-actions"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary">Registrar</button></div></form>`,()=>{
      const loanEl=$('#pmLoan'),modeEl=$('#pmMode'),dateEl=$('#pmDate'),amountEl=$('#pmAmount'),principalEl=$('#pmPrincipal'),interestEl=$('#pmInterest'),infoEl=$('#pmInterestInfo');
      const selectedLoan=()=>state.data.loans.find(l=>l.id===loanEl.value);
      const updateInfo=()=>{const loan=selectedLoan();if(!loan){infoEl.textContent='Selecciona un préstamo para ver el cálculo de intereses.';return;}const per=interestPeriodAmount(loan),acc=interestAccruedEstimate(loan,dateEl.value);const since=loan.interestLastSettledDate||loan.startDate||'—';infoEl.innerHTML=`<strong>${esc(loan.name)}</strong><br>Saldo: ${money(loan.currentBalance)} · Tasa: ${num(loan.interestRate)||0}% ${interestFrequencyLabel(loan.interestFrequency).toLowerCase()}<br>Interés de 1 período: <strong>${money(per)}</strong> · Acumulado estimado desde ${fmtDate(since)}: <strong>${money(acc)}</strong>`;};
      const setPayment=(interest,interestOnly=false)=>{interest=Math.max(0,num(interest));interestEl.value=interest.toFixed(2);if(interestOnly){principalEl.value='0.00';amountEl.value=interest.toFixed(2);}else{amountEl.value=(num(principalEl.value)+interest).toFixed(2);}};
      loanEl.addEventListener('change',()=>{updateInfo(); if(modeEl.value==='interest-only') setPayment(interestPeriodAmount(selectedLoan()),true);});
      dateEl.addEventListener('change',updateInfo);
      modeEl.addEventListener('change',()=>{const loan=selectedLoan();if(modeEl.value==='interest-only'){principalEl.value='0.00';setPayment(interestPeriodAmount(loan),true);}updateInfo();});
      $('#pmUsePeriod').onclick=()=>{const loan=selectedLoan();if(!loan)return;setPayment(interestPeriodAmount(loan),modeEl.value==='interest-only');};
      $('#pmUseAccrued').onclick=()=>{const loan=selectedLoan();if(!loan)return;setPayment(interestAccruedEstimate(loan,dateEl.value),modeEl.value==='interest-only');};
      amountEl.addEventListener('input',()=>{ if(modeEl.value!=='interest-only'&&!principalEl.dataset.touched) principalEl.value=Math.max(0,num(amountEl.value)-num(interestEl.value)).toFixed(2); });
      principalEl.addEventListener('input',()=>principalEl.dataset.touched='1');
      interestEl.addEventListener('input',()=>{if(modeEl.value==='interest-only'){principalEl.value='0';amountEl.value=num(interestEl.value).toFixed(2);}});
      updateInfo();
      $('#paymentForm').onsubmit=e=>{e.preventDefault();const loan=selectedLoan(); if(!loan)return; const mode=formVal('pmMode'),amount=num(formVal('pmAmount')),principal=mode==='interest-only'?0:num(formVal('pmPrincipal')),interest=num(formVal('pmInterest')); if(amount<=0){toast('El pago debe ser mayor que cero.','error');return;} if(Math.abs((principal+interest)-amount)>.01){toast('Capital + interés debe coincidir con el pago total.','error');return;} if(principal>num(loan.currentBalance)){toast('El abono a capital supera el saldo.','error');return;} if(mode==='interest-only'&&interest<=0){toast('Un pago solo de intereses debe incluir un monto de interés.','error');return;} const prev=num(loan.currentBalance),next=Math.max(0,prev-principal),settle=interest>0&&checked('pmSettleInterest'); const previousInterestSettledDate=loan.interestLastSettledDate||''; const p={id:uid('pay'),loanId:loan.id,date:formVal('pmDate'),paymentType:mode,amount,principal,interest,previousBalance:prev,newBalance:next,interestSettledThroughDate:settle?formVal('pmDate'):'',previousInterestSettledDate,note:formVal('pmNote'),createdAt:nowISO()}; state.data.payments.push(p); loan.currentBalance=next; if(settle)loan.interestLastSettledDate=formVal('pmDate'); if(next===0){loan.status='active';loan.maintenance=false;} markDirty(mode==='interest-only'?'Pago de intereses registrado':'Pago registrado',`${loan.name}: ${money(amount)}`); closeModal(); renderAll(); };
    });
  }


  function renderIncome(){ const arr=[...state.data.incomes].sort((a,b)=>b.startDate.localeCompare(a.startDate)); $('#view-income').innerHTML=`${pageHeader('Ingresos','Fuentes recurrentes y extraordinarias.','<button class="btn btn-primary" data-action="add-income">+ Nuevo ingreso</button>')}${arr.length?simpleTable(['Fuente','Categoría','Monto','Frecuencia','Inicio',''],arr.map(i=>[`<strong>${esc(i.name)}</strong>`,esc(i.category),money(i.amount),esc(freqLabel(i.frequency)),fmtDate(i.startDate),actions('delete-income',i.id)])):empty('Sin ingresos','Agrega salario u otras entradas.')}`; }
  function incomeModal(){ const s=state.data.settings; showModal('Nuevo ingreso',`<form id="incomeForm"><div class="form-grid"><div class="field full"><label>Fuente</label><input id="inName" required></div><div class="field"><label>Categoría</label><select id="inCat">${selectOptions(s.incomeCategories)}</select></div><div class="field"><label>Monto</label><input id="inAmount" type="number" min="0" step="0.01" required></div><div class="field"><label>Frecuencia</label><select id="inFreq"><option value="quincenal">Quincenal</option><option value="mensual">Mensual</option><option value="unico">Único</option></select></div><div class="field"><label>Fecha de inicio / fecha única</label><input id="inStart" type="date" value="${todayISO()}" required></div><div class="field"><label>Día mensual (opcional)</label><input id="inDay" type="number" min="1" max="28"></div><div class="field full"><label>Notas</label><textarea id="inNotes"></textarea></div></div><div class="form-actions"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary">Guardar</button></div></form>`,()=>{$('#incomeForm').onsubmit=e=>{e.preventDefault();const r={id:uid('inc'),name:formVal('inName'),category:formVal('inCat'),amount:num(formVal('inAmount')),frequency:formVal('inFreq'),startDate:formVal('inStart'),dayOfMonth:num(formVal('inDay')),notes:formVal('inNotes'),createdAt:nowISO()}; state.data.incomes.push(r);markDirty('Ingreso creado',r.name);closeModal();renderAll();};}); }

  function renderCommitments(){ const arr=state.data.commitments; $('#view-commitments').innerHTML=`${pageHeader('Compromisos','Gastos recurrentes que consumen tu flujo de cada quincena.','<button class="btn btn-primary" data-action="add-commitment">+ Nuevo compromiso</button>')}${arr.length?simpleTable(['Concepto','Categoría','Monto','Frecuencia','Inicio',''],arr.map(i=>[`<strong>${esc(i.name)}</strong>`,esc(i.category),money(i.amount),esc(freqLabel(i.frequency)),fmtDate(i.startDate),actions('delete-commitment',i.id)])):empty('Sin compromisos','Agrega casa, servicios, educación u otros pagos.')}`; }
  function commitmentModal(){ const s=state.data.settings; showModal('Nuevo compromiso',`<form id="commitmentForm"><div class="form-grid"><div class="field full"><label>Concepto</label><input id="cmName" required></div><div class="field"><label>Categoría</label><select id="cmCat">${selectOptions(s.commitmentCategories)}</select></div><div class="field"><label>Monto</label><input id="cmAmount" type="number" min="0" step="0.01" required></div><div class="field"><label>Frecuencia</label><select id="cmFreq"><option value="quincenal">Quincenal</option><option value="mensual">Mensual</option><option value="unico">Único</option></select></div><div class="field"><label>Fecha de inicio / fecha única</label><input id="cmStart" type="date" value="${todayISO()}" required></div><div class="field"><label>Día mensual (opcional)</label><input id="cmDay" type="number" min="1" max="28"></div><div class="field full"><label>Notas</label><textarea id="cmNotes"></textarea></div></div><div class="form-actions"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary">Guardar</button></div></form>`,()=>{$('#commitmentForm').onsubmit=e=>{e.preventDefault();const r={id:uid('com'),name:formVal('cmName'),category:formVal('cmCat'),amount:num(formVal('cmAmount')),frequency:formVal('cmFreq'),startDate:formVal('cmStart'),dayOfMonth:num(formVal('cmDay')),notes:formVal('cmNotes'),createdAt:nowISO()};state.data.commitments.push(r);markDirty('Compromiso creado',r.name);closeModal();renderAll();};}); }
  function freqLabel(v){ return ({quincenal:'Quincenal',mensual:'Mensual',unico:'Único',manual:'Manual'})[v]||v; }
  function actions(action,id){ return `<button class="btn btn-danger" data-action="${action}" data-id="${id}">Eliminar</button>`; }
  function simpleTable(headers,rows){ return `<div class="card"><div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`; }

  function renderLenders(){ const arr=state.data.lenders; $('#view-lenders').innerHTML=`${pageHeader('A quién le debo','Personas, bancos y lugares a los que les debes.','<button class="btn btn-primary" data-action="add-lender">+ Nuevo acreedor</button>')}${arr.length?simpleTable(['Nombre','Tipo','Teléfono','Método / cuenta','Deuda asociada',''],arr.map(l=>[ `<strong>${esc(l.name)}</strong>`,esc(l.type),esc(l.phone||'—'),esc(l.paymentInfo||'—'),money(state.data.loans.filter(x=>x.lenderId===l.id).reduce((s,x)=>s+num(x.currentBalance),0)),`<button class="btn btn-secondary btn-compact" data-action="report-lender" data-id="${l.id}">Resumen</button> ${actions('delete-lender',l.id)}`])):empty('Sin acreedores','Agrega personas, bancos o instituciones acreedoras.')}`; }
  function lenderModal(){ showModal('Nuevo acreedor / institución',`<form id="lenderForm"><div class="form-grid"><div class="field full"><label>Nombre</label><input id="ldName" required></div><div class="field"><label>Tipo</label><select id="ldType"><option>Persona</option><option>Banco</option><option>Institución</option><option>Otro</option></select></div><div class="field"><label>Teléfono</label><input id="ldPhone"></div><div class="field"><label>Email</label><input id="ldEmail" type="email"></div><div class="field"><label>Método de pago / cuenta</label><input id="ldPay"></div><div class="field full"><label>Notas</label><textarea id="ldNotes"></textarea></div></div><div class="form-actions"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary">Guardar</button></div></form>`,()=>{$('#lenderForm').onsubmit=e=>{e.preventDefault();const r={id:uid('lend'),name:formVal('ldName'),type:formVal('ldType'),phone:formVal('ldPhone'),email:formVal('ldEmail'),paymentInfo:formVal('ldPay'),notes:formVal('ldNotes'),createdAt:nowISO()};state.data.lenders.push(r);markDirty('Acreedor creado',r.name);closeModal();renderAll();};}); }

  function renderGoals(){ const arr=state.data.goals; $('#view-goals').innerHTML=`${pageHeader('Metas','Objetivos sencillos para ir bajando tus deudas.','<button class="btn btn-primary" data-action="add-goal">+ Nuevo objetivo</button>')}<div class="three-col">${arr.length?arr.map(g=>`<div class="card"><h3>${esc(g.name)}</h3>${goalCard(g)}<button class="btn btn-danger" data-action="delete-goal" data-id="${g.id}">Eliminar</button></div>`).join(''):empty('Sin objetivos','Crea una meta medible.')}</div>`; }
  function goalModal(){ showModal('Nuevo objetivo',`<form id="goalForm"><div class="form-grid"><div class="field full"><label>Nombre</label><input id="glName" required placeholder="Ej. Reducir deuda total a RD$200,000"></div><div class="field"><label>Tipo</label><select id="glType"><option value="debt-total">Deuda total</option><option value="loan">Liquidar préstamo</option><option value="manual">Progreso manual</option></select></div><div class="field"><label>Préstamo (si aplica)</label><select id="glLoan">${entityOptions(state.data.loans)}</select></div><div class="field"><label>Valor objetivo</label><input id="glTarget" type="number" min="0" step="0.01"></div><div class="field"><label>Fecha objetivo</label><input id="glDate" type="date"></div><div class="field"><label>Progreso manual %</label><input id="glProgress" type="number" min="0" max="100" value="0"></div></div><div class="form-actions"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary">Guardar</button></div></form>`,()=>{$('#goalForm').onsubmit=e=>{e.preventDefault();const type=formVal('glType');const r={id:uid('goal'),name:formVal('glName'),type,loanId:formVal('glLoan'),targetValue:num(formVal('glTarget')),targetDate:formVal('glDate'),progress:num(formVal('glProgress')),startValue:state.data.loans.reduce((s,l)=>s+num(l.currentBalance),0),createdAt:nowISO()};state.data.goals.push(r);markDirty('Objetivo creado',r.name);closeModal();renderAll();};}); }

  function renderCalendar(){ const d=state.calendarCursor,y=d.getFullYear(),m=d.getMonth(); const first=new Date(y,m,1),startDow=first.getDay(); const days=lastDay(y,m); const ev=eventsForRange(new Date(y,m,1),new Date(y,m,days,23,59,59)); const cells=[]; for(let i=0;i<startDow;i++)cells.push('<div class="cal-day muted"></div>'); for(let day=1;day<=days;day++){const iso=localISO(new Date(y,m,day));const list=ev.filter(e=>e.date===iso);cells.push(`<div class="cal-day ${iso===todayISO()?'today':''}"><div class="cal-num">${day}</div>${list.slice(0,4).map(e=>`<div class="cal-event ${e.type}" title="${esc(e.name)}">${esc(e.name)} · ${money(e.amount)}</div>`).join('')}${list.length>4?`<div class="card-sub">+${list.length-4} más</div>`:''}</div>`)} $('#view-calendar').innerHTML=`${pageHeader('Calendario de pagos','Ingresos, compromisos y préstamos programados.','<button class="btn btn-secondary" data-action="cal-prev">←</button><button class="btn btn-secondary" data-action="cal-today">Hoy</button><button class="btn btn-secondary" data-action="cal-next">→</button>')}<div class="card"><h3>${new Date(y,m,1).toLocaleDateString(state.data.settings.locale,{month:'long',year:'numeric'})}</h3><div class="calendar">${['Do','Lu','Ma','Mi','Ju','Vi','Sá'].map(x=>`<div class="dow">${x}</div>`).join('')}${cells.join('')}</div></div>`; }

  function eventsForRange(start,end){ const years=[]; for(let y=start.getFullYear();y<=end.getFullYear();y++)years.push(...eventsForYear(y)); return years.filter(e=>{const d=new Date(e.date+'T12:00:00');return d>=start&&d<=end;}).sort((a,b)=>a.date.localeCompare(b.date)); }
  function eventsForYear(y){ const out=[]; const firstDay=num(state.data.settings.firstFortnightDay)||15; const addRecurring=(arr,type)=>{arr.forEach(it=>{const start=it.startDate?new Date(it.startDate+'T12:00:00'):new Date(y,0,1); if(it.frequency==='unico'){if(start.getFullYear()===y) out.push({type,name:it.name,amount:num(it.amount),date:it.startDate,id:it.id});return;} for(let m=0;m<12;m++){if(new Date(y,m,lastDay(y,m))<start)continue;if(it.frequency==='quincenal'){[firstDay,lastDay(y,m)].forEach(day=>{const dt=new Date(y,m,Math.min(day,lastDay(y,m)));if(dt>=start)out.push({type,name:it.name,amount:num(it.amount),date:localISO(dt),id:it.id});});}else if(it.frequency==='mensual'){const day=it.dayOfMonth||start.getDate();const dt=new Date(y,m,Math.min(day,lastDay(y,m)));if(dt>=start)out.push({type,name:it.name,amount:num(it.amount),date:localISO(dt),id:it.id});}}});}; addRecurring(state.data.incomes,'income'); addRecurring(state.data.commitments,'commitment'); state.data.loans.filter(l=>l.maintenance&&l.status!=='paused'&&num(l.currentBalance)>0&&num(l.scheduledAmount)>0&&l.frequency!=='manual').forEach(l=>{const start=l.nextPaymentDate?new Date(l.nextPaymentDate+'T12:00:00'):new Date(y,0,firstDay);for(let m=0;m<12;m++){if(new Date(y,m,lastDay(y,m))<start)continue;if(l.frequency==='quincenal'){[firstDay,lastDay(y,m)].forEach(day=>{const dt=new Date(y,m,Math.min(day,lastDay(y,m)));if(dt>=start)out.push({type:'loan',name:l.name,amount:num(l.scheduledAmount),date:localISO(dt),id:l.id});});}else{const day=start.getDate();const dt=new Date(y,m,Math.min(day,lastDay(y,m)));if(dt>=start)out.push({type:'loan',name:l.name,amount:num(l.scheduledAmount),date:localISO(dt),id:l.id});}}}); state.data.payments.filter(p=>new Date(p.date+'T12:00:00').getFullYear()===y).forEach(p=>out.push({type:'payment',name:`Pago: ${state.data.loans.find(l=>l.id===p.loanId)?.name||'Préstamo'}`,amount:num(p.amount),date:p.date,id:p.id})); return out; }

  function forecastByQuarter(y){ const ev=eventsForYear(y).filter(e=>e.type!=='payment'); const income=[0,0,0,0],outgo=[0,0,0,0];ev.forEach(e=>{const q=Math.floor((num(e.date.slice(5,7))-1)/3);if(e.type==='income')income[q]+=e.amount;else outgo[q]+=e.amount;});return {income,outgo}; }
  function forecastByMonth(y){ const ev=eventsForYear(y).filter(e=>e.type!=='payment'); const income=Array(12).fill(0),outgo=Array(12).fill(0),loan=Array(12).fill(0);ev.forEach(e=>{const m=num(e.date.slice(5,7))-1;if(e.type==='income')income[m]+=e.amount;else{outgo[m]+=e.amount;if(e.type==='loan')loan[m]+=e.amount;}});return {income,outgo,loan}; }
  function renderForecast(){ const y=num(state.data.settings.projectionYear)||new Date().getFullYear(),f=forecastByMonth(y); const totals={income:f.income.reduce(sum,0),out:f.outgo.reduce(sum,0),loan:f.loan.reduce(sum,0)}; let debt=state.data.loans.reduce((s,l)=>s+num(l.currentBalance),0);const debtSeries=f.loan.map(v=>debt=Math.max(0,debt-v)); $('#view-forecast').innerHTML=`${pageHeader(`Proyección anual ${y}`,'Plan financiero estimado a 12 meses.','')}<div class="kpi-grid">${kpi('Ingresos proyectados',money(totals.income),'Año completo','↗')}${kpi('Compromisos + deuda',money(totals.out),'Programados','▣')}${kpi('Pagos de deuda',money(totals.loan),'Planificados','◈')}${kpi('Disponible proyectado',money(totals.income-totals.out),'Antes de gastos no registrados','●')}${kpi('Saldo de deuda final',money(debt),'Estimado','✓')}</div><div class="two-col" style="margin-top:12px"><div class="card"><h3>Flujo mensual</h3><div class="chart-wrap"><canvas id="forecastBars"></canvas></div></div><div class="card"><h3>Reducción proyectada de deuda</h3><div class="chart-wrap"><canvas id="forecastDebt"></canvas></div></div></div>${simpleTable(['Mes','Ingresos','Compromisos + deuda','Pago deuda','Disponible'],monthNames.map((m,i)=>[m,money(f.income[i]),money(f.outgo[i]),money(f.loan[i]),money(f.income[i]-f.outgo[i])]))}`; requestAnimationFrame(()=>{FinCharts.bars($('#forecastBars'),monthNames,f.income,f.outgo);FinCharts.line($('#forecastDebt'),monthNames,debtSeries,{color:FinCharts.colors.green});}); }
  function sum(a,b){return a+b;}

  function reportPeriodDefaults(){
    const y=num(state.data.settings.projectionYear)||new Date().getFullYear();
    if(!state.reportFilters.from) state.reportFilters.from=`${y}-01-01`;
    if(!state.reportFilters.to) state.reportFilters.to=`${y}-12-31`;
  }
  function reportDate(v,fallback){ const d=new Date((v||fallback)+'T12:00:00'); return Number.isNaN(d.getTime())?new Date(fallback+'T12:00:00'):d; }
  function reportFilteredLoans(){ const f=state.reportFilters; return state.data.loans.filter(l=>(!f.lenderId||l.lenderId===f.lenderId)&&(!f.loanId||l.id===f.loanId)&&(!f.type||l.type===f.type)&&(!f.status||loanStatus(l)===f.status)); }
  function reportFilteredPayments(loans=reportFilteredLoans()){ const f=state.reportFilters,ids=new Set(loans.map(l=>l.id)); return state.data.payments.filter(p=>ids.has(p.loanId)&&(!f.from||p.date>=f.from)&&(!f.to||p.date<=f.to)); }
  function monthSequence(from,to){ const a=reportDate(from,`${new Date().getFullYear()}-01-01`),b=reportDate(to,`${new Date().getFullYear()}-12-31`),out=[]; let d=new Date(a.getFullYear(),a.getMonth(),1),guard=0; while(d<=b&&guard++<72){out.push({y:d.getFullYear(),m:d.getMonth(),key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,label:new Date(d.getFullYear(),d.getMonth(),1).toLocaleDateString(state.data.settings.locale,{month:'short',year:'2-digit'})});d=new Date(d.getFullYear(),d.getMonth()+1,1);} return out; }
  function debtAtDate(loans,date){ const end=new Date(date.getFullYear(),date.getMonth(),date.getDate(),23,59,59); return loans.reduce((sum,l)=>{ const start=l.startDate?new Date(l.startDate+'T12:00:00'):null; if(start&&start>end)return sum; const after=state.data.payments.filter(p=>p.loanId===l.id&&new Date(p.date+'T12:00:00')>end).reduce((s,p)=>s+num(p.principal),0); return sum+num(l.currentBalance)+after; },0); }
  function nextLoanEvent(loanId){ const start=new Date(),end=new Date();end.setFullYear(end.getFullYear()+2); return eventsForRange(start,end).find(e=>e.type==='loan'&&e.id===loanId)||null; }
  function reportMonthlyRows(loans,payments){ const months=monthSequence(state.reportFilters.from,state.reportFilters.to), ids=new Set(loans.map(l=>l.id)); const from=reportDate(state.reportFilters.from,`${new Date().getFullYear()}-01-01`),to=reportDate(state.reportFilters.to,`${new Date().getFullYear()}-12-31`); const ev=eventsForRange(from,to); return months.map(x=>{ const pp=payments.filter(p=>p.date.startsWith(x.key)); const inc=ev.filter(e=>e.type==='income'&&e.date.startsWith(x.key)).reduce((s,e)=>s+num(e.amount),0); const com=ev.filter(e=>e.type==='commitment'&&e.date.startsWith(x.key)).reduce((s,e)=>s+num(e.amount),0); const plannedDebt=ev.filter(e=>e.type==='loan'&&ids.has(e.id)&&e.date.startsWith(x.key)).reduce((s,e)=>s+num(e.amount),0); const paid=pp.reduce((s,p)=>s+num(p.amount),0),principal=pp.reduce((s,p)=>s+num(p.principal),0),interest=pp.reduce((s,p)=>s+num(p.interest),0); const monthEnd=new Date(x.y,x.m+1,0); return {...x,inc,com,plannedDebt,paid,principal,interest,debt:debtAtDate(loans,monthEnd),available:inc-com-plannedDebt}; }); }
  function reportLenderRows(loans,payments){ const lenders=new Map(); loans.forEach(l=>{ const key=l.lenderId||'__none__',name=lenderName(l.lenderId)==='—'?'Sin acreedor':lenderName(l.lenderId); if(!lenders.has(key))lenders.set(key,{id:key,name,loans:[],initial:0,balance:0,paid:0,principal:0,interest:0}); const r=lenders.get(key);r.loans.push(l);r.initial+=num(l.initialAmount);r.balance+=num(l.currentBalance);}); payments.forEach(p=>{const loan=state.data.loans.find(l=>l.id===p.loanId);if(!loan)return;const key=loan.lenderId||'__none__';const r=lenders.get(key);if(r){r.paid+=num(p.amount);r.principal+=num(p.principal);r.interest+=num(p.interest);}}); return [...lenders.values()].sort((a,b)=>b.balance-a.balance); }
  function reportLoanRows(loans,payments){ return loans.map(l=>{const pp=payments.filter(p=>p.loanId===l.id),next=nextLoanEvent(l.id);return {loan:l,paid:pp.reduce((s,p)=>s+num(p.amount),0),principal:pp.reduce((s,p)=>s+num(p.principal),0),interest:pp.reduce((s,p)=>s+num(p.interest),0),next};}).sort((a,b)=>num(b.loan.currentBalance)-num(a.loan.currentBalance)); }
  function reportTypeRows(loans,payments){ const map=new Map(); loans.forEach(l=>{const key=l.type||'Otro';if(!map.has(key))map.set(key,{type:key,count:0,initial:0,balance:0,paid:0});const r=map.get(key);r.count++;r.initial+=num(l.initialAmount);r.balance+=num(l.currentBalance);}); payments.forEach(p=>{const l=state.data.loans.find(x=>x.id===p.loanId);if(l&&map.has(l.type||'Otro'))map.get(l.type||'Otro').paid+=num(p.amount);}); return [...map.values()].sort((a,b)=>b.balance-a.balance); }
  function reportStatusRows(loans){ const sts=['En mantenimiento','Sin mantenimiento','Pausado','Liquidado']; return sts.map(status=>{const a=loans.filter(l=>loanStatus(l)===status);return {status,count:a.length,balance:a.reduce((s,l)=>s+num(l.currentBalance),0),initial:a.reduce((s,l)=>s+num(l.initialAmount),0)};}).filter(r=>r.count); }
  function reportFilterForm(loans){ const f=state.reportFilters; return `<div class="card report-filter-card"><div class="report-filter-head"><div><h3>Filtros del análisis</h3><div class="card-sub">Combina período, acreedor, préstamo, tipo y estado.</div></div><button class="btn btn-ghost" data-action="report-reset">Limpiar filtros</button></div><div class="report-filters"><div class="field"><label>Desde</label><input id="rpFrom" type="date" value="${esc(f.from)}"></div><div class="field"><label>Hasta</label><input id="rpTo" type="date" value="${esc(f.to)}"></div><div class="field"><label>Acreedor</label><select id="rpLender"><option value="">Todos</option>${state.data.lenders.map(l=>`<option value="${l.id}" ${f.lenderId===l.id?'selected':''}>${esc(l.name)}</option>`).join('')}</select></div><div class="field"><label>Préstamo</label><select id="rpLoan"><option value="">Todos</option>${state.data.loans.map(l=>`<option value="${l.id}" ${f.loanId===l.id?'selected':''}>${esc(l.name)}</option>`).join('')}</select></div><div class="field"><label>Tipo</label><select id="rpType"><option value="">Todos</option>${state.data.settings.loanTypes.map(t=>`<option value="${esc(t)}" ${f.type===t?'selected':''}>${esc(t)}</option>`).join('')}</select></div><div class="field"><label>Estado</label><select id="rpStatus"><option value="">Todos</option>${['En mantenimiento','Sin mantenimiento','Pausado','Liquidado'].map(t=>`<option value="${t}" ${f.status===t?'selected':''}>${t}</option>`).join('')}</select></div></div><div class="filter-summary">Mostrando <strong>${loans.length}</strong> préstamo(s) dentro de los filtros seleccionados.</div></div>`; }
  function renderReports(){
    reportPeriodDefaults();
    const loans=reportFilteredLoans(),payments=reportFilteredPayments(loans),monthly=reportMonthlyRows(loans,payments),byLender=reportLenderRows(loans,payments),byLoan=reportLoanRows(loans,payments),byType=reportTypeRows(loans,payments),byStatus=reportStatusRows(loans);
    const totalInitial=loans.reduce((s,l)=>s+num(l.initialAmount),0),balance=loans.reduce((s,l)=>s+num(l.currentBalance),0),paid=payments.reduce((s,p)=>s+num(p.amount),0),principal=payments.reduce((s,p)=>s+num(p.principal),0),interest=payments.reduce((s,p)=>s+num(p.interest),0);
    const from=reportDate(state.reportFilters.from,`${new Date().getFullYear()}-01-01`),to=reportDate(state.reportFilters.to,`${new Date().getFullYear()}-12-31`),planned=eventsForRange(from,to).filter(e=>e.type==='loan'&&new Set(loans.map(l=>l.id)).has(e.id)).reduce((s,e)=>s+num(e.amount),0);
    const lenderTable=byLender.length?`<div class="table-wrap"><table><thead><tr><th>Acreedor</th><th>Préstamos</th><th>Original</th><th>Saldo actual</th><th>Pagado período</th><th>Capital</th><th>Interés</th><th></th></tr></thead><tbody>${byLender.map(r=>`<tr><td><strong>${esc(r.name)}</strong></td><td>${r.loans.length}</td><td>${money(r.initial)}</td><td>${money(r.balance)}</td><td>${money(r.paid)}</td><td>${money(r.principal)}</td><td>${money(r.interest)}</td><td>${r.id!=='__none__'?`<button class="btn btn-secondary btn-compact" data-action="report-lender" data-id="${r.id}">Filtrar</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:empty('Sin resultados','No hay acreedores dentro de los filtros.');
    const loanTable=byLoan.length?`<div class="table-wrap"><table><thead><tr><th>Préstamo</th><th>Acreedor</th><th>Tipo</th><th>Original</th><th>Saldo</th><th>Pagado período</th><th>Capital</th><th>Interés</th><th>Próximo pago</th><th>Estado</th><th></th></tr></thead><tbody>${byLoan.map(r=>`<tr><td><strong>${esc(r.loan.name)}</strong></td><td>${esc(lenderName(r.loan.lenderId))}</td><td>${esc(r.loan.type)}</td><td>${money(r.loan.initialAmount)}</td><td>${money(r.loan.currentBalance)}</td><td>${money(r.paid)}</td><td>${money(r.principal)}</td><td>${money(r.interest)}</td><td>${r.next?`${fmtDate(r.next.date)} · ${money(r.next.amount)}`:'—'}</td><td>${badge(loanStatus(r.loan))}</td><td><button class="btn btn-secondary btn-compact" data-action="report-loan" data-id="${r.loan.id}">Filtrar</button></td></tr>`).join('')}</tbody></table></div>`:empty('Sin resultados','No hay préstamos dentro de los filtros.');
    const monthTable=monthly.length?`<div class="table-wrap"><table><thead><tr><th>Mes</th><th>Ingresos programados</th><th>Compromisos</th><th>Deuda planificada</th><th>Pagos reales</th><th>Capital</th><th>Interés</th><th>Disponible planificado</th><th>Deuda al cierre*</th></tr></thead><tbody>${monthly.map(r=>`<tr><td><strong>${esc(r.label)}</strong></td><td>${money(r.inc)}</td><td>${money(r.com)}</td><td>${money(r.plannedDebt)}</td><td>${money(r.paid)}</td><td>${money(r.principal)}</td><td>${money(r.interest)}</td><td>${money(r.available)}</td><td>${money(r.debt)}</td></tr>`).join('')}</tbody></table></div>`:'';
    const typeTable=byType.length?`<div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Préstamos</th><th>Original</th><th>Saldo</th><th>Pagado período</th></tr></thead><tbody>${byType.map(r=>`<tr><td>${esc(r.type)}</td><td>${r.count}</td><td>${money(r.initial)}</td><td>${money(r.balance)}</td><td>${money(r.paid)}</td></tr>`).join('')}</tbody></table></div>`:empty('Sin tipos','No hay datos para agrupar.');
    const statusTable=byStatus.length?`<div class="table-wrap"><table><thead><tr><th>Estado</th><th>Préstamos</th><th>Original</th><th>Saldo</th></tr></thead><tbody>${byStatus.map(r=>`<tr><td>${badge(r.status)}</td><td>${r.count}</td><td>${money(r.initial)}</td><td>${money(r.balance)}</td></tr>`).join('')}</tbody></table></div>`:empty('Sin estados','No hay datos para agrupar.');
    $('#view-reports').innerHTML=`${pageHeader('Resumen','Tus números con más detalle cuando quieras revisarlos.','<button class="btn btn-secondary" data-action="copy-report">Copiar resumen filtrado</button>')}${reportFilterForm(loans)}
      <div class="kpi-grid report-kpis">${kpi('Saldo actual',money(balance),`${loans.length} préstamo(s)`,'◈')}${kpi('Monto original',money(totalInitial),'Dentro del filtro','▤')}${kpi('Pagado en período',money(paid),`${payments.length} pago(s)`,'◎')}${kpi('Capital amortizado',money(principal),'Reduce la deuda','↘')}${kpi('Intereses / cargos',money(interest),`Planificado: ${money(planned)}`,'％')}</div>
      <div class="report-section card"><div class="report-section-title"><div><h3>Resumen por acreedor</h3><p>Consolida todos los préstamos y pagos de cada acreedor: persona, banco o institución.</p></div></div>${lenderTable}</div>
      <div class="report-section card"><div class="report-section-title"><div><h3>Resumen por préstamo</h3><p>Saldo, pagos, capital, intereses, próximo pago y estado de cada deuda.</p></div></div>${loanTable}</div>
      <div class="two-col report-chart-grid"><div class="card"><h3>Pagos por mes</h3><div class="card-sub">Pago total vs. capital amortizado según los filtros.</div><div class="chart-wrap"><canvas id="reportMonthlyBars"></canvas></div></div><div class="card"><h3>Evolución de deuda filtrada</h3><div class="card-sub">Saldo reconstruido al cierre de cada mes.</div><div class="chart-wrap"><canvas id="reportDebtLine"></canvas></div></div></div>
      <div class="report-section card"><div class="report-section-title"><div><h3>Resumen mensual</h3><p>Ingresos y compromisos son programados; los pagos son los realmente registrados. *La deuda al cierre se reconstruye usando el historial disponible.</p></div></div>${monthTable}</div>
      <div class="two-col"><div class="card"><h3>Por tipo de deuda</h3>${typeTable}</div><div class="card"><h3>Por estado</h3>${statusTable}</div></div>
      <div class="report-section card"><div class="report-section-title"><div><h3>Pagos del período</h3><p>Detalle de movimientos que alimentan los resúmenes anteriores.</p></div></div>${payments.length?`<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Acreedor</th><th>Préstamo</th><th>Total</th><th>Capital</th><th>Interés</th><th>Saldo resultante</th></tr></thead><tbody>${[...payments].sort((a,b)=>b.date.localeCompare(a.date)).map(p=>{const l=state.data.loans.find(x=>x.id===p.loanId);return `<tr><td>${fmtDate(p.date)}</td><td>${esc(lenderName(l?.lenderId))}</td><td>${esc(l?.name||'Préstamo eliminado')}</td><td>${money(p.amount)}</td><td>${money(p.principal)}</td><td>${money(p.interest)}</td><td>${money(p.newBalance)}</td></tr>`;}).join('')}</tbody></table></div>`:empty('Sin pagos','No hay pagos registrados en este período para los filtros seleccionados.')}</div>
      <div class="card"><details><summary>Historial técnico del archivo</summary><div class="report-box" style="margin-top:12px">${esc(state.data.audit.slice(0,50).map(a=>`${new Date(a.at).toLocaleString()} | ${a.action} | ${a.detail}`).join('\n')||'Sin eventos.')}</div></details></div>`;
    setTimeout(()=>{
      const bind=(id,key)=>{const el=$(id);if(el)el.addEventListener('change',()=>{state.reportFilters[key]=el.value;if(key==='lenderId'&&state.reportFilters.loanId){const l=state.data.loans.find(x=>x.id===state.reportFilters.loanId);if(l&&l.lenderId!==el.value)state.reportFilters.loanId='';}if(key==='loanId'&&el.value){const l=state.data.loans.find(x=>x.id===el.value);if(l)state.reportFilters.lenderId=l.lenderId||'';}renderReports();});};
      bind('#rpFrom','from');bind('#rpTo','to');bind('#rpLender','lenderId');bind('#rpLoan','loanId');bind('#rpType','type');bind('#rpStatus','status');
    },0);
    requestAnimationFrame(()=>{if($('#reportMonthlyBars'))FinCharts.bars($('#reportMonthlyBars'),monthly.map(x=>x.label),monthly.map(x=>x.paid),monthly.map(x=>x.principal),{colorA:FinCharts.colors.blue,colorB:FinCharts.colors.green});if($('#reportDebtLine'))FinCharts.line($('#reportDebtLine'),monthly.map(x=>x.label),monthly.map(x=>x.debt),{color:FinCharts.colors.cyan});});
  }
  function reportText(){ reportPeriodDefaults(); const loans=reportFilteredLoans(),payments=reportFilteredPayments(loans); const paid=payments.reduce((s,p)=>s+num(p.amount),0),principal=payments.reduce((s,p)=>s+num(p.principal),0),interest=payments.reduce((s,p)=>s+num(p.interest),0),balance=loans.reduce((s,l)=>s+num(l.currentBalance),0); return `FINCORE — RESUMEN FILTRADO\nUsuario: ${state.data.profile.name}\nPeríodo: ${state.reportFilters.from} a ${state.reportFilters.to}\nAcreedor: ${state.reportFilters.lenderId?lenderName(state.reportFilters.lenderId):'Todos'}\nPréstamo: ${state.reportFilters.loanId?(state.data.loans.find(l=>l.id===state.reportFilters.loanId)?.name||'—'):'Todos'}\nTipo: ${state.reportFilters.type||'Todos'}\nEstado: ${state.reportFilters.status||'Todos'}\n\nPréstamos incluidos: ${loans.length}\nSaldo actual: ${money(balance)}\nPagado en período: ${money(paid)}\nCapital amortizado: ${money(principal)}\nIntereses / cargos: ${money(interest)}\nPagos registrados: ${payments.length}`; }

  function renderSettings(){ const s=state.data.settings; $('#view-settings').innerHTML=`${pageHeader('Ajustes','Personaliza FinCore a tu manera.','')}<div class="card"><form id="settingsForm"><div class="form-grid"><div class="field"><label>Nombre</label><input id="stName" value="${esc(state.data.profile.name)}"></div><div class="field"><label>Símbolo de moneda</label><input id="stSymbol" value="${esc(s.currencySymbol)}"></div><div class="field"><label>Primera quincena</label><input id="stFirst" type="number" min="1" max="28" value="${s.firstFortnightDay}"></div><div class="field"><label>Segunda quincena</label><input value="Último día del mes" disabled></div><div class="field"><label>Año de proyección</label><input id="stYear" type="number" min="2020" max="2100" value="${s.projectionYear}"></div><div class="field"><label>Locale</label><input id="stLocale" value="${esc(s.locale)}"></div><div class="field full"><label>Tipos de préstamo (separados por coma)</label><input id="stLoanTypes" value="${esc(s.loanTypes.join(', '))}"></div><div class="field full"><label>Categorías de compromisos</label><input id="stComCats" value="${esc(s.commitmentCategories.join(', '))}"></div><div class="field full"><label>Categorías de ingresos</label><input id="stIncCats" value="${esc(s.incomeCategories.join(', '))}"></div></div><div class="form-actions"><button class="btn btn-primary">Guardar configuración</button></div></form></div><div class="card" style="margin-top:12px"><h3>Almacenamiento local</h3><div class="metric-line"><span>Versión del esquema</span><strong>${esc(state.data.schemaVersion)}</strong></div><div class="metric-line"><span>Creado</span><strong>${new Date(state.data.createdAt).toLocaleString()}</strong></div><div class="metric-line"><span>Actualizado</span><strong>${new Date(state.data.updatedAt).toLocaleString()}</strong></div><div class="metric-line"><span>Ubicación</span><strong>Memoria interna de FinCore en este dispositivo</strong></div><div style="margin-top:16px"><button class="btn btn-danger" data-action="reset-local">Borrar todos los datos de FinCore</button></div></div>`; setTimeout(()=>{$('#settingsForm').onsubmit=e=>{e.preventDefault();state.data.profile.name=formVal('stName').trim()||state.data.profile.name;s.currencySymbol=formVal('stSymbol')||'RD$';s.firstFortnightDay=clamp(num(formVal('stFirst')),1,28);s.projectionYear=num(formVal('stYear'))||new Date().getFullYear();s.locale=formVal('stLocale')||'es-DO';s.loanTypes=formVal('stLoanTypes').split(',').map(x=>x.trim()).filter(Boolean);s.commitmentCategories=formVal('stComCats').split(',').map(x=>x.trim()).filter(Boolean);s.incomeCategories=formVal('stIncCats').split(',').map(x=>x.trim()).filter(Boolean);markDirty('Configuración actualizada','Preferencias');updateTopbar();renderAll();toast('Configuración guardada.');};},0); }

  function deleteBy(collection,id,label){ const arr=state.data[collection]; const idx=arr.findIndex(x=>x.id===id); if(idx<0)return; if(!confirm(`¿Eliminar ${label}?`))return; const [r]=arr.splice(idx,1); markDirty(`${label} eliminado`,r.name||r.id); renderAll(); }
  function deletePayment(id){ const idx=state.data.payments.findIndex(p=>p.id===id);if(idx<0)return;const p=state.data.payments[idx];const l=state.data.loans.find(x=>x.id===p.loanId);if(!confirm('¿Revertir este pago? El capital volverá al saldo del préstamo.'))return;if(l){l.currentBalance=num(l.currentBalance)+num(p.principal);if(p.interestSettledThroughDate&&l.interestLastSettledDate===p.interestSettledThroughDate)l.interestLastSettledDate=p.previousInterestSettledDate||'';}state.data.payments.splice(idx,1);markDirty('Pago revertido',money(p.amount));renderAll(); }


  /* FinCore 2.0 — modo simple dominicano */
  function debtScheduleFromLoan(l){
    if(l.paymentSchedule)return l.paymentSchedule;
    if(l.frequency==='quincenal')return 'both';
    if(l.frequency==='manual'||l.maintenance===false)return 'none';
    if(l.nextPaymentDate){
      const d=new Date(l.nextPaymentDate+'T12:00:00');
      if(d.getDate()===15)return '15';
      if(d.getDate()>=28)return 'end';
    }
    return 'custom';
  }
  function scheduleDate(kind,custom=''){
    const n=new Date(), y=n.getFullYear(), m=n.getMonth(), day=n.getDate();
    if(kind==='15'){
      const d=day<=15?new Date(y,m,15):new Date(y,m+1,15);
      return localISO(d);
    }
    if(kind==='end'){
      return localISO(new Date(y,m,lastDay(y,m)));
    }
    if(kind==='both'){
      if(day<=15)return localISO(new Date(y,m,15));
      return localISO(new Date(y,m,lastDay(y,m)));
    }
    return custom||todayISO();
  }
  function friendlyDebtStatus(l){
    if(num(l.currentBalance)<=0)return 'Saldada';
    if(!l.maintenance||l.status==='paused')return 'Pausada';
    return 'Pagando';
  }
  function friendlyPaymentType(p){
    if(p.paymentType==='interest-only'||(num(p.principal)===0&&num(p.interest)>0))return 'Solo interés';
    if(num(p.interest)>0)return 'Interés + abono';
    return 'Abono';
  }

  function renderDashboard(){
    const m=computeMetrics();
    const now=new Date(), monthStart=new Date(now.getFullYear(),now.getMonth(),1), monthEnd=new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59);
    const monthPayments=state.data.payments.filter(p=>{const d=new Date(p.date+'T12:00:00');return d>=monthStart&&d<=monthEnd;});
    const paidMonth=monthPayments.reduce((s,p)=>s+num(p.amount),0);
    const debtDownMonth=monthPayments.reduce((s,p)=>s+num(p.principal),0);
    const upcoming=eventsForRange(new Date(),new Date(Date.now()+31*864e5)).filter(e=>['loan','commitment'].includes(e.type)).slice(0,6);
    $('#view-dashboard').innerHTML=`${pageHeader(`Hola, ${state.data.profile.name.split(' ')[0]}`,'Tu dinero, claro y al día.','<button class="btn btn-primary" data-action="add-payment">+ Registrar pago</button>')}
      <div class="v2-debt-hero">
        <span>Debo ahora</span>
        <strong>${money(m.total)}</strong>
        <small>Saldo total pendiente</small>
      </div>

      <div class="v2-quincena-card">
        <div class="v2-section-title"><div><h3>Esta quincena</h3><p>Hasta ${fmtDate(localISO(m.next.end))}</p></div></div>
        <div class="v2-quincena-grid">
          <div><span>Voy a recibir</span><strong>${money(m.income)}</strong></div>
          <div><span>Tengo que pagar</span><strong>${money(m.commitments)}</strong></div>
          <div class="${m.available<0?'negative':''}"><span>Me quedan</span><strong>${money(m.available)}</strong></div>
        </div>
      </div>

      <div class="v2-dashboard-grid">
        <div class="card simple-panel">
          <div class="v2-section-title"><div><h3>Próximos pagos</h3><p>Lo que viene en los próximos 31 días.</p></div></div>
          ${upcoming.length?`<div class="upcoming-list">${upcoming.map(e=>`<div class="upcoming-row"><div><strong>${esc(e.name)}</strong><small>${fmtDate(e.date)} · ${e.type==='loan'?'Deuda':'Gasto fijo'}</small></div><b>${money(e.amount)}</b></div>`).join('')}</div>`:empty('Nada pendiente','No tienes pagos programados en los próximos 31 días.')}
        </div>

        <div class="card simple-panel">
          <div class="v2-section-title"><div><h3>Este mes</h3><p>Lo que ya has pagado.</p></div></div>
          <div class="v2-month-grid">
            <div><span>He pagado</span><strong>${money(paidMonth)}</strong></div>
            <div><span>Mi deuda bajó</span><strong>${money(debtDownMonth)}</strong></div>
          </div>
        </div>

        <div class="card simple-panel v2-chart-panel">
          <div class="v2-section-title"><div><h3>Mi deuda</h3><p>Cómo ha bajado en los últimos 6 meses.</p></div></div>
          <div class="chart-wrap simple-chart"><canvas id="debtLine" class="chart-canvas"></canvas></div>
        </div>
      </div>`;
    requestAnimationFrame(drawDashboardCharts);
  }

  function drawDashboardCharts(){
    const months=lastTwelveMonths().slice(-6), balances=debtHistory(months);
    if($('#debtLine'))FinCharts.line($('#debtLine'),months.map(x=>x.label),balances,{color:FinCharts.colors.blue});
  }

  function renderLoans(){
    const rows=state.data.loans;
    $('#view-loans').innerHTML=`${pageHeader('Mis deudas','A quién le debes, cuánto debes y cuánto vas pagando.','<button class="btn btn-primary" data-action="add-loan">+ Agregar deuda</button>')}
      ${rows.length?`<div class="v2-debt-list">${rows.map(l=>`
        <div class="v2-debt-card">
          <div class="v2-debt-card-main">
            <div><strong>${esc(l.name)}</strong><small>${esc(lenderName(l.lenderId)==='—'?'Sin acreedor':lenderName(l.lenderId))}</small></div>
            <div class="v2-debt-balance"><span>Debo</span><b>${money(l.currentBalance)}</b></div>
          </div>
          <div class="v2-debt-card-foot">
            <span class="v2-status ${friendlyDebtStatus(l).toLowerCase()}">${friendlyDebtStatus(l)}</span>
            ${l.maintenance&&num(l.scheduledAmount)>0?`<span>Pago usual: <b>${money(l.scheduledAmount)}</b></span>`:''}
            <div class="v2-card-actions"><button class="btn btn-secondary btn-compact" data-action="edit-loan" data-id="${l.id}">Editar</button><button class="btn btn-danger btn-compact" data-action="delete-loan" data-id="${l.id}">Eliminar</button></div>
          </div>
        </div>`).join('')}</div>`:empty('No tienes deudas registradas','Agrega una deuda con lo básico: a quién, cuánto y cómo la pagas.')}`;
  }

  function loanModal(editId=''){
    const l=state.data.loans.find(x=>x.id===editId)||{}, s=state.data.settings;
    const schedule=debtScheduleFromLoan(l);
    const lenderValue=l.lenderId?lenderName(l.lenderId):'';
    showModal(editId?'Editar deuda':'Agregar deuda',`<form id="loanForm">
      <div class="form-grid v2-simple-form">
        <div class="field full"><label>¿Qué deuda es?</label><input id="lnName" required value="${esc(l.name||'')}" placeholder="Ej. Préstamo de Juan, tarjeta, carro"></div>
        <div class="field full"><label>¿A quién le debes?</label><input id="lnLenderName" value="${esc(lenderValue==='—'?'':lenderValue)}" placeholder="Persona, banco o institución"></div>
        <div class="field full"><label>¿Cuánto debes ahora?</label><input id="lnBalance" inputmode="decimal" type="number" min="0" step="0.01" required value="${l.currentBalance??''}" placeholder="0.00"></div>

        <div class="field full"><label>¿La estás pagando ahora?</label>
          <select id="lnPaying"><option value="yes" ${l.maintenance!==false?'selected':''}>Sí</option><option value="no" ${l.maintenance===false?'selected':''}>No, por ahora no</option></select>
        </div>

        <div id="lnPaymentFields" class="field full">
          <div class="v2-inline-fields">
            <div class="field"><label>¿Cuánto pagas normalmente?</label><input id="lnScheduled" inputmode="decimal" type="number" min="0" step="0.01" value="${l.scheduledAmount??''}" placeholder="0.00"></div>
            <div class="field"><label>¿Cuándo pagas?</label><select id="lnSchedule">
              <option value="both" ${schedule==='both'?'selected':''}>15 y fin de mes</option>
              <option value="15" ${schedule==='15'?'selected':''}>Los 15</option>
              <option value="end" ${schedule==='end'?'selected':''}>Fin de mes</option>
              <option value="custom" ${schedule==='custom'?'selected':''}>Otra fecha</option>
            </select></div>
          </div>
          <div id="lnCustomDateWrap" class="field ${schedule==='custom'?'':'hidden'}"><label>Próximo pago</label><input id="lnNext" type="date" value="${l.nextPaymentDate||todayISO()}"></div>
        </div>

        <details class="v2-advanced field full">
          <summary>Opciones avanzadas</summary>
          <div class="v2-advanced-grid">
            <div class="field"><label>Tipo de deuda</label><select id="lnType">${selectOptions(s.loanTypes,l.type||'Personal')}</select></div>
            <div class="field"><label>Monto original</label><input id="lnInitial" type="number" min="0" step="0.01" value="${l.initialAmount??l.currentBalance??''}"></div>
            <div class="field"><label>Desde cuándo la tienes</label><input id="lnStart" type="date" value="${l.startDate||todayISO()}"></div>
            <div class="field"><label>Interés %</label><input id="lnRate" type="number" min="0" step="0.0001" value="${l.interestRate??''}" placeholder="Opcional"></div>
            <div class="field"><label>Cómo se cobra el interés</label><select id="lnInterestFreq">
              <option value="none" ${!l.interestFrequency||l.interestFrequency==='none'?'selected':''}>No calcular</option>
              <option value="daily" ${l.interestFrequency==='daily'?'selected':''}>Diario</option>
              <option value="fortnightly" ${l.interestFrequency==='fortnightly'?'selected':''}>Quincenal</option>
              <option value="monthly" ${l.interestFrequency==='monthly'?'selected':''}>Mensual</option>
              <option value="annual" ${l.interestFrequency==='annual'?'selected':''}>Anual</option>
            </select></div>
            <div class="field full"><label>Notas</label><textarea id="lnNotes">${esc(l.notes||'')}</textarea></div>
          </div>
        </details>
      </div>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary">Guardar deuda</button></div>
    </form>`,()=>{
      const paying=$('#lnPaying'), paymentFields=$('#lnPaymentFields'), scheduleEl=$('#lnSchedule'), customWrap=$('#lnCustomDateWrap');
      const refresh=()=>{paymentFields.classList.toggle('hidden',paying.value==='no');customWrap.classList.toggle('hidden',scheduleEl.value!=='custom');};
      paying.addEventListener('change',refresh);scheduleEl.addEventListener('change',refresh);refresh();
      $('#loanForm').onsubmit=e=>{
        e.preventDefault();
        const balance=num(formVal('lnBalance')), payingNow=formVal('lnPaying')==='yes', sch=payingNow?formVal('lnSchedule'):'none';
        let lenderId=l.lenderId||'', lenderText=formVal('lnLenderName').trim();
        if(lenderText){
          let lender=state.data.lenders.find(x=>x.name.trim().toLowerCase()===lenderText.toLowerCase());
          if(!lender){lender={id:uid('lend'),name:lenderText,type:'Persona',phone:'',email:'',paymentInfo:'',notes:'',createdAt:nowISO()};state.data.lenders.push(lender);}
          lenderId=lender.id;
        }else lenderId='';
        const rate=num(formVal('lnRate')), interestFrequency=rate>0?formVal('lnInterestFreq'):'none';
        const next=payingNow?scheduleDate(sch,formVal('lnNext')):todayISO();
        const rec={
          id:l.id||uid('loan'),name:formVal('lnName').trim(),lenderId,
          type:formVal('lnType')||l.type||'Personal',
          initialAmount:num(formVal('lnInitial'))||l.initialAmount||balance,
          currentBalance:balance,startDate:formVal('lnStart')||l.startDate||todayISO(),
          interestRate:rate,interestFrequency,interestLastSettledDate:l.interestLastSettledDate||'',
          scheduledAmount:payingNow?num(formVal('lnScheduled')):0,
          frequency:sch==='both'?'quincenal':(sch==='none'?'manual':'mensual'),
          paymentSchedule:sch,nextPaymentDate:next,status:'active',maintenance:payingNow,
          notes:formVal('lnNotes'),createdAt:l.createdAt||nowISO(),updatedAt:nowISO()
        };
        if(editId)Object.assign(l,rec);else state.data.loans.push(rec);
        markDirty(editId?'Deuda editada':'Deuda creada',rec.name);closeModal();renderAll();
      };
    });
  }

  function renderPayments(){
    const arr=[...state.data.payments].sort((a,b)=>b.date.localeCompare(a.date));
    $('#view-payments').innerHTML=`${pageHeader('Pagos','Registra lo que pagaste de forma sencilla.','<button class="btn btn-primary" data-action="add-payment">+ Registrar pago</button>')}
      ${arr.length?`<div class="card"><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Deuda</th><th>Qué hiciste</th><th>Pagaste</th><th>La deuda bajó</th><th>Saldo</th><th></th></tr></thead><tbody>${arr.map(p=>`<tr><td>${fmtDate(p.date)}</td><td><strong>${esc(state.data.loans.find(l=>l.id===p.loanId)?.name||'Deuda eliminada')}</strong></td><td>${friendlyPaymentType(p)}</td><td>${money(p.amount)}</td><td>${money(p.principal)}</td><td>${money(p.newBalance)}</td><td><button class="btn btn-danger btn-compact" data-action="delete-payment" data-id="${p.id}">Revertir</button></td></tr>`).join('')}</tbody></table></div></div>`:empty('Aún no has registrado pagos','Cuando pagues algo, regístralo aquí.')}`;
  }

  function paymentModal(){
    const loans=state.data.loans.filter(l=>num(l.currentBalance)>0);
    if(!loans.length){toast('Primero agrega una deuda con saldo.','error');return;}
    showModal('Registrar pago',`<form id="paymentForm">
      <div class="form-grid v2-simple-form">
        <div class="field full"><label>¿Qué deuda pagaste?</label><select id="pmLoan" required>${entityOptions(loans.map(l=>({id:l.id,name:`${l.name} — debes ${money(l.currentBalance)}`})))}</select></div>
        <div class="field"><label>Fecha</label><input id="pmDate" type="date" value="${todayISO()}" required></div>
        <div class="field"><label>¿Qué hiciste?</label><select id="pmMode">
          <option value="capital">Aboné a la deuda</option>
          <option value="interest-only">Pagué solo interés</option>
          <option value="mixed">Pagué interés + aboné</option>
        </select></div>
        <div class="field full"><label>¿Cuánto pagaste en total?</label><input id="pmAmount" inputmode="decimal" type="number" min="0.01" step="0.01" required placeholder="0.00"></div>
        <div id="pmPrincipalWrap" class="field full hidden"><label>De ese pago, ¿cuánto bajó la deuda?</label><input id="pmPrincipal" inputmode="decimal" type="number" min="0" step="0.01" value="0" placeholder="0.00"><div class="card-sub">Lo restante se guardará como interés o cargo.</div></div>
        <div class="field full"><label>Nota <span class="optional">(opcional)</span></label><textarea id="pmNote" placeholder="Ej. Pago de septiembre"></textarea></div>
      </div>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary">Guardar pago</button></div>
    </form>`,()=>{
      const mode=$('#pmMode'), wrap=$('#pmPrincipalWrap'), amount=$('#pmAmount'), principal=$('#pmPrincipal');
      const refresh=()=>{wrap.classList.toggle('hidden',mode.value!=='mixed');if(mode.value==='capital')principal.value=amount.value||'0';if(mode.value==='interest-only')principal.value='0';};
      mode.addEventListener('change',refresh);
      amount.addEventListener('input',()=>{if(mode.value==='capital')principal.value=amount.value||'0';});
      refresh();
      $('#paymentForm').onsubmit=e=>{
        e.preventDefault();
        const loan=state.data.loans.find(l=>l.id===formVal('pmLoan'));if(!loan)return;
        const paymentMode=formVal('pmMode'), total=num(formVal('pmAmount'));
        let principalPaid=paymentMode==='interest-only'?0:(paymentMode==='capital'?total:num(formVal('pmPrincipal')));
        if(total<=0){toast('Escribe cuánto pagaste.','error');return;}
        if(principalPaid<0||principalPaid>total){toast('El abono no puede ser mayor que el pago total.','error');return;}
        if(principalPaid>num(loan.currentBalance)){principalPaid=num(loan.currentBalance);}
        const interest=Math.max(0,total-principalPaid), prev=num(loan.currentBalance), next=Math.max(0,prev-principalPaid);
        const previousInterestSettledDate=loan.interestLastSettledDate||'';
        const p={id:uid('pay'),loanId:loan.id,date:formVal('pmDate'),paymentType:paymentMode,amount:total,principal:principalPaid,interest,previousBalance:prev,newBalance:next,interestSettledThroughDate:interest>0?formVal('pmDate'):'',previousInterestSettledDate,note:formVal('pmNote'),createdAt:nowISO()};
        state.data.payments.push(p);loan.currentBalance=next;if(interest>0)loan.interestLastSettledDate=formVal('pmDate');if(next===0)loan.maintenance=false;
        markDirty('Pago registrado',`${loan.name}: ${money(total)}`);closeModal();renderAll();
      };
    });
  }

  function renderCalendar(){
    const d=new Date(), first=num(state.data.settings.firstFortnightDay)||15;
    const start=d.getDate()<=first?new Date(d.getFullYear(),d.getMonth(),1):new Date(d.getFullYear(),d.getMonth(),first+1);
    const end=d.getDate()<=first?new Date(d.getFullYear(),d.getMonth(),first,23,59,59):new Date(d.getFullYear(),d.getMonth(),lastDay(d.getFullYear(),d.getMonth()),23,59,59);
    const ev=eventsForRange(start,end), income=ev.filter(e=>e.type==='income').reduce((s,e)=>s+num(e.amount),0), out=ev.filter(e=>['loan','commitment'].includes(e.type)).reduce((s,e)=>s+num(e.amount),0);
    const list=ev.filter(e=>['loan','commitment','income'].includes(e.type));
    $('#view-calendar').innerHTML=`${pageHeader('Mi quincena',`${fmtDate(localISO(start))} al ${fmtDate(localISO(end))}`,'')}
      <div class="v2-quincena-card">
        <div class="v2-quincena-grid">
          <div><span>Voy a recibir</span><strong>${money(income)}</strong></div>
          <div><span>Tengo que pagar</span><strong>${money(out)}</strong></div>
          <div class="${income-out<0?'negative':''}"><span>Me quedan</span><strong>${money(income-out)}</strong></div>
        </div>
      </div>
      <div class="card simple-panel" style="margin-top:10px"><div class="v2-section-title"><div><h3>Movimientos de esta quincena</h3><p>Ingresos, deudas y gastos fijos programados.</p></div></div>
        ${list.length?`<div class="upcoming-list">${list.map(e=>`<div class="upcoming-row"><div><strong>${esc(e.name)}</strong><small>${fmtDate(e.date)} · ${e.type==='income'?'Ingreso':e.type==='loan'?'Deuda':'Gasto fijo'}</small></div><b>${e.type==='income'?'+':'-'}${money(e.amount)}</b></div>`).join('')}</div>`:empty('Quincena tranquila','No tienes movimientos programados en esta quincena.')}
      </div>`;
  }

  function eventsForYear(y){
    const out=[], firstDay=num(state.data.settings.firstFortnightDay)||15;
    const addRecurring=(arr,type)=>{arr.forEach(it=>{const start=it.startDate?new Date(it.startDate+'T12:00:00'):new Date(y,0,1);if(it.frequency==='unico'){if(start.getFullYear()===y)out.push({type,name:it.name,amount:num(it.amount),date:it.startDate,id:it.id});return;}for(let m=0;m<12;m++){if(new Date(y,m,lastDay(y,m))<start)continue;if(it.frequency==='quincenal'){[firstDay,lastDay(y,m)].forEach(day=>{const dt=new Date(y,m,Math.min(day,lastDay(y,m)));if(dt>=start)out.push({type,name:it.name,amount:num(it.amount),date:localISO(dt),id:it.id});});}else if(it.frequency==='mensual'){const day=it.dayOfMonth||start.getDate();const dt=new Date(y,m,Math.min(day,lastDay(y,m)));if(dt>=start)out.push({type,name:it.name,amount:num(it.amount),date:localISO(dt),id:it.id});}}});};
    addRecurring(state.data.incomes,'income');addRecurring(state.data.commitments,'commitment');
    state.data.loans.filter(l=>l.maintenance&&l.status!=='paused'&&num(l.currentBalance)>0&&num(l.scheduledAmount)>0).forEach(l=>{
      const sch=debtScheduleFromLoan(l), start=l.nextPaymentDate?new Date(l.nextPaymentDate+'T12:00:00'):new Date(y,0,firstDay);
      for(let m=0;m<12;m++){
        if(new Date(y,m,lastDay(y,m))<start)continue;
        let days=[];
        if(sch==='both')days=[firstDay,lastDay(y,m)];
        else if(sch==='15')days=[firstDay];
        else if(sch==='end')days=[lastDay(y,m)];
        else if(sch==='custom'||l.frequency==='monthly')days=[Math.min(start.getDate(),lastDay(y,m))];
        days.forEach(day=>{const dt=new Date(y,m,Math.min(day,lastDay(y,m)));if(dt>=start)out.push({type:'loan',name:l.name,amount:num(l.scheduledAmount),date:localISO(dt),id:l.id});});
      }
    });
    state.data.payments.filter(p=>new Date(p.date+'T12:00:00').getFullYear()===y).forEach(p=>out.push({type:'payment',name:`Pago: ${state.data.loans.find(l=>l.id===p.loanId)?.name||'Deuda'}`,amount:num(p.amount),date:p.date,id:p.id}));
    return out;
  }

  function renderCommitments(){
    const arr=state.data.commitments;
    $('#view-commitments').innerHTML=`${pageHeader('Gastos fijos','Casa, servicios, comida, educación y otros pagos habituales.','<button class="btn btn-primary" data-action="add-commitment">+ Agregar gasto fijo</button>')}${arr.length?simpleTable(['Gasto','Categoría','Monto','Frecuencia',''],arr.map(i=>[`<strong>${esc(i.name)}</strong>`,esc(i.category),money(i.amount),esc(freqLabel(i.frequency)),actions('delete-commitment',i.id)])):empty('Sin gastos fijos','Agrega tus pagos habituales para organizar la quincena.')}`;
  }

  function renderForecast(){
    const y=num(state.data.settings.projectionYear)||new Date().getFullYear(), f=forecastByMonth(y), totals={income:f.income.reduce(sum,0),out:f.outgo.reduce(sum,0),loan:f.loan.reduce(sum,0)};
    $('#view-forecast').innerHTML=`${pageHeader('Mi plan',`Una mirada sencilla a ${y}.`,'')}
      <div class="simple-summary-grid">
        <div class="summary-card"><span>Ingresos estimados</span><strong>${money(totals.income)}</strong></div>
        <div class="summary-card"><span>Pagos y gastos</span><strong>${money(totals.out)}</strong></div>
        <div class="summary-card"><span>Para deudas</span><strong>${money(totals.loan)}</strong></div>
        <div class="summary-card"><span>Disponible estimado</span><strong>${money(totals.income-totals.out)}</strong></div>
      </div>
      <div class="card simple-panel"><div class="v2-section-title"><div><h3>Mes a mes</h3><p>Una referencia, no una promesa.</p></div></div><div class="chart-wrap simple-chart"><canvas id="forecastBars"></canvas></div></div>`;
    requestAnimationFrame(()=>{if($('#forecastBars'))FinCharts.bars($('#forecastBars'),monthNames,f.income,f.outgo);});
  }


  document.addEventListener('click',e=>{
    const close=e.target.closest('[data-close]'); if(close){closeModal();return;}
    const b=e.target.closest('[data-action]'); if(!b)return; const a=b.dataset.action,id=b.dataset.id;
    const map={'add-loan':()=>loanModal(),'edit-loan':()=>loanModal(id),'delete-loan':()=>deleteBy('loans',id,'préstamo'),'add-payment':paymentModal,'delete-payment':()=>deletePayment(id),'add-income':incomeModal,'delete-income':()=>deleteBy('incomes',id,'ingreso'),'add-commitment':commitmentModal,'delete-commitment':()=>deleteBy('commitments',id,'compromiso'),'add-lender':lenderModal,'delete-lender':()=>{if(state.data.loans.some(l=>l.lenderId===id)){toast('Este acreedor está asociado a préstamos.','error');return;}deleteBy('lenders',id,'acreedor');},'add-goal':goalModal,'delete-goal':()=>deleteBy('goals',id,'objetivo'),'cal-prev':()=>{state.calendarCursor=new Date(state.calendarCursor.getFullYear(),state.calendarCursor.getMonth()-1,1);renderCalendar();},'cal-next':()=>{state.calendarCursor=new Date(state.calendarCursor.getFullYear(),state.calendarCursor.getMonth()+1,1);renderCalendar();},'cal-today':()=>{state.calendarCursor=new Date();renderCalendar();},'report-loan':()=>{const l=state.data.loans.find(x=>x.id===id);state.reportFilters={from:'',to:'',lenderId:l?.lenderId||'',loanId:id,type:'',status:''};navigate('reports');},'report-lender':()=>{state.reportFilters={from:'',to:'',lenderId:id,loanId:'',type:'',status:''};navigate('reports');},'report-reset':()=>{state.reportFilters={from:'',to:'',lenderId:'',loanId:'',type:'',status:''};renderReports();},'copy-report':async()=>{try{await navigator.clipboard.writeText(reportText());toast('Resumen copiado.');}catch(e){toast('No se pudo copiar automáticamente.','error');}},'reset-local':async()=>{if(!confirm('¿Borrar todos los datos guardados en este dispositivo? Esta acción no se puede deshacer.'))return;if(!confirm('Confirmación final: ¿eliminar completamente FinCore y comenzar desde cero?'))return;await clearLocalData();state.data=null;state.dirty=false;location.reload();}}; map[a]?.();
  });

  $('#newUserBtn').onclick=newUserModal; $('#modalClose').onclick=closeModal; $('#modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop'){e.preventDefault();e.stopPropagation();}});
  const mobileMoreBtn=$('#mobileMoreBtn'), mobileMenuTopBtn=$('#mobileMenuTopBtn'), mobileMenuCloseBtn=$('#mobileMenuCloseBtn'), mobileMenuScrim=$('#mobileMenuScrim'), mobileSidebar=document.querySelector('.sidebar');
  const setMobileMenu=(open)=>{if(!mobileSidebar||!mobileMoreBtn)return;mobileSidebar.classList.toggle('mobile-expanded',open);document.body.classList.toggle('mobile-menu-open',open);if(mobileMenuScrim){mobileMenuScrim.classList.toggle('show',open);mobileMenuScrim.setAttribute('aria-hidden',open?'false':'true');}const s=mobileMoreBtn.querySelector('span');if(s)s.textContent=open?'Cerrar':'Más';mobileMoreBtn.setAttribute('aria-label',open?'Cerrar menú':'Abrir más opciones');if(mobileMenuTopBtn){mobileMenuTopBtn.classList.toggle('menu-open',open);mobileMenuTopBtn.setAttribute('aria-label',open?'Cerrar menú':'Abrir menú');}};
  if(mobileMoreBtn)mobileMoreBtn.addEventListener('click',()=>setMobileMenu(!mobileSidebar.classList.contains('mobile-expanded'))); if(mobileMenuTopBtn)mobileMenuTopBtn.addEventListener('click',()=>setMobileMenu(!mobileSidebar.classList.contains('mobile-expanded'))); if(mobileMenuCloseBtn)mobileMenuCloseBtn.addEventListener('click',()=>setMobileMenu(false)); if(mobileMenuScrim)mobileMenuScrim.addEventListener('click',()=>setMobileMenu(false)); document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mobileSidebar?.classList.contains('mobile-expanded'))setMobileMenu(false);});
  $('#mainNav').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b){navigate(b.dataset.view);setMobileMenu(false);}});
  $('#globalSearch').addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase(); if(!q)return; const loan=state.data?.loans.find(x=>x.name.toLowerCase().includes(q)); const lender=state.data?.lenders.find(x=>x.name.toLowerCase().includes(q)); if(loan)navigate('loans'); else if(lender)navigate('lenders'); });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&state.data)persistLocalData();});
  async function initializeFinCoreLocal(){
    const standalone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
    const newUserBtn=$('#newUserBtn'), installBtn=$('#installPwaBtn');
    const subtitle=$('#welcomeSubtitle'), copy=$('#welcomeCopy'), note=$('#welcomeNote');

    if(!standalone){
      state.data=null;
      state.dirty=false;
      $('#appShell').classList.add('hidden');
      $('#welcomeScreen').classList.remove('hidden');
      if(newUserBtn)newUserBtn.classList.add('hidden');
      if(installBtn)installBtn.classList.remove('hidden');
      if(subtitle)subtitle.textContent='Instala FinCore para comenzar';
      if(copy)copy.textContent='FinCore no abrirá ni leerá tus datos personales desde esta página del navegador. Instala la app y ábrela desde tu pantalla de inicio.';
      if(note)note.textContent='Primero instala • Después configura • Tus datos quedan en la app';
      return;
    }

    if(installBtn)installBtn.classList.add('hidden');
    const saved=await loadLocalData();
    if(saved){
      try{
        state.data=validateData(saved);
        state.fileName='Guardado local';
        state.dirty=false;
        enterApp();
        return;
      }catch(e){
        await clearLocalData();
        toast('Los datos locales estaban dañados y se reiniciaron.','error');
      }
    }

    if(newUserBtn)newUserBtn.classList.remove('hidden');
    if(subtitle)subtitle.textContent='Configura tu FinCore';
    if(copy)copy.textContent='Esta es la primera vez que abres la app. Crea tu usuario para comenzar.';
    if(note)note.textContent='Usuario único • Guardado automático • Datos locales';
  }
  initializeFinCoreLocal();
})();
