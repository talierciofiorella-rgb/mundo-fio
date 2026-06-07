import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

const DAYS = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const FULL_DAYS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
const TRAINING_SCHEDULE = {
  0:{fuerza:true,cardio:true,yoga:false},1:{fuerza:true,cardio:true,yoga:false},
  2:{fuerza:true,cardio:true,yoga:false},3:{fuerza:true,cardio:true,yoga:false},
  4:{fuerza:true,cardio:true,yoga:false},5:{fuerza:false,cardio:false,yoga:true},
  6:{fuerza:false,cardio:false,yoga:true},
};
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
const getWeekKey = (offset = 0) => {
  const now = new Date();
  now.setDate(now.getDate() + offset * 7);
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const wn = Math.ceil((((d - ys) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(wn).padStart(2,"0")}`;
};
const getWeekLabel = (offset = 0) => {
  const now = new Date();
  now.setDate(now.getDate() + offset * 7);
  const day = now.getDay() || 7;
  const mon = new Date(now); mon.setDate(now.getDate() - day + 1);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = d => d.toLocaleDateString("es-AR",{day:"numeric",month:"short"});
  return `${fmt(mon)} — ${fmt(sun)}`;
};
const getTodayIdx = () => { const d = new Date().getDay(); return d===0?6:d-1; };
const todayStr = () => new Date().toISOString().split("T")[0];
const fmtDate = (str) => { if(!str) return ""; const [y,m,d]=str.split("-"); return `${d}/${m}/${y}`; };
const daysBetween = (a,b) => Math.abs((new Date(a)-new Date(b))/86400000);

const defaultDay = () => ({
  training:{fuerzaDone:false,cardioDone:false,yogaDone:false,fuerzaNotes:"",cardioNotes:"",yogaNotes:""},
  food:{desayuno:"",almuerzo:"",merienda:"",cena:"",agua:0},
  blocks:{trabajo:{done:false,notes:"",duration:""},limpieza:{done:false,notes:"",duration:""},idoneo:{done:false,notes:"",duration:""}},
  mood:3,gratitud:"",intencion:"",reflexion:"",tasks:[],
});

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function PlannerFio() {
  const [view, setView] = useState("home");
  const [allData, setAllData] = useState({});
  const [measures, setMeasuresState] = useState([]);
  const [photoLog, setPhotoLog] = useState({lastReminder:null,notes:[]});
  const [motivation, setMotivation] = useState({date:null,msg:null});
  const [aiLoading, setAiLoading] = useState(false);
  const [activeDay, setActiveDay] = useState(getTodayIdx());
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const todayIdx = getTodayIdx();
  const weekKey = getWeekKey(weekOffset);
  const isCurrentWeek = weekOffset === 0;

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const {data:dias} = await supabase.from("planner_dias").select("*");
      if (dias) { const map={}; dias.forEach(r=>{map[`${r.week_key}-${r.day_index}`]=r.data;}); setAllData(map); }
      const {data:meds} = await supabase.from("medidas").select("*").order("fecha",{ascending:true});
      if (meds) setMeasuresState(meds);
      const {data:fotos} = await supabase.from("fotos_log").select("*").limit(1);
      if (fotos&&fotos.length>0) setPhotoLog({lastReminder:fotos[0].last_reminder,notes:fotos[0].notes||[]});
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

  const getDayData = useCallback((i,wk=weekKey) => allData[`${wk}-${i}`]||defaultDay(),[allData,weekKey]);

  const updateDayLocal = (i,updater) => {
    const curr = getDayData(i);
    const updated = updater(curr);
    setAllData(prev=>({...prev,[`${weekKey}-${i}`]:updated}));
  };

  const saveDayToSupabase = async (i) => {
    const curr = getDayData(i);
    const {error} = await supabase.from("planner_dias").upsert(
      {week_key:weekKey,day_index:i,data:curr,updated_at:new Date().toISOString()},
      {onConflict:"week_key,day_index"}
    );
    if (error) console.error("Save error:",error);
    return !error;
  };

  const updateDayAndSave = async (i,updater) => {
    const curr = getDayData(i);
    const updated = updater(curr);
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
    if (existing&&existing.length>0) await supabase.from("fotos_log").update({last_reminder:obj.lastReminder,notes:obj.notes,updated_at:new Date().toISOString()}).eq("id",existing[0].id);
    else await supabase.from("fotos_log").insert({last_reminder:obj.lastReminder,notes:obj.notes});
  };

  const weekProgress = DAYS.map((_,i) => {
    const d=getDayData(i); const s=TRAINING_SCHEDULE[i];
    let done=0,total=0;
    if(s.fuerza){total++;if(d.training.fuerzaDone)done++;}
    if(s.cardio){total++;if(d.training.cardioDone)done++;}
    if(s.yoga){total++;if(d.training.yogaDone)done++;}
    total+=3; done+=Object.values(d.blocks).filter(b=>b.done).length;
    return total>0?done/total:0;
  });

  const totalDaysActive = Object.keys(allData).length;
  const photosDue = !photoLog.lastReminder||daysBetween(photoLog.lastReminder,todayStr())>=15;

  if (loading) return (
    <div style={{minHeight:"100vh",background:"#0d0b1a",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{fontSize:32}}>✨</div>
      <div style={{color:"#c084fc",fontSize:14,fontFamily:"Palatino,serif"}}>Cargando Mundo Fio...</div>
    </div>
  );

  const sharedProps = {weekOffset,setWeekOffset,weekKey,weekLabel:getWeekLabel(weekOffset),isCurrentWeek,todayIdx,activeDay,setActiveDay,weekProgress,getDayData,updateDayLocal,updateDayAndSave,saveDayToSupabase,setView};

  return (
    <div style={{minHeight:"100vh",background:"#0d0b1a",fontFamily:"'Palatino Linotype',Palatino,serif",color:"#f0e6ff",paddingBottom:80}}>
      {view==="home"     && <HomeView {...sharedProps} motivation={motivation} aiLoading={aiLoading} onRefresh={fetchMotivation} totalDaysActive={totalDaysActive} photosDue={photosDue} measures={measures} />}
      {view==="planner"  && <PlannerView {...sharedProps} />}
      {view==="dashboard"&& <DashboardView {...sharedProps} measures={measures} allData={allData} />}
      {view==="medidas"  && <MedidasView measures={measures} saveMeasure={saveMeasure} deleteMeasure={deleteMeasure} setView={setView} />}
      {view==="fotos"    && <FotosView photoLog={photoLog} savePhotoLog={savePhotoLog} photosDue={photosDue} setView={setView} />}
      <BottomNav view={view} setView={setView} photosDue={photosDue} />
    </div>
  );
}

// ─── WEEK NAV ─────────────────────────────────────────────────────────────────
function WeekNav({weekOffset,setWeekOffset,weekLabel,isCurrentWeek,onDayChange,activeDay}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"0 16px 12px"}}>
      <button onClick={()=>{setWeekOffset(w=>w-1);}} style={{background:"rgba(192,132,252,0.15)",border:"1px solid rgba(192,132,252,0.3)",borderRadius:8,padding:"6px 12px",color:"#c084fc",cursor:"pointer",fontSize:16}}>←</button>
      <div style={{flex:1,textAlign:"center"}}>
        <div style={{fontSize:12,color:"#c084fc",fontWeight:600}}>{isCurrentWeek?"Semana actual":"Semana anterior"}</div>
        <div style={{fontSize:11,color:"#a78bfa",marginTop:2}}>{weekLabel}</div>
      </div>
      <button onClick={()=>{if(!isCurrentWeek)setWeekOffset(w=>w+1);}} style={{background:isCurrentWeek?"rgba(255,255,255,0.04)":"rgba(192,132,252,0.15)",border:`1px solid ${isCurrentWeek?"rgba(255,255,255,0.08)":"rgba(192,132,252,0.3)"}`,borderRadius:8,padding:"6px 12px",color:isCurrentWeek?"#4d4060":"#c084fc",cursor:isCurrentWeek?"default":"pointer",fontSize:16}}>→</button>
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function HomeView({motivation,aiLoading,onRefresh,weekProgress,todayIdx,setActiveDay,setView,totalDaysActive,photosDue,getDayData,updateDayAndSave,weekOffset,setWeekOffset,weekLabel,isCurrentWeek,measures}) {
  const today = getDayData(todayIdx);
  const sched = TRAINING_SCHEDULE[todayIdx];
  const fuerzaThisWeek = [0,1,2,3,4].filter(i=>getDayData(i).training.fuerzaDone).length;
  const cardioThisWeek = [0,1,2,3,4].filter(i=>getDayData(i).training.cardioDone).length;

  return (
    <div>
      <div style={{padding:"32px 20px 20px",background:"linear-gradient(180deg,rgba(138,43,226,0.18) 0%,transparent 100%)",textAlign:"center"}}>
        <div style={{fontSize:11,letterSpacing:5,color:"#c084fc",textTransform:"uppercase",marginBottom:6}}>Tu espacio</div>
        <h1 style={{margin:0,fontSize:30,fontWeight:700,color:"#f0e6ff",letterSpacing:-1}}>✨ Mundo Fio</h1>
        <div style={{marginTop:8,fontSize:12,color:"#a78bfa"}}>{new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"})}</div>
      </div>

      {/* Motivación */}
      <div style={{margin:"0 16px 16px"}}>
        <div style={{padding:"18px 16px",borderRadius:16,background:"linear-gradient(135deg,rgba(192,132,252,0.15),rgba(244,114,182,0.1))",border:"1px solid rgba(192,132,252,0.3)",position:"relative"}}>
          <div style={{fontSize:11,color:"#f472b6",letterSpacing:3,textTransform:"uppercase",marginBottom:8}}>💬 Para vos hoy</div>
          {aiLoading?<div style={{color:"#a78bfa",fontSize:14,fontStyle:"italic"}}>Generando tu mensaje...</div>
            :<div style={{fontSize:15,color:"#f0e6ff",lineHeight:1.7,fontStyle:"italic"}}>{motivation.msg||"Cargando..."}</div>}
          <button onClick={onRefresh} style={{position:"absolute",top:12,right:12,background:"none",border:"none",color:"#7c3aed",cursor:"pointer",fontSize:16}}>↺</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{display:"flex",gap:10,margin:"0 16px 16px"}}>
        {[{label:"Semanas",val:Math.ceil(totalDaysActive/7)||0,emoji:"📆"},{label:"Fuerza esta sem.",val:`${fuerzaThisWeek}/5`,emoji:"🏋️"},{label:"Cardio esta sem.",val:`${cardioThisWeek}/5`,emoji:"🏃"}].map(s=>(
          <div key={s.label} style={{flex:1,background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"12px 8px",textAlign:"center",border:"1px solid rgba(200,160,255,0.1)"}}>
            <div style={{fontSize:20}}>{s.emoji}</div>
            <div style={{fontSize:18,fontWeight:700,color:"#e9d5ff",marginTop:2}}>{s.val}</div>
            <div style={{fontSize:10,color:"#7c3aed",marginTop:2}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Foto reminder */}
      {photosDue&&(
        <div style={{margin:"0 16px 16px"}} onClick={()=>setView("fotos")}>
          <div style={{padding:"14px 16px",borderRadius:14,background:"rgba(244,114,182,0.12)",border:"1px solid rgba(244,114,182,0.35)",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:24}}>📸</span>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:"#f472b6"}}>¡Es día de foto!</div>
              <div style={{fontSize:12,color:"#fda4af"}}>15 días cumplidos. Registrá tu progreso →</div>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard shortcut */}
      <div style={{margin:"0 16px 16px"}} onClick={()=>setView("dashboard")}>
        <div style={{padding:"14px 16px",borderRadius:14,background:"rgba(96,165,250,0.08)",border:"1px solid rgba(96,165,250,0.2)",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:24}}>📊</span>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:"#60a5fa"}}>Ver mi dashboard de progreso</div>
            <div style={{fontSize:12,color:"#93c5fd"}}>Medidas, ejercicio semanal y evolución →</div>
          </div>
        </div>
      </div>

      {/* Hoy */}
      <div style={{margin:"0 16px 16px"}}>
        <div style={{fontSize:13,color:"#c084fc",letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Hoy — {FULL_DAYS[todayIdx]}</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {sched.fuerza&&<QuickCheck emoji="🏋️" label="Entrenamiento de fuerza" done={today.training.fuerzaDone} onToggle={()=>updateDayAndSave(todayIdx,d=>({...d,training:{...d.training,fuerzaDone:!d.training.fuerzaDone}}))} />}
          {sched.cardio&&<QuickCheck emoji="🏃" label="Cardio" done={today.training.cardioDone} onToggle={()=>updateDayAndSave(todayIdx,d=>({...d,training:{...d.training,cardioDone:!d.training.cardioDone}}))} />}
          {sched.yoga&&<QuickCheck emoji="🧘" label="Yoga" done={today.training.yogaDone} onToggle={()=>updateDayAndSave(todayIdx,d=>({...d,training:{...d.training,yogaDone:!d.training.yogaDone}}))} />}
          <QuickCheck emoji="💼" label="Bloque trabajo" done={today.blocks.trabajo.done} onToggle={()=>updateDayAndSave(todayIdx,d=>({...d,blocks:{...d.blocks,trabajo:{...d.blocks.trabajo,done:!d.blocks.trabajo.done}}}))} />
          <QuickCheck emoji="📖" label="Estudio idóneo" done={today.blocks.idoneo.done} onToggle={()=>updateDayAndSave(todayIdx,d=>({...d,blocks:{...d.blocks,idoneo:{...d.blocks.idoneo,done:!d.blocks.idoneo.done}}}))} />
          <QuickCheck emoji="🧹" label="Limpieza" done={today.blocks.limpieza.done} onToggle={()=>updateDayAndSave(todayIdx,d=>({...d,blocks:{...d.blocks,limpieza:{...d.blocks.limpieza,done:!d.blocks.limpieza.done}}}))} />
        </div>
        <button onClick={()=>setView("planner")} style={{marginTop:12,width:"100%",padding:"12px",borderRadius:12,background:"rgba(124,58,237,0.2)",border:"1px solid rgba(124,58,237,0.4)",color:"#c084fc",fontSize:13,cursor:"pointer"}}>Ver planner completo →</button>
      </div>

      {/* Semana */}
      <div style={{margin:"0 16px 20px"}}>
        <div style={{fontSize:13,color:"#c084fc",letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Esta semana</div>
        <div style={{display:"flex",gap:6}}>
          {DAYS.map((d,i)=>(
            <div key={i} onClick={()=>{setActiveDay(i);setView("planner");}} style={{flex:1,background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"8px 4px",textAlign:"center",cursor:"pointer",border:`1px solid ${i===todayIdx?"rgba(192,132,252,0.5)":"transparent"}`}}>
              <div style={{fontSize:11,color:"#a78bfa"}}>{d}</div>
              <div style={{width:"100%",height:3,borderRadius:2,background:"rgba(255,255,255,0.08)",marginTop:6,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${weekProgress[i]*100}%`,background:weekProgress[i]===1?"#4ade80":"#c084fc",borderRadius:2}}/>
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

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function DashboardView({measures,allData,setView,weekOffset,setWeekOffset,weekLabel,isCurrentWeek,getDayData,todayIdx}) {
  const [chartMetric,setChartMetric] = useState("cintura");

  const fields = [
    {k:"cintura",l:"Cintura",u:"cm",e:"📏"},
    {k:"cadera",l:"Cadera",u:"cm",e:"📐"},
    {k:"bajo_vientre",l:"Bajo vientre",u:"cm",e:"🎯"},
    {k:"pierna_der",l:"Pierna der.",u:"cm",e:"🦵"},
  ];

  // Ejercicio por semana — últimas 6 semanas
  const weekKeys = Array.from({length:6},(_,i)=>getWeekKey(-(5-i)));
  const weekLabels = Array.from({length:6},(_,i)=>{ const wk=getWeekKey(-(5-i)); return wk.split("-W")[1]?"S"+wk.split("-W")[1]:wk; });

  const ejercicioSemanal = weekKeys.map(wk => {
    let fuerza=0,cardio=0;
    for(let i=0;i<5;i++){
      const d=allData[`${wk}-${i}`]||defaultDay();
      if(d.training.fuerzaDone) fuerza++;
      if(d.training.cardioDone) cardio++;
    }
    return {fuerza,cardio};
  });

  // Gráfico de medidas
  const chartData = measures.filter(m=>m[chartMetric]).map(m=>({date:fmtDate(m.fecha),val:parseFloat(m[chartMetric])}));
  const minVal = chartData.length?Math.min(...chartData.map(d=>d.val)):0;
  const maxVal = chartData.length?Math.max(...chartData.map(d=>d.val)):1;
  const range = maxVal-minVal||1;

  // Última medida
  const lastMeasure = measures.length>0?measures[measures.length-1]:null;
  const prevMeasure = measures.length>1?measures[measures.length-2]:null;

  // Esta semana resumen
  const fuerzaThisWeek = [0,1,2,3,4].filter(i=>getDayData(i).training.fuerzaDone).length;
  const cardioThisWeek = [0,1,2,3,4].filter(i=>getDayData(i).training.cardioDone).length;
  const yogaThisWeek = [5,6].filter(i=>getDayData(i).training.yogaDone).length;

  return (
    <div>
      <div style={{padding:"24px 16px 12px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={()=>setView("home")} style={{background:"none",border:"none",color:"#a78bfa",fontSize:20,cursor:"pointer"}}>←</button>
        <h2 style={{margin:0,fontSize:22,color:"#f0e6ff"}}>📊 Mi Progreso</h2>
      </div>

      <div style={{padding:"0 16px"}}>

        {/* Resumen semanal ejercicio */}
        <Card>
          <div style={{fontSize:13,color:"#c084fc",fontWeight:600,marginBottom:12}}>🏅 Esta semana</div>
          <div style={{display:"flex",gap:10}}>
            {[{e:"🏋️",l:"Fuerza",v:fuerzaThisWeek,t:5,c:"#c084fc"},{e:"🏃",l:"Cardio",v:cardioThisWeek,t:5,c:"#f472b6"},{e:"🧘",l:"Yoga",v:yogaThisWeek,t:2,c:"#818cf8"}].map(s=>(
              <div key={s.l} style={{flex:1,textAlign:"center"}}>
                <div style={{fontSize:22}}>{s.e}</div>
                <div style={{fontSize:20,fontWeight:700,color:s.v===s.t?"#4ade80":s.c,marginTop:4}}>{s.v}<span style={{fontSize:12,color:"#6d28d9"}}>/{s.t}</span></div>
                <div style={{fontSize:10,color:"#7c3aed",marginTop:2}}>{s.l}</div>
                <div style={{width:"100%",height:4,borderRadius:2,background:"rgba(255,255,255,0.08)",marginTop:6,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${(s.v/s.t)*100}%`,background:s.v===s.t?"#4ade80":s.c,borderRadius:2,transition:"width 0.4s"}}/>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Barras últimas 6 semanas */}
        <Card>
          <div style={{fontSize:13,color:"#c084fc",fontWeight:600,marginBottom:12}}>📅 Ejercicio — últimas 6 semanas</div>
          <div style={{display:"flex",gap:4,alignItems:"flex-end",height:80}}>
            {ejercicioSemanal.map((w,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <div style={{width:"100%",display:"flex",gap:2,alignItems:"flex-end",height:60}}>
                  <div style={{flex:1,background:"#c084fc",borderRadius:"3px 3px 0 0",height:`${(w.fuerza/5)*100}%`,minHeight:w.fuerza>0?4:0,transition:"height 0.4s"}}/>
                  <div style={{flex:1,background:"#f472b6",borderRadius:"3px 3px 0 0",height:`${(w.cardio/5)*100}%`,minHeight:w.cardio>0?4:0,transition:"height 0.4s"}}/>
                </div>
                <div style={{fontSize:9,color:i===5?"#f472b6":"#6d28d9"}}>{weekLabels[i]}</div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:12,marginTop:8,justifyContent:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:10,background:"#c084fc",borderRadius:2}}/><span style={{fontSize:10,color:"#a78bfa"}}>Fuerza</span></div>
            <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:10,background:"#f472b6",borderRadius:2}}/><span style={{fontSize:10,color:"#a78bfa"}}>Cardio</span></div>
          </div>
        </Card>

        {/* Última medida */}
        {lastMeasure&&(
          <Card>
            <div style={{fontSize:13,color:"#c084fc",fontWeight:600,marginBottom:12}}>📏 Última medida — {fmtDate(lastMeasure.fecha)}</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {[{k:"cintura",l:"Cintura",u:"cm",e:"📏"},{k:"cadera",l:"Cadera",u:"cm",e:"📐"},{k:"bajo_vientre",l:"Bajo vientre",u:"cm",e:"🎯"},{k:"pierna_der",l:"Pierna der.",u:"cm",e:"🦵"},{k:"pierna_izq",l:"Pierna izq.",u:"cm",e:"🦵"}].filter(f=>lastMeasure[f.k]).map(({k,l,u,e})=>{
                const curr = parseFloat(lastMeasure[k]);
                const prev = prevMeasure?parseFloat(prevMeasure[k]):null;
                const diff = prev?curr-prev:null;
                return (
                  <div key={k} style={{background:"rgba(255,255,255,0.05)",borderRadius:12,padding:"10px 12px",minWidth:80,textAlign:"center"}}>
                    <div style={{fontSize:10,color:"#a78bfa",marginBottom:4}}>{e} {l}</div>
                    <div style={{fontSize:16,fontWeight:700,color:"#f0e6ff"}}>{curr} <span style={{fontSize:10,color:"#6d28d9"}}>{u}</span></div>
                    {diff!==null&&<div style={{fontSize:10,marginTop:3,color:diff<0?"#4ade80":diff>0?"#f472b6":"#a78bfa"}}>{diff===0?"—":diff<0?`↓ ${Math.abs(diff).toFixed(1)}`:`↑ ${diff.toFixed(1)}`}</div>}
                  </div>
                );
              })}
            </div>
            {measures.length<2&&<div style={{fontSize:11,color:"#6d28d9",marginTop:8,textAlign:"center"}}>Registrá otra medida en 15 días para ver la evolución</div>}
          </Card>
        )}

        {/* Gráfico evolución medidas */}
        {chartData.length>1&&(
          <Card>
            <div style={{fontSize:13,color:"#c084fc",fontWeight:600,marginBottom:8}}>📈 Evolución de medidas</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
              {fields.map(f=>(
                <button key={f.k} onClick={()=>setChartMetric(f.k)} style={{padding:"4px 10px",borderRadius:20,fontSize:11,cursor:"pointer",border:"none",background:chartMetric===f.k?"#7c3aed":"rgba(255,255,255,0.06)",color:chartMetric===f.k?"white":"#a78bfa"}}>{f.e} {f.l}</button>
              ))}
            </div>
            <svg viewBox="0 0 300 100" style={{width:"100%",height:100}}>
              <defs><linearGradient id="grad2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c084fc" stopOpacity="0.3"/><stop offset="100%" stopColor="#c084fc" stopOpacity="0"/></linearGradient></defs>
              {(()=>{
                const pts=chartData.map((d,i)=>{const x=10+(i/(chartData.length-1))*280;const y=85-((d.val-minVal)/range)*70;return `${x},${y}`;});
                const ptsStr=pts.join(" ");const firstX=pts[0].split(",")[0];const lastX=pts[pts.length-1].split(",")[0];
                return(<><path d={`M ${ptsStr}`} fill="none" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d={`M ${pts[0]} L ${ptsStr} L ${lastX},90 L ${firstX},90 Z`} fill="url(#grad2)"/>{chartData.map((d,i)=>{const x=10+(i/(chartData.length-1))*280;const y=85-((d.val-minVal)/range)*70;return <circle key={i} cx={x} cy={y} r="3" fill="#c084fc"/>;})}</>);
              })()}
            </svg>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#6d28d9",marginTop:4}}>
              <span>{chartData[0].date}</span><span>{chartData[chartData.length-1].date}</span>
            </div>
            {(()=>{
              const first=chartData[0].val,last=chartData[chartData.length-1].val,diff=last-first;
              return <div style={{marginTop:8,fontSize:12,color:diff<0?"#4ade80":diff>0?"#f472b6":"#a78bfa",textAlign:"center"}}>
                {diff===0?"Sin cambios aún — la constancia se acumula.":diff<0?`↓ ${Math.abs(diff).toFixed(1)} cm menos desde el inicio 💪`:`↑ ${diff.toFixed(1)} cm desde el inicio`}
              </div>;
            })()}
          </Card>
        )}

        {!lastMeasure&&(
          <div style={{textAlign:"center",padding:"30px 0",color:"#6d28d9",fontSize:13}}>
            Aún no hay medidas registradas.<br/>
            <button onClick={()=>setView("medidas")} style={{marginTop:12,padding:"10px 20px",borderRadius:10,background:"rgba(124,58,237,0.2)",border:"1px solid rgba(124,58,237,0.4)",color:"#c084fc",fontSize:13,cursor:"pointer"}}>Registrar primera medida →</button>
          </div>
        )}

        <div style={{marginBottom:16}}>
          <button onClick={()=>setView("medidas")} style={{width:"100%",padding:"12px",borderRadius:12,background:"rgba(124,58,237,0.15)",border:"1px solid rgba(124,58,237,0.3)",color:"#c084fc",fontSize:13,cursor:"pointer"}}>📏 Ir a mis medidas completas →</button>
        </div>
      </div>
    </div>
  );
}

// ─── PLANNER ──────────────────────────────────────────────────────────────────
function PlannerView({activeDay,setActiveDay,todayIdx,weekProgress,getDayData,updateDayLocal,updateDayAndSave,saveDayToSupabase,setView,weekOffset,setWeekOffset,weekLabel,isCurrentWeek}) {
  const [tab,setTab] = useState("entreno");
  const [saving,setSaving] = useState(false);
  const [saved,setSaved] = useState(false);
  const day = getDayData(activeDay);
  const sched = TRAINING_SCHEDULE[activeDay];
  const [newTask,setNewTask] = useState("");

  const setTraining=(f,v)=>updateDayAndSave(activeDay,d=>({...d,training:{...d.training,[f]:v}}));
  const setFood=(f,v)=>updateDayLocal(activeDay,d=>({...d,food:{...d.food,[f]:v}}));
  const setBlock=(b,f,v)=>{
    if(f==="done") updateDayAndSave(activeDay,d=>({...d,blocks:{...d.blocks,[b]:{...d.blocks[b],[f]:v}}}));
    else updateDayLocal(activeDay,d=>({...d,blocks:{...d.blocks,[b]:{...d.blocks[b],[f]:v}}}));
  };
  const setField=(f,v)=>updateDayLocal(activeDay,d=>({...d,[f]:v}));
  const addTask=()=>{
    if(!newTask.trim()) return;
    updateDayAndSave(activeDay,d=>({...d,tasks:[...d.tasks,{text:newTask.trim(),done:false,id:Date.now()}]}));
    setNewTask("");
  };

  const handleSave=async()=>{
    setSaving(true);
    const ok = await saveDayToSupabase(activeDay);
    setSaving(false);
    if(ok){setSaved(true);setTimeout(()=>setSaved(false),3000);}
  };

  const tabs=[{id:"entreno",label:"🏋️ Entreno"},{id:"comida",label:"🥗 Comida"},{id:"bloques",label:"📚 Bloques"},{id:"tareas",label:"✅ Tareas"},{id:"alma",label:"🌸 Alma"}];

  return (
    <div>
      <div style={{padding:"24px 16px 8px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={()=>setView("home")} style={{background:"none",border:"none",color:"#a78bfa",fontSize:20,cursor:"pointer"}}>←</button>
        <h2 style={{margin:0,fontSize:22,color:"#f0e6ff",flex:1}}>Planner</h2>
        <button onClick={handleSave} disabled={saving} style={{padding:"8px 16px",borderRadius:10,background:saved?"rgba(74,222,128,0.2)":"linear-gradient(135deg,#7c3aed,#ec4899)",border:saved?"1px solid #4ade80":"none",color:saved?"#4ade80":"white",fontSize:12,fontWeight:700,cursor:"pointer",opacity:saving?0.7:1,transition:"all 0.3s"}}>
          {saving?"Guardando...":saved?"✓ Guardado":"💾 Guardar día"}
        </button>
      </div>

      {/* Week nav */}
      <WeekNav weekOffset={weekOffset} setWeekOffset={setWeekOffset} weekLabel={weekLabel} isCurrentWeek={isCurrentWeek} />

      {/* Day selector */}
      <div style={{padding:"0 12px 12px",display:"flex",gap:6}}>
        {DAYS.map((d,i)=>(
          <button key={i} onClick={()=>setActiveDay(i)} style={{flex:1,padding:"8px 4px",borderRadius:10,border:i===activeDay?"2px solid #c084fc":"2px solid transparent",background:i===activeDay?"rgba(192,132,252,0.2)":"rgba(255,255,255,0.04)",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
            <div style={{fontSize:11,color:i===activeDay?"#e9d5ff":"#a78bfa",fontWeight:(i===todayIdx&&isCurrentWeek)?700:400}}>{d}</div>
            {i===todayIdx&&isCurrentWeek&&<div style={{fontSize:8,color:"#f472b6"}}>HOY</div>}
            <div style={{width:"100%",height:3,borderRadius:2,background:"rgba(255,255,255,0.08)",overflow:"hidden"}}>
              <div style={{height:"100%",width:`${weekProgress[i]*100}%`,background:weekProgress[i]===1?"#4ade80":"#c084fc",borderRadius:2}}/>
            </div>
          </button>
        ))}
      </div>
      <div style={{padding:"0 16px 8px",fontSize:16,color:"#e9d5ff",fontWeight:600}}>{FULL_DAYS[activeDay]}{!isCurrentWeek&&<span style={{fontSize:11,color:"#6d28d9",marginLeft:8}}>{weekLabel}</span>}</div>

      {/* Tabs */}
      <div style={{padding:"0 12px 12px",display:"flex",gap:4,overflowX:"auto",scrollbarWidth:"none"}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"8px 12px",borderRadius:8,border:"none",background:tab===t.id?"rgba(192,132,252,0.25)":"rgba(255,255,255,0.05)",color:tab===t.id?"#f0e6ff":"#a78bfa",fontSize:12,cursor:"pointer",whiteSpace:"nowrap",fontWeight:tab===t.id?600:400,borderBottom:tab===t.id?"2px solid #c084fc":"2px solid transparent"}}>{t.label}</button>
        ))}
      </div>

      <div style={{padding:"0 16px"}}>
        {tab==="entreno"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {!sched.fuerza&&!sched.cardio&&!sched.yoga
              ?<div style={{textAlign:"center",padding:"40px 0",color:"#7c3aed"}}>🌙 Día de descanso activo.</div>
              :<>{sched.fuerza&&<TrainingCard emoji="🏋️" label="Fuerza" done={day.training.fuerzaDone} notes={day.training.fuerzaNotes} onToggle={()=>setTraining("fuerzaDone",!day.training.fuerzaDone)} onNotes={v=>updateDayLocal(activeDay,d=>({...d,training:{...d.training,fuerzaNotes:v}}))} color="#c084fc"/>}
                {sched.cardio&&<TrainingCard emoji="🏃" label="Cardio" done={day.training.cardioDone} notes={day.training.cardioNotes} onToggle={()=>setTraining("cardioDone",!day.training.cardioDone)} onNotes={v=>updateDayLocal(activeDay,d=>({...d,training:{...d.training,cardioNotes:v}}))} color="#f472b6"/>}
                {sched.yoga&&<TrainingCard emoji="🧘" label="Yoga" done={day.training.yogaDone} notes={day.training.yogaNotes} onToggle={()=>setTraining("yogaDone",!day.training.yogaDone)} onNotes={v=>updateDayLocal(activeDay,d=>({...d,training:{...d.training,yogaNotes:v}}))} color="#818cf8"/>}</>
            }
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

// ─── MEDIDAS ──────────────────────────────────────────────────────────────────
function MedidasView({measures,saveMeasure,deleteMeasure,setView}) {
  const emptyForm={fecha:todayStr(),peso:"",cintura:"",cadera:"",bajo_vientre:"",pierna_der:"",pierna_izq:"",notas:""};
  const [form,setForm]=useState(emptyForm);
  const [showForm,setShowForm]=useState(false);
  const [editingId,setEditingId]=useState(null);
  const [confirmDelete,setConfirmDelete]=useState(null);
  const [saving,setSaving]=useState(false);
  const fields=[{k:"cintura",l:"Cintura",u:"cm",e:"📏"},{k:"cadera",l:"Cadera",u:"cm",e:"📐"},{k:"bajo_vientre",l:"Bajo vientre",u:"cm",e:"🎯"},{k:"pierna_der",l:"Pierna der.",u:"cm",e:"🦵"},{k:"pierna_izq",l:"Pierna izq.",u:"cm",e:"🦵"}];
  const startEdit=(m)=>{setForm({fecha:m.fecha,peso:m.peso||"",cintura:m.cintura||"",cadera:m.cadera||"",bajo_vientre:m.bajo_vientre||"",pierna_der:m.pierna_der||"",pierna_izq:m.pierna_izq||"",notas:m.notas||""});setEditingId(m.id);setShowForm(true);setConfirmDelete(null);};
  const cancelForm=()=>{setShowForm(false);setEditingId(null);setForm(emptyForm);};
  const handleSave=async()=>{
    if(![...fields].some(f=>form[f.k])) return;
    setSaving(true);await saveMeasure(form,editingId);setSaving(false);cancelForm();
  };
  return (
    <div>
      <div style={{padding:"24px 16px 12px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={()=>setView("home")} style={{background:"none",border:"none",color:"#a78bfa",fontSize:20,cursor:"pointer"}}>←</button>
        <h2 style={{margin:0,fontSize:22,color:"#f0e6ff"}}>📏 Mis Medidas</h2>
      </div>
      <div style={{padding:"0 16px"}}>
        <div style={{fontSize:12,color:"#a78bfa",marginBottom:16,lineHeight:1.7,background:"rgba(192,132,252,0.06)",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(192,132,252,0.15)"}}>
          🌱 Registrá cada 15 días. El progreso se ve en la <strong style={{color:"#c084fc"}}>tendencia</strong>, no en un número aislado.
        </div>
        {!showForm
          ?<button onClick={()=>{setShowForm(true);setEditingId(null);setForm(emptyForm);}} style={{width:"100%",padding:"14px",borderRadius:14,margin:"0 0 12px",background:"rgba(124,58,237,0.2)",border:"1px solid rgba(124,58,237,0.4)",color:"#c084fc",fontSize:14,cursor:"pointer",fontWeight:600}}>+ Registrar medidas de hoy</button>
          :<Card>
            <div style={{fontSize:13,color:"#c084fc",fontWeight:600,marginBottom:12}}>{editingId?"✏️ Editando registro":"📝 Nuevo registro"}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {fields.map(({k,l,u,e})=>(
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
                    <span style={{fontSize:12,color:"#fda4af"}}>¿Segura que querés borrar?</span>
                    <div style={{display:"flex",gap:6,flexShrink:0}}>
                      <button onClick={()=>{deleteMeasure(m.id);setConfirmDelete(null);}} style={{background:"#be123c",border:"none",borderRadius:8,padding:"5px 12px",color:"white",fontSize:12,cursor:"pointer",fontWeight:600}}>Sí</button>
                      <button onClick={()=>setConfirmDelete(null)} style={{background:"rgba(255,255,255,0.06)",border:"none",borderRadius:8,padding:"5px 12px",color:"#a78bfa",fontSize:12,cursor:"pointer"}}>No</button>
                    </div>
                  </div>
                )}
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {fields.filter(f=>m[f.k]).map(({k,l,u,e})=>(
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
function FotosView({photoLog,savePhotoLog,photosDue,setView}) {
  const [newNote,setNewNote]=useState("");
  const daysSince=photoLog.lastReminder?Math.floor(daysBetween(photoLog.lastReminder,todayStr())):null;
  const nextIn=photoLog.lastReminder?Math.max(0,15-daysSince):0;
  const markPhotoDone=()=>savePhotoLog({...photoLog,lastReminder:todayStr()});
  const addNote=()=>{if(!newNote.trim())return;savePhotoLog({...photoLog,notes:[...(photoLog.notes||[]),{text:newNote.trim(),date:todayStr(),id:Date.now()}]});setNewNote("");};
  return (
    <div>
      <div style={{padding:"24px 16px 12px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={()=>setView("home")} style={{background:"none",border:"none",color:"#a78bfa",fontSize:20,cursor:"pointer"}}>←</button>
        <h2 style={{margin:0,fontSize:22,color:"#f0e6ff"}}>📸 Fotos de Progreso</h2>
      </div>
      <div style={{padding:"0 16px"}}>
        <Card>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:8}}>{photosDue?"📸":"🗓️"}</div>
            {photosDue?(
              <>
                <div style={{fontSize:16,fontWeight:700,color:"#f472b6",marginBottom:6}}>¡Es momento de tu foto!</div>
                <div style={{fontSize:13,color:"#fda4af",marginBottom:16,lineHeight:1.6}}>Cada foto es evidencia de tu constancia. No tiene que ser perfecta — tiene que ser real.</div>
                <div style={{fontSize:12,color:"#a78bfa",marginBottom:16,textAlign:"left",background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"10px 12px"}}>📋 <strong>Tips:</strong> misma ropa · misma hora · misma luz · mismo ángulo</div>
                <button onClick={markPhotoDone} style={{width:"100%",padding:"14px",borderRadius:14,background:"linear-gradient(135deg,#7c3aed,#ec4899)",border:"none",color:"white",fontSize:14,cursor:"pointer",fontWeight:700}}>✓ Saqué mi foto de hoy</button>
              </>
            ):(
              <>
                <div style={{fontSize:15,fontWeight:600,color:"#c084fc",marginBottom:6}}>Última foto: {fmtDate(photoLog.lastReminder)}</div>
                <div style={{fontSize:13,color:"#a78bfa",marginBottom:16}}>Próximo recordatorio en <strong style={{color:"#f472b6"}}>{nextIn} día{nextIn!==1?"s":""}</strong></div>
                <svg viewBox="0 0 80 80" style={{width:80,height:80,margin:"0 auto",display:"block"}}>
                  <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6"/>
                  <circle cx="40" cy="40" r="32" fill="none" stroke="#c084fc" strokeWidth="6" strokeDasharray={`${2*Math.PI*32}`} strokeDashoffset={`${2*Math.PI*32*(1-(Math.min(daysSince,15)/15))}`} strokeLinecap="round" transform="rotate(-90 40 40)"/>
                  <text x="40" y="44" textAnchor="middle" fill="#e9d5ff" fontSize="14" fontWeight="bold">{daysSince}d</text>
                </svg>
              </>
            )}
          </div>
        </Card>
        <Card>
          <div style={{fontSize:13,color:"#c084fc",fontWeight:600,marginBottom:6}}>📝 ¿Cómo te sentís en tu cuerpo?</div>
          <div style={{fontSize:12,color:"#7c3aed",marginBottom:10}}>Anotá qué notás, qué cambió, cómo te movés...</div>
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
        <Card>
          <div style={{fontSize:13,color:"#818cf8",fontWeight:600,marginBottom:10}}>📱 Cómo guardar tus fotos</div>
          <div style={{fontSize:12,color:"#a78bfa",lineHeight:1.9}}>
            <strong style={{color:"#e9d5ff"}}>1.</strong> Creá un álbum privado: "Progreso Fio"<br/>
            <strong style={{color:"#e9d5ff"}}>2.</strong> Siempre a la misma hora del día<br/>
            <strong style={{color:"#e9d5ff"}}>3.</strong> Misma posición, misma luz, misma ropa<br/>
            <strong style={{color:"#e9d5ff"}}>4.</strong> Volvé acá y marcá ✓ que la sacaste
          </div>
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
function WaterTracker({agua,setAgua}){return(<div style={{background:"rgba(96,165,250,0.08)",borderRadius:12,padding:14,border:"1px solid rgba(96,165,250,0.2)"}}><div style={{fontSize:13,color:"#60a5fa",marginBottom:12,fontWeight:600}}>💧 Agua del día</div><div style={{display:"flex",alignItems:"center",gap:10}}><button onClick={()=>setAgua(Math.max(0,agua-1))} style={{background:"rgba(96,165,250,0.2)",border:"none",borderRadius:8,padding:"6px 12px",color:"#60a5fa",fontSize:18,cursor:"pointer"}}>−</button><div style={{flex:1,display:"flex",gap:4,flexWrap:"wrap"}}>{Array.from({length:8}).map((_,i)=>(<div key={i} onClick={()=>setAgua(i+1)} style={{width:28,height:28,borderRadius:"50%",background:i<agua?"#60a5fa":"rgba(96,165,250,0.1)",border:"2px solid rgba(96,165,250,0.3)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,transition:"all 0.2s"}}>{i<agua?"💧":""}</div>))}</div><button onClick={()=>setAgua(Math.min(8,agua+1))} style={{background:"rgba(96,165,250,0.2)",border:"none",borderRadius:8,padding:"6px 12px",color:"#60a5fa",fontSize:18,cursor:"pointer"}}>+</button></div><div style={{textAlign:"center",marginTop:8,fontSize:12,color:"#60a5fa"}}>{agua}/8 vasos {agua>=8?"🎉 ¡Meta cumplida!":agua>=4?"💪 Vas bien":"Acordate de tomar agua"}</div></div>);}
function BottomNav({view,setView,photosDue}){
  const items=[{id:"home",e:"🏠",l:"Inicio"},{id:"planner",e:"📋",l:"Planner"},{id:"dashboard",e:"📊",l:"Dashboard"},{id:"medidas",e:"📏",l:"Medidas"},{id:"fotos",e:"📸",l:"Fotos"}];
  return(<div style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(13,11,26,0.97)",borderTop:"1px solid rgba(200,160,255,0.15)",display:"flex",backdropFilter:"blur(12px)",zIndex:100}}>{items.map(({id,e,l})=>(<button key={id} onClick={()=>setView(id)} style={{flex:1,padding:"12px 4px 10px",background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,position:"relative"}}><span style={{fontSize:18}}>{e}</span>{id==="fotos"&&photosDue&&<span style={{position:"absolute",top:8,right:"20%",width:8,height:8,background:"#f472b6",borderRadius:"50%",border:"2px solid #0d0b1a"}}/>}<span style={{fontSize:9,color:view===id?"#c084fc":"#6d28d9",fontWeight:view===id?700:400}}>{l}</span></button>))}</div>);
}
