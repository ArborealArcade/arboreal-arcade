"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";

const COLS = 9;
const ROWS = 12;
const START = { x: 4, y: 11 };
const LANE_TYPES = ["goal","branch","hazard","branch","vine","rest","branch","hazard","vine","branch","rest","start"] as const;

type Goal = { type: "top" } | { type: "side"; dir: "left" | "right"; row: number };
type Stage = { name: string; subtitle: string; bonus: number; goal: Goal };

// Canopy Crossing's own identity: not every stage climbs. Some crossings
// end at the crown (top row), others at the far bank (walk off the screen edge).
const STAGES: Stage[] = [
  { name: "Rainforest Edge", subtitle: "Learn the canopy · climb to the crown", bonus: 500, goal: { type: "top" } },
  { name: "River Crossing", subtitle: "Fast wet limbs · cross to the far bank", bonus: 650, goal: { type: "side", dir: "right", row: 6 } },
  { name: "Dense Canopy", subtitle: "Tighter safe windows · climb to the crown", bonus: 800, goal: { type: "top" } },
  { name: "Night Canopy", subtitle: "Predators in the dark · slip out the far side", bonus: 1000, goal: { type: "side", dir: "left", row: 3 } },
  { name: "Tropical Storm", subtitle: "Survive the crown · final ascent", bonus: 1500, goal: { type: "top" } },
];

const stageOf = (level: number): Stage => STAGES[Math.min(Math.max(level, 1) - 1, STAGES.length - 1)];
const objectiveOf = (s: Stage): string =>
  s.goal.type === "top" ? "↑ REACH THE CROWN" : s.goal.dir === "right" ? "→ CROSS TO THE FAR BANK" : "← CROSS TO THE FAR BANK";

// Five-stage difficulty tuning. Stage 1 is gentle (wide limbs, slow, few
// predators); stage 5 is a gauntlet (narrow limbs, fast, crowded lanes).
type Tuning = { speed:number; branchW:number; vineW:number; hazW:number; movers:number; spacing:number; insects:number; hazSpeed:number };
const TUNING: Tuning[] = [
  { speed:1.00, branchW:3.0, vineW:1.70, hazW:1.10, movers:3, spacing:4.2, insects:6, hazSpeed:0.85 }, // Rainforest Edge — learn the ropes
  { speed:1.12, branchW:2.7, vineW:1.60, hazW:1.05, movers:3, spacing:3.9, insects:6, hazSpeed:0.95 }, // River Crossing — first side exit
  { speed:1.25, branchW:2.4, vineW:1.50, hazW:1.00, movers:3, spacing:3.6, insects:5, hazSpeed:1.05 }, // Dense Canopy — tighter windows
  { speed:1.38, branchW:2.2, vineW:1.45, hazW:0.95, movers:4, spacing:3.4, insects:5, hazSpeed:1.15 }, // Night Canopy — crowded, dark
  { speed:1.55, branchW:2.0, vineW:1.40, hazW:0.90, movers:4, spacing:3.1, insects:4, hazSpeed:1.25 }, // Tropical Storm — gauntlet
];
const tuningOf = (level: number): Tuning => TUNING[Math.min(Math.max(level, 1) - 1, TUNING.length - 1)];

type Pos = { x:number; y:number };
type Mover = { row:number; x:number; width:number; speed:number; kind:"branch"|"hazard"|"vine" };
type Insect = { x:number; y:number };
type Firefly = {x:number;y:number;phase:number};
const FIREFLIES:Firefly[] = Array.from({length:18},(_,i)=>({x:(i*47)%100,y:(i*73)%100,phase:i*.83}));

// Juice: floating score text + leaf/spark particles, stored in grid units
// so they survive canvas resizes.
type Floater={gx:number;gy:number;text:string;color:string;t0:number};
type Particle={gx:number;gy:number;vx:number;vy:number;t0:number;life:number;color:string;size:number};

// Production sprite art: generated in the locked Arboreal Planet style
// (bold cartoon-vector, thick outlines, cel shading, black keyable bg).
const SPRITE_SRC: Record<string,string> = {
  "monitor-up": "/arcade/canopy-crossing/monitor-up.webp",
  "monitor-down": "/arcade/canopy-crossing/monitor-down.webp",
  "monitor-left": "/arcade/canopy-crossing/monitor-left.webp",
  "monitor-right": "/arcade/canopy-crossing/monitor-right.webp",
  branch: "/arcade/canopy-crossing/branch.webp",
  vine: "/arcade/canopy-crossing/vine.webp",
  predator: "/arcade/canopy-crossing/predator.webp",
  insect: "/arcade/canopy-crossing/insect.webp",
  foliage: "/arcade/canopy-crossing/foliage.webp",
};

const clamp = (n:number,min:number,max:number) => Math.max(min,Math.min(max,n));

