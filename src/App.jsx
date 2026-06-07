import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase";

const DAYS = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const FULL_DAYS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

// Todos los días tienen las 3 opciones disponibles
const DEFAULT_TRAINING = { fuerza:false, cardio:false, yoga:false };

const FALLBACK_MSGS = [
  "Fio, hoy te levantaste. Eso ya es un sí. El resto viene solo.",
  "La pereza miente. Te dice que mañana. Vos sabés que hoy.",
  "No necesitás ganas. Necesitás empezar. Las ganas llegan después.",
  "Cada hábito que sostenés hoy es la versión futura de vos haciéndote gracias.",
  "Dejaste cosas antes. Esta vez es diferente porque elegís diferente.",
  "El gym no te pide perfección. Te pide que aparezcas. Aparecé.",
  "Tu cuerpo es la herramienta más poderosa que tenés. Cuidalo bien hoy.",
  "Constancia no es hacerlo siempre perfecto. Es volver cuando parás.",
  "Fio, sos más fuerte que la pereza. Lo demostrás cada vez que empezás.",
  "Hoy es otro día para elegirte. Elegite.",
  "El progreso no siempre se ve. Pero siempre está pasando.",
  "La versión de vos que querés ser ya existe. Solo la estás alcanzando.",
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const getWeekKey = (offset=0) => {
  const now = new Date();
  now.setDate(now.getDate()+offset*7);
  const d = new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()));
  d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));
  const ys = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  const wn = Math.ceil((((d-ys)/86400000)+1)/7);
  return `${d.getUTCFullYear()}-W${String(wn).padStart(2,"0")}`;
};
const getWeekLabel = (offset=0) => {
  const now = new Date();
  now.setDate(now.getDate()+offset*7);
  const day = now.getDay()||7;
  const mon = new Date(now); mon.setDate(now.getDate()-day+1);
  const sun = new Date(mon); sun.setDate(mon.getDate()+6);
  const fmt = d => d.toLocaleDateString("es-AR",{day:"numeric",month:"short"});
  return `${fmt(mon)} — ${fmt(sun)}`;
};
const getTodayIdx = () => { const d=new Date().getDay(); return d===0?6:d-1; };
const todayStr = () => new Date().toISOString().split("T")[0];
const fmtDate = (str) => { if(!str) return ""; const [y,m,d]=str.split("-"); return `${d}/${m}/${y}`; };
const daysBetween = (a,b) => Math.abs((new Date(a)-new Date(b))/86400000);

const defaultDay = () => ({
  training: { fuerzaDone:false, cardioDone:false, yogaDone:false, fuerzaNotes:"", cardioNotes:"", yogaNotes:"" },
  food: { desayuno:"", almuerzo:"", merienda:"", cena:"", agua:0 },
  blocks: {
    trabajo:  { done:false, notes:"", duration:"" },
    limpieza: { done:false, notes:"", duration:"" },
    idoneo:   { done:false, notes:"", duration:"" },
  },
  mood:3, gratitud:"", intencion:"", reflexion:"", tasks:[],
  indispuesta: false,
});

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function PlannerFio() {
  const [view, setView] = useState("home");
  const [allData, setAllData] = useState({});
  const [measures, setMeasuresState] = useState([]);
  const [photoLog, setPhotoLog] = useState({ lastReminder:null, notes:[], photos:[] });
  const [motivation, setMotivation] = useState({ date:null, msg:null });
  const [aiLoading, setAiLoading] = useState(false);
  const [activeDay, setActiveDay] = useState(getTodayIdx());
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodoState] = useState([]); // [{id, inicio, fin}]
  const todayIdx = getTodayIdx();
  const weekKey = getWeekKey(weekOffset);
  const isCurrentWeek = weekOffset===0;

  // Recordatorio 15 días desde 8 de junio 2026
  const REMINDER_START = "2026-06-08";
  const daysSinceStart = daysBetween(REMINDER_START, todayStr());
  const reminderDue = daysSinceStart >= 0 && (daysSinceStart % 15 === 0);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const {data:dias} = await supabase.from("planner_dias").select("*");
      if (dias) { const map={}; dias.forEach(r=>{map[`${r.week_key}-${r.day_index}`]=r.data;}); setAllData(map); }
      const {data:meds} = await supabase.from("medidas").select("*").order("fecha",{ascending:true});
      if (meds) setMeasuresState(meds);
      const {data:fotos} = await supabase.from("fotos_log").select("*").limit(1);
      if (fotos&&fotos.length>0) setPhotoLog({lastReminder:fotos[0].last_reminder,notes:fotos[0].notes||[],photos:fotos[0].photos||[]});
      const {data:per} = await supabase.from("periodo").select("*").order("inicio",{ascending:true}).catch(()=>({data:[]}));
      if (per) setPeriodoState(per);
      const today = todayStr();
      const {data:mot} = await supabase.from("motivacion").select("*").eq("fecha",today).limit(1);
      if (mot&&mot.length>0) setMotivation({date:today,msg:mot[0].msg});
      else fetchMotivation();
    } catch(e){console.error(e);}
    setLoading(false);
  };

  const fetchMotivation = async () => {
    setAiLoading(true);
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:120,
          messages:[{role:"user",content:`Escribí UN mensaje motivacional corto (máximo 2 oraciones) en español rioplatense para Fio, una mujer argentina construyendo hábitos de movimiento y bienestar. Tiende a dejar las cosas a la mitad. Empujón genuino, cálido, directo. Sin clichés. Solo el mensaje.`}]})
      });
      const data = await resp.json();
      const msg = data?.content?.[0]?.text?.trim()||FALLBACK_MSGS[new Date().getDate()%FALLBACK_MSGS.length];
      const today = todayStr();
      setMotivation({date:today,msg});
      await supabase.from("motivacion").upsert({fecha:today,msg},{onConflict:"fecha"});
    } catch { setMotivation({date:todayStr(),msg:FALLBACK_MSGS[new Date().getDate()%FALLBACK_MSGS.length]}); }
    setAiLoading(false);
  };

  const getDayData = useCallback((i,wk=weekKey)=>allData[`${wk}-${i}`]||defaultDay(),[allData,weekKey]);

  const updateDayLocal = (i,updater) => {
    const updated = updater(getDayData(i));
    setAllData(prev=>({...prev,[`${weekKey}-${i}`]:updated}));
  };

  const saveDayToSupabase = async (i) => {
    const curr = getDayData(i);
    const {error} = await supabase.from("planner_dias").upsert(
      {week_key:weekKey,day_index:i,data:curr,updated_at:new Date().toISOString()},
      {onConflict:"week_key,day_index"}
    );
    return !error;
  };

  const updateDayAndSave = async (i,updater) => {
    const updated = updater(getDayData(i));
    setAllData(prev=>({...prev,[`${weekKey}-${i}`]:updated}));
    await supabase.from("planner_dias").upsert(
      {week_key:weekKey,day_index:i,data:updated,updated_at:new Date().toISOString()},
      {onConflict:"week_key,day_index"}
    );
  };

  const saveMeasure = async (form,editingId) => {
    const payload = {fecha:form.fecha,peso:form.peso||null,cintura:form.cintura||null,cadera:form.cadera||null,bajo_vientre:form.bajo_vientre||null,pierna_der:form.pierna_der||null,pierna_izq:form.pierna_izq||null,notas:form.notas||null};
    if (editingId) {
      const {data} = await supabase.from("medidas").update(payload).eq("id",editingId).select();
      if (data) setMeasuresState(prev=>prev.map(m=>m.id===editingId?data[0]:m).sort((a,b)=>a.fecha.localeCompare(b.fecha)));
    } else {
      const {data} = await supabase.from("medidas").insert(payload).select();
      if (data) setMeasuresState(prev=>[...prev,data[0]].sort((a,b)=>a.fecha.localeCompare(b.fecha)));
    }
  };

  const deleteMeasure = async (id) => {
    await supabase.from("medidas").delete().eq("id",id);
    setMeasuresState(prev=>prev.filter(m=>m.id!==id));
  };

  const savePhotoLog = async (obj) => {
    setPhotoLog(obj);
    const {data:existing} = await supabase.from("fotos_log").select("id").limit(1);
    if (existing&&existing.length>0) await supabase.from("fotos_log").update({last_reminder:obj.lastReminder,notes:obj.notes,photos:obj.photos||[],updated_at:new Date().toISOString()}).eq("id",existing[0].id);
    else await supabase.from("fotos_log").insert({last_reminder:obj.lastReminder,notes:obj.notes,photos:obj.photos||[]});
  };

  const savePeriodo = async (arr) => {
    setPeriodoState(arr);
  };

  const weekProgress = DAYS.map((_,i)=>{
    const d=getDayData(i);
    let done=0,total=3;
    if(d.training.fuerzaDone) done++;
    if(d.training.cardioDone) done++;
    if(d.training.yogaDone) done++;
    total+=3; done+=Object.values(d.blocks).filter(b=>b.done).length;
    return done/total;
  });

  const totalDaysActive = Object.keys(allData).length;

  if (loading) return (
    <div style={{minHeight:"100vh",background:"#0d0b1a",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{fontSize:32}}>✨</div>
      <div style={{color:"#c084fc",fontSize:14,fontFamily:"Palatino,serif"}}>Cargando Mundo Fio...</div>
    </div>
  );

  const sharedProps = {weekOffset,setWeekOffset,weekKey,weekLabel:getWeekLabel(weekOffset),isCurrentWeek,todayIdx,activeDay,setActiveDay,weekProgress,getDayData,updateDayLocal,updateDayAndSave,saveDayToSupabase,setView};

  return (
    <div style={{minHeight:"100vh",background:"#0d0b1a",fontFamily:"'Palatino Linotype',Palatino,serif",color:"#f0e6ff",paddingBottom:80}}>
      {reminderDue&&<ReminderBanner setView={setView}/>}
      {view==="home"      && <HomeView {...sharedProps} motivation={motivation} aiLoading={aiLoading} onRefresh={fetchMotivation} totalDaysActive={totalDaysActive} measures={measures} periodo={periodo}/>}
      {view==="planner"   && <PlannerView {...sharedProps} periodo={periodo} savePeriodo={savePeriodo}/>}
      {view==="dashboard" && <DashboardView {...sharedProps} measures={measures} allData={allData} periodo={periodo}/>}
      {view==="medidas"   && <MedidasView measures={measures} saveMeasure={saveMeasure} deleteMeasure={deleteMeasure} setView={setView}/>}
      {view==="fotos"     && <FotosView photoLog={photoLog} savePhotoLog={savePhotoLog} reminderDue={reminderDue} setView={setView}/>}
      <BottomNav view={view} setView={setView} reminderDue={reminderDue}/>
    </div>
  );
}

