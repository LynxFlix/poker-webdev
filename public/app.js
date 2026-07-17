// ════════════════════════════════════════════════════
// ROYAL CASINO — Full-Featured Poker Client  v4
// Features: Chat · Hand Meter · Slider · Deal Anim
//           Chip Stacks · Spectator Mode
// ════════════════════════════════════════════════════
const appEl = document.getElementById('app');

let token    = localStorage.getItem('poker_token')    || null;
let username = localStorage.getItem('poker_username') || null;

let socket    = null;
let gameState = null;
let prevLog0  = null;
let prevAct   = null;
let prevComm  = 0;
let prevHand  = 0;

let activeTab    = 'join';
let isSignup     = false;
let peekCards    = true;
let timerIv      = null;
let turnSecs     = 30;
let timerLeft    = 30;
let timerStartedAt = 0;

// Chat state
let chatOpen     = false;
let localChat    = [];   // messages appended in real-time via socket event
let chatUnread   = 0;

// Deal animation flag
let dealAnimating = false;
let dismissJoinPrompt = false;

// Board reveal / tension state
let visibleCommCount = 0;
let revealingBoard   = false;
let seenFirstState   = false;
let prevDealerIndex  = null;

// Ambient sound
let ambientOn    = false;
let ambientNodes = null;

// Slot machine
let slotOpen      = false;
let slotBet       = 20;
let slotSpinning  = false;
let slotReels     = ['🍒','🍒','🍒'];
let slotLastResult = null;

// ── Avatar colours ────────────────────────────────────
const AV_COLS = [
  ['#001A2E','#00D4FF'],['#1A0028','#D946EF'],
  ['#1A1200','#FFD600'],['#001A0E','#00E676'],
  ['#200010','#FF1744'],['#0A001A','#9C27B0'],
  ['#001A18','#00BFA5'],['#1A1000','#FF6F00'],
];
function avStyle(name){
  const [bg,border]=AV_COLS[(name||'').charCodeAt(0)%AV_COLS.length];
  return `background:${bg};border-color:${border};color:${border};`;
}

// ── Helpers ───────────────────────────────────────────
const RL={11:'J',12:'Q',13:'K',14:'A'};
const SS={s:'♠',h:'♥',d:'♦',c:'♣'};
function rl(r){return RL[r]||String(r);}
function ss(s){return SS[s]||s;}
function isRed(s){return s==='h'||s==='d';}
function esc(s){if(!s)return'';return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function potTotal(){if(!gameState?.players)return 0;return gameState.players.reduce((t,p)=>t+p.totalContributed,0);}
function avLetter(n){return(n||'?')[0].toUpperCase();}
function timeAgo(ms){const s=Math.floor((Date.now()-ms)/1000);if(s<60)return s+'s';return Math.floor(s/60)+'m';}

// ── Seat positions ────────────────────────────────────
const MAPS={2:[0,4],3:[0,2,6],4:[0,2,4,6],5:[0,1,3,5,7],6:[0,1,3,4,5,7],7:[0,1,2,4,5,6,7],8:[0,1,2,3,4,5,6,7]};
function posClass(i,n){return `seat-pos-${MAPS[n]?.[i]??i}`;}

// ════════════════════════════════════════════════════
// CLIENT-SIDE HAND EVALUATOR
// ════════════════════════════════════════════════════
function evaluateClientHand(cards){
  if(!cards||cards.length<2)return null;
  const c=cards.filter(Boolean);
  if(c.length<2)return null;

  const ranks=c.map(x=>x.rank);
  const suits=c.map(x=>x.suit);

  const rFreq={};
  ranks.forEach(r=>rFreq[r]=(rFreq[r]||0)+1);
  const counts=Object.values(rFreq).sort((a,b)=>b-a);

  const sFreq={};
  suits.forEach(s=>sFreq[s]=(sFreq[s]||0)+1);
  const flushSuit=Object.entries(sFreq).find(([,v])=>v>=5)?.[0];
  const isFlush=!!flushSuit;

  const uRanks=[...new Set(ranks)].sort((a,b)=>a-b);
  let isStraight=false;
  for(let i=0;i<=uRanks.length-5;i++){
    if(uRanks[i+4]-uRanks[i]===4&&new Set(uRanks.slice(i,i+5)).size===5)isStraight=true;
  }
  if([14,2,3,4,5].every(r=>uRanks.includes(r)))isStraight=true;

  if(isFlush&&isStraight){
    const fc=c.filter(x=>x.suit===flushSuit).map(x=>x.rank).sort((a,b)=>b-a);
    const ufc=[...new Set(fc)];
    let isSF=false;
    for(let i=0;i<=ufc.length-5;i++){if(ufc[i]-ufc[i+4]===4)isSF=true;}
    if([14,2,3,4,5].every(r=>ufc.includes(r)))isSF=true;
    if(isSF){
      if(fc.length>=5&&fc[0]===14&&fc[1]===13&&fc[2]===12&&fc[3]===11&&fc[4]===10)
        return{rank:9,name:'Royal Flush',pct:100,col:'#FFD700',desc:'Unbeatable!'};
      return{rank:8,name:'Straight Flush',pct:94,col:'#FF6F00',desc:'Five consecutive same suit'};
    }
  }
  if(counts[0]===4)return{rank:7,name:'Four of a Kind',pct:88,col:'#D946EF',desc:'Four of the same rank'};
  if(counts[0]===3&&counts[1]===2)return{rank:6,name:'Full House',pct:80,col:'#9C27B0',desc:'Three of a kind + pair'};
  if(isFlush)return{rank:5,name:'Flush',pct:70,col:'#2196F3',desc:'Five of same suit'};
  if(isStraight)return{rank:4,name:'Straight',pct:62,col:'#00BCD4',desc:'Five consecutive cards'};
  if(counts[0]===3)return{rank:3,name:'Three of a Kind',pct:50,col:'#4CAF50',desc:'Three of same rank'};
  if(counts[0]===2&&counts[1]===2)return{rank:2,name:'Two Pair',pct:38,col:'#8BC34A',desc:'Two different pairs'};
  if(counts[0]===2)return{rank:1,name:'Pair',pct:25,col:'#FFC107',desc:'Two of same rank'};
  const high=Math.max(...ranks);
  const pct=Math.round(5+(high-2)/12*15);
  return{rank:0,name:'High Card',pct,col:'#EF5350',desc:`${rl(high)} high`};
}

// Pre-flop heuristic (hole cards only, 2 cards)
function preflopStrength(cards){
  if(!cards||cards.length!==2||!cards[0]||!cards[1])return null;
  const[a,b]=cards;
  const suited=a.suit===b.suit;
  const gap=Math.abs(a.rank-b.rank);
  const hi=Math.max(a.rank,b.rank);
  const lo=Math.min(a.rank,b.rank);
  if(a.rank===b.rank){
    const pct=50+Math.round((a.rank-2)/12*40);
    const nm={14:'Pocket Aces ♠♣',13:'Pocket Kings',12:'Pocket Queens',11:'Pocket Jacks',10:'Pocket Tens'};
    return{name:nm[a.rank]||`Pocket ${rl(a.rank)}s`,pct,col:pct>=70?'#4CAF50':'#FFC107',desc:'Pocket pair — strong start'};
  }
  let pct=8;
  if(hi===14)pct+=15;else if(hi>=12)pct+=10;else if(hi>=10)pct+=5;
  if(lo>=10)pct+=8;
  if(suited)pct+=8;
  if(gap===1)pct+=7;else if(gap===2)pct+=4;
  pct=Math.min(48,Math.max(6,pct));
  const col=pct>=30?'#FFC107':pct>=20?'#FF9800':'#EF5350';
  const s=suited?'Suited ':'';
  return{name:`${s}${rl(hi)}-${rl(lo)}${gap<=2?' Connectors':''}`,pct,col,desc:suited?'Suited — flush potential':'Offsuit'};
}

// ════════════════════════════════════════════════════
// CHIP STACK VISUALIZER
// ════════════════════════════════════════════════════
const DENOMS=[
  {v:1000,bg:'#C9A84C',b:'#8A6020',label:'1K'},
  {v:500, bg:'#7B1FA2',b:'#4A0072',label:'500'},
  {v:100, bg:'#222',   b:'#555',   label:'100'},
  {v:25,  bg:'#2E7D32',b:'#1B5E20',label:'25'},
  {v:5,   bg:'#C62828',b:'#7F0000',label:'5'},
  {v:1,   bg:'#E0E0E0',b:'#9E9E9E',label:'1'},
];
function chipStackHtml(amount,maxStacks=4){
  if(!amount||amount<=0)return'<div class="cs-empty"></div>';
  let chips=[],rem=amount;
  for(const d of DENOMS){
    const n=Math.min(Math.floor(rem/d.v),maxStacks);
    if(n>0){chips.push({...d,n});rem-=n*d.v;}
    if(chips.length>=4)break;
  }
  if(!chips.length)chips=[{...DENOMS[5],n:1}];
  return `<div class="chip-stack-wrap">${chips.map(c=>`<div class="chip-col" title="${c.v} chip">${Array.from({length:c.n},(_,i)=>`<div class="chip-disc" style="background:${c.bg};border-color:${c.b};bottom:${i*3.5}px"></div>`).join('')}</div>`).join('')}</div>`;
}

// ── Animated bg canvas ────────────────────────────────
function initBg(){
  const canvas=document.getElementById('bg-canvas');
  if(!canvas)return;
  const resize=()=>{canvas.width=window.innerWidth;canvas.height=window.innerHeight;};
  resize();window.addEventListener('resize',resize);
  const ctx=canvas.getContext('2d');
  const COLS=['rgba(10,50,25,','rgba(201,168,76,','rgba(30,20,60,','rgba(15,40,20,'];
  const particles=Array.from({length:100},()=>({
    x:Math.random()*window.innerWidth,y:Math.random()*window.innerHeight,
    r:0.4+Math.random()*1.8,vx:(Math.random()-.5)*.25,vy:(Math.random()-.5)*.25,
    col:COLS[~~(Math.random()*COLS.length)],op:.05+Math.random()*.18,
  }));
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;if(p.x<0)p.x=canvas.width;if(p.x>canvas.width)p.x=0;if(p.y<0)p.y=canvas.height;if(p.y>canvas.height)p.y=0;});
    for(let i=0;i<particles.length;i++)for(let j=i+1;j<particles.length;j++){
      const dx=particles[i].x-particles[j].x,dy=particles[i].y-particles[j].y,d=Math.sqrt(dx*dx+dy*dy);
      if(d<100){ctx.beginPath();ctx.strokeStyle=`rgba(201,168,76,${(1-d/100)*.04})`;ctx.lineWidth=.5;ctx.moveTo(particles[i].x,particles[i].y);ctx.lineTo(particles[j].x,particles[j].y);ctx.stroke();}
    }
    particles.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=p.col+p.op+')';ctx.fill();});
    requestAnimationFrame(draw);
  }
  draw();
}