// Sprites ship on solid black backgrounds ("sprite-keyable"). Drawing them
// with 'screen' blend keys the black out but leaves the art ghostly —
// translucent over bright lanes. Instead, key each sprite once at load:
// flood-fill the edge-connected near-black background to transparent, then
// draw with normal source-over at true 100% opacity. Also records the
// subject's bounding box so every facing can be normalized to one size.
type KeyedSprite = { img: HTMLCanvasElement; bx:number; by:number; bw:number; bh:number };
function keySprite(src: HTMLImageElement): KeyedSprite {
  const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
  const fallback = (): KeyedSprite => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d")!.drawImage(src, 0, 0);
    return { img: c, bx: 0, by: 0, bw: w, bh: h };
  };
  try {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(src, 0, 0);
    const id = ctx.getImageData(0, 0, w, h), d = id.data;
    const seen = new Uint8Array(w * h);
    const stack: number[] = [];
    const push = (x:number, y:number) => {
      const p = y * w + x;
      if (seen[p]) return;
      const i = p * 4;
      if (d[i] >= 16 || d[i+1] >= 16 || d[i+2] >= 16) return;
      seen[p] = 1; stack.push(p);
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (stack.length) {
      const p = stack.pop()!;
      d[p*4+3] = 0;
      const x = p % w, y = (p / w) | 0;
      if (x > 0) push(x-1, y);
      if (x < w-1) push(x+1, y);
      if (y > 0) push(x, y-1);
      if (y < h-1) push(x, y+1);
    }
    ctx.putImageData(id, 0, 0);
    let x0=w, y0=h, x1=-1, y1=-1;
    for (let p = 0; p < w*h; p++) {
      if (d[p*4+3] > 8) {
        const x = p % w, y = (p / w) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return fallback();
    return { img: c, bx: x0, by: y0, bw: x1-x0+1, bh: y1-y0+1 };
  } catch { return fallback(); }
}

function makeMovers(level:number): Mover[] {
  const movers: Mover[] = [];
  const st = stageOf(level);
  const tn = tuningOf(level);
  for (let row=1; row<=9; row++) {
    if (row===5) continue;
    if (st.goal.type==="side" && row===st.goal.row) {
      // Exit limb: a safe perch patrolled by predators — time the walk to the edge.
      for (let i=0;i<2;i++) movers.push({row,x:i*(COLS/2),width:tn.hazW,speed:(i%2?1:-1)*tn.hazSpeed,kind:"hazard"});
      continue;
    }
    const kind = LANE_TYPES[row] === "hazard" ? "hazard" : LANE_TYPES[row] === "vine" ? "vine" : "branch";
    const dir = row % 2 ? 1 : -1;
    const base = (0.40 + row * 0.012) * tn.speed;
    for (let i=0;i<tn.movers;i++) movers.push({row,x:i*tn.spacing+(row%3)*0.45,width:kind==="branch"?tn.branchW:kind==="vine"?tn.vineW:tn.hazW,speed:dir*base,kind});
  }
  return movers;
}

function makeInsects(level:number): Insect[] {
  const st = stageOf(level);
  const goal = st.goal;
  const rows = [1,2,3,4,6,7,8,9].filter(r=>!(goal.type==="side"&&r===goal.row));
  let seed = level*97+13;
  const rnd = () => (seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff;
  const spots: Insect[] = [];
  const n = tuningOf(level).insects;
  for (let i=0;i<n;i++) spots.push({x:Math.floor(rnd()*COLS),y:rows[Math.floor(rnd()*rows.length)]});
  return spots;
}

export default function CanopyCrossing() {
  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const moversRef = useRef<Mover[]>(makeMovers(1));
  const insectsRef = useRef<Insect[]>(makeInsects(1));
  const playerRef = useRef<Pos>({...START});
  const lastRef = useRef(0);
  const runningRef = useRef(false);
  const levelRef = useRef(1);
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const bugsRef = useRef(0);
  const touchRef = useRef<{x:number;y:number}|null>(null);
  const facingRef = useRef<"up"|"down"|"left"|"right">("up");
  const [running,setRunning] = useState(false);
  const [score,setScore] = useState(0);
  const [lives,setLives] = useState(3);
  const [level,setLevel] = useState(1);
  const [bugs,setBugs] = useState(0);
  const [message,setMessage] = useState("Cross five wild canopy stages. Climb to the crown — or slip out the far bank. Ride branches and vines; dodge predators.");
  // Best score via useSyncExternalStore: SSR renders 0 (no hydration mismatch),
  // client reads localStorage; syncBest writes + notifies subscribers.
  const BEST_KEY = "canopy-crossing-best";
  const readBest = useCallback(() => { try { return Number(localStorage.getItem(BEST_KEY) || 0); } catch { return 0; } }, []);
  const subscribeBest = useCallback((cb: () => void) => { window.addEventListener("cc-best", cb); return () => window.removeEventListener("cc-best", cb); }, []);
  const best = useSyncExternalStore(subscribeBest, readBest, () => 0);
  const syncBest = useCallback((value: number) => {
    try {
      if (value > Number(localStorage.getItem(BEST_KEY) || 0)) {
        localStorage.setItem(BEST_KEY, String(value));
        window.dispatchEvent(new Event("cc-best"));
      }
    } catch {}
  }, []);
  const [paused,setPaused] = useState(false);
  const [narrow,setNarrow] = useState(false);
  const [endKind,setEndKind] = useState<null|"win"|"gameover">(null);
  const pausedRef = useRef(false);
  const stageStartRef = useRef(0);
  const lastRowRef = useRef(START.y);
  const messageUntilRef = useRef(0);
  const spritesRef = useRef<Record<string, KeyedSprite>>({});
  const floatersRef = useRef<Floater[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const hopRef = useRef(0);
  const dieRef = useRef(0);
  const clearRef = useRef(0);
  const audioRef = useRef<{ctx:AudioContext|null}>({ctx:null});
  const mutedRef = useRef(false);
  const [muted,setMuted]=useState(false);
  useEffect(()=>{
    for(const [k,src] of Object.entries(SPRITE_SRC)){
      const img=new Image();
      img.onload=()=>{spritesRef.current[k]=keySprite(img);};
      img.src=src;
    }
  },[]);
  useEffect(()=>{
    const mq = window.matchMedia("(max-width:640px)");
    const apply = ()=>setNarrow(mq.matches);
    apply();
    mq.addEventListener("change",apply);
    return ()=>mq.removeEventListener("change",apply);
  },[]);

  const resetPlayer = useCallback(() => { playerRef.current={...START}; lastRowRef.current=START.y; facingRef.current="up"; },[]);
  const togglePause=useCallback(()=>{if(!runningRef.current)return;pausedRef.current=!pausedRef.current;setPaused(pausedRef.current);setMessage(pausedRef.current?"PAUSED":"");},[]);
  const toggleMute=useCallback(()=>{const nm=!mutedRef.current;mutedRef.current=nm;setMuted(nm);},[]);

  // Tiny WebAudio synth SFX — no assets. Context is created on START (user gesture).
  const tone=useCallback((freq:number,dur:number,type:OscillatorType="sine",vol=.14,delay=0)=>{
    const a=audioRef.current; if(!a.ctx||mutedRef.current) return;
    try{
      const t0=a.ctx.currentTime+delay;
      const o=a.ctx.createOscillator(),g=a.ctx.createGain();
      o.type=type;o.frequency.value=freq;
      g.gain.setValueAtTime(.0001,t0);
      g.gain.exponentialRampToValueAtTime(vol,t0+.015);
      g.gain.exponentialRampToValueAtTime(.0001,t0+dur);
      o.connect(g);g.connect(a.ctx.destination);
      o.start(t0);o.stop(t0+dur+.05);
    }catch{}
  },[]);
  const sfxHop=useCallback(()=>tone(300+Math.random()*90,.09,"triangle",.1),[tone]);
  const sfxPickup=useCallback(()=>{tone(880,.09,"sine",.13);tone(1318,.13,"sine",.11,.07);},[tone]);
  const sfxDie=useCallback(()=>tone(150,.28,"sawtooth",.15),[tone]);
  const sfxClear=useCallback(()=>{[523,659,784,1047].forEach((f,i)=>tone(f,.15,"triangle",.12,i*.085));},[tone]);
  const sfxWin=useCallback(()=>{[523,659,784,1047,1319,1568].forEach((f,i)=>tone(f,.18,"triangle",.12,i*.1));},[tone]);

  const addFloater=useCallback((gx:number,gy:number,text:string,color:string)=>{
    floatersRef.current.push({gx,gy,text,color,t0:performance.now()});
    if(floatersRef.current.length>24)floatersRef.current.shift();
  },[]);
  const burst=useCallback((gx:number,gy:number,n:number,colors:string[],spd=2.2)=>{
    const now=performance.now();
    for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,v=spd*(.35+Math.random());
      particlesRef.current.push({gx,gy,vx:Math.cos(a)*v,vy:Math.sin(a)*v-.9,t0:now,life:480+Math.random()*420,color:colors[i%colors.length],size:1.6+Math.random()*2.6});}
    if(particlesRef.current.length>180)particlesRef.current.splice(0,particlesRef.current.length-180);
  },[]);

  const showStageCard = useCallback((lv:number) => {
    const s = stageOf(lv);
    setMessage(`STAGE ${lv} — ${s.name.toUpperCase()} · ${s.subtitle}`);
    messageUntilRef.current = performance.now()+1800;
  },[]);

  const advanceStage = useCallback(() => {
    const completed = stageOf(levelRef.current);
    const t = performance.now();
    if (levelRef.current>=STAGES.length) {
      const timeBonus=Math.max(0,Math.floor(1500-(t-stageStartRef.current)/20));
      scoreRef.current+=completed.bonus+timeBonus;
      setScore(scoreRef.current);syncBest(scoreRef.current);
      runningRef.current=false;setRunning(false);
      setMessage("CROWN CONQUERED — all five crossings complete!");
      setEndKind("win");
      sfxWin(); clearRef.current=t;
      for(let i=0;i<5;i++) burst(1+i*2,.8,14,["#a8d96f","#ffd76e","#7fd4a8","#fff3c4"],3);
      resetPlayer();
      return;
    }
    levelRef.current++; scoreRef.current+=completed.bonus; stageStartRef.current=t;
    setLevel(levelRef.current);setScore(scoreRef.current);
    clearRef.current=t; sfxClear();
    addFloater(4.5,1.2,`+${completed.bonus}`,"#ffe9a3");
    moversRef.current=makeMovers(levelRef.current);
    insectsRef.current=makeInsects(levelRef.current);
    resetPlayer();
    showStageCard(levelRef.current);
  },[resetPlayer,syncBest,showStageCard,sfxClear,sfxWin,addFloater,burst]);

  const start = useCallback(() => {
    try{
      if(!audioRef.current.ctx){const AC=window.AudioContext||(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(AC)audioRef.current.ctx=new AC();}
      audioRef.current.ctx?.resume();
    }catch{}
    levelRef.current=1; scoreRef.current=0; livesRef.current=3; bugsRef.current=0;
    moversRef.current=makeMovers(1); insectsRef.current=makeInsects(1); resetPlayer();
    setLevel(1);setScore(0);setLives(3);setBugs(0);
    stageStartRef.current=performance.now();pausedRef.current=false;setPaused(false);
    setEndKind(null);
    runningRef.current=true;setRunning(true);
    showStageCard(1);
  },[resetPlayer,showStageCard]);

  const move = useCallback((dx:number,dy:number) => {
    if(!runningRef.current||pausedRef.current) return;
    const p=playerRef.current;
    if(dx>0) facingRef.current="right"; else if(dx<0) facingRef.current="left";
    else if(dy<0) facingRef.current="up"; else if(dy>0) facingRef.current="down";
    const nx=p.x+dx;
    if(dx!==0&&(nx<0||nx>COLS-1)){
      const goal=stageOf(levelRef.current).goal;
      if(goal.type==="side"&&p.y===goal.row&&((dx<0&&goal.dir==="left")||(dx>0&&goal.dir==="right"))){
        advanceStage();
        return;
      }
    }
    p.x=clamp(nx,0,COLS-1);
    p.y=clamp(p.y+dy,0,ROWS-1);
    hopRef.current=performance.now();sfxHop();
    if(dy<0){
      const progress=Math.max(0,lastRowRef.current-p.y);
      if(progress>0){scoreRef.current+=10*progress;setScore(scoreRef.current);lastRowRef.current=p.y;addFloater(p.x+.5,p.y+.1,`+${10*progress}`,"#a8d96f");}
    }
    const ix=insectsRef.current.findIndex(s=>s.x===p.x&&s.y===p.y);
    if(ix>=0){
      insectsRef.current.splice(ix,1);
      scoreRef.current+=25;setScore(scoreRef.current);
      bugsRef.current+=1;setBugs(bugsRef.current);
      addFloater(p.x+.5,p.y,"+25","#ffd76e");
      burst(p.x+.5,p.y+.5,10,["#ffd76e","#fff3c4","#ffb13d"],2.4);
      sfxPickup();
    }
  },[advanceStage,sfxHop,sfxPickup,addFloater,burst]);

  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      const k=e.key.toLowerCase();
      if(["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d"].includes(k)) e.preventDefault();
      if(k==="arrowup"||k==="w") move(0,-1);
      if(k==="arrowdown"||k==="s") move(0,1);
      if(k==="arrowleft"||k==="a") move(-1,0);
      if(k==="arrowright"||k==="d") move(1,0);
      if(k==="p"||k==="escape") togglePause();
    };
    window.addEventListener("keydown",key,{passive:false});
    return()=>window.removeEventListener("keydown",key);
  },[move,togglePause]);

  useEffect(()=>{
    let raf=0;
    const frame=(t:number)=>{
      const c=canvasRef.current; if(!c){raf=requestAnimationFrame(frame);return;}
      const ctx=c.getContext("2d"); if(!ctx){raf=requestAnimationFrame(frame);return;}
      const rect=c.getBoundingClientRect(); const dpr=Math.min(window.devicePixelRatio||1,2);
      if(c.width!==Math.floor(rect.width*dpr)||c.height!==Math.floor(rect.height*dpr)){c.width=Math.floor(rect.width*dpr);c.height=Math.floor(rect.height*dpr);}
      ctx.setTransform(dpr,0,0,dpr,0,0);
      const W=rect.width,H=rect.height,rowH=H/ROWS,colW=W/COLS;
      const dieAge=t-dieRef.current;
      if(dieAge<350){const k=1-dieAge/350;ctx.translate((Math.random()-.5)*12*k,(Math.random()-.5)*12*k);}
      const dt=Math.min((t-lastRef.current)/1000||0,.04);lastRef.current=t;
      if(messageUntilRef.current && t>messageUntilRef.current){ messageUntilRef.current=0; setMessage(""); }
      if(runningRef.current && !pausedRef.current){
        for(const m of moversRef.current){m.x+=m.speed*dt;if(m.speed>0&&m.x>COLS+1)m.x=-m.width-1;if(m.speed<0&&m.x+m.width<-1)m.x=COLS+1;}
        const p=playerRef.current;
        const goal=stageOf(levelRef.current).goal;
        if(p.y===0&&goal.type==="top"){
          advanceStage();
        } else if(p.y>0&&p.y<10&&p.y!==5){
          const lane=LANE_TYPES[p.y];
          const hits=moversRef.current.filter(m=>m.row===p.y&&p.x+.65>m.x&&p.x+.35<m.x+m.width);
          const isExit=goal.type==="side"&&p.y===goal.row;
          const safe = isExit ? hits.length===0 : lane==="hazard" ? hits.length===0 : hits.some(h=>h.kind!=="hazard");
          if(!safe){
            livesRef.current--;setLives(livesRef.current);setMessage("Missed the branch!");
            messageUntilRef.current=t+900;
            dieRef.current=t; sfxDie();
            burst(p.x+.5,p.y+.5,12,["#e2605c","#7fb3d4","#a8d96f"],2.6);
            addFloater(p.x+.5,p.y+.2,"−1 ♥","#ff8f86");
            resetPlayer();
            if(livesRef.current<=0){syncBest(scoreRef.current);runningRef.current=false;setRunning(false);setMessage("The jungle wins this round.");setEndKind("gameover");}
          } else if(!isExit&&lane!=="hazard"&&hits[0]){
            p.x+=hits[0].speed*dt;
            if(p.x<-.4||p.x>COLS-.6){
              livesRef.current--;setLives(livesRef.current);
              dieRef.current=t;sfxDie();
              addFloater(clamp(p.x,0,COLS-1)+.5,p.y+.2,"−1 ♥","#ff8f86");
              resetPlayer();
              if(livesRef.current<=0){syncBest(scoreRef.current);runningRef.current=false;setRunning(false);setMessage("Swept out of the canopy.");setEndKind("gameover");}
              else{setMessage("Swept off the limb!");messageUntilRef.current=t+900;}
            }
          }
        }
      }

      const grad=ctx.createLinearGradient(0,0,0,H);grad.addColorStop(0,"#071b12");grad.addColorStop(.55,"#0b2a1d");grad.addColorStop(1,"#06110d");ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
      // Layered New Guinea canopy: foliage sprite when loaded, procedural fallback.
      const fol=spritesRef.current["foliage"];
      if(fol){
        // Keyed leaves drawn solid at reduced alpha — a real canopy wash,
        // not a screen-blend haze.
        ctx.save();ctx.globalAlpha=.55;
        const fs=Math.max(W/fol.img.width,H/fol.img.height),fdw=fol.img.width*fs,fdh=fol.img.height*fs;
        ctx.drawImage(fol.img,(W-fdw)/2,(H-fdh)/2,fdw,fdh);
        ctx.restore();
      }else{
        ctx.fillStyle="rgba(20,63,40,.42)";
        for(let i=0;i<18;i++){const x=((i*83+31)%Math.max(1,W+120))-60;const y=((i*137)%Math.max(1,H));ctx.beginPath();ctx.ellipse(x,y,42+(i%4)*10,14+(i%3)*5,(i%5)*.42,0,Math.PI*2);ctx.fill();}
      }
      ctx.strokeStyle="rgba(55,105,62,.35)";ctx.lineWidth=5;
      for(let i=0;i<7;i++){const x=(i+.5)*W/7;ctx.beginPath();ctx.moveTo(x,-20);ctx.bezierCurveTo(x-35,H*.25,x+28,H*.55,x-15,H+20);ctx.stroke();}
      const stageIndex=Math.min(levelRef.current-1,STAGES.length-1);
      const stage=STAGES[stageIndex];
      if(stageIndex===1){ctx.fillStyle="rgba(72,139,168,.12)";ctx.fillRect(0,H*.25,W,H*.55);}
      if(stageIndex===3){ctx.fillStyle="rgba(0,8,20,.44)";ctx.fillRect(0,0,W,H);for(const f of FIREFLIES){const a=.25+.45*(.5+.5*Math.sin(t/420+f.phase));ctx.fillStyle=`rgba(213,238,109,${a})`;ctx.beginPath();ctx.arc(W*f.x/100,H*f.y/100,1.7,0,Math.PI*2);ctx.fill();}}
      if(stageIndex===4){ctx.strokeStyle="rgba(190,220,235,.22)";ctx.lineWidth=1;for(let i=0;i<38;i++){const rx=(i*79+t*.08)%W,ry=(i*113+t*.18)%H;ctx.beginPath();ctx.moveTo(rx,ry);ctx.lineTo(rx-9,ry+20);ctx.stroke();}}
      for(let r=0;r<ROWS;r++){
        const y=r*rowH;
        const isExitRow=stage.goal.type==="side"&&r===stage.goal.row;
        if(r===0){ctx.fillStyle="rgba(175,224,95,.16)";ctx.fillRect(0,y,W,rowH);}
        else if(isExitRow){ctx.fillStyle="rgba(255,205,90,.08)";ctx.fillRect(0,y,W,rowH);}
        else if(r===5||r===10||r===11){ctx.fillStyle="rgba(255,255,255,.035)";ctx.fillRect(0,y,W,rowH);}
        else if(LANE_TYPES[r]==="hazard"){ctx.fillStyle="rgba(150,40,30,.13)";ctx.fillRect(0,y,W,rowH);}
        else if(LANE_TYPES[r]==="vine"){ctx.fillStyle="rgba(90,170,80,.07)";ctx.fillRect(0,y,W,rowH);}
        ctx.strokeStyle="rgba(255,255,255,.025)";ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();
      }
      // Stationary perches: rest rows 5/10 and the side-exit row are logically
      // safe, so render them as big obvious full-width limbs (behind movers),
      // tiled from the branch sprite's middle band to avoid distortion.
      {
        const perchRows:number[]=[5,10];
        if(stage.goal.type==="side") perchRows.push(stage.goal.row);
        const bSpr=spritesRef.current["branch"];
        for(const r of perchRows){
          const py=r*rowH;
          ctx.fillStyle="rgba(130,225,130,.10)";
          ctx.beginPath();ctx.ellipse(W/2,py+rowH*.6,W*.48,rowH*.34,0,0,Math.PI*2);ctx.fill();
          ctx.fillStyle="rgba(0,0,0,.35)";
          ctx.beginPath();ctx.ellipse(W/2,py+rowH*.95,W*.46,rowH*.14,0,0,Math.PI*2);ctx.fill();
          if(bSpr){
            // One continuous limb: three distinct slices of the art's middle
            // band (no squeeze, no 3x repetition, no seams), keyed so the
            // band edges melt into the canopy.
            const sy=bSpr.img.height*.30,sh=bSpr.img.height*.35,slices=3;
            const ssw=bSpr.img.width/slices,segW=W/slices,dh=segW*sh/ssw;
            for(let i=0;i<slices;i++) ctx.drawImage(bSpr.img,i*ssw,sy,ssw,sh,i*segW,py+rowH/2-dh/2,segW,dh);
          }else{
            ctx.lineCap="round";ctx.strokeStyle="#755238";ctx.lineWidth=Math.max(10,rowH*.5);
            ctx.beginPath();ctx.moveTo(W*.02,py+rowH*.5);ctx.lineTo(W*.98,py+rowH*.5);ctx.stroke();
          }
          ctx.strokeStyle="rgba(196,232,150,.55)";ctx.lineWidth=Math.max(2,rowH*.07);ctx.lineCap="round";
          ctx.beginPath();ctx.moveTo(W*.03,py+rowH*.30);ctx.lineTo(W*.97,py+rowH*.30);ctx.stroke();
        }
      }
      // Lane edge ticks: instant safe/danger reading without looking at the movers.
      // Green = rideable limb, red = predator lane, gray = rest, gold = goal row.
      for(let r=1;r<=9;r++){
        const y=r*rowH;
        const isExitRow=stage.goal.type==="side"&&r===stage.goal.row;
        const lane=LANE_TYPES[r];
        const col=isExitRow?"#ffd76e":r===5?"rgba(150,160,150,.45)":lane==="hazard"?"rgba(255,96,74,.8)":"rgba(130,225,130,.65)";
        ctx.fillStyle=col;
        ctx.fillRect(0,y+rowH*.32,5,rowH*.36);
        ctx.fillRect(W-5,y+rowH*.32,5,rowH*.36);
      }
      // Predator flow telegraphing: red chevrons on the edge each predator
      // lane enters from, so players can read travel direction at a glance.
      for(let r=1;r<=9;r++){
        const isExitRow=stage.goal.type==="side"&&r===stage.goal.row;
        if(LANE_TYPES[r]!=="hazard"||isExitRow) continue;
        const dir=r%2?1:-1;
        const y=r*rowH+rowH*.62;
        ctx.fillStyle="rgba(255,120,95,.85)";ctx.textAlign="center";
        ctx.font=`900 ${Math.max(12,rowH*.3)}px system-ui`;
        const bx=dir>0?16:W-16;
        ctx.globalAlpha=.6+.4*Math.abs(Math.sin(t/260+r));
        ctx.fillText(dir>0?"❯❯":"❮❮",bx,y);
        ctx.globalAlpha=1;ctx.textAlign="start";
      }
      // Exit marker for side-goal stages: glowing edge + chevron on the exit limb.
      if(stage.goal.type==="side"){
        const right=stage.goal.dir==="right";
        const gy=stage.goal.row*rowH;
        const gg=ctx.createLinearGradient(right?W:0,0,right?W-84:84,0);
        gg.addColorStop(0,"rgba(255,205,90,.45)");gg.addColorStop(1,"rgba(255,205,90,0)");
        ctx.fillStyle=gg;ctx.fillRect(right?W-84:0,gy,84,rowH);
        const bob=Math.sin(t/280)*4;
        ctx.fillStyle="rgba(255,220,130,.95)";ctx.textAlign="center";
        ctx.font=`900 ${Math.max(16,rowH*.42)}px system-ui`;
        ctx.fillText(right?"❯":"❮",right?W-26:26,gy+rowH*.68+bob);
        ctx.font=`700 ${Math.max(10,rowH*.2)}px system-ui`;ctx.fillStyle="rgba(255,225,150,.75)";
        ctx.fillText("EXIT",W/2,gy+rowH*.62);
        ctx.textAlign="start";
      }
      if(stage.goal.type==="top"){
        // Obvious goal: a gold crown band across the whole top row.
        ctx.fillStyle="rgba(255,205,90,.16)";ctx.fillRect(0,0,W,rowH);
        ctx.strokeStyle="rgba(255,215,120,.6)";ctx.lineWidth=Math.max(2,rowH*.06);
        ctx.beginPath();ctx.moveTo(0,rowH-1);ctx.lineTo(W,rowH-1);ctx.stroke();
        const bob=Math.sin(t/300)*3;
        ctx.textAlign="center";ctx.fillStyle="#ffd76e";
        ctx.font=`900 ${Math.max(14,rowH*.32)}px system-ui`;
        ctx.fillText("👑  REACH THE CROWN  👑",W/2,rowH*.64+bob);
        ctx.textAlign="start";
      }else{
        ctx.textAlign="center";ctx.font=`700 ${Math.max(10,rowH*.18)}px system-ui`;ctx.fillStyle="rgba(230,246,218,.72)";ctx.fillText(stage.subtitle.toUpperCase(),W/2,rowH*.55);ctx.textAlign="start";
      }

      for(const m of moversRef.current){
        const x=m.x*colW,y=m.row*rowH+rowH*.28,w=m.width*colW,h=rowH*.44;
        const spr=spritesRef.current[m.kind==="hazard"?"predator":m.kind];
        if(spr){
          if(m.kind==="hazard"){
            // Solid keyed predator at full opacity — the threat has to read
            // against the green canopy, not dissolve into it.
            const dw=colW*1.25,dh=dw*spr.img.height/spr.img.width;
            const pulse=.22+.14*Math.sin(t/240+m.x*2);
            ctx.fillStyle=`rgba(255,70,45,${pulse})`;
            ctx.beginPath();ctx.ellipse(x+w/2,y+h*.95,dw*.62,rowH*.22,0,0,Math.PI*2);ctx.fill();
            ctx.drawImage(spr.img,x+w/2-dw/2,y+h/2-dh/2,dw,dh);
            const ppx=playerRef.current.x,ppy=playerRef.current.y;
            if(runningRef.current&&ppy===m.row&&Math.abs(ppx+.5-(m.x+m.width/2))<1.7){
              ctx.fillStyle="#ffd2c4";ctx.font=`900 ${Math.max(14,rowH*.5)}px system-ui`;ctx.textAlign="center";
              ctx.fillText("!",x+w/2,y-h*.15);ctx.textAlign="start";
            }
          }else if(m.kind==="branch"){
            // Big obvious safe limb: draw the art's middle band undistorted,
            // with a grounding shadow, a soft safe-glow, and a bright top edge.
            ctx.fillStyle="rgba(130,225,130,.10)";
            ctx.beginPath();ctx.ellipse(x+w/2,y+h*.6,w*.62,rowH*.34,0,0,Math.PI*2);ctx.fill();
            ctx.fillStyle="rgba(0,0,0,.35)";
            ctx.beginPath();ctx.ellipse(x+w/2,y+h*.95,w*.52,h*.32,0,0,Math.PI*2);ctx.fill();
            // Three distinct band slices across the mover — continuous bark,
            // no 3x repetition or seams.
            const sy=spr.img.height*.30,sh=spr.img.height*.35,slices=3;
            const ssw=spr.img.width/slices,segW=w/slices,dh=segW*sh/ssw;
            for(let i=0;i<slices;i++) ctx.drawImage(spr.img,i*ssw,sy,ssw,sh,x+i*segW,y+h/2-dh/2,segW,dh);
            ctx.strokeStyle="rgba(196,232,150,.55)";ctx.lineWidth=Math.max(2,rowH*.07);ctx.lineCap="round";
            ctx.beginPath();ctx.moveTo(x+6,y+h/2-dh*.30);ctx.lineTo(x+w-6,y+h/2-dh*.30);ctx.stroke();
          }else{
            // Vine: safe too — same soft safe-glow so it reads instantly.
            ctx.fillStyle="rgba(130,225,130,.10)";
            ctx.beginPath();ctx.ellipse(x+w/2,y+h*.6,w*.62,rowH*.34,0,0,Math.PI*2);ctx.fill();
            const dh=w*(spr.img.height/spr.img.width);
            ctx.drawImage(spr.img,x,y+h/2-dh/2,w,dh);
          }
        }else if(m.kind==="hazard"){
          ctx.fillStyle="#6d2b27";ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w*.42,h*.36,0,0,Math.PI*2);ctx.fill();
          ctx.fillStyle="#d9b26f";ctx.beginPath();ctx.arc(x+w*.72,y+h*.32,3,0,Math.PI*2);ctx.fill();
        }else{
          ctx.lineCap="round";ctx.strokeStyle=m.kind==="vine"?"#4f8c3b":"#755238";ctx.lineWidth=Math.max(7,h*.45);
          ctx.beginPath();ctx.moveTo(x,y+h*.5);ctx.lineTo(x+w,y+h*.5);ctx.stroke();
          ctx.strokeStyle=m.kind==="vine"?"#87b94e":"#a8794f";ctx.lineWidth=2;ctx.stroke();
          ctx.fillStyle="rgba(111,177,69,.8)";
          for(let j=0;j<3;j++){ctx.beginPath();ctx.ellipse(x+w*(.2+j*.3),y+h*.1+(j%2)*h*.75,8,4,j*.7,0,Math.PI*2);ctx.fill();}
        }
      }

      // Insects: bonus pickups scattered per stage.
      for(const s of insectsRef.current){
        const ix=(s.x+.5)*colW,iy=(s.y+.55)*rowH;
        const pulse=.6+.4*Math.sin(t/350+s.x*1.7+s.y);
        ctx.fillStyle=`rgba(255,190,80,${.28*pulse})`;
        ctx.beginPath();ctx.arc(ix,iy,10,0,Math.PI*2);ctx.fill();
        const bug=spritesRef.current["insect"];
        if(bug){
          const bd=colW*1.05;
          ctx.drawImage(bug.img,ix-bd/2,iy-bd/2,bd,bd);
        }else{
          ctx.fillStyle="#ffcf6e";
          ctx.beginPath();ctx.ellipse(ix,iy,4.2,3,.5,0,Math.PI*2);ctx.fill();
          ctx.fillStyle="#7a4a12";
          ctx.beginPath();ctx.arc(ix+1.5,iy-.5,1.4,0,Math.PI*2);ctx.fill();
        }
      }

      const p=playerRef.current;const px=(p.x+.5)*colW,py=(p.y+.55)*rowH;
      const facing=facingRef.current;
      const mon=spritesRef.current[`monitor-${facing}`];
      const hopAge=(t-hopRef.current)/200;
      const hopS=hopAge<1?1+.22*Math.sin(hopAge*Math.PI):1;
      ctx.fillStyle="rgba(0,0,0,.38)";
      ctx.beginPath();ctx.ellipse(px,py+rowH*.42,colW*.42*(2-hopS),rowH*.13,0,0,Math.PI*2);ctx.fill();
      if(mon){
        // One consistent hero size for every facing: fit the art's subject
        // box into the same square target — no more direction-dependent scale.
        const target=colW*2*hopS;
        const s=target/Math.max(mon.bw,mon.bh);
        const dw=mon.bw*s,dh=mon.bh*s;
        const cy=py-(hopS-1)*rowH*.5;
        ctx.drawImage(mon.img,mon.bx,mon.by,mon.bw,mon.bh,px-dw/2,cy-dh/2,dw,dh);
      }else{
      ctx.save();ctx.translate(px,py);
      const angle=facing==="up"?-Math.PI/2:facing==="down"?Math.PI/2:facing==="left"?Math.PI:0;
      ctx.rotate(angle);
      const s=Math.min(colW/76,rowH/54);
      ctx.scale(s,s);
      // Baby blue tree monitor: long slender body, banded tail, turquoise/black pattern.
      ctx.lineCap="round";ctx.lineJoin="round";
      ctx.strokeStyle="#071314";ctx.lineWidth=8;
      ctx.beginPath();ctx.moveTo(-18,1);ctx.bezierCurveTo(-38,5,-54,19,-61,8);ctx.bezierCurveTo(-68,-3,-53,-15,-43,-10);ctx.stroke();
      ctx.strokeStyle="#59cbd1";ctx.lineWidth=5;
      ctx.beginPath();ctx.moveTo(-18,1);ctx.bezierCurveTo(-38,5,-54,19,-61,8);ctx.bezierCurveTo(-68,-3,-53,-15,-43,-10);ctx.stroke();
      ctx.fillStyle="#58cbd1";ctx.strokeStyle="#071314";ctx.lineWidth=3;
      ctx.beginPath();ctx.ellipse(-4,0,25,10,-.03,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(13,-8);ctx.quadraticCurveTo(31,-10,39,-4);ctx.quadraticCurveTo(42,0,37,4);ctx.quadraticCurveTo(25,9,12,7);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.strokeStyle="#071314";ctx.lineWidth=4;
      for(const yy of [-1,1]) for(const xx of [-1,1]){
        ctx.beginPath();ctx.moveTo(xx<0?-10:7,yy*6);ctx.lineTo((xx<0?-20:17),yy*15);ctx.lineTo((xx<0?-28:25),yy*16);ctx.stroke();
      }
      ctx.strokeStyle="#163c42";ctx.lineWidth=3;
      for(const bx of [-18,-10,-2,6]){ctx.beginPath();ctx.moveTo(bx,-8);ctx.lineTo(bx+3,8);ctx.stroke();}
      ctx.strokeStyle="#173a40";ctx.lineWidth=2;
      for(const tx of [-48,-40,-32]){ctx.beginPath();ctx.moveTo(tx,-4);ctx.lineTo(tx+2,7);ctx.stroke();}
      ctx.fillStyle="#d8edf0";ctx.beginPath();ctx.ellipse(28,-4,4.5,3.6,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#5b3218";ctx.beginPath();ctx.arc(29,-4,2.2,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#0a0b08";ctx.beginPath();ctx.arc(29.5,-4,1.1,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#e9f4dd";ctx.beginPath();ctx.arc(36,-1,1.1,0,Math.PI*2);ctx.fill();
      ctx.restore();
      }

      // Floating score text.
      for(let i=floatersRef.current.length-1;i>=0;i--){
        const f=floatersRef.current[i],age=t-f.t0;
        if(age>900){floatersRef.current.splice(i,1);continue;}
        const fy=(f.gy+.3)*rowH-age/1000*34;
        ctx.globalAlpha=1-age/900;ctx.fillStyle=f.color;
        ctx.font=`900 ${Math.max(13,rowH*.34)}px system-ui`;ctx.textAlign="center";
        ctx.fillText(f.text,f.gx*colW,fy);ctx.textAlign="start";ctx.globalAlpha=1;
      }
      // Particles.
      for(let i=particlesRef.current.length-1;i>=0;i--){
        const pt=particlesRef.current[i],age=t-pt.t0;
        if(age>pt.life){particlesRef.current.splice(i,1);continue;}
        const k=1-age/pt.life;
        pt.gx+=pt.vx*dt;pt.gy+=pt.vy*dt;pt.vy+=3.2*dt;
        ctx.globalAlpha=k;ctx.fillStyle=pt.color;
        ctx.beginPath();ctx.arc(pt.gx*colW,pt.gy*rowH,pt.size*k+0.4,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
      }
      // Death flash / stage-clear flash.
      if(t-dieRef.current<380){ctx.fillStyle=`rgba(210,45,30,${.32*(1-(t-dieRef.current)/380)})`;ctx.fillRect(0,0,W,H);}
      if(t-clearRef.current<500){ctx.fillStyle=`rgba(255,215,120,${.28*(1-(t-clearRef.current)/500)})`;ctx.fillRect(0,0,W,H);}

      raf=requestAnimationFrame(frame);
    };
    raf=requestAnimationFrame(frame);return()=>cancelAnimationFrame(raf);
  },[resetPlayer,advanceStage,syncBest,sfxDie,addFloater,burst]);

  const onTouchStart=(e:React.TouchEvent)=>{const t=e.changedTouches[0];touchRef.current={x:t.clientX,y:t.clientY};};
  const onTouchEnd=(e:React.TouchEvent)=>{const s=touchRef.current;if(!s)return;const t=e.changedTouches[0],dx=t.clientX-s.x,dy=t.clientY-s.y;if(Math.max(Math.abs(dx),Math.abs(dy))<18)return;if(Math.abs(dx)>Math.abs(dy))move(dx>0?1:-1,0);else move(0,dy>0?1:-1);touchRef.current=null;};

  const hudStage=stageOf(level);
  return <main style={{minHeight:"100svh",background:"#030806",color:"#edf7e9",fontFamily:"system-ui,sans-serif",padding:narrow?"10px":"18px"}}>
    <div style={{maxWidth:760,margin:"0 auto"}}>
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"end",gap:12,marginBottom:12}}>
        <div><div style={{fontSize:12,letterSpacing:3,color:"#8ebc77"}}>ARBOREAL PLANET ARCADE · PROTOTYPE</div><h1 style={{margin:"3px 0 0",fontSize:"clamp(28px,6vw,54px)",lineHeight:.95}}>CANOPY CROSSING</h1></div>
        <div style={{textAlign:"right",fontWeight:800,fontSize:14}}>SCORE {score} · BEST {best} · 🪲 {bugs}<br/><span style={{color:"#e2605c"}}>{"♥".repeat(Math.max(0,lives))}</span><br/>STAGE {level}/5 · {hudStage.name.toUpperCase()}<br/><span style={{fontSize:11,color:"#9dc98f",letterSpacing:1}}>{objectiveOf(hudStage)}</span></div>
      </header>
      <div style={{position:"relative"}}>
      <section style={{position:"relative",height:narrow?"min(42svh,400px)":"min(72svh,760px)",minHeight:narrow?300:520,border:"1px solid #315b3a",borderRadius:20,overflow:"hidden",boxShadow:"0 24px 80px rgba(0,0,0,.55)",touchAction:"none"}} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <canvas ref={canvasRef} style={{width:"100%",height:"100%",display:"block"}} aria-label="Canopy Crossing game"/>
        {(running&&message)&&<div style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",width:"min(82%,420px)",padding:22,textAlign:"center",borderRadius:18,background:"rgba(2,10,7,.88)",border:"1px solid rgba(159,213,117,.35)",backdropFilter:"blur(8px)"}}>
          <strong style={{fontSize:20}}>{message}</strong>
        </div>}
      </section>
      {!running&&<div style={{position:"absolute",inset:0,display:"flex",overflowY:"auto",padding:12,borderRadius:20}}>
        <div style={{width:"min(88%,380px)",margin:"auto",padding:narrow?14:22,textAlign:"center",borderRadius:18,background:"rgba(2,10,7,.92)",border:"1px solid rgba(159,213,117,.35)",backdropFilter:"blur(8px)"}}>
          <strong style={{fontSize:narrow?22:30}}>{endKind==="win"?"👑 CROWN CONQUERED":endKind==="gameover"?"THE JUNGLE WINS":"CLIMB THE CANOPY"}</strong>
          {endKind&&<p style={{color:endKind==="win"?"#ffd76e":"#ff9d8f",fontWeight:800,fontSize:narrow?14:16,margin:"8px 0 0"}}>
            {endKind==="win"?"All five crossings complete!":"Out of hearts."} Final score: {score}{best>0&&` · Best: ${best}`}
          </p>}
          <img src="/arcade/canopy-crossing/monitor-up.webp" alt="Baby blue tree monitor" style={{width:endKind?(narrow?84:110):(narrow?104:170),margin:"-6px auto 4px",display:"block",mixBlendMode:"screen"}}/>
          {!endKind&&<p style={{color:"#b9c9b7",lineHeight:1.5,fontSize:narrow?13:16,margin:"6px 0 12px"}}>Guide a baby blue tree monitor through five escalating New Guinea canopy stages. Some climbs end at the crown — others at the far bank. Ride branches and vines, grab insects, dodge predators.</p>}
          {!endKind&&<div style={{display:"flex",flexWrap:"wrap",justifyContent:"center",gap:6,margin:"0 0 14px",fontSize:11,fontWeight:700,color:"#cfe3c9"}}>
            <span style={{border:"1px solid rgba(130,225,130,.5)",borderRadius:999,padding:"3px 9px"}}>🟢 rideable limb</span>
            <span style={{border:"1px solid rgba(255,96,74,.5)",borderRadius:999,padding:"3px 9px"}}>🔴 predator lane</span>
            <span style={{border:"1px solid rgba(255,205,90,.5)",borderRadius:999,padding:"3px 9px"}}>👑 / EXIT = goal</span>
            <span style={{border:"1px solid rgba(255,190,80,.5)",borderRadius:999,padding:"3px 9px"}}>🪲 +25 bonus</span>
          </div>}
          <button onClick={start} style={{border:0,borderRadius:999,padding:"13px 24px",fontWeight:900,fontSize:16,cursor:"pointer",background:"#a8d96f",color:"#10200d"}}>{endKind?"PLAY AGAIN":"START ASCENT"}</button>
        </div>
      </div>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,maxWidth:300,margin:"14px auto 0",userSelect:"none",marginBottom:narrow?"calc(84px + env(safe-area-inset-bottom))":0}}>
        <span/><button onClick={()=>move(0,-1)} style={btn} aria-label="Hop up">▲</button><span/>
        <button onClick={()=>move(-1,0)} style={btn} aria-label="Hop left">◀</button><button onClick={()=>move(0,1)} style={btn} aria-label="Hop down">▼</button><button onClick={()=>move(1,0)} style={btn} aria-label="Hop right">▶</button>
      </div>
      <div style={{display:"flex",justifyContent:"center",gap:8,marginTop:10}}><button onClick={togglePause} style={{...btn,width:110}}>{paused?"RESUME":"PAUSE"}</button><button onClick={toggleMute} style={{...btn,width:64}} aria-label="Toggle sound">{muted?"🔇":"🔊"}</button></div>
      <p style={{textAlign:"center",fontSize:12,color:"#748579"}}>Arrow keys / WASD · swipe on mobile · P/Esc pause · best score saves on device</p>
    </div>
  </main>;
}

const btn:CSSProperties={height:46,borderRadius:12,border:"1px solid #315b3a",background:"#0d1c14",color:"#dcebd6",fontSize:18,fontWeight:900,cursor:"pointer"};