// ─── REMINDER BANNER ──────────────────────────────────────────────────────────
function ReminderBanner({setView}) {
  const [visible,setVisible] = useState(true);
  if (!visible) return null;
  return (
    <div style={{background:"linear-gradient(135deg,#7c3aed,#ec4899)",padding:"12px 16px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:200}}>
      <span style={{fontSize:20}}>🔔</span>
      <div style={{flex:1}}>
        <div style={{fontSize:13,fontWeight:700,color:"white"}}>¡Hoy es día de registro!</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.85)"}}>Pesarte · Medidas · Foto de progreso</div>
      </div>
      <div style={{display:"flex",gap:6}}>
        <button onClick={()=>setView("medidas")} style={{background:"rgba(255,255,255,0.2)",border:"none",borderRadius:8,padding:"5px 10px",color:"white",fontSize:11,cursor:"pointer",fontWeight:600}}>Ir →</button>
        <button onClick={()=>setVisible(false)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:16}}>✕</button>
      </div>
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function HomeView({motivation,aiLoading,onRefresh,weekProgress,todayIdx,setActiveDay,setView,totalDaysActive,getDayData,updateDayAndSave,weekOffset,setWeekOffset,weekLabel,isCurrentWeek,measures,periodo}) {
  const today = getDayData(todayIdx);

  const fuerzaThisWeek = DAYS.map((_,i)=>getDayData(i).training.fuerzaDone).filter(Boolean).length;
  const cardioThisWeek = DAYS.map((_,i)=>getDayData(i).training.cardioDone).filter(Boolean).length;

  // Período activo hoy
  const todayDate = todayStr();
  const periodoHoy = periodo.find(p=>p.inicio<=todayDate&&(!p.fin||p.fin>=todayDate));

  return (
    <div>
      <div style={{padding:"32px 20px 20px",background:"linear-gradient(180deg,rgba(138,43,226,0.18) 0%,transparent 100%)",textAlign:"center"}}>
        <div style={{fontSize:11,letterSpacing:5,color:"#c084fc",textTransform:"uppercase",marginBottom:6}}>Tu espacio</div>
        <h1 style={{margin:0,fontSize:30,fontWeight:700,color:"#f0e6ff",letterSpacing:-1}}>✨ Mundo Fio</h1>
        <div style={{marginTop:8,fontSize:12,color:"#a78bfa"}}>{new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"})}</div>
        {periodoHoy&&<div style={{marginTop:8,display:"inline-block",background:"rgba(244,114,182,0.15)",border:"1px solid rgba(244,114,182,0.4)",borderRadius:20,padding:"4px 12px",fontSize:11,color:"#f472b6"}}>🌸 Estás indispuesta hoy</div>}
      </div>

      <div style={{margin:"0 16px 16px"}}>
        <div style={{padding:"18px 16px",borderRadius:16,background:"linear-gradient(135deg,rgba(192,132,252,0.15),rgba(244,114,182,0.1))",border:"1px solid rgba(192,132,252,0.3)",position:"relative"}}>
          <div style={{fontSize:11,color:"#f472b6",letterSpacing:3,textTransform:"uppercase",marginBottom:8}}>💬 Para vos hoy</div>
          {aiLoading?<div style={{color:"#a78bfa",fontSize:14,fontStyle:"italic"}}>Generando tu mensaje...</div>
            :<div style={{fontSize:15,color:"#f0e6ff",lineHeight:1.7,fontStyle:"italic"}}>{motivation.msg||"..."}</div>}
          <button onClick={onRefresh} style={{position:"absolute",top:12,right:12,background:"none",border:"none",color:"#7c3aed",cursor:"pointer",fontSize:16}}>↺</button>
        </div>
      </div>

      <div style={{display:"flex",gap:10,margin:"0 16px 16px"}}>
        {[{label:"Semanas",val:Math.max(1,Math.ceil(totalDaysActive/7)),emoji:"📆"},{label:"Fuerza / sem",val:`${fuerzaThisWeek}/7`,emoji:"🏋️"},{label:"Cardio / sem",val:`${cardioThisWeek}/7`,emoji:"🏃"}].map(s=>(
          <div key={s.label} style={{flex:1,background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"12px 8px",textAlign:"center",border:"1px solid rgba(200,160,255,0.1)"}}>
            <div style={{fontSize:20}}>{s.emoji}</div>
            <div style={{fontSize:18,fontWeight:700,color:"#e9d5ff",marginTop:2}}>{s.val}</div>
            <div style={{fontSize:10,color:"#7c3aed",marginTop:2}}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{margin:"0 16px 16px"}} onClick={()=>setView("dashboard")}>
        <div style={{padding:"14px 16px",borderRadius:14,background:"rgba(96,165,250,0.08)",border:"1px solid rgba(96,165,250,0.2)",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:24}}>📊</span>
          <div><div style={{fontSize:13,fontWeight:700,color:"#60a5fa"}}>Ver mi dashboard</div><div style={{fontSize:12,color:"#93c5fd"}}>Medidas, ejercicio y evolución →</div></div>
        </div>
      </div>

      <div style={{margin:"0 16px 16px"}}>
        <div style={{fontSize:13,color:"#c084fc",letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Hoy — {FULL_DAYS[todayIdx]}</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <QuickCheck emoji="🏋️" label="Fuerza" done={today.training.fuerzaDone} onToggle={()=>updateDayAndSave(todayIdx,d=>({...d,training:{...d.training,fuerzaDone:!d.training.fuerzaDone}}))}/>
          <QuickCheck emoji="🏃" label="Cardio" done={today.training.cardioDone} onToggle={()=>updateDayAndSave(todayIdx,d=>({...d,training:{...d.training,cardioDone:!d.training.cardioDone}}))}/>
          <QuickCheck emoji="🧘" label="Yoga" done={today.training.yogaDone} onToggle={()=>updateDayAndSave(todayIdx,d=>({...d,training:{...d.training,yogaDone:!d.training.yogaDone}}))}/>
          <QuickCheck emoji="💼" label="Bloque trabajo" done={today.blocks.trabajo.done} onToggle={()=>updateDayAndSave(todayIdx,d=>({...d,blocks:{...d.blocks,trabajo:{...d.blocks.trabajo,done:!d.blocks.trabajo.done}}}))}/>
          <QuickCheck emoji="📖" label="Estudio idóneo" done={today.blocks.idoneo.done} onToggle={()=>updateDayAndSave(todayIdx,d=>({...d,blocks:{...d.blocks,idoneo:{...d.blocks.idoneo,done:!d.blocks.idoneo.done}}}))}/>
          <QuickCheck emoji="🧹" label="Limpieza" done={today.blocks.limpieza.done} onToggle={()=>updateDayAndSave(todayIdx,d=>({...d,blocks:{...d.blocks,limpieza:{...d.blocks.limpieza,done:!d.blocks.limpieza.done}}}))}/>
        </div>
        <button onClick={()=>setView("planner")} style={{marginTop:12,width:"100%",padding:"12px",borderRadius:12,background:"rgba(124,58,237,0.2)",border:"1px solid rgba(124,58,237,0.4)",color:"#c084fc",fontSize:13,cursor:"pointer"}}>Ver planner completo →</button>
      </div>

      <div style={{margin:"0 16px 20px"}}>
        <div style={{fontSize:13,color:"#c084fc",letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Esta semana</div>
        <div style={{display:"flex",gap:6}}>
          {DAYS.map((d,i)=>(
            <div key={i} onClick={()=>{setActiveDay(i);setView("planner");}} style={{flex:1,background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"8px 4px",textAlign:"center",cursor:"pointer",border:`1px solid ${i===todayIdx?"rgba(192,132,252,0.5)":"transparent"}`}}>
              <div style={{fontSize:11,color:"#a78bfa"}}>{d}</div>
              <div style={{width:"100%",height:3,borderRadius:2,background:"rgba(255,255,255,0.08)",marginTop:6,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${weekProgress[i]*100}%`,background:weekProgress[i]>=0.99?"#4ade80":"#c084fc",borderRadius:2}}/>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuickCheck({emoji,label,done,onToggle}) {
  return (
    <div onClick={onToggle} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:12,background:done?"rgba(74,222,128,0.08)":"rgba(255,255,255,0.04)",border:`1px solid ${done?"rgba(74,222,128,0.3)":"rgba(200,160,255,0.1)"}`,cursor:"pointer",transition:"all 0.2s"}}>
      <span style={{fontSize:18}}>{emoji}</span>
      <span style={{flex:1,fontSize:13,color:done?"#4ade80":"#e9d5ff",textDecoration:done?"line-through":"none",opacity:done?0.7:1}}>{label}</span>
      <div style={{width:22,height:22,borderRadius:"50%",border:`2px solid ${done?"#4ade80":"#7c3aed"}`,background:done?"#4ade80":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#0d0b1a",fontWeight:700}}>{done?"✓":""}</div>
    </div>
  );
}

// ─── PLANNER ──────────────────────────────────────────────────────────────────
function PlannerView({activeDay,setActiveDay,todayIdx,weekProgress,getDayData,updateDayLocal,updateDayAndSave,saveDayToSupabase,setView,weekOffset,setWeekOffset,weekLabel,isCurrentWeek,periodo,savePeriodo}) {
  const [tab,setTab] = useState("entreno");
  const [saving,setSaving] = useState(false);
  const [saved,setSaved] = useState(false);
  const [showPeriodo,setShowPeriodo] = useState(false);
  const [periodoForm,setPeriodoForm] = useState({inicio:todayStr(),fin:""});
  const day = getDayData(activeDay);
  const [newTask,setNewTask] = useState("");

  const setTraining=(f,v)=>updateDayAndSave(activeDay,d=>({...d,training:{...d.training,[f]:v}}));
  const setFood=(f,v)=>updateDayLocal(activeDay,d=>({...d,food:{...d.food,[f]:v}}));
  const setBlock=(b,f,v)=>{
    if(f==="done") updateDayAndSave(activeDay,d=>({...d,blocks:{...d.blocks,[b]:{...d.blocks[b],[f]:v}}}));
    else updateDayLocal(activeDay,d=>({...d,blocks:{...d.blocks,[b]:{...d.blocks[b],[f]:v}}}));
  };
  const setField=(f,v)=>updateDayLocal(activeDay,d=>({...d,[f]:v}));
  const addTask=()=>{if(!newTask.trim())return;updateDayAndSave(activeDay,d=>({...d,tasks:[...d.tasks,{text:newTask.trim(),done:false,id:Date.now()}]}));setNewTask("");};
  const handleSave=async()=>{setSaving(true);const ok=await saveDayToSupabase(activeDay);setSaving(false);if(ok){setSaved(true);setTimeout(()=>setSaved(false),3000);}};

  const toggleIndispuesta=()=>updateDayAndSave(activeDay,d=>({...d,indispuesta:!d.indispuesta}));

  const addPeriodo=async()=>{
    if(!periodoForm.inicio) return;
    const nuevo={id:Date.now(),inicio:periodoForm.inicio,fin:periodoForm.fin||null};
    const updated=[...periodo,nuevo];
    await supabase.from("periodo").insert({inicio:nuevo.inicio,fin:nuevo.fin}).catch(()=>{});
    savePeriodo(updated);
    setShowPeriodo(false);
    setPeriodoForm({inicio:todayStr(),fin:""});
  };

  const tabs=[{id:"entreno",label:"🏋️ Entreno"},{id:"comida",label:"🥗 Comida"},{id:"bloques",label:"📚 Bloques"},{id:"tareas",label:"✅ Tareas"},{id:"alma",label:"🌸 Alma"}];

  return (
    <div>
      <div style={{padding:"24px 16px 8px",display:"flex",alignItems:"center",gap:8}}>
        <button onClick={()=>setView("home")} style={{background:"none",border:"none",color:"#a78bfa",fontSize:20,cursor:"pointer"}}>←</button>
        <h2 style={{margin:0,fontSize:20,color:"#f0e6ff",flex:1}}>Planner</h2>
        {/* Botón indispuesta */}
        <button onClick={toggleIndispuesta} title="Marcar día indispuesta" style={{padding:"6px 10px",borderRadius:10,border:`1px solid ${day.indispuesta?"rgba(244,114,182,0.5)":"rgba(255,255,255,0.1)"}`,background:day.indispuesta?"rgba(244,114,182,0.15)":"rgba(255,255,255,0.04)",color:day.indispuesta?"#f472b6":"#6d28d9",fontSize:16,cursor:"pointer"}}>🌸</button>
        <button onClick={handleSave} disabled={saving} style={{padding:"6px 12px",borderRadius:10,background:saved?"rgba(74,222,128,0.2)":"linear-gradient(135deg,#7c3aed,#ec4899)",border:saved?"1px solid #4ade80":"none",color:saved?"#4ade80":"white",fontSize:11,fontWeight:700,cursor:"pointer",opacity:saving?0.7:1}}>
          {saving?"...":saved?"✓ OK":"💾 Guardar"}
        </button>
      </div>

      {day.indispuesta&&(
        <div style={{margin:"0 16px 8px",padding:"10px 14px",borderRadius:12,background:"rgba(244,114,182,0.1)",border:"1px solid rgba(244,114,182,0.3)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:12,color:"#f472b6"}}>🌸 Día marcado como indispuesta</span>
          <button onClick={()=>{setShowPeriodo(!showPeriodo);}} style={{fontSize:11,background:"rgba(244,114,182,0.2)",border:"none",borderRadius:8,padding:"4px 10px",color:"#f472b6",cursor:"pointer"}}>Registrar período</button>
        </div>
      )}

      {showPeriodo&&(
        <div style={{margin:"0 16px 8px",padding:"12px 14px",borderRadius:12,background:"rgba(244,114,182,0.08)",border:"1px solid rgba(244,114,182,0.25)"}}>
          <div style={{fontSize:12,color:"#f472b6",fontWeight:600,marginBottom:8}}>🌸 Registrar período</div>
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            <div style={{flex:1}}><div style={{fontSize:10,color:"#a78bfa",marginBottom:4}}>Inicio</div><input type="date" value={periodoForm.inicio} onChange={e=>setPeriodoForm(f=>({...f,inicio:e.target.value}))} style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(200,160,255,0.2)",borderRadius:8,padding:"6px 8px",color:"#f0e6ff",fontSize:12,outline:"none",boxSizing:"border-box"}}/></div>
            <div style={{flex:1}}><div style={{fontSize:10,color:"#a78bfa",marginBottom:4}}>Fin (opcional)</div><input type="date" value={periodoForm.fin} onChange={e=>setPeriodoForm(f=>({...f,fin:e.target.value}))} style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(200,160,255,0.2)",borderRadius:8,padding:"6px 8px",color:"#f0e6ff",fontSize:12,outline:"none",boxSizing:"border-box"}}/></div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={addPeriodo} style={{flex:1,padding:"8px",borderRadius:8,background:"rgba(244,114,182,0.3)",border:"none",color:"white",fontSize:12,cursor:"pointer",fontWeight:600}}>Guardar</button>
            <button onClick={()=>setShowPeriodo(false)} style={{flex:1,padding:"8px",borderRadius:8,background:"rgba(255,255,255,0.06)",border:"none",color:"#a78bfa",fontSize:12,cursor:"pointer"}}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Week nav */}
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 16px"}}>
        <button onClick={()=>setWeekOffset(w=>w-1)} style={{background:"rgba(192,132,252,0.15)",border:"1px solid rgba(192,132,252,0.3)",borderRadius:8,padding:"6px 12px",color:"#c084fc",cursor:"pointer",fontSize:16}}>←</button>
        <div style={{flex:1,textAlign:"center"}}>
          <div style={{fontSize:11,color:"#c084fc",fontWeight:600}}>{isCurrentWeek?"Semana actual":"Semana pasada"}</div>
          <div style={{fontSize:10,color:"#a78bfa"}}>{weekLabel}</div>
        </div>
        <button onClick={()=>{if(!isCurrentWeek)setWeekOffset(w=>w+1);}} style={{background:isCurrentWeek?"rgba(255,255,255,0.03)":"rgba(192,132,252,0.15)",border:`1px solid ${isCurrentWeek?"transparent":"rgba(192,132,252,0.3)"}`,borderRadius:8,padding:"6px 12px",color:isCurrentWeek?"#3d2060":"#c084fc",cursor:isCurrentWeek?"default":"pointer",fontSize:16}}>→</button>
      </div>

      {/* Day selector */}
      <div style={{padding:"0 12px 8px",display:"flex",gap:6}}>
        {DAYS.map((d,i)=>(
          <button key={i} onClick={()=>setActiveDay(i)} style={{flex:1,padding:"8px 4px",borderRadius:10,border:i===activeDay?"2px solid #c084fc":"2px solid transparent",background:i===activeDay?"rgba(192,132,252,0.2)":"rgba(255,255,255,0.04)",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
            <div style={{fontSize:11,color:i===activeDay?"#e9d5ff":"#a78bfa",fontWeight:(i===todayIdx&&isCurrentWeek)?700:400}}>{d}</div>
            {i===todayIdx&&isCurrentWeek&&<div style={{fontSize:7,color:"#f472b6"}}>HOY</div>}
            <div style={{width:"100%",height:3,borderRadius:2,background:"rgba(255,255,255,0.08)",overflow:"hidden"}}>
              <div style={{height:"100%",width:`${weekProgress[i]*100}%`,background:weekProgress[i]>=0.99?"#4ade80":"#c084fc",borderRadius:2}}/>
            </div>
          </button>
        ))}
      </div>
      <div style={{padding:"0 16px 8px",fontSize:15,color:"#e9d5ff",fontWeight:600}}>{FULL_DAYS[activeDay]}{!isCurrentWeek&&<span style={{fontSize:10,color:"#6d28d9",marginLeft:8}}>{weekLabel}</span>}</div>

      {/* Tabs */}
      <div style={{padding:"0 12px 8px",display:"flex",gap:4,overflowX:"auto",scrollbarWidth:"none"}}>
        {tabs.map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"7px 11px",borderRadius:8,border:"none",background:tab===t.id?"rgba(192,132,252,0.25)":"rgba(255,255,255,0.05)",color:tab===t.id?"#f0e6ff":"#a78bfa",fontSize:11,cursor:"pointer",whiteSpace:"nowrap",fontWeight:tab===t.id?600:400,borderBottom:tab===t.id?"2px solid #c084fc":"2px solid transparent"}}>{t.label}</button>))}
      </div>

      <div style={{padding:"0 16px"}}>
        {tab==="entreno"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{fontSize:11,color:"#7c3aed",marginBottom:4}}>Marcá lo que hiciste hoy — podés combinar lo que quieras</div>
            <TrainingCard emoji="🏋️" label="Fuerza" done={day.training.fuerzaDone} notes={day.training.fuerzaNotes} onToggle={()=>setTraining("fuerzaDone",!day.training.fuerzaDone)} onNotes={v=>updateDayLocal(activeDay,d=>({...d,training:{...d.training,fuerzaNotes:v}}))} color="#c084fc"/>
            <TrainingCard emoji="🏃" label="Cardio" done={day.training.cardioDone} notes={day.training.cardioNotes} onToggle={()=>setTraining("cardioDone",!day.training.cardioDone)} onNotes={v=>updateDayLocal(activeDay,d=>({...d,training:{...d.training,cardioNotes:v}}))} color="#f472b6"/>
            <TrainingCard emoji="🧘" label="Yoga" done={day.training.yogaDone} notes={day.training.yogaNotes} onToggle={()=>setTraining("yogaDone",!day.training.yogaDone)} onNotes={v=>updateDayLocal(activeDay,d=>({...d,training:{...d.training,yogaNotes:v}}))} color="#818cf8"/>
          </div>
        )}
        {tab==="comida"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {[{f:"desayuno",l:"Desayuno",e:"☀️"},{f:"almuerzo",l:"Almuerzo",e:"🥗"},{f:"merienda",l:"Merienda",e:"🍎"},{f:"cena",l:"Cena",e:"🌙"}].map(({f,l,e})=>(
              <Card key={f}><div style={{fontSize:13,color:"#a78bfa",marginBottom:8,fontWeight:600}}>{e} {l}</div><Textarea value={day.food[f]} onChange={v=>setFood(f,v)} placeholder="¿Qué comiste?"/></Card>
            ))}
            <WaterTracker agua={day.food.agua} setAgua={v=>updateDayAndSave(activeDay,d=>({...d,food:{...d.food,agua:v}}))}/>
          </div>
        )}
        {tab==="bloques"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {[{k:"trabajo",e:"💼",l:"Bloque de Trabajo",c:"#f59e0b"},{k:"limpieza",e:"🧹",l:"Bloque de Limpieza",c:"#34d399"},{k:"idoneo",e:"📖",l:"Estudio Idóneo",c:"#60a5fa"}].map(({k,e,l,c})=>(
              <BlockCard key={k} emoji={e} label={l} color={c} block={day.blocks[k]} onToggle={()=>setBlock(k,"done",!day.blocks[k].done)} onNotes={v=>setBlock(k,"notes",v)} onDuration={v=>setBlock(k,"duration",v)}/>
            ))}
          </div>
        )}
        {tab==="tareas"&&(
          <Card>
            <div style={{fontSize:13,color:"#c084fc",marginBottom:10,fontWeight:600}}>✅ Pendientes del día</div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <input value={newTask} onChange={e=>setNewTask(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTask()} placeholder="Nueva tarea..." style={{flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(200,160,255,0.2)",borderRadius:8,padding:"8px 12px",color:"#f0e6ff",fontSize:13,outline:"none"}}/>
              <button onClick={addTask} style={{background:"#7c3aed",border:"none",borderRadius:8,padding:"8px 14px",color:"white",cursor:"pointer",fontSize:16}}>+</button>
            </div>
            {day.tasks.length===0&&<div style={{color:"#6d28d9",fontSize:13,textAlign:"center",padding:"16px 0"}}>¡Todo limpio! ✨</div>}
            {day.tasks.map(t=>(
              <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                <button onClick={()=>updateDayAndSave(activeDay,d=>({...d,tasks:d.tasks.map(x=>x.id===t.id?{...x,done:!x.done}:x)}))} style={{width:20,height:20,borderRadius:"50%",border:`2px solid ${t.done?"#4ade80":"#7c3aed"}`,background:t.done?"#4ade80":"transparent",cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11}}>{t.done?"✓":""}</button>
                <span style={{flex:1,fontSize:13,color:t.done?"#6d28d9":"#e9d5ff",textDecoration:t.done?"line-through":"none"}}>{t.text}</span>
                <button onClick={()=>updateDayAndSave(activeDay,d=>({...d,tasks:d.tasks.filter(x=>x.id!==t.id)}))} style={{background:"none",border:"none",color:"#6d28d9",cursor:"pointer",fontSize:14}}>✕</button>
              </div>
            ))}
          </Card>
        )}
        {tab==="alma"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <Card>
              <div style={{fontSize:13,color:"#f472b6",marginBottom:12,fontWeight:600}}>🌡️ ¿Cómo estás hoy?</div>
              <div style={{display:"flex",justifyContent:"space-around"}}>
                {["😔","😕","😐","🙂","🌟"].map((m,i)=>(
                  <button key={i} onClick={()=>updateDayAndSave(activeDay,d=>({...d,mood:i+1}))} style={{fontSize:28,background:"none",border:`2px solid ${day.mood===i+1?"#f472b6":"transparent"}`,borderRadius:"50%",padding:6,cursor:"pointer",transform:day.mood===i+1?"scale(1.2)":"scale(1)",transition:"all 0.2s"}}>{m}</button>
                ))}
              </div>
            </Card>
            {[{f:"intencion",e:"🌱",l:"Intención del día",p:"Hoy quiero enfocarme en...",c:"#818cf8"},{f:"gratitud",e:"🙏",l:"Gratitud",p:"Hoy agradezco...",c:"#f472b6"},{f:"reflexion",e:"🌙",l:"Reflexión",p:"Hoy aprendí / sentí / logré...",c:"#c084fc"}].map(({f,e,l,p,c})=>(
              <Card key={f}><div style={{fontSize:13,color:c,marginBottom:8,fontWeight:600}}>{e} {l}</div><Textarea value={day[f]} onChange={v=>setField(f,v)} placeholder={p} rows={3}/></Card>
            ))}
          </div>
        )}
        <div style={{marginTop:16,marginBottom:8}}>
          <button onClick={handleSave} disabled={saving} style={{width:"100%",padding:"14px",borderRadius:14,background:saved?"rgba(74,222,128,0.15)":"linear-gradient(135deg,#7c3aed,#ec4899)",border:saved?"1px solid #4ade80":"none",color:saved?"#4ade80":"white",fontSize:14,fontWeight:700,cursor:"pointer",opacity:saving?0.7:1,transition:"all 0.3s"}}>
            {saving?"Guardando...":saved?"✓ ¡Día guardado!":"💾 Guardar día"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function DashboardView({measures,allData,setView,weekOffset,setWeekOffset,weekLabel,isCurrentWeek,getDayData,todayIdx,periodo}) {
  const [chartMetric,setChartMetric] = useState("cintura");
  const weekKeys = Array.from({length:6},(_,i)=>getWeekKey(-(5-i)));
  const weekLabelsShort = weekKeys.map(wk=>"S"+wk.split("-W")[1]);
  const ejercicioSemanal = weekKeys.map(wk=>{
    let f=0,c=0,y=0;
    for(let i=0;i<7;i++){const d=allData[`${wk}-${i}`]||defaultDay();if(d.training.fuerzaDone)f++;if(d.training.cardioDone)c++;if(d.training.yogaDone)y++;}
    return {fuerza:f,cardio:c,yoga:y};
  });

  const measureFields=[{k:"cintura",l:"Cintura",u:"cm",e:"📏"},{k:"cadera",l:"Cadera",u:"cm",e:"📐"},{k:"bajo_vientre",l:"Bajo vientre",u:"cm",e:"🎯"},{k:"pierna_der",l:"Pierna der.",u:"cm",e:"🦵"}];

  // Peso separado
  const pesoData = measures.filter(m=>m.peso).map(m=>({date:fmtDate(m.fecha),val:parseFloat(m.peso)}));
  const pesoMin = pesoData.length?Math.min(...pesoData.map(d=>d.val))-2:0;
  const pesoMax = pesoData.length?Math.max(...pesoData.map(d=>d.val))+2:1;
  const pesoRange = pesoMax-pesoMin||1;

  const chartData = measures.filter(m=>m[chartMetric]).map(m=>({date:fmtDate(m.fecha),val:parseFloat(m[chartMetric])}));
  const minVal = chartData.length?Math.min(...chartData.map(d=>d.val)):0;
  const maxVal = chartData.length?Math.max(...chartData.map(d=>d.val)):1;
  const range = maxVal-minVal||1;

  const lastMeasure = measures.length>0?measures[measures.length-1]:null;
  const prevMeasure = measures.length>1?measures[measures.length-2]:null;

  const fuerzaThisWeek=DAYS.map((_,i)=>getDayData(i).training.fuerzaDone).filter(Boolean).length;
  const cardioThisWeek=DAYS.map((_,i)=>getDayData(i).training.cardioDone).filter(Boolean).length;
  const yogaThisWeek=DAYS.map((_,i)=>getDayData(i).training.yogaDone).filter(Boolean).length;

  // Período resumen
  const periodoReciente = [...periodo].sort((a,b)=>b.inicio.localeCompare(a.inicio)).slice(0,3);

  return (
    <div>
      <div style={{padding:"24px 16px 12px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={()=>setView("home")} style={{background:"none",border:"none",color:"#a78bfa",fontSize:20,cursor:"pointer"}}>←</button>
        <h2 style={{margin:0,fontSize:22,color:"#f0e6ff"}}>📊 Mi Progreso</h2>
      </div>
      <div style={{padding:"0 16px"}}>

        {/* Esta semana */}
        <Card>
          <div style={{fontSize:13,color:"#c084fc",fontWeight:600,marginBottom:12}}>🏅 Esta semana</div>
          <div style={{display:"flex",gap:10}}>
            {[{e:"🏋️",l:"Fuerza",v:fuerzaThisWeek,t:7,c:"#c084fc"},{e:"🏃",l:"Cardio",v:cardioThisWeek,t:7,c:"#f472b6"},{e:"🧘",l:"Yoga",v:yogaThisWeek,t:7,c:"#818cf8"}].map(s=>(
              <div key={s.l} style={{flex:1,textAlign:"center"}}>
                <div style={{fontSize:22}}>{s.e}</div>
                <div style={{fontSize:20,fontWeight:700,color:s.v>0?"#4ade80":s.c,marginTop:4}}>{s.v}<span style={{fontSize:11,color:"#6d28d9"}}>/{s.t}</span></div>
                <div style={{fontSize:10,color:"#7c3aed",marginTop:2}}>{s.l}</div>
                <div style={{width:"100%",height:4,borderRadius:2,background:"rgba(255,255,255,0.08)",marginTop:6,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${(s.v/s.t)*100}%`,background:s.v>0?"#4ade80":s.c,borderRadius:2,transition:"width 0.4s"}}/>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Barras 6 semanas */}
        <Card>
          <div style={{fontSize:13,color:"#c084fc",fontWeight:600,marginBottom:12}}>📅 Últimas 6 semanas</div>
          <div style={{display:"flex",gap:4,alignItems:"flex-end",height:80}}>
            {ejercicioSemanal.map((w,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <div style={{width:"100%",display:"flex",gap:1,alignItems:"flex-end",height:60}}>
                  <div style={{flex:1,background:"#c084fc",borderRadius:"3px 3px 0 0",height:`${(w.fuerza/7)*100}%`,minHeight:w.fuerza>0?3:0}}/>
                  <div style={{flex:1,background:"#f472b6",borderRadius:"3px 3px 0 0",height:`${(w.cardio/7)*100}%`,minHeight:w.cardio>0?3:0}}/>
                  <div style={{flex:1,background:"#818cf8",borderRadius:"3px 3px 0 0",height:`${(w.yoga/7)*100}%`,minHeight:w.yoga>0?3:0}}/>
                </div>
                <div style={{fontSize:8,color:i===5?"#f472b6":"#6d28d9"}}>{weekLabelsShort[i]}</div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:10,marginTop:8,justifyContent:"center"}}>
            {[{c:"#c084fc",l:"Fuerza"},{c:"#f472b6",l:"Cardio"},{c:"#818cf8",l:"Yoga"}].map(x=>(<div key={x.l} style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:8,height:8,background:x.c,borderRadius:2}}/><span style={{fontSize:9,color:"#a78bfa"}}>{x.l}</span></div>))}
          </div>
        </Card>

        {/* GRÁFICO PESO */}
        {pesoData.length>0&&(
          <Card>
            <div style={{fontSize:13,color:"#c084fc",fontWeight:600,marginBottom:8}}>⚖️ Evolución del peso</div>
            {pesoData.length===1&&<div style={{fontSize:11,color:"#6d28d9",marginBottom:8}}>Registrá otra medida en 15 días para ver la evolución</div>}
            {pesoData.length>1&&(
              <>
                <svg viewBox="0 0 300 100" style={{width:"100%",height:100}}>
                  <defs><linearGradient id="gradPeso" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f472b6" stopOpacity="0.3"/><stop offset="100%" stopColor="#f472b6" stopOpacity="0"/></linearGradient></defs>
                  {(()=>{
                    const pts=pesoData.map((d,i)=>{const x=10+(i/(pesoData.length-1))*280;const y=85-((d.val-pesoMin)/pesoRange)*70;return `${x},${y}`;});
                    const ptsStr=pts.join(" ");const firstX=pts[0].split(",")[0];const lastX=pts[pts.length-1].split(",")[0];
                    return(<><path d={`M ${ptsStr}`} fill="none" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d={`M ${pts[0]} L ${ptsStr} L ${lastX},90 L ${firstX},90 Z`} fill="url(#gradPeso)"/>{pesoData.map((d,i)=>{const x=10+(i/(pesoData.length-1))*280;const y=85-((d.val-pesoMin)/pesoRange)*70;return(<g key={i}><circle cx={x} cy={y} r="3" fill="#f472b6"/><text x={x} y={y-6} textAnchor="middle" fill="#f0e6ff" fontSize="8">{d.val}</text></g>);})}</>);
                  })()}
                </svg>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#6d28d9",marginTop:2}}>
                  <span>{pesoData[0].date}</span><span>{pesoData[pesoData.length-1].date}</span>
                </div>
                {(()=>{const first=pesoData[0].val,last=pesoData[pesoData.length-1].val,diff=last-first;return <div style={{marginTop:8,fontSize:12,color:diff<0?"#4ade80":diff>0?"#f472b6":"#a78bfa",textAlign:"center",fontWeight:600}}>{diff===0?"Sin cambios aún":diff<0?`↓ ${Math.abs(diff).toFixed(1)} kg menos desde el inicio 💪`:`↑ ${diff.toFixed(1)} kg desde el inicio`}</div>;})()}
              </>
            )}
            {lastMeasure?.peso&&<div style={{textAlign:"center",marginTop:8,padding:"8px",background:"rgba(244,114,182,0.08)",borderRadius:10,fontSize:13,color:"#f0e6ff"}}>Último registro: <strong style={{color:"#f472b6"}}>{lastMeasure.peso} kg</strong> — {fmtDate(lastMeasure.fecha)}</div>}
          </Card>
        )}

        {/* Medidas */}
        {lastMeasure&&(
          <Card>
            <div style={{fontSize:13,color:"#c084fc",fontWeight:600,marginBottom:12}}>📏 Últimas medidas — {fmtDate(lastMeasure.fecha)}</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {measureFields.filter(f=>lastMeasure[f.k]).map(({k,l,u,e})=>{
                const curr=parseFloat(lastMeasure[k]);
                const prev=prevMeasure?parseFloat(prevMeasure[k]):null;
                const diff=prev?curr-prev:null;
                return (
                  <div key={k} style={{background:"rgba(255,255,255,0.05)",borderRadius:12,padding:"10px 12px",minWidth:76,textAlign:"center"}}>
                    <div style={{fontSize:10,color:"#a78bfa",marginBottom:4}}>{e} {l}</div>
                    <div style={{fontSize:16,fontWeight:700,color:"#f0e6ff"}}>{curr} <span style={{fontSize:10,color:"#6d28d9"}}>{u}</span></div>
                    {diff!==null&&<div style={{fontSize:10,marginTop:3,color:diff<0?"#4ade80":diff>0?"#f472b6":"#a78bfa"}}>{diff===0?"—":diff<0?`↓ ${Math.abs(diff).toFixed(1)}`:`↑ ${diff.toFixed(1)}`}</div>}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Gráfico medidas */}
        {chartData.length>1&&(
          <Card>
            <div style={{fontSize:13,color:"#c084fc",fontWeight:600,marginBottom:8}}>📈 Evolución medidas</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
              {measureFields.map(f=>(<button key={f.k} onClick={()=>setChartMetric(f.k)} style={{padding:"4px 10px",borderRadius:20,fontSize:11,cursor:"pointer",border:"none",background:chartMetric===f.k?"#7c3aed":"rgba(255,255,255,0.06)",color:chartMetric===f.k?"white":"#a78bfa"}}>{f.e} {f.l}</button>))}
            </div>
            <svg viewBox="0 0 300 100" style={{width:"100%",height:100}}>
              <defs><linearGradient id="grad2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c084fc" stopOpacity="0.3"/><stop offset="100%" stopColor="#c084fc" stopOpacity="0"/></linearGradient></defs>
              {(()=>{const pts=chartData.map((d,i)=>{const x=10+(i/(chartData.length-1))*280;const y=85-((d.val-minVal)/range)*70;return `${x},${y}`;});const ptsStr=pts.join(" ");const firstX=pts[0].split(",")[0];const lastX=pts[pts.length-1].split(",")[0];return(<><path d={`M ${ptsStr}`} fill="none" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d={`M ${pts[0]} L ${ptsStr} L ${lastX},90 L ${firstX},90 Z`} fill="url(#grad2)"/>{chartData.map((d,i)=>{const x=10+(i/(chartData.length-1))*280;const y=85-((d.val-minVal)/range)*70;return <circle key={i} cx={x} cy={y} r="3" fill="#c084fc"/>;})}</>);})()}
            </svg>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#6d28d9",marginTop:4}}><span>{chartData[0].date}</span><span>{chartData[chartData.length-1].date}</span></div>
          </Card>
        )}

        {/* Período */}
        {periodoReciente.length>0&&(
          <Card>
            <div style={{fontSize:13,color:"#f472b6",fontWeight:600,marginBottom:10}}>🌸 Registros de período</div>
            {periodoReciente.map((p,i)=>(
              <div key={p.id||i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",fontSize:12}}>
                <span style={{color:"#fda4af"}}>{fmtDate(p.inicio)}</span>
                <span style={{color:"#6d28d9"}}>→</span>
                <span style={{color:p.fin?"#fda4af":"#f472b6"}}>{p.fin?fmtDate(p.fin):"En curso"}</span>
              </div>
            ))}
          </Card>
        )}

        <div style={{marginBottom:16}}>
          <button onClick={()=>setView("medidas")} style={{width:"100%",padding:"12px",borderRadius:12,background:"rgba(124,58,237,0.15)",border:"1px solid rgba(124,58,237,0.3)",color:"#c084fc",fontSize:13,cursor:"pointer"}}>📏 Ir a mis medidas completas →</button>
        </div>
      </div>
    </div>
  );
}

// ─── MEDIDAS ──────────────────────────────────────────────────────────────────
function MedidasView({measures,saveMeasure,deleteMeasure,setView}) {
  const emptyForm={fecha:todayStr(),peso:"",cintura:"",cadera:"",bajo_vientre:"",pierna_der:"",pierna_izq:"",notas:""};
  const [form,setForm]=useState(emptyForm);
  const [showForm,setShowForm]=useState(false);
  const [editingId,setEditingId]=useState(null);
  const [confirmDelete,setConfirmDelete]=useState(null);
  const [saving,setSaving]=useState(false);

  const allFields=[{k:"peso",l:"Peso",u:"kg",e:"⚖️"},{k:"cintura",l:"Cintura",u:"cm",e:"📏"},{k:"cadera",l:"Cadera",u:"cm",e:"📐"},{k:"bajo_vientre",l:"Bajo vientre",u:"cm",e:"🎯"},{k:"pierna_der",l:"Pierna der.",u:"cm",e:"🦵"},{k:"pierna_izq",l:"Pierna izq.",u:"cm",e:"🦵"}];

  const startEdit=(m)=>{setForm({fecha:m.fecha,peso:m.peso||"",cintura:m.cintura||"",cadera:m.cadera||"",bajo_vientre:m.bajo_vientre||"",pierna_der:m.pierna_der||"",pierna_izq:m.pierna_izq||"",notas:m.notas||""});setEditingId(m.id);setShowForm(true);setConfirmDelete(null);};
  const cancelForm=()=>{setShowForm(false);setEditingId(null);setForm(emptyForm);};
  const handleSave=async()=>{if(!allFields.some(f=>form[f.k]))return;setSaving(true);await saveMeasure(form,editingId);setSaving(false);cancelForm();};

  return (
    <div>
      <div style={{padding:"24px 16px 12px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={()=>setView("home")} style={{background:"none",border:"none",color:"#a78bfa",fontSize:20,cursor:"pointer"}}>←</button>
        <h2 style={{margin:0,fontSize:22,color:"#f0e6ff"}}>📏 Mis Medidas</h2>
      </div>
      <div style={{padding:"0 16px"}}>
        <div style={{fontSize:12,color:"#a78bfa",marginBottom:16,lineHeight:1.7,background:"rgba(192,132,252,0.06)",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(192,132,252,0.15)"}}>
          📅 Registrá cada 15 días — empezando el <strong style={{color:"#c084fc"}}>8 de junio</strong>. Peso + medidas juntos.
        </div>
        {!showForm
          ?<button onClick={()=>{setShowForm(true);setEditingId(null);setForm(emptyForm);}} style={{width:"100%",padding:"14px",borderRadius:14,margin:"0 0 12px",background:"rgba(124,58,237,0.2)",border:"1px solid rgba(124,58,237,0.4)",color:"#c084fc",fontSize:14,cursor:"pointer",fontWeight:600}}>+ Registrar medidas de hoy</button>
          :<Card>
            <div style={{fontSize:13,color:"#c084fc",fontWeight:600,marginBottom:12}}>{editingId?"✏️ Editando":"📝 Nuevo registro"}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {allFields.map(({k,l,u,e})=>(
                <div key={k}>
                  <div style={{fontSize:11,color:"#a78bfa",marginBottom:4}}>{e} {l} <span style={{color:"#6d28d9"}}>({u})</span></div>
                  <input type="number" value={form[k]} onChange={ev=>setForm(f=>({...f,[k]:ev.target.value}))} placeholder="—" style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(200,160,255,0.2)",borderRadius:8,padding:"8px 10px",color:"#f0e6ff",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                </div>
              ))}
            </div>
            <div style={{marginTop:8}}>
              <div style={{fontSize:11,color:"#a78bfa",marginBottom:4}}>📅 Fecha</div>
              <input type="date" value={form.fecha} onChange={ev=>setForm(f=>({...f,fecha:ev.target.value}))} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(200,160,255,0.2)",borderRadius:8,padding:"8px 10px",color:"#f0e6ff",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"}}/>
            </div>
            <Textarea value={form.notas} onChange={v=>setForm(f=>({...f,notas:v}))} placeholder="Notas opcionales..." rows={2}/>
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <button onClick={handleSave} disabled={saving} style={{flex:1,padding:"10px",borderRadius:10,background:"#7c3aed",border:"none",color:"white",fontSize:13,cursor:"pointer",fontWeight:600,opacity:saving?0.6:1}}>{saving?"Guardando...":"Guardar"}</button>
              <button onClick={cancelForm} style={{flex:1,padding:"10px",borderRadius:10,background:"rgba(255,255,255,0.06)",border:"none",color:"#a78bfa",fontSize:13,cursor:"pointer"}}>Cancelar</button>
            </div>
          </Card>
        }
        {measures.length>0&&(
          <div>
            <div style={{fontSize:13,color:"#c084fc",letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Historial</div>
            {[...measures].reverse().map(m=>(
              <div key={m.id} style={{background:"rgba(255,255,255,0.03)",borderRadius:12,padding:"12px 14px",marginBottom:8,border:"1px solid rgba(200,160,255,0.08)"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                  <div style={{fontSize:12,color:"#c084fc",fontWeight:600}}>{fmtDate(m.fecha)}</div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>startEdit(m)} style={{background:"rgba(192,132,252,0.15)",border:"1px solid rgba(192,132,252,0.3)",borderRadius:8,padding:"4px 10px",color:"#c084fc",fontSize:11,cursor:"pointer"}}>✏️</button>
                    <button onClick={()=>setConfirmDelete(m.id)} style={{background:"rgba(244,63,94,0.1)",border:"1px solid rgba(244,63,94,0.25)",borderRadius:8,padding:"4px 10px",color:"#fb7185",fontSize:11,cursor:"pointer"}}>🗑️</button>
                  </div>
                </div>
                {confirmDelete===m.id&&(
                  <div style={{background:"rgba(244,63,94,0.1)",border:"1px solid rgba(244,63,94,0.3)",borderRadius:10,padding:"10px 12px",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                    <span style={{fontSize:12,color:"#fda4af"}}>¿Segura?</span>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>{deleteMeasure(m.id);setConfirmDelete(null);}} style={{background:"#be123c",border:"none",borderRadius:8,padding:"5px 12px",color:"white",fontSize:12,cursor:"pointer",fontWeight:600}}>Sí</button>
                      <button onClick={()=>setConfirmDelete(null)} style={{background:"rgba(255,255,255,0.06)",border:"none",borderRadius:8,padding:"5px 12px",color:"#a78bfa",fontSize:12,cursor:"pointer"}}>No</button>
                    </div>
                  </div>
                )}
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {allFields.filter(f=>m[f.k]).map(({k,l,u,e})=>(
                    <div key={k} style={{background:"rgba(255,255,255,0.05)",borderRadius:10,padding:"5px 10px",display:"flex",flexDirection:"column",alignItems:"center",minWidth:72}}>
                      <span style={{fontSize:10,color:"#a78bfa",marginBottom:2}}>{e} {l}</span>
                      <span style={{fontSize:14,color:"#f0e6ff",fontWeight:600}}>{parseFloat(m[k])} <span style={{fontSize:10,color:"#7c3aed"}}>{u}</span></span>
                    </div>
                  ))}
                </div>
                {m.notas&&<div style={{fontSize:11,color:"#7c3aed",marginTop:6}}>{m.notas}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── FOTOS ────────────────────────────────────────────────────────────────────
function FotosView({photoLog,savePhotoLog,reminderDue,setView}) {
  const [newNote,setNewNote]=useState("");
  const [uploading,setUploading]=useState(false);
  const [uploadMsg,setUploadMsg]=useState("");
  const fileRef=useRef();

  const REMINDER_START="2026-06-08";
  const daysSinceStart=daysBetween(REMINDER_START,todayStr());
  const ciclo=Math.floor(daysSinceStart/15);
  const nextReminder=new Date(REMINDER_START);
  nextReminder.setDate(nextReminder.getDate()+(ciclo+1)*15);
  const daysToNext=Math.ceil((nextReminder-new Date())/86400000);

  const handleUpload=async(e)=>{
    const file=e.target.files[0];
    if(!file) return;
    setUploading(true);setUploadMsg("");
    try {
      const ext=file.name.split(".").pop();
      const fileName=`progreso-${todayStr()}-${Date.now()}.${ext}`;
      const {data,error}=await supabase.storage.from("fotos-progreso").upload(fileName,file,{cacheControl:"3600",upsert:false});
      if(error) throw error;
      const {data:{publicUrl}}=supabase.storage.from("fotos-progreso").getPublicUrl(fileName);
      const updatedPhotos=[...(photoLog.photos||[]),{url:publicUrl,date:todayStr(),id:Date.now()}];
      await savePhotoLog({...photoLog,lastReminder:todayStr(),photos:updatedPhotos});
      setUploadMsg("✓ Foto guardada correctamente");
    } catch(err) {
      setUploadMsg("Error al subir la foto. Intentá de nuevo.");
      console.error(err);
    }
    setUploading(false);
  };

  const addNote=()=>{if(!newNote.trim())return;savePhotoLog({...photoLog,notes:[...(photoLog.notes||[]),{text:newNote.trim(),date:todayStr(),id:Date.now()}]});setNewNote("");};

  return (
    <div>
      <div style={{padding:"24px 16px 12px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={()=>setView("home")} style={{background:"none",border:"none",color:"#a78bfa",fontSize:20,cursor:"pointer"}}>←</button>
        <h2 style={{margin:0,fontSize:22,color:"#f0e6ff"}}>📸 Fotos de Progreso</h2>
      </div>
      <div style={{padding:"0 16px"}}>

        {/* Estado recordatorio */}
        <Card>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:8}}>{reminderDue?"📸":"🗓️"}</div>
            {reminderDue?(
              <>
                <div style={{fontSize:15,fontWeight:700,color:"#f472b6",marginBottom:6}}>¡Hoy es día de foto!</div>
                <div style={{fontSize:12,color:"#fda4af",marginBottom:12,lineHeight:1.6}}>Misma ropa · misma hora · misma luz · mismo ángulo</div>
              </>
            ):(
              <>
                <div style={{fontSize:14,fontWeight:600,color:"#c084fc",marginBottom:4}}>{photoLog.lastReminder?`Última foto: ${fmtDate(photoLog.lastReminder)}`:"Primera foto: 8 de junio"}</div>
                <div style={{fontSize:12,color:"#a78bfa",marginBottom:12}}>Próxima en <strong style={{color:"#f472b6"}}>{daysToNext} día{daysToNext!==1?"s":""}</strong></div>
              </>
            )}

            {/* Upload */}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{display:"none"}}/>
            <button onClick={()=>fileRef.current.click()} disabled={uploading} style={{width:"100%",padding:"14px",borderRadius:14,background:"linear-gradient(135deg,#7c3aed,#ec4899)",border:"none",color:"white",fontSize:14,cursor:"pointer",fontWeight:700,opacity:uploading?0.7:1}}>
              {uploading?"Subiendo foto...":"📷 Subir foto de progreso"}
            </button>
            {uploadMsg&&<div style={{marginTop:8,fontSize:12,color:uploadMsg.startsWith("✓")?"#4ade80":"#fb7185"}}>{uploadMsg}</div>}
          </div>
        </Card>

        {/* Galería */}
        {(photoLog.photos||[]).length>0&&(
          <Card>
            <div style={{fontSize:13,color:"#c084fc",fontWeight:600,marginBottom:10}}>🖼️ Mis fotos ({photoLog.photos.length})</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
              {[...(photoLog.photos||[])].reverse().map(p=>(
                <div key={p.id} style={{aspectRatio:"1",borderRadius:10,overflow:"hidden",position:"relative"}}>
                  <img src={p.url} alt="progreso" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,0.5)",padding:"3px",fontSize:8,color:"white",textAlign:"center"}}>{fmtDate(p.date)}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Observaciones */}
        <Card>
          <div style={{fontSize:13,color:"#c084fc",fontWeight:600,marginBottom:6}}>📝 ¿Cómo te sentís en tu cuerpo?</div>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <input value={newNote} onChange={e=>setNewNote(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addNote()} placeholder="Escribir observación..." style={{flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(200,160,255,0.2)",borderRadius:8,padding:"8px 12px",color:"#f0e6ff",fontSize:13,outline:"none"}}/>
            <button onClick={addNote} style={{background:"#7c3aed",border:"none",borderRadius:8,padding:"8px 14px",color:"white",cursor:"pointer"}}>+</button>
          </div>
          {(photoLog.notes||[]).length===0&&<div style={{color:"#6d28d9",fontSize:12,textAlign:"center",padding:"12px 0"}}>Tus reflexiones van a aparecer acá.</div>}
          {[...(photoLog.notes||[])].reverse().map(n=>(
            <div key={n.id} style={{padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
              <div style={{fontSize:11,color:"#6d28d9",marginBottom:3}}>{fmtDate(n.date)}</div>
              <div style={{fontSize:13,color:"#e9d5ff"}}>{n.text}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

// ─── SHARED ───────────────────────────────────────────────────────────────────
function Card({children}){return <div style={{background:"rgba(255,255,255,0.04)",borderRadius:14,padding:"14px 16px",border:"1px solid rgba(200,160,255,0.1)",marginBottom:12}}>{children}</div>;}
function Textarea({value,onChange,placeholder,rows=2}){return <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(200,160,255,0.15)",borderRadius:8,padding:"8px 10px",color:"#e9d5ff",fontSize:13,outline:"none",resize:"none",fontFamily:"inherit",lineHeight:1.6,boxSizing:"border-box",marginTop:4}}/>;}
function TrainingCard({emoji,label,done,notes,onToggle,onNotes,color}){return(<div style={{background:done?"rgba(74,222,128,0.06)":"rgba(255,255,255,0.04)",borderRadius:14,padding:16,border:`1px solid ${done?"rgba(74,222,128,0.3)":color+"33"}`,transition:"all 0.3s"}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}><div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:22}}>{emoji}</span><span style={{fontSize:15,fontWeight:600,color:done?"#4ade80":"#e9d5ff"}}>{label}</span></div><button onClick={onToggle} style={{padding:"6px 14px",borderRadius:20,border:`2px solid ${done?"#4ade80":color}`,background:done?"#4ade80":"transparent",color:done?"#0d0b1a":color,fontSize:12,fontWeight:700,cursor:"pointer"}}>{done?"✓ HECHO":"Marcar"}</button></div><Textarea value={notes} onChange={onNotes} placeholder="¿Qué hiciste? Series, tiempos, sensaciones..."/></div>);}
function BlockCard({emoji,label,color,block,onToggle,onNotes,onDuration}){return(<div style={{background:block.done?"rgba(255,255,255,0.06)":"rgba(255,255,255,0.03)",borderRadius:14,padding:16,border:`1px solid ${block.done?color:"rgba(200,160,255,0.1)"}`,transition:"all 0.3s"}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}><div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:20}}>{emoji}</span><span style={{fontSize:14,fontWeight:600,color:block.done?"#4ade80":"#e9d5ff"}}>{label}</span></div><button onClick={onToggle} style={{padding:"5px 12px",borderRadius:20,border:`2px solid ${block.done?"#4ade80":color}`,background:block.done?"#4ade80":"transparent",color:block.done?"#0d0b1a":color,fontSize:11,fontWeight:700,cursor:"pointer"}}>{block.done?"✓ LISTO":"Marcar"}</button></div><input value={block.duration} onChange={e=>onDuration(e.target.value)} placeholder="Duración (ej: 1h)" style={{width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(200,160,255,0.15)",borderRadius:8,padding:"6px 10px",color:"#e9d5ff",fontSize:12,outline:"none",boxSizing:"border-box",marginBottom:8}}/><Textarea value={block.notes} onChange={onNotes} placeholder="¿Qué hiciste en este bloque?"/></div>);}
function WaterTracker({agua,setAgua}){
  return(
    <div style={{background:"rgba(96,165,250,0.08)",borderRadius:12,padding:14,border:"1px solid rgba(96,165,250,0.2)"}}>
      <div style={{fontSize:13,color:"#60a5fa",marginBottom:12,fontWeight:600}}>💧 Agua del día</div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
        <button onClick={()=>setAgua(Math.max(0,agua-1))} style={{background:"rgba(96,165,250,0.2)",border:"none",borderRadius:8,padding:"6px 14px",color:"#60a5fa",fontSize:20,cursor:"pointer",fontWeight:700}}>−</button>
        <div style={{flex:1,textAlign:"center"}}>
          <div style={{fontSize:32,fontWeight:700,color:"#60a5fa"}}>{agua}</div>
          <div style={{fontSize:10,color:"#3b82f6"}}>vasos</div>
        </div>
        <button onClick={()=>setAgua(agua+1)} style={{background:"rgba(96,165,250,0.2)",border:"none",borderRadius:8,padding:"6px 14px",color:"#60a5fa",fontSize:20,cursor:"pointer",fontWeight:700}}>+</button>
      </div>
      <div style={{display:"flex",gap:3,flexWrap:"wrap",justifyContent:"center"}}>
        {Array.from({length:Math.max(8,agua)}).map((_,i)=>(<div key={i} style={{fontSize:16,opacity:i<agua?1:0.2}}>💧</div>))}
      </div>
      <div style={{textAlign:"center",marginTop:8,fontSize:12,color:"#60a5fa"}}>{agua>=8?"🎉 ¡Meta superada!":agua>=4?"💪 Vas bien, seguí":"Acordate de tomar agua"}</div>
    </div>
  );
}
function BottomNav({view,setView,reminderDue}){
  const items=[{id:"home",e:"🏠",l:"Inicio"},{id:"planner",e:"📋",l:"Planner"},{id:"dashboard",e:"📊",l:"Dashboard"},{id:"medidas",e:"📏",l:"Medidas"},{id:"fotos",e:"📸",l:"Fotos"}];
  return(<div style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(13,11,26,0.97)",borderTop:"1px solid rgba(200,160,255,0.15)",display:"flex",backdropFilter:"blur(12px)",zIndex:100}}>{items.map(({id,e,l})=>(<button key={id} onClick={()=>setView(id)} style={{flex:1,padding:"10px 4px 8px",background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,position:"relative"}}><span style={{fontSize:18}}>{e}</span>{id==="fotos"&&reminderDue&&<span style={{position:"absolute",top:6,right:"18%",width:8,height:8,background:"#f472b6",borderRadius:"50%",border:"2px solid #0d0b1a"}}/>}<span style={{fontSize:9,color:view===id?"#c084fc":"#6d28d9",fontWeight:view===id?700:400}}>{l}</span></button>))}</div>);
}