// ── Audio ─────────────────────────────────────────────
let actx=null;
function getA(){if(!actx)actx=new(window.AudioContext||window.webkitAudioContext)();else if(actx.state==='suspended')actx.resume().catch(()=>{});return actx;}
function beep(freq,dur=.09,type='sine',vol=.12){
  try{const a=getA(),o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.type=type;o.frequency.setValueAtTime(freq,a.currentTime);g.gain.setValueAtTime(vol,a.currentTime);g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+dur);o.start(a.currentTime);o.stop(a.currentTime+dur);}catch{}
}
const SFX={
  card:  ()=>{beep(900,.06,'sine',.1);setTimeout(()=>beep(1100,.05,'sine',.07),55);},
  chip:  ()=>beep(600,.07,'triangle',.09),
  fold:  ()=>{beep(300,.14,'sine',.12);setTimeout(()=>beep(220,.1,'sine',.07),110);},
  check: ()=>beep(720,.07,'sine',.09),
  raise: ()=>[500,650,820].forEach((f,i)=>setTimeout(()=>beep(f,.08,'triangle',.11),i*55)),
  win:   ()=>[520,660,830,1050].forEach((f,i)=>setTimeout(()=>beep(f,.14,'sine',.14),i*80)),
  turn:  ()=>{beep(880,.1,'sine',.13);setTimeout(()=>beep(1100,.1,'sine',.12),120);},
  tick:  ()=>beep(440,.04,'square',.06),
  urgent:()=>{beep(800,.08,'square',.15);setTimeout(()=>beep(600,.08,'square',.12),100);},
  chat:  ()=>beep(880,.06,'sine',.07),
  reel:  ()=>beep(280+Math.random()*180,.04,'square',.05),
  slotwin: ()=>[500,700,900,1200].forEach((f,i)=>setTimeout(()=>beep(f,.12,'sine',.13),i*70)),
  slotlose:()=>{beep(220,.12,'sine',.08);setTimeout(()=>beep(160,.14,'sine',.06),90);},
};

// ── Ambient table sound (procedural, no audio files) ───
function startAmbient(){
  if(ambientNodes||!ambientOn)return;
  try{
    const a=getA();
    const bufSize=2*a.sampleRate;
    const buffer=a.createBuffer(1,bufSize,a.sampleRate);
    const data=buffer.getChannelData(0);
    let lastOut=0;
    for(let i=0;i<bufSize;i++){
      const white=Math.random()*2-1;
      lastOut=(lastOut+0.015*white)/1.015;
      data[i]=lastOut*3.5;
    }
    const noise=a.createBufferSource();
    noise.buffer=buffer;noise.loop=true;
    // Two-stage lowpass to keep this a soft low rumble, not a hiss
    const f1=a.createBiquadFilter();f1.type='lowpass';f1.frequency.value=280;f1.Q.value=0.4;
    const f2=a.createBiquadFilter();f2.type='lowpass';f2.frequency.value=180;f2.Q.value=0.4;
    const gain=a.createGain();gain.gain.value=0.005;
    noise.connect(f1);f1.connect(f2);f2.connect(gain);gain.connect(a.destination);
    noise.start();
    const iv=setInterval(()=>{
      if(ambientOn&&Math.random()<0.2)beep(1200+Math.random()*400,.02,'triangle',.008);
    },3400);
    ambientNodes={noise,gain,iv};
  }catch{}
}
function stopAmbient(){
  if(!ambientNodes)return;
  try{ambientNodes.noise.stop();}catch{}
  clearInterval(ambientNodes.iv);
  ambientNodes=null;
}
function toggleAmbient(){
  ambientOn=!ambientOn;
  if(ambientOn)startAmbient();else stopAmbient();
  render();
}

// ── Toast ─────────────────────────────────────────────
function toast(msg,cls='',ms=2800){
  const rack=document.getElementById('toast-rack');
  if(!rack)return;
  const t=document.createElement('div');
  t.className=`toast ${cls}`;t.textContent=msg;
  rack.appendChild(t);
  setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),300);},ms);
}

// ── Confetti ──────────────────────────────────────────
function confetti(){
  const cv=document.getElementById('confetti-canvas');if(!cv)return;
  cv.width=window.innerWidth;cv.height=window.innerHeight;
  const ctx=cv.getContext('2d');
  const COLS=['#C9A84C','#E8C96A','#F5E0A0','#fff','#3DBE7A','#5BC4D8','#E84057'];
  const P=Array.from({length:180},()=>({x:Math.random()*cv.width,y:Math.random()*-cv.height,w:5+Math.random()*10,h:3+Math.random()*6,r:Math.random()*Math.PI*2,dr:(Math.random()-.5)*.3,vx:(Math.random()-.5)*3,vy:2+Math.random()*4,col:COLS[~~(Math.random()*COLS.length)]}));
  let fr=0,MAX=280;
  (function tick(){ctx.clearRect(0,0,cv.width,cv.height);P.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.r+=p.dr;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.r);ctx.fillStyle=p.col;ctx.globalAlpha=Math.max(0,1-fr/MAX);ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);ctx.restore();});if(++fr<MAX)requestAnimationFrame(tick);else ctx.clearRect(0,0,cv.width,cv.height);})();
}

// ── Timer ─────────────────────────────────────────────
function startTimer(){
  clearTimer();
  const ts=gameState?.turnTimeoutMs||30000;
  turnSecs=Math.ceil(ts/1000);timerLeft=turnSecs;timerStartedAt=Date.now();
  renderTimer();
  timerIv=setInterval(()=>{
    timerLeft=Math.max(0,turnSecs-Math.floor((Date.now()-timerStartedAt)/1000));
    if(timerLeft<=8)SFX.tick();
    if(timerLeft<=5&&timerLeft>0)SFX.urgent();
    if(timerLeft<=0)clearTimer();
    renderTimer();
  },1000);
}
function clearTimer(){if(timerIv){clearInterval(timerIv);timerIv=null;}}
function renderTimer(){
  const pct=(timerLeft/turnSecs*100)+'%';
  const urgent=timerLeft<=8;
  const b=document.getElementById('tbfill');
  if(b){b.style.width=pct;b.className='game-timer-fill'+(urgent?' urgent':'');}
  const seatBar=document.getElementById('seat-timer-bar');
  if(seatBar){seatBar.style.width=pct;seatBar.className='seat-timer-fill'+(urgent?' urgent':'');}
  const seatVal=document.getElementById('seat-timer-val');
  if(seatVal)seatVal.textContent=timerLeft+'s';
}

// ── Deal Animation ────────────────────────────────────
function triggerDealAnimation(){
  dealAnimating=true;
  const scene=document.getElementById('table-scene');
  if(scene){scene.classList.add('dealing');setTimeout(()=>{scene.classList.remove('dealing');dealAnimating=false;},900);}
}
function sequentialDealSound(s){
  const inHand=(s.players||[]).filter(p=>p.chips>0||p.holeCards?.length===2).length||s.players.length;
  const total=Math.max(inHand*2,2);
  let n=0;
  const iv=setInterval(()=>{
    SFX.card();
    if(++n>=total)clearInterval(iv);
  },90);
}

// ── Flying chip (seat → pot) ───────────────────────────
function flyChip(pid){
  const seatEl=document.querySelector(`.seat[data-pid="${pid}"] .seat-av`);
  const potEl=document.getElementById('pot-holo');
  const sceneEl=document.getElementById('table-scene');
  if(!seatEl||!potEl||!sceneEl)return;
  const sceneRect=sceneEl.getBoundingClientRect();
  const seatRect=seatEl.getBoundingClientRect();
  const potRect=potEl.getBoundingClientRect();
  const chip=document.createElement('div');
  chip.className='flying-chip';
  chip.style.left=(seatRect.left-sceneRect.left+seatRect.width/2-9)+'px';
  chip.style.top=(seatRect.top-sceneRect.top+seatRect.height/2-9)+'px';
  sceneEl.appendChild(chip);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    chip.style.left=(potRect.left-sceneRect.left+potRect.width/2-9)+'px';
    chip.style.top=(potRect.top-sceneRect.top+potRect.height/2-9)+'px';
    chip.style.opacity='0.2';
    chip.style.transform='scale(.55) rotate(160deg)';
  }));
  setTimeout(()=>chip.remove(),680);
}
function flyChipForLog(logText,s){
  const p=(s.players||[]).find(pl=>logText.startsWith(pl.name+' '));
  if(p)flyChip(p.id);
}

// ── Flying dealer button (old seat → new seat) ─────────
function flyDealerButton(fromIdx,toIdx){
  const scene=document.getElementById('table-scene');
  if(!scene)return;
  const seats=scene.querySelectorAll('.seat');
  const fromAv=seats[fromIdx]?.querySelector('.seat-av');
  const toAv=seats[toIdx]?.querySelector('.seat-av');
  if(!fromAv||!toAv)return;
  const sceneRect=scene.getBoundingClientRect();
  const fr=fromAv.getBoundingClientRect(),tr=toAv.getBoundingClientRect();
  const btn=document.createElement('div');
  btn.className='flying-dealer-btn';
  btn.textContent='D';
  btn.style.left=(fr.left-sceneRect.left+fr.width-10)+'px';
  btn.style.top=(fr.top-sceneRect.top+fr.height-10)+'px';
  scene.appendChild(btn);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    btn.style.left=(tr.left-sceneRect.left+tr.width-10)+'px';
    btn.style.top=(tr.top-sceneRect.top+tr.height-10)+'px';
  }));
  setTimeout(()=>btn.remove(),700);
}

// ── Event detection ───────────────────────────────────
function handleLogEvent(top,s){
  if(!top)return;
  const lo=top.toLowerCase();
  if(lo.includes('🎰')||lo.includes('spins'))return; // handled directly by spinSlots()
  if(lo.includes('wins'))          {toast(`🏆 ${top}`,'t-win',3500);SFX.win();if(lo.includes(username.toLowerCase()))confetti();}
  else if(lo.includes('all in'))   {toast(`🔥 ${top}`,'t-allin',3000);SFX.raise();flyChipForLog(top,s);}
  else if(lo.includes('raises')||lo.includes('bets')){toast(`💰 ${top}`,'t-raise',2400);SFX.raise();flyChipForLog(top,s);}
  else if(lo.includes('calls'))    {toast(`👁 ${top}`,'',1800);SFX.chip();flyChipForLog(top,s);}
  else if(lo.includes('checks'))   {toast(`✓ ${top}`,'',1400);SFX.check();}
  else if(lo.includes('folds'))    {toast(`🃏 ${top}`,'t-fold',2200);SFX.fold();}
  else if(lo.includes('expired'))  {toast(`⏰ ${top}`,'t-fold',2500);}
  else if(lo.includes('left the room')) {toast(`🚪 ${top}`,'t-fold',3000);}
  else if(lo.includes('disconnected'))  {toast(`⚡ ${top}`,'t-fold',3000);}
  else if(lo.includes('rabbit'))   {toast(`🐇 ${top}`,'',3000);}
}

function detectEvents(s){
  if(!seenFirstState){
    seenFirstState=true;
    visibleCommCount=s.community.length;
    prevHand=s.handNumber;prevComm=s.community.length;
    prevLog0=s.log?.[0]||null;prevAct=s.actingId;prevDealerIndex=s.dealerIndex;
    startAmbient();
    return;
  }

  if(s.handNumber>prevHand){
    dismissJoinPrompt=false;
    toast(`✦ Hand #${s.handNumber}`,'',1800);
    sequentialDealSound(s);
    triggerDealAnimation();
    visibleCommCount=0;
    if(prevDealerIndex!=null&&s.dealerIndex!==prevDealerIndex)flyDealerButton(prevDealerIndex,s.dealerIndex);
    // small/big blind chips sliding in
    const ring=s.ring||[],n=s.players.length;
    const sbId=ring[n===2?0:1],bbId=ring[n===2?1:2];
    if(sbId)setTimeout(()=>flyChip(sbId),380);
    if(bbId)setTimeout(()=>flyChip(bbId),540);
  }

  const top=s.log?.[0]||null;
  const isNewLog=top&&top!==prevLog0;
  const fastForward=s.screen==='handover'&&s.community.length>visibleCommCount&&s.community.length>prevComm;

  if(fastForward){
    revealingBoard=true;
    toast('🔥 ALL IN — running it out…','t-allin',2400);
    SFX.raise();
    const target=s.community.length;
    const step=()=>{
      visibleCommCount++;
      SFX.card();
      render();
      if(visibleCommCount<target){
        setTimeout(step,1050);
      }else{
        revealingBoard=false;
        if(isNewLog)handleLogEvent(top,s);
        render();
      }
    };
    setTimeout(step,650);
  }else{
    if(s.community.length>visibleCommCount){
      const L={3:'Flop',4:'Turn',5:'River'}[s.community.length];
      if(L){toast(`🃏 ${L}`,'',1400);SFX.card();}
    }
    visibleCommCount=s.community.length;
    if(isNewLog)handleLogEvent(top,s);
  }

  if(s.actingId!==prevAct&&s.actingId===username&&s.screen==='reveal'){SFX.turn();startTimer();}
  else if(s.actingId!==prevAct){clearTimer();}
  prevHand=s.handNumber;prevComm=s.community.length;prevLog0=top;prevAct=s.actingId;prevDealerIndex=s.dealerIndex;
}

// ════════════════════════════════════════════════════
// CHAT
// ════════════════════════════════════════════════════
function toggleChat(){
  chatOpen=!chatOpen;
  chatUnread=0;
  const panel=document.getElementById('chat-panel');
  const btn=document.getElementById('chat-btn');
  const badge=document.getElementById('chat-badge');
  if(panel){panel.classList.toggle('open',chatOpen);if(chatOpen)setTimeout(()=>{const i=document.getElementById('chat-input');if(i)i.focus();},100);}
  if(btn)btn.classList.toggle('active',chatOpen);
  if(badge)badge.textContent='';
}
function sendChat(){
  const inp=document.getElementById('chat-input');
  if(!inp)return;
  const text=inp.value.trim();
  if(!text||!socket)return;
  socket.emit('chat_message',{text});
  inp.value='';
}
function appendChatMsg(msg){
  localChat.unshift(msg);
  if(localChat.length>60)localChat.pop();
  const feed=document.getElementById('chat-feed');
  if(feed){
    const isMe=msg.user===username;
    const div=document.createElement('div');
    div.className='cm'+(isMe?' me':'');
    div.innerHTML=`<span class="cm-nm">${esc(msg.user)}</span><span class="cm-txt">${esc(msg.text)}</span>`;
    feed.prepend(div);
  }
  if(!chatOpen){
    chatUnread++;
    const badge=document.getElementById('chat-badge');
    if(badge)badge.textContent=chatUnread>9?'9+':chatUnread;
    SFX.chat();
  }
}

function chatPanelHtml(messages){
  const msgs=(messages||[]).slice(0,50);
  return `<div class="chat-panel" id="chat-panel">
    <div class="chat-hdr">
      <span>💬 Table Chat</span>
      <button class="chat-close" onclick="toggleChat()">✕</button>
    </div>
    <div class="chat-feed" id="chat-feed">
      ${msgs.map(m=>{const isMe=m.user===username;return`<div class="cm${isMe?' me':''}"><span class="cm-nm">${esc(m.user)}</span><span class="cm-txt">${esc(m.text)}</span></div>`;}).join('')}
    </div>
    <div class="chat-input-row">
      <input class="chat-input" id="chat-input" placeholder="Say something…" maxlength="120" autocomplete="off">
      <button class="chat-send" onclick="sendChat()">↑</button>
    </div>
  </div>`;
}

function chatBtnHtml(){
  return `<button class="chat-btn${chatOpen?' active':''}" id="chat-btn" onclick="toggleChat()" title="Chat">
    💬<span class="chat-badge" id="chat-badge">${chatUnread>0?(chatUnread>9?'9+':chatUnread):''}</span>
  </button>`;
}

// ════════════════════════════════════════════════════
// HAND STRENGTH METER
// ════════════════════════════════════════════════════
function handMeterHtml(me,community){
  const hole=me?.holeCards;
  if(!hole||!Array.isArray(hole)||hole.length<2||!hole[0])return'';
  const all=[...hole,...(community||[])].filter(Boolean);
  let ev;
  if(all.length<3){ev=preflopStrength(hole);}
  else{ev=evaluateClientHand(all);}
  if(!ev)return'';
  return `<div class="hand-meter">
    <div class="hm-label">
      <span class="hm-name" style="color:${ev.col}">${ev.name}</span>
      <span class="hm-desc">${ev.desc}</span>
    </div>
    <div class="hm-track">
      <div class="hm-fill" style="width:${ev.pct}%;background:${ev.col}"></div>
    </div>
    <div class="hm-ranks">
      ${['High Card','Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Str. Flush','Royal'].map((n,i)=>`<span class="hm-rank${ev.rank>=i?' active':''}" title="${n}">${n.split(' ')[0]}</span>`).join('')}
    </div>
  </div>`;
}

// ── Socket ────────────────────────────────────────────
function connectSocket(){
  if(!token)return;
  socket=io({auth:{token}});
  socket.on('connect',()=>console.log('🚀 Connected'));
  socket.on('connect_error',err=>{console.error(err);logout();});
  socket.on('state_update',s=>{
    detectEvents(s);
    // Sync localChat from server on first load
    if(localChat.length===0&&s.chatMessages?.length>0)localChat=[...s.chatMessages];
    gameState=s;
    // While the local slot-spin animation is playing, skip the full
    // re-render here — the server resolves + broadcasts the spin result
    // almost instantly, well before our ~1s fake spin animation ends.
    // Rendering immediately was tearing down and remounting the whole
    // modal mid-spin (visible as a flash between the table and the
    // slot screen). gameState is still updated above so nothing is lost;
    // spinSlots()'s own finish() callback renders the final state once
    // the animation completes.
    if(slotSpinning)return;
    render();
  });
  socket.on('chat_message',msg=>{appendChatMsg(msg);});
  socket.on('disconnect',()=>clearTimer());
}
function logout(){
  localStorage.clear();token=null;username=null;gameState=null;
  clearTimer();if(socket){socket.disconnect();socket=null;}render();
}
function leaveRoom(){
  if(socket&&socket.connected)socket.emit('leave_room');
  gameState=null;clearTimer();render();
}
function rebuyChips(){
  const sc=gameState?.startingChips||1000;
  socket.emit('rebuy_chips',{},r=>{
    if(r.error)toast('❌ '+r.error,'t-fold',2800);
    else{toast(`💰 Top-up! +✦ ${sc}`,'t-raise',2800);SFX.chip();}
  });
}

// ── Slot machine ──────────────────────────────────────
const SLOT_DISPLAY_SYMS=['🍒','🍋','🍇','🔔','💎','7️⃣'];
function setSlotBet(v){
  const me=gameState?.players?.find(p=>p.id===username);
  const mx=me?me.chips:0;
  slotBet = v==='max' ? mx : Math.max(1,Math.min(Number(v),mx));
  render();
}
function spinSlots(){
  if(slotSpinning||!socket)return;
  const me=gameState?.players?.find(p=>p.id===username);
  if(!me)return;
  if(me.chips<=0){toast('❌ No chips to bet!','t-fold',2500);return;}
  const bet=Math.max(1,Math.min(slotBet,me.chips));
  slotSpinning=true;
  slotLastResult=null;
  render();

  const spinTick=setInterval(()=>{
    slotReels=[0,1,2].map(()=>SLOT_DISPLAY_SYMS[Math.floor(Math.random()*SLOT_DISPLAY_SYMS.length)]);
    SFX.reel();
    // Update only the reel symbols directly instead of re-rendering the
    // whole screen — a full render() here was tearing down and rebuilding
    // the entire game UI (table, chat, action buttons...) 11+ times per
    // second while spinning, causing the whole page to flicker/flash.
    [0,1,2].forEach(i=>{
      const el=document.getElementById('slot-reel-'+i);
      if(el)el.textContent=slotReels[i];
    });
  },90);

  let serverResult=null,serverErr=null,settled=false;
  socket.emit('slot_spin',{bet},(r)=>{
    if(r?.error)serverErr=r.error; else serverResult=r;
  });

  const finish=()=>{
    if(settled)return;
    settled=true;
    clearInterval(spinTick);
    slotSpinning=false;
    if(serverErr){
      toast('❌ '+serverErr,'t-fold',2500);
      render();
      return;
    }
    const r=serverResult;
    slotReels=r.reels;
    slotLastResult={bet:r.bet,payout:r.payout};
    render();
    if(r.payout>r.bet){SFX.slotwin();confetti();toast(`🎰 JACKPOT! +✦${r.payout}`,'t-win',3200);}
    else if(r.payout===r.bet&&r.payout>0){toast('🎰 Push — bet returned','',2000);}
    else{SFX.slotlose();toast('🎰 No luck this time','t-fold',2000);}
  };

  setTimeout(()=>{
    if(serverResult||serverErr){finish();return;}
    // network slower than expected — poll briefly rather than guessing a result
    const wait=setInterval(()=>{
      if(serverResult||serverErr){clearInterval(wait);finish();}
    },100);
  },1050);
}
function slotModalHtml(me){
  if(!slotOpen||!me)return'';
  const maxBet=me.chips;
  const bet=Math.max(0,Math.min(slotBet,maxBet));
  let resultHtml='';
  if(slotLastResult){
    if(slotLastResult.payout>slotLastResult.bet) resultHtml=`<div class="slot-result win">🎉 +✦ ${slotLastResult.payout}</div>`;
    else if(slotLastResult.payout===slotLastResult.bet&&slotLastResult.payout>0) resultHtml=`<div class="slot-result push">↩ Push — bet returned</div>`;
    else resultHtml=`<div class="slot-result lose">💨 No win — bet lost</div>`;
  }
  const presets=[10,25,50,100].map(v=>`<button class="slot-preset" data-v="${v}" ${v>maxBet?'disabled':''}>${v}</button>`).join('');
  return `
  <div class="spec-join-modal-overlay" id="slot-overlay">
    <div class="spec-join-modal slot-modal">
      <div class="sjm-icon">🎰</div>
      <h3>Lucky Slots</h3>
      <div class="slot-reels">
        <div class="slot-reel${slotSpinning?' spinning':''}" id="slot-reel-0">${slotReels[0]}</div>
        <div class="slot-reel${slotSpinning?' spinning':''}" id="slot-reel-1">${slotReels[1]}</div>
        <div class="slot-reel${slotSpinning?' spinning':''}" id="slot-reel-2">${slotReels[2]}</div>
      </div>
      ${resultHtml}
      <div class="slot-legend">🍒×2 · 🍋×3 · 🍇×5 · 🔔×10 · 💎×20 · 7️⃣×50 &nbsp;·&nbsp; 2×🍒 = push</div>
      <div class="slot-bet-row">
        <span class="slot-bet-label">Bet ✦ ${bet}</span>
        <div class="slot-bet-presets">${presets}<button class="slot-preset" data-v="max" ${maxBet<=0?'disabled':''}>MAX</button></div>
      </div>
      <button class="btn btn-gold" id="slot-spin-btn" style="width:100%;margin-top:14px;" ${(slotSpinning||bet<=0)?'disabled':''}>${slotSpinning?'🎰 Spinning…':'🎰 SPIN'}</button>
      <button class="btn-ghost" id="slot-close-btn" style="width:100%;margin-top:8px;" ${slotSpinning?'disabled':''}>Close</button>
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════
// Card Builders
// ════════════════════════════════════════════════════
function communityCard(card,idx=0,ghost=false){
  if(!card)return`<div class="comm-slot empty"><div class="comm-slot-inner"></div></div>`;
  const r=isRed(card.suit);
  return`<div class="comm-slot" style="animation-delay:${idx*0.08}s">
    <div class="comm-card${r?' r':''}${ghost?' ghost':''}">
      <div class="cc-top"><span class="cc-rank">${rl(card.rank)}</span><span class="cc-suit">${ss(card.suit)}</span></div>
      <div class="cc-center">${ss(card.suit)}</div>
      <div class="cc-bot"><span class="cc-rank">${rl(card.rank)}</span><span class="cc-suit">${ss(card.suit)}</span></div>
    </div>
  </div>`;
}
function tinyCard(card,face=false,delay=0){
  if(!card||!face)return`<div class="card-mini facedown"></div>`;
  const r=isRed(card.suit);
  return`<div class="card-mini${r?' r':''}" style="animation-delay:${delay}s">
    <span class="cr">${rl(card.rank)}</span><span class="cs">${ss(card.suit)}</span>
  </div>`;
}
function bigCard(card,hidden=false){
  if(!card||hidden)return`<div class="hand-card back"></div>`;
  const r=isRed(card.suit);
  return`<div class="hand-card${r?' r':''}">
    <div class="hc-top"><span class="hcr">${rl(card.rank)}</span><span class="hcs">${ss(card.suit)}</span></div>
    <div class="hc-mid">${ss(card.suit)}</div>
    <div class="hc-bot"><span class="hcr">${rl(card.rank)}</span><span class="hcs">${ss(card.suit)}</span></div>
  </div>`;
}
function sdCard(card){
  if(!card)return`<div class="sd-mini"></div>`;
  return`<div class="sd-mini${isRed(card.suit)?' r':''}"><span>${rl(card.rank)}</span><span>${ss(card.suit)}</span></div>`;
}

// ════════════════════════════════════════════════════
// TABLE BUILDER (with chip stacks)
// ════════════════════════════════════════════════════
function buildTable(activeId,opts={}){
  const{showAll=false,showMe=false}=opts;
  const n=gameState.players.length;
  const ring=gameState.ring||[];
  const sbId=ring[n===2?0:1];
  const bbId=ring[n===2?1:2];

  const seatsHtml=gameState.players.map((p,i)=>{
    const pc=posClass(i,n);
    const isMe=p.id===username;
    const isAct=p.id===activeId&&!p.folded;
    const isDealer=i===gameState.dealerIndex;
    let cls=`seat ${pc}`;
    if(p.folded)cls+=' folded';
    else if(p.allIn)cls+=' allin';
    else if(isAct)cls+=' active';
    if(isMe)cls+=' is-me';

    let rb='';
    if(isDealer)rb='<div class="rb rb-d">D</div>';
    else if(p.id===sbId)rb='<div class="rb rb-sb">SB</div>';
    else if(p.id===bbId)rb='<div class="rb rb-bb">BB</div>';

    const bet=p.currentBet>0?`<div class="bet-float">${p.currentBet}</div>`:'';

    let holeHtml='';
    if(!p.folded&&p.holeCards){
      const show=showAll||(isMe&&showMe)||(Array.isArray(p.holeCards)&&p.holeCards[0]&&typeof p.holeCards[0]==='object');
      holeHtml=`<div class="seat-hole">${tinyCard(p.holeCards?.[0],show,.05)}${tinyCard(p.holeCards?.[1],show,.12)}</div>`;
    }

    // Timer bar — below nameplate
    let timerBarHtml='';
    if(isAct&&activeId&&!showAll){
      const pct=(timerLeft/turnSecs*100);
      const urgent=timerLeft<=8;
      timerBarHtml=`<div class="seat-timer-wrap">
        <div class="seat-timer-track"><div id="seat-timer-bar" class="seat-timer-fill${urgent?' urgent':''}" style="width:${pct}%"></div></div>
        <span id="seat-timer-val" class="seat-timer-val${urgent?' urgent':''}">${timerLeft}s</span>
      </div>`;
    }

    const allInTag=p.allIn?`<span class="allin-tag">ALL IN</span>`:'';
    const offDot=!p.connected?`<span class="dot-offline"></span>`:'';
    const chips=chipStackHtml(p.chips,3);

    return`<div class="${cls}" data-pid="${p.id}">
      ${bet}
      <div class="seat-av" style="${avStyle(p.name)}">${rb}${avLetter(p.name)}</div>
      <div class="seat-plate">
        <div class="seat-nm">${esc(p.name)}${offDot}</div>
        <div class="seat-chips-row">
          ${chips}
          <span class="seat-chp">✦ ${p.chips}${allInTag}</span>
        </div>
        ${timerBarHtml}
      </div>
      ${holeHtml}
    </div>`;
  }).join('');

  const showCount=Math.min(visibleCommCount,gameState.community.length);
  const rabbit=(gameState.screen==='handover'&&gameState.handoverResult?.rabbitCards)||null;
  const boardHtml=[0,1,2,3,4].map(i=>{
    if(i<showCount&&gameState.community[i])return communityCard(gameState.community[i],i);
    if(rabbit){
      const rIdx=i-gameState.community.length;
      if(rIdx>=0&&rIdx<rabbit.length)return communityCard(rabbit[rIdx],i,true);
    }
    return communityCard(null,i);
  }).join('');
  const rabbitLabel=rabbit?`<div class="rabbit-label">🐇 What could've been</div>`:'';
  const street=gameState.street?gameState.street.toUpperCase():'';
  const pot=potTotal();

  // Spectators strip
  const specs=gameState.spectators||[];
  const specHtml=specs.length?`<div class="spectator-strip">👁 ${specs.map(s=>`<span class="spec-name${!s.connected?' offline':''}">${esc(s.name)}</span>`).join('')} watching</div>`:'';

  return`<div class="table-scene" id="table-scene">
    <div class="table-oval">
      <div class="table-center">
        <div class="tbl-street">${revealingBoard?'🔥 RUNNING IT OUT':street}</div>
        <div class="pot-holo" id="pot-holo">
          <span class="pot-icon">◈</span><span class="pot-amount">${pot}</span>
        </div>
        <div class="community-row">${boardHtml}</div>
        ${rabbitLabel}
      </div>
    </div>
    ${seatsHtml}
  </div>${specHtml}`;
}

// ════════════════════════════════════════════════════
// AUTH SCREEN
// ════════════════════════════════════════════════════
function renderAuth(){
  appEl.innerHTML=`
  <div class="auth-screen">
    <div class="auth-root">
      <div class="hero-logo">
        <div class="hero-eyebrow">Next-Gen · Real-Time · Texas Hold'em</div>
        <div class="hero-title">POKER<span class="hero-dot">.</span>NIGHT</div>
        <div class="hero-suits"><span>♠</span><span class="red">♥</span><span class="red">♦</span><span>♣</span></div>
        <div class="hero-sub">Multiplayer · Live · No Download</div>
      </div>
      <div class="auth-card">
        <div class="auth-card-title">${isSignup?'Create Account':'Welcome Back'}</div>
        <div class="err-msg" id="aerr"></div>
        <form id="aform">
          <div class="field"><label class="f-label">Username</label><input class="f-input" type="text" id="au" placeholder="3–12 characters" minlength="3" maxlength="12" required autocomplete="username"></div>
          <div class="field"><label class="f-label">Password</label><input class="f-input" type="password" id="ap" placeholder="${isSignup?'Choose a password':'Your password'}" required autocomplete="${isSignup?'new-password':'current-password'}"></div>
          <button type="submit" class="btn btn-cyan" id="asub" style="margin-top:8px;">${isSignup?'⚡ Create Account':'⚡ Sign In'}</button>
        </form>
        <div class="auth-switch">${isSignup?`Have an account? <span class="switch-link" onclick="window._togAuth(false)">Sign in</span>`:`New player? <span class="switch-link" onclick="window._togAuth(true)">Create account</span>`}</div>
      </div>
    </div>
  </div>`;
  window._togAuth=v=>{isSignup=v;render();};
  document.getElementById('aform').onsubmit=async e=>{
    e.preventDefault();
    const u=document.getElementById('au').value,p=document.getElementById('ap').value;
    const errEl=document.getElementById('aerr'),btn=document.getElementById('asub');
    errEl.style.display='none';btn.disabled=true;btn.textContent='…';
    try{
      const res=await fetch(isSignup?'/api/signup':'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'Failed');
      token=data.token;username=data.username;
      localStorage.setItem('poker_token',token);localStorage.setItem('poker_username',username);
      SFX.chip();connectSocket();render();
    }catch(ex){
      errEl.textContent=ex.message;errEl.style.display='block';
      btn.disabled=false;btn.textContent=isSignup?'⚡ Create Account':'⚡ Sign In';
    }
  };
}

// ════════════════════════════════════════════════════
// LOBBY
// ════════════════════════════════════════════════════
function renderLobby(){
  appEl.innerHTML=`
  <div class="lobby-screen">
    <div class="lobby-wrap">
      <div class="lobby-header">
        <div class="lh-brand"><span class="lh-suits">♠♥♦♣</span><span class="lh-name">◈ &nbsp;${esc(username)}</span></div>
        <button class="btn-ghost" onclick="logout()">Disconnect</button>
      </div>
      <div class="lobby-panel">
        <div class="tab-strip">
          <button class="tab-item${activeTab==='join'?' on':''}" onclick="window._ltab('join')">⬡ &nbsp;Join Room</button>
          <button class="tab-item${activeTab==='create'?' on':''}" onclick="window._ltab('create')">⬡ &nbsp;Create Table</button>
        </div>
        <div class="err-msg" id="lerr"></div>
        ${activeTab==='join'?`
        <form id="lform">
          <div class="field code-field"><label class="f-label">Room Code</label><input class="f-input code-input" type="text" id="rc" placeholder="ABCDE" maxlength="5" required autocomplete="off"></div>
          <p class="spectate-note">💡 If the game has started, you'll join as a <strong>spectator</strong></p>
          <button type="submit" class="btn btn-cyan" style="margin-top:12px;">Enter Table →</button>
        </form>
        `:`
        <form id="lform">
          <div class="field"><label class="f-label">Starting Stack</label><input class="f-input" type="number" id="sc" value="1000" min="10" step="10"></div>
          <div class="two-col">
            <div class="field"><label class="f-label">Small Blind</label><input class="f-input" type="number" id="sb" value="5" min="1"></div>
            <div class="field"><label class="f-label">Big Blind</label><input class="f-input" type="number" id="bb" value="10" min="2"></div>
          </div>
          <button type="submit" class="btn btn-gold" style="margin-top:12px;">🃏 Create Table</button>
        </form>`}
      </div>
      <div class="lobby-footer">
        <span class="lf-item">⏱ 30s turn timer</span><span class="lf-dot">·</span>
        <span class="lf-item">🃏 Up to 8 players</span><span class="lf-dot">·</span>
        <span class="lf-item">♠ Texas Hold'em</span>
      </div>
    </div>
  </div>`;
  window._ltab=t=>{activeTab=t;render();};
  document.getElementById('lform').onsubmit=e=>{
    e.preventDefault();
    const errEl=document.getElementById('lerr');errEl.style.display='none';
    if(!socket||!socket.connected)connectSocket();
    if(activeTab==='join'){
      const code=document.getElementById('rc').value.toUpperCase().trim();
      socket.emit('join_room',{code},r=>{
        if(r.error){errEl.textContent=r.error;errEl.style.display='block';}
        else{SFX.chip();if(r.spectator)toast('👁 Joined as spectator','',2500);}
      });
    }else{
      socket.emit('create_room',{smallBlind:document.getElementById('sb').value,bigBlind:document.getElementById('bb').value,startingChips:document.getElementById('sc').value},r=>{if(r.error){errEl.textContent=r.error;errEl.style.display='block';}else SFX.chip();});
    }
  };
}

// ════════════════════════════════════════════════════
// GAME SCREEN
// ════════════════════════════════════════════════════
function renderGame(){
  const isSpectator=gameState.isSpectator;
  const me=gameState.players.find(p=>p.id===username);
  const isHost=gameState.creator===username;

  // ── WAITING ROOM ───────────────────────────────────
  if(gameState.screen==='setup'){
    const listHtml=gameState.players.map(p=>`<div class="wait-row">
      <div class="wait-av" style="${avStyle(p.name)}">${avLetter(p.name)}</div>
      <div class="wait-name">${esc(p.name)}</div>
      ${p.id===gameState.creator?'<span class="badge-host">HOST</span>':''}
      ${p.id===username?'<span class="badge-me">YOU</span>':''}
      <div class="wait-chips">✦ ${p.chips}</div>
    </div>`).join('');
    appEl.innerHTML=`
    <div class="screen setup-screen">
      <div class="top-strip">
        <span>Room &nbsp;<span class="code-pill">${gameState.code}</span></span>
        <span class="player-pill">${gameState.players.length}/8 Seated</span>
      </div>
      <div class="setup-layout">
        ${buildTable(null)}
        <div class="ctrl-hud">
          <div class="ctrl-hud-title">Players at the Table</div>
          <div class="wait-list">${listHtml}</div>
          <div class="divider"></div>
          <div class="setup-info">Blinds <span class="info-val cyan">${gameState.smallBlind}/${gameState.bigBlind}</span> &nbsp;·&nbsp; Stack <span class="info-val gold">✦${gameState.startingChips}</span> &nbsp;·&nbsp; Code: <span class="info-val cyan code-em">${gameState.code}</span></div>
          ${isHost?`<button class="btn btn-gold" id="sbtn" ${gameState.players.length<2?'disabled':''}>${gameState.players.length<2?'Waiting for Players…':'⚡ Deal First Hand'}</button>`:`<div class="status-banner status-waiting">Waiting for <strong>${esc(gameState.creator)}</strong> to start…</div>`}
          <button onclick="leaveRoom()" class="leave-btn" style="width:100%;margin-top:10px;">⬅ Leave Room</button>
        </div>
      </div>
    </div>`;
    const sb=document.getElementById('sbtn');
    if(sb)sb.onclick=()=>socket.emit('start_game',r=>{if(r.error)toast('❌ '+r.error,'t-fold',2500);});
    return;
  }

  // ── SPECTATOR VIEW ─────────────────────────────────
  if(isSpectator){renderSpectator();return;}

  // ── ACTIVE HAND / HANDOVER ─────────────────────────
  if(!me)return;
  const isHandover=gameState.screen==='handover';
  const isMyTurn=gameState.actingId===username && !isHandover;
  const toCall=gameState.currentBet-me.currentBet;
  const canCheck=toCall===0;
  const minRaise=gameState.currentBet+gameState.minRaiseIncrement;
  const maxRaise=me.currentBet+me.chips;
  const pot=potTotal();
  const actP=gameState.players.find(p=>p.id===gameState.actingId);
  const initRaise=Math.min(minRaise,maxRaise);
  const step=gameState.bigBlind||10;
  const ts=gameState?.turnTimeoutMs||30000;
  const timerPct=(timerLeft/Math.ceil(ts/1000)*100)+'%';
  const urgent=timerLeft<=8;
  const meter=peekCards?handMeterHtml(me,gameState.community):'';

  const tableActiveId=isHandover?null:gameState.actingId;
  const tableOpts=isHandover?{showAll:true}:{showMe:peekCards};

  appEl.innerHTML=`
  <div class="game-screen">

    <!-- Top strip -->
    <div class="game-top">
      <span class="gt-info">Hand&nbsp;<strong>#${gameState.handNumber}</strong>&nbsp;&nbsp;<span class="code-pill">${gameState.code}</span></span>
      <span class="gt-right">
        <span class="gt-chips"><span class="gt-name">${esc(username)}</span>&nbsp;·&nbsp;<span class="gt-val">✦ ${me.chips}</span></span>
        <button onclick="toggleAmbient()" class="leave-btn" title="Toggle table ambience" style="margin-right:6px;">${ambientOn?'🔊':'🔇'}</button>
        <button onclick="leaveRoom()" class="leave-btn">⬅ Leave</button>
      </span>
    </div>

    <!-- Table -->
    <div class="game-table-area">${buildTable(tableActiveId,tableOpts)}</div>

    <!-- Timer bar -->
    ${isMyTurn?`<div class="game-timer-bar"><div class="game-timer-fill${urgent?' urgent':''}" id="tbfill" style="width:${timerPct}"></div></div>`:''}

    <!-- Bottom bar -->
    <div class="game-bottom">

      <!-- My hand -->
      <div class="my-hand-dock">
        <div class="mhd-label">Your Hand</div>
        <div class="mhd-cards">${bigCard(me.holeCards?.[0],!peekCards)}${bigCard(me.holeCards?.[1],!peekCards)}</div>
        <button class="peek-btn" id="pkbtn">${peekCards?'🙈 Hide':'👁 Peek'}</button>
      </div>

      <!-- Center status + meter -->
      <div class="bottom-info">
        ${isHandover
          ? (() => {
              const r = gameState.handoverResult;
              let winnerText = '';
              if (r && r.pots) {
                winnerText = r.pots.map((p, i) => {
                  return `🏆 ${p.winners.map(w => `${esc(w.name)} wins ${w.amount}${w.desc ? ` (${w.desc})` : ''}`).join(', ')}`;
                }).join(' | ');
              }
              const canHunt = r?.uncontested && me.folded && gameState.community.length<5 && !r.rabbitCards;
              const huntBtn = canHunt ? `<button class="btn btn-cyan" id="rabbit-btn" style="margin-top:10px;padding:8px 18px;font-size:13px;">🐇 Rabbit Hunt</button>` : '';
              return `<div class="bi-status handover-banner">${revealingBoard?'🔥 Running it out…':(winnerText || 'Hand Completed')}</div>${revealingBoard?'':huntBtn}`;
            })()
          : (isMyTurn
            ? `<div class="bi-status myturn">⚡ YOUR TURN${toCall>0?`&nbsp;·&nbsp;<strong>${toCall}</strong> to call`:'&nbsp;·&nbsp;can check'}&nbsp;·&nbsp;pot <strong>${pot}</strong></div>`
            : `<div class="bi-status">⌛ Waiting for <strong>${esc(actP?.name||'…')}</strong></div>`)
        }
        ${isHandover ? '' : meter}
      </div>

      <!-- Actions -->
      ${isMyTurn?`
      <div class="action-dock" id="adock">

        <!-- Raise slider + presets -->
        <div class="raise-ctrl-box">
          <div class="raise-presets">
            <button class="rp-btn" data-q="min">MIN</button>
            <button class="rp-btn" data-q="half">½ POT</button>
            <button class="rp-btn" data-q="pot">POT</button>
            <button class="rp-btn" data-q="allin">ALL IN</button>
          </div>
          <div class="slider-wrap">
            <div class="slider-labels">
              <span>${minRaise}</span>
              <span class="slider-val" id="rs-val">✦ ${initRaise}</span>
              <span>${maxRaise}</span>
            </div>
            <input type="range" class="raise-slider" id="rs-slider"
              min="${minRaise}" max="${maxRaise}" value="${initRaise}" step="${step}">
          </div>
        </div>

        <!-- FOLD / CHECK·CALL / RAISE·BET -->
        <div class="action-btns">
          <button class="ab-fold" id="ab-fold">FOLD</button>
          ${canCheck
            ?`<button class="ab-check" id="ab-action">CHECK</button>`
            :`<button class="ab-check" id="ab-action">CALL<small>✦${toCall}</small></button>`}
          ${me.chips>0?`<button class="ab-raise" id="ab-raise"><span>${gameState.currentBet>0?'RAISE TO':'BET'}</span><small id="ab-raise-amt">✦${initRaise}</small></button>`:''}
        </div>
      </div>
      ` : (isHandover ? `
      <div class="action-dock" id="adock">
        ${me.chips===0 ? `
          <div class="rebuy-box" style="width:100%;">
            <div class="rebuy-label">⚠️ You're out of chips!</div>
            <div class="rebuy-sub">Top up to ✦ ${gameState.startingChips||1000} chips, or leave the room.</div>
            <button class="btn btn-gold" id="topup-btn" style="width:100%;margin-bottom:10px;">🎁 Top Up</button>
            <button class="btn btn-cyan" id="leave-table-btn" style="width:100%;">⬅ Leave Room</button>
          </div>
        ` : (isHost
          ? `<button class="btn btn-gold" id="next-hand-btn" style="padding: 16px 24px; font-size: 16px;">Deal Next Hand →</button>`
          : `<div class="status-banner status-waiting" style="padding: 12px 18px; font-size: 14px;">Waiting for host to start next hand…</div>`
        )}
      </div>
      ` : '')}

    </div>

    <!-- Chat -->
    ${chatPanelHtml(localChat)}
    ${chatBtnHtml()}

    <!-- Slot machine -->
    <button class="slot-fab" id="slot-fab-btn" title="Lucky Slots">🎰</button>
    ${slotModalHtml(me)}
  </div>`;

  // Peek handler
  document.getElementById('pkbtn').onclick=()=>{peekCards=!peekCards;render();};

  // Next Hand handler
  if(isHandover && isHost){
    const nhb=document.getElementById('next-hand-btn');
    if(nhb)nhb.onclick=()=>socket.emit('next_hand');
  }

  // Busted player: top up or leave
  if(isHandover && me.chips===0){
    const tub=document.getElementById('topup-btn');
    if(tub)tub.onclick=()=>rebuyChips();
    const ltb=document.getElementById('leave-table-btn');
    if(ltb)ltb.onclick=()=>leaveRoom();
  }

  // Rabbit hunt
  if(isHandover){
    const rbb=document.getElementById('rabbit-btn');
    if(rbb)rbb.onclick=()=>{socket.emit('rabbit_hunt');rbb.disabled=true;rbb.textContent='🐇 Hunting…';};
  }

  // Slot machine
  const sfab=document.getElementById('slot-fab-btn');
  if(sfab)sfab.onclick=()=>{slotOpen=true;slotLastResult=null;render();};
  if(slotOpen){
    const scb=document.getElementById('slot-close-btn');
    if(scb)scb.onclick=()=>{if(!slotSpinning){slotOpen=false;render();}};
    document.querySelectorAll('.slot-preset').forEach(btn=>{
      btn.onclick=()=>setSlotBet(btn.dataset.v);
    });
    const ssb=document.getElementById('slot-spin-btn');
    if(ssb)ssb.onclick=()=>spinSlots();
  }

  // Action handlers
  if(isMyTurn){
    let raiseVal=initRaise;
    const rsSlider=document.getElementById('rs-slider');
    const rsValEl=document.getElementById('rs-val');
    const abRaiseAmt=document.getElementById('ab-raise-amt');

    function clamp(v){return Math.max(minRaise,Math.min(maxRaise,v));}
    function setRaise(v){
      raiseVal=clamp(v);
      if(rsSlider)rsSlider.value=raiseVal;
      if(rsValEl)rsValEl.textContent='✦ '+raiseVal;
      if(abRaiseAmt)abRaiseAmt.textContent='✦'+raiseVal;
    }

    // Slider input
    if(rsSlider)rsSlider.oninput=()=>setRaise(parseInt(rsSlider.value));

    // Presets
    document.querySelectorAll('.rp-btn[data-q]').forEach(b=>{
      b.onclick=()=>{
        let v;
        if(b.dataset.q==='min')       v=minRaise;
        else if(b.dataset.q==='half') v=gameState.currentBet+Math.round(pot/2);
        else if(b.dataset.q==='pot')  v=gameState.currentBet+pot;
        else                           v=maxRaise;
        setRaise(v);
      };
    });

    const abFold=document.getElementById('ab-fold');
    if(abFold)abFold.onclick=()=>{clearTimer();socket.emit('game_action',{type:'fold'});};
    const abAction=document.getElementById('ab-action');
    if(abAction)abAction.onclick=()=>{clearTimer();socket.emit('game_action',{type:canCheck?'check':'call'});};
    const abRaise=document.getElementById('ab-raise');
    if(abRaise)abRaise.onclick=()=>{
      clearTimer();
      socket.emit('game_action',{type:raiseVal>=maxRaise?'allin':(gameState.currentBet>0?'raise':'bet'),amount:raiseVal});
    };
  }

  // Chat: restore open state & add keyboard handler
  if(chatOpen){
    const panel=document.getElementById('chat-panel');
    if(panel)panel.classList.add('open');
  }
  const cinp=document.getElementById('chat-input');
  if(cinp)cinp.addEventListener('keydown',e=>{if(e.key==='Enter')sendChat();});
}

// ════════════════════════════════════════════════════
// SPECTATOR VIEW
// ════════════════════════════════════════════════════
function renderSpectator(){
  const isHandover=gameState.screen==='handover';
  const pot=potTotal();
  const actP=gameState.players.find(p=>p.id===gameState.actingId);
  const r=gameState.handoverResult;
  let winnerText='';
  if(isHandover && r && r.pots){
    winnerText = r.pots.map((p, i) => {
      return `🏆 ${p.winners.map(w => `${esc(w.name)} wins ${w.amount}${w.desc ? ` (${w.desc})` : ''}`).join(', ')}`;
    }).join(' | ');
  }

  // Check if we should show the modal dialog overlay asking to join
  const showJoinModal = isHandover && !dismissJoinPrompt;

  appEl.innerHTML=`
  <div class="game-screen spectator-mode">
    <div class="game-top">
      <span class="gt-info">👁 <em>Spectating</em>&nbsp;&nbsp;Hand <strong>#${gameState.handNumber}</strong>&nbsp;&nbsp;<span class="code-pill">${gameState.code}</span></span>
      <span class="gt-right"><button onclick="leaveRoom()" class="leave-btn">⬅ Leave</button></span>
    </div>
    <div class="game-table-area">${buildTable(isHandover ? null : gameState.actingId,{showAll:isHandover,showMe:false})}</div>
    <div class="game-bottom spectator-bar">
      <div class="spec-status">
        <div class="spec-watching-badge">👁 Spectating</div>
        <div class="spec-info">
          <span>Pot: <strong>✦${pot}</strong></span>
          <span>Street: <strong>${gameState.street?.toUpperCase()||''}</strong></span>
          ${isHandover ? `<span>${winnerText}</span>` : (actP?`<span>Acting: <strong>${esc(actP.name)}</strong></span>`:'')}
        </div>
        ${isHandover ? `<button class="btn btn-cyan" id="join-p-btn" style="width: auto; padding: 10px 18px; font-size: 13px; margin-left: 14px;">⚡ Join Table</button>` : ''}
      </div>
    </div>

    <!-- Join Dialog Overlay -->
    ${showJoinModal ? `
    <div class="spec-join-modal-overlay">
      <div class="spec-join-modal">
        <div class="sjm-icon">🎰</div>
        <h3>Join the Game?</h3>
        <p>This hand is over. Do you want to sit at the table and play with a starting stack of <strong>✦${gameState.startingChips || 1000}</strong> chips?</p>
        <div class="sjm-btns">
          <button class="btn btn-gold" id="modal-join-btn">⚡ Sit & Play</button>
          <button class="btn-ghost" id="modal-close-btn" style="width: 100%; margin-top: 8px;">Keep Spectating</button>
        </div>
      </div>
    </div>
    ` : ''}

    ${chatPanelHtml(localChat)}
    ${chatBtnHtml()}
  </div>`;

  if(isHandover){
    // Sit & Play button in modal
    const mjb=document.getElementById('modal-join-btn');
    if(mjb){
      mjb.onclick=()=>{
        socket.emit('join_as_player', r => {
          if(r.error) toast('❌ ' + r.error);
          else {
            toast('⚡ You joined the table!', 't-win');
            SFX.chip();
          }
        });
      };
    }

    // Keep Spectating button in modal
    const mcb=document.getElementById('modal-close-btn');
    if(mcb){
      mcb.onclick=()=>{
        dismissJoinPrompt = true;
        render();
      };
    }

    // Standard join button in bottom bar
    const jpb=document.getElementById('join-p-btn');
    if(jpb){
      jpb.onclick=()=>{
        socket.emit('join_as_player', r => {
          if(r.error) toast('❌ ' + r.error);
          else {
            toast('⚡ You joined the table!', 't-win');
            SFX.chip();
          }
        });
      };
    }
  }

  if(chatOpen){const panel=document.getElementById('chat-panel');if(panel)panel.classList.add('open');}
  const cinp=document.getElementById('chat-input');
  if(cinp)cinp.addEventListener('keydown',e=>{if(e.key==='Enter')sendChat();});
}



// ════════════════════════════════════════════════════
// MASTER RENDER
// ════════════════════════════════════════════════════
function render(){
  if(!token)      {renderAuth();  return;}
  if(!gameState)  {renderLobby(); return;}
  renderGame();
}

// ── Boot ──────────────────────────────────────────────
initBg();
if(token)connectSocket();
render();
