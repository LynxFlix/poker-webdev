// ════════════════════════════════════════════════════
// app.js — NEON OVERDRIVE Poker Client
// ════════════════════════════════════════════════════
const appEl = document.getElementById('app');

let token    = localStorage.getItem('poker_token')    || null;
let username = localStorage.getItem('poker_username') || null;
let balance  = Number(localStorage.getItem('poker_balance')) || 0;

let socket    = null;
let gameState = null;
let prevLog0  = null;
let prevAct   = null;
let prevComm  = 0;
let prevHand  = 0;

let activeTab   = 'join';
let isSignup    = false;
let peekCards   = true;
let timerIv     = null;
let turnSecs    = 30;
let timerLeft   = 30;

// ── Avatar colours ────────────────────────────────────
const AV_COLS = [
  ['#001A2E','#00D4FF'], ['#1A0028','#D946EF'],
  ['#1A1200','#FFD600'], ['#001A0E','#00E676'],
  ['#200010','#FF1744'], ['#0A001A','#9C27B0'],
  ['#001A18','#00BFA5'],
];
function avStyle(name) {
  const [bg,border] = AV_COLS[(name||'').charCodeAt(0) % AV_COLS.length];
  return `background:${bg};border-color:${border};color:${border};text-shadow:0 0 8px ${border}80;`;
}

// ── Helpers ───────────────────────────────────────────
const RL = {11:'J',12:'Q',13:'K',14:'A'};
const SS = {s:'♠',h:'♥',d:'♦',c:'♣'};
function rl(r){ return RL[r]||String(r); }
function ss(s){ return SS[s]||s; }
function isRed(s){ return s==='h'||s==='d'; }
function esc(s){ if(!s)return''; return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function potTotal(){ if(!gameState?.players)return 0; return gameState.players.reduce((t,p)=>t+p.totalContributed,0); }
function avLetter(n){ return (n||'?')[0].toUpperCase(); }

// ── Seat positions ────────────────────────────────────
const MAPS = {2:[0,4],3:[0,2,6],4:[0,2,4,6],5:[0,1,3,5,7],6:[0,1,3,4,5,7],7:[0,1,2,4,5,6,7],8:[0,1,2,3,4,5,6,7]};
function posClass(i,n){ return `seat-pos-${MAPS[n]?.[i]??i}`; }

// ── Animated bg canvas (particles) ───────────────────
function initBg() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
  resize();
  window.addEventListener('resize', resize);
  const ctx = canvas.getContext('2d');

  const COLS = ['rgba(0,212,255,', 'rgba(217,70,239,', 'rgba(255,214,0,', 'rgba(0,230,118,'];
  const particles = Array.from({length:80},()=>({
    x: Math.random()*window.innerWidth,
    y: Math.random()*window.innerHeight,
    r: 0.4 + Math.random()*1.6,
    vx: (Math.random()-0.5)*0.2,
    vy: (Math.random()-0.5)*0.2,
    col: COLS[~~(Math.random()*COLS.length)],
    op: 0.15+Math.random()*0.35,
  }));

  // Connections
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    particles.forEach(p=>{
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0)p.x=canvas.width;
      if(p.x>canvas.width)p.x=0;
      if(p.y<0)p.y=canvas.height;
      if(p.y>canvas.height)p.y=0;
    });
    // Draw connections
    for(let i=0;i<particles.length;i++){
      for(let j=i+1;j<particles.length;j++){
        const dx=particles[i].x-particles[j].x, dy=particles[i].y-particles[j].y;
        const dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<100){
          ctx.beginPath();
          ctx.strokeStyle=`rgba(0,212,255,${(1-dist/100)*0.06})`;
          ctx.lineWidth=0.5;
          ctx.moveTo(particles[i].x,particles[i].y);
          ctx.lineTo(particles[j].x,particles[j].y);
          ctx.stroke();
        }
      }
    }
    // Draw dots
    particles.forEach(p=>{
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=p.col+p.op+')';
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
}

// ── Audio ─────────────────────────────────────────────
let actx=null;
function getA(){ if(!actx)actx=new (window.AudioContext||window.webkitAudioContext)(); return actx; }
function beep(freq,dur=0.09,type='sine',vol=0.12){
  try{
    const a=getA(),o=a.createOscillator(),g=a.createGain();
    o.connect(g);g.connect(a.destination);
    o.type=type;o.frequency.setValueAtTime(freq,a.currentTime);
    g.gain.setValueAtTime(vol,a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+dur);
    o.start(a.currentTime);o.stop(a.currentTime+dur);
  }catch{}
}
const SFX={
  card:  ()=>{beep(900,0.06,'sine',0.1);setTimeout(()=>beep(1100,0.05,'sine',0.07),55);},
  chip:  ()=>beep(600,0.07,'triangle',0.09),
  fold:  ()=>{beep(300,0.14,'sine',0.12);setTimeout(()=>beep(220,0.1,'sine',0.07),110);},
  check: ()=>beep(720,0.07,'sine',0.09),
  raise: ()=>[500,650,820].forEach((f,i)=>setTimeout(()=>beep(f,0.08,'triangle',0.11),i*55)),
  win:   ()=>[520,660,830,1050].forEach((f,i)=>setTimeout(()=>beep(f,0.14,'sine',0.14),i*80)),
  turn:  ()=>{beep(880,0.1,'sine',0.13);setTimeout(()=>beep(1100,0.1,'sine',0.12),120);},
  tick:  ()=>beep(440,0.04,'square',0.06),
};

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
  const cv=document.getElementById('confetti-canvas');
  if(!cv)return;
  cv.width=window.innerWidth;cv.height=window.innerHeight;
  const ctx=cv.getContext('2d');
  const COLS=['#00D4FF','#D946EF','#FFD600','#00E676','#FF1744','#fff','#E2E8F8'];
  const P=Array.from({length:160},()=>({
    x:Math.random()*cv.width, y:Math.random()*-cv.height,
    w:5+Math.random()*8, h:3+Math.random()*5,
    r:Math.random()*Math.PI*2, dr:(Math.random()-0.5)*0.25,
    vx:(Math.random()-0.5)*2.5, vy:2+Math.random()*3,
    col:COLS[~~(Math.random()*COLS.length)],
  }));
  let fr=0,MAX=250;
  (function tick(){
    ctx.clearRect(0,0,cv.width,cv.height);
    P.forEach(p=>{
      p.x+=p.vx;p.y+=p.vy;p.r+=p.dr;
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.r);
      ctx.fillStyle=p.col;ctx.globalAlpha=Math.max(0,1-fr/MAX);
      ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);ctx.restore();
    });
    if(++fr<MAX)requestAnimationFrame(tick);
    else ctx.clearRect(0,0,cv.width,cv.height);
  })();
}

// ── Timer ─────────────────────────────────────────────
function startTimer(){
  clearTimer();timerLeft=turnSecs;renderTimer();
  timerIv=setInterval(()=>{
    timerLeft--;
    if(timerLeft<=8)SFX.tick();
    if(timerLeft<=0){timerLeft=0;clearTimer();}
    renderTimer();
  },1000);
}
function clearTimer(){if(timerIv){clearInterval(timerIv);timerIv=null;}}
function renderTimer(){
  const pct = (timerLeft/turnSecs*100)+'%';
  const cls  = 'timer-bar-fill'+(timerLeft<=8?' urgent':'');
  const gcls = 'game-timer-fill'+(timerLeft<=8?' urgent':'');
  const b=document.getElementById('tbfill');
  if(!b)return;
  b.style.width=pct;
  b.className=b.classList.contains('game-timer-fill') ? gcls : cls;
}

// ── Event detection ───────────────────────────────────
function detectEvents(s){
  if(s.handNumber>prevHand){toast(`✦ Hand #${s.handNumber} — cards in the air`,'',1800);SFX.card();}
  if(s.community.length>prevComm){
    const L={3:'Flop',4:'Turn',5:'River'}[s.community.length];
    if(L){toast(`🃏 ${L} dealt`,'',1600);SFX.card();}
  }
  const top=s.log?.[0];
  if(top&&top!==prevLog0){
    const lo=top.toLowerCase();
    if(lo.includes('wins'))            {toast(`🏆 ${top}`,'t-win',3500);SFX.win();if(lo.includes(username.toLowerCase()))confetti();}
    else if(lo.includes('all in'))     {toast(`🔥 ${top}`,'t-allin',3000);SFX.raise();}
    else if(lo.includes('raises')||lo.includes('bets')){toast(`💰 ${top}`,'t-raise',2400);SFX.raise();}
    else if(lo.includes('calls'))      {toast(`👁 ${top}`,'',1800);SFX.chip();}
    else if(lo.includes('checks'))     {toast(`✓ ${top}`,'',1400);SFX.check();}
    else if(lo.includes('folds'))      {toast(`🃏 ${top}`,'t-fold',2200);SFX.fold();}
  }
  if(s.actingId!==prevAct&&s.actingId===username&&s.screen==='reveal'){SFX.turn();startTimer();}
  else if(s.actingId!==prevAct){clearTimer();}
  prevHand=s.handNumber;prevComm=s.community.length;prevLog0=top||null;prevAct=s.actingId;
}

// ── Socket ────────────────────────────────────────────
function connectSocket(){
  if(!token)return;
  socket=io({auth:{token}});
  socket.on('connect',()=>console.log('🚀 Connected'));
  socket.on('connect_error',err=>{console.error(err);logout();});
  socket.on('state_update',s=>{
    detectEvents(s);
    gameState=s;
    const me=s.players?.find(p=>p.id===username);
    if(me){balance=me.chips;localStorage.setItem('poker_balance',balance);}
    render();
  });
  socket.on('disconnect',()=>clearTimer());
}
function logout(){
  localStorage.clear();token=null;username=null;balance=0;gameState=null;
  clearTimer();if(socket){socket.disconnect();socket=null;}render();
}
function leaveRoom(){
  if(socket && socket.connected) socket.emit('leave_room');
  gameState=null;
  clearTimer();
  render();
}
function rebuyChips(){
  const sc = gameState?.startingChips || 1000;
  socket.emit('rebuy_chips', { amount: sc }, r => {
    if(r.error) {
      toast('❌ ' + r.error, 't-fold', 2800);
    } else {
      toast('💰 Rebuy successful! +✦ ' + sc, 't-raise', 2800);
      balance = r.newBalance;
      localStorage.setItem('poker_balance', balance);
      SFX.chip();
      render();
    }
  });
}
async function claimTopup(){
  try {
    const res = await fetch('/api/topup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to claim');
    toast('🎁 Claimed 5,000 chips successfully!', 't-raise', 2800);
    balance = data.balance;
    localStorage.setItem('poker_balance', balance);
    SFX.win();
    render();
  } catch(ex) {
    toast('❌ ' + ex.message, 't-fold', 2800);
  }
}

// ════════════════════════════════════════════════════
// Card Builders
// ════════════════════════════════════════════════════
function miniCard(card){
  if(!card) return `<div class="board-slot"></div>`;
  const r=isRed(card.suit);
  return `<div class="board-slot">
    <div class="card-mini${r?' r':''}">
      <span class="cr">${rl(card.rank)}</span>
      <span class="cs">${ss(card.suit)}</span>
    </div>
  </div>`;
}
function tinyCard(card,face=false){
  if(!card||!face) return `<div class="card-mini facedown"></div>`;
  const r=isRed(card.suit);
  return `<div class="card-mini${r?' r':''}">
    <span class="cr">${rl(card.rank)}</span><span class="cs">${ss(card.suit)}</span>
  </div>`;
}
function bigCard(card,hidden=false){
  if(!card||hidden) return `<div class="hand-card back"></div>`;
  const r=isRed(card.suit);
  return `<div class="hand-card${r?' r':''}">
    <div class="hc-top"><span class="hcr">${rl(card.rank)}</span><span class="hcs">${ss(card.suit)}</span></div>
    <div class="hc-mid">${ss(card.suit)}</div>
    <div class="hc-bot"><span class="hcr">${rl(card.rank)}</span><span class="hcs">${ss(card.suit)}</span></div>
  </div>`;
}
function sdCard(card){
  if(!card)return `<div class="sd-mini"></div>`;
  return `<div class="sd-mini${isRed(card.suit)?' r':''}"><span>${rl(card.rank)}</span><span>${ss(card.suit)}</span></div>`;
}

// ════════════════════════════════════════════════════
// Table Builder
// ════════════════════════════════════════════════════
function buildTable(activeId, opts={}){
  const {showAll=false,showMe=false}=opts;
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

    // Role badge
    let rb='';
    if(isDealer)rb='<div class="rb rb-d">D</div>';
    else if(p.id===sbId)rb='<div class="rb rb-sb">SB</div>';
    else if(p.id===bbId)rb='<div class="rb rb-bb">BB</div>';

    // Bet float
    const bet=p.currentBet>0?`<div class="bet-float">${p.currentBet}</div>`:'';

    // Hole cards
    let holeHtml='';
    if(!p.folded&&p.holeCards){
      const show=showAll||(isMe&&showMe)||(Array.isArray(p.holeCards)&&p.holeCards[0]&&typeof p.holeCards[0]==='object');
      holeHtml=`<div class="seat-hole">
        ${tinyCard(p.holeCards?.[0],show)}${tinyCard(p.holeCards?.[1],show)}
      </div>`;
    }

    const allInTag=p.allIn?`<span style="font-family:var(--f-mono);font-size:8px;color:#FFAA70;"> ALL IN</span>`:'';
    const offDot=!p.connected?`<span class="dot-offline"></span>`:'';

    return `<div class="${cls}">
      ${bet}
      <div class="seat-av" style="${avStyle(p.name)}">${rb}${avLetter(p.name)}</div>
      <div class="seat-plate">
        <div class="seat-nm">${esc(p.name)}${offDot}</div>
        <div class="seat-chp">✦ ${p.chips}${allInTag}</div>
      </div>
      ${holeHtml}
    </div>`;
  }).join('');

  const boardHtml=[0,1,2,3,4].map(i=>miniCard(gameState.community[i])).join('');
  const street=gameState.street?gameState.street.toUpperCase():'';

  return `<div class="table-scene">
    <div class="table-oval">
      <div class="table-center">
        <div class="tbl-street">${street}</div>
        <div class="pot-holo" id="pot-holo">
          <span class="pot-icon">◈</span>${potTotal()}
        </div>
        <div class="board-row">${boardHtml}</div>
      </div>
    </div>
    ${seatsHtml}
  </div>`;
}

// ════════════════════════════════════════════════════
// AUTH SCREEN
// ════════════════════════════════════════════════════
function renderAuth(){
  appEl.innerHTML=`
  <div style="position:relative;z-index:1;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px;width:100%;max-width:480px;margin:0 auto;animation:screenIn .45s cubic-bezier(.22,1,.36,1);">
    <div class="auth-root" style="width:100%;display:flex;flex-direction:column;align-items:center;">

      <div class="hero-logo">
        <div class="hero-eyebrow">Next-Gen · Real-Time · Texas Hold'em</div>
        <div class="hero-title">POKER<span style="-webkit-text-fill-color:var(--magenta);color:var(--magenta);">.</span>NIGHT</div>
        <div class="hero-suits">
          <span>♠</span><span>♥</span><span>♦</span><span>♣</span>
        </div>
        <div class="hero-sub">Multiplayer • Live • No Download</div>
      </div>

      <div class="auth-card" style="width:100%;max-width:400px;">
        <div class="auth-card-title">${isSignup?'Join the Table':'Sign In'}</div>
        <div class="err-msg" id="aerr"></div>
        <form id="aform">
          <div class="field">
            <label class="f-label">Username</label>
            <input class="f-input" type="text" id="au" placeholder="3–12 characters" minlength="3" maxlength="12" required autocomplete="username">
          </div>
          <div class="field">
            <label class="f-label">Password</label>
            <input class="f-input" type="password" id="ap" placeholder="${isSignup?'Choose a strong password':'Your password'}" required autocomplete="${isSignup?'new-password':'current-password'}">
          </div>
          <button type="submit" class="btn btn-cyan" id="asub" style="margin-top:8px;">
            ${isSignup?'⚡ Create Account &amp; Play':'⚡ Sign In'}
          </button>
        </form>
        <div class="auth-switch">
          ${isSignup
            ?`Already have an account? <span class="switch-link" onclick="window._togAuth(false)">Sign in</span>`
            :`New player? <span class="switch-link" onclick="window._togAuth(true)">Create account</span>`}
        </div>
      </div>
    </div>
  </div>`;

  window._togAuth=v=>{isSignup=v;render();};
  document.getElementById('aform').onsubmit=async e=>{
    e.preventDefault();
    const u=document.getElementById('au').value;
    const p=document.getElementById('ap').value;
    const errEl=document.getElementById('aerr');
    const btn=document.getElementById('asub');
    errEl.style.display='none';btn.disabled=true;btn.textContent='…';
    try{
      const res=await fetch(isSignup?'/api/signup':'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'Failed');
      token=data.token;username=data.username;balance=data.balance;
      localStorage.setItem('poker_token',token);localStorage.setItem('poker_username',username);localStorage.setItem('poker_balance',balance);
      SFX.chip();connectSocket();render();
    }catch(ex){
      errEl.textContent=ex.message;errEl.style.display='block';
      btn.disabled=false;btn.textContent=isSignup?'⚡ Create Account & Play':'⚡ Sign In';
    }
  };
}

// ════════════════════════════════════════════════════
// LOBBY
// ════════════════════════════════════════════════════
function renderLobby(){
  appEl.innerHTML=`
  <div class="screen" style="justify-content:center;min-height:100vh;">
    <div class="lobby-wrap">
      <div class="lobby-header">
        <div>
          <div class="lh-name">◈ &nbsp;${esc(username)}</div>
          <div class="lh-chips">✦ ${balance} chips</div>
        </div>
        <button class="btn-ghost" onclick="logout()">Disconnect</button>
      </div>

      ${balance === 0
        ? `<div style="background:rgba(255,214,0,0.06);border:1px dashed rgba(255,214,0,0.3);border-radius:8px;padding:14px;margin-bottom:14px;text-align:center;">
            <div style="font-size:13px;color:var(--text);margin-bottom:8px;font-weight:600;">⚠️ You are completely out of chips!</div>
            <button class="btn btn-gold" onclick="claimTopup()" style="padding:8px 16px;font-size:13px;font-weight:700;">🎁 Claim Free 5,000 Chips</button>
           </div>`
        : ''}

      <div class="lobby-panel">
        <div class="tab-strip">
          <button class="tab-item${activeTab==='join'?' on':''}" onclick="window._ltab('join')">⬡ &nbsp;Join Room</button>
          <button class="tab-item${activeTab==='create'?' on':''}" onclick="window._ltab('create')">⬡ &nbsp;Create Table</button>
        </div>
        <div class="err-msg" id="lerr"></div>

        ${activeTab==='join'?`
        <form id="lform">
          <div class="field code-field">
            <label class="f-label">Room Code</label>
            <input class="f-input" type="text" id="rc" placeholder="ABCDE" maxlength="5" required autocomplete="off"
              style="text-transform:uppercase;letter-spacing:.22em;font-weight:700;font-size:24px;text-align:center;font-family:var(--f-mono);color:var(--cyan);text-shadow:0 0 10px var(--cyan-glow);">
          </div>
          <button type="submit" class="btn btn-cyan" style="margin-top:10px;">Enter Table →</button>
        </form>
        `:`
        <form id="lform">
          <div class="field">
            <label class="f-label">Starting Stack</label>
            <input class="f-input" type="number" id="sc" value="1000" min="10" step="10">
          </div>
          <div class="two-col">
            <div class="field"><label class="f-label">Small Blind</label><input class="f-input" type="number" id="sb" value="5" min="1"></div>
            <div class="field"><label class="f-label">Big Blind</label><input class="f-input" type="number" id="bb" value="10" min="2"></div>
          </div>
          <button type="submit" class="btn btn-gold" style="margin-top:10px;">🃏 Create Table</button>
        </form>`}
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
      socket.emit('join_room',{code},r=>{if(r.error){errEl.textContent=r.error;errEl.style.display='block';}else SFX.chip();});
    }else{
      socket.emit('create_room',{
        smallBlind:document.getElementById('sb').value,
        bigBlind:document.getElementById('bb').value,
        startingChips:document.getElementById('sc').value,
      },r=>{if(r.error){errEl.textContent=r.error;errEl.style.display='block';}else SFX.chip();});
    }
  };
}

// ════════════════════════════════════════════════════
// GAME
// ════════════════════════════════════════════════════
function renderGame(){
  const me=gameState.players.find(p=>p.id===username);
  const isHost=gameState.creator===username;

  // ── GAME OVER ─────────────────────────────────────
  if(gameState.screen==='gameover'){
    const w=gameState.players.find(p=>p.chips>0)||gameState.players[0];
    const iWin=w?.id===username;
    if(iWin){SFX.win();confetti();}

    const myChips = me?.chips || 0;
    const canRebuy = myChips === 0 && balance >= (gameState.startingChips || 1000);

    appEl.innerHTML=`
    <div class="gameover-root" style="animation:screenIn .45s cubic-bezier(.22,1,.36,1);">
      <div class="go-card">
        <div class="go-emoji">🏆</div>
        <div class="go-over-label">Tournament Champion</div>
        <div class="go-winner-name">${esc(w?.name||'?')}</div>
        <div class="go-sub">${iWin?'🎉 You dominated the table!':esc(w?.name)+' takes it all!'}</div>
        <div class="go-chips">✦ ${w?.chips||0} chips</div>
        <div class="go-divider"></div>

        ${myChips === 0
          ? `<div style="margin-bottom:16px;text-align:center;">
              <div style="font-size:13px;color:var(--text-dim);margin-bottom:8px;">You have run out of chips!</div>
              <div style="font-size:12px;color:var(--gold-text);font-family:var(--f-mono);margin-bottom:12px;">Account Balance: ✦ ${balance}</div>
              <button class="btn btn-gold" onclick="rebuyChips()" style="width:100%;margin-bottom:10px;">💰 Rebuy & Continue (✦ ${gameState.startingChips || 1000})</button>
             </div>`
          : ''}

        <button class="btn btn-cyan" onclick="leaveRoom()" style="width:100%;">⬅ Return to Lobby</button>
      </div>
    </div>`;
    return;
  }

  // ── WAITING ROOM ───────────────────────────────────
  if(gameState.screen==='setup'){
    const listHtml=gameState.players.map(p=>`
      <div class="wait-row">
        <div class="wait-av" style="${avStyle(p.name)}">${avLetter(p.name)}</div>
        <div class="wait-name">${esc(p.name)}</div>
        ${p.id===gameState.creator?'<span class="badge-host">HOST</span>':''}
        ${p.id===username?'<span class="badge-me">YOU</span>':''}
        <div class="wait-chips">✦ ${p.chips}</div>
      </div>`).join('');

    appEl.innerHTML=`
    <div class="screen" style="justify-content:flex-start;padding-top:18px;max-width:720px;">
      <div class="top-strip">
        <span>Room &nbsp;<span class="code-pill">${gameState.code}</span></span>
        <span class="player-pill">${gameState.players.length}/8 Seated</span>
      </div>
      <div style="width:100%;max-width:720px;">
        ${buildTable(null)}
        <div class="ctrl-hud">
          <div style="font-family:var(--f-mono);font-size:12px;color:var(--cyan);text-transform:uppercase;letter-spacing:.12em;opacity:.75;margin-bottom:10px;">Players at the Table</div>
          <div class="wait-list">${listHtml}</div>
          <div class="divider"></div>
          <div style="text-align:center;font-family:var(--f-mono);font-size:14px;color:var(--text-dim);margin-bottom:14px;">
            Blinds <span style="color:var(--cyan)">${gameState.smallBlind}/${gameState.bigBlind}</span>
            &nbsp;·&nbsp; Stack <span style="color:var(--gold-text)">✦${gameState.startingChips}</span>
            &nbsp;·&nbsp; Code: <span style="color:var(--cyan);font-weight:700;letter-spacing:.12em;">${gameState.code}</span>
          </div>
          ${isHost
            ?`<button class="btn btn-gold" id="sbtn" ${gameState.players.length<2?'disabled':''}>${gameState.players.length<2?'Waiting for Players…':'⚡ Deal First Hand'}</button>`
            :`<div class="status-banner status-waiting">Waiting for <strong>${esc(gameState.creator)}</strong> to start the game…</div>`}
          <button onclick="leaveRoom()" class="leave-btn" style="width:100%;margin-top:10px;">⬅ Leave Room</button>
        </div>
      </div>
    </div>`;
    const sb=document.getElementById('sbtn');
    if(sb)sb.onclick=()=>socket.emit('start_game',r=>{if(r.error)toast('❌ '+r.error,'t-fold',2500);});
    return;
  }

  // ── HANDOVER ───────────────────────────────────────
  if(gameState.screen==='handover'){renderHandover();return;}

  // ── ACTIVE HAND ────────────────────────────────────
  if(!me)return;
  const isMyTurn=gameState.actingId===username;
  const toCall=gameState.currentBet-me.currentBet;
  const canCheck=toCall===0;
  const minRaise=gameState.currentBet+gameState.minRaiseIncrement;
  const maxRaise=me.currentBet+me.chips;
  const pot=potTotal();
  const actP=gameState.players.find(p=>p.id===gameState.actingId);
  const initRaise=Math.min(minRaise,maxRaise);

  appEl.innerHTML=`
  <div class="game-screen">

    <!-- Top info strip -->
    <div class="game-top">
      <span>Hand&nbsp;<strong>#${gameState.handNumber}</strong>&nbsp;&nbsp;<span class="code-pill">${gameState.code}</span></span>
      <span style="display:flex;align-items:center;gap:14px;">
        <span><span style="color:var(--text-dim)">${esc(username)}</span>&nbsp;·&nbsp;<span style="color:var(--gold-text);font-weight:700;">✦ ${me.chips}</span></span>
        <button onclick="leaveRoom()" class="leave-btn" title="Leave game">⬅ Leave</button>
      </span>
    </div>

    <!-- Table fills remaining height -->
    <div class="game-table-area">
      ${buildTable(gameState.actingId,{showMe:peekCards})}
    </div>

    <!-- Timer bar -->
    ${isMyTurn?`<div class="game-timer-bar"><div class="game-timer-fill" id="tbfill" style="width:100%"></div></div>`:''}

    <!-- Bottom bar: cards | status | actions -->
    <div class="game-bottom">

      <!-- My hand (left) -->
      <div class="my-hand-dock">
        <div class="mhd-label">Your Hand</div>
        <div class="mhd-cards">
          ${bigCard(me.holeCards?.[0],!peekCards)}
          ${bigCard(me.holeCards?.[1],!peekCards)}
        </div>
        <button class="peek-btn" id="pkbtn">${peekCards?'🙈 Hide':'👁 Peek'}</button>
      </div>

      <!-- Status (center) -->
      <div class="bottom-info">
        ${isMyTurn
          ?`<div class="bi-status myturn">⚡ YOUR TURN${toCall>0?`&nbsp;·&nbsp;<strong>${toCall}</strong> to call&nbsp;·&nbsp;pot <strong>${pot}</strong>`:`&nbsp;·&nbsp;pot <strong>${pot}</strong>`}</div>`
          :`<div class="bi-status">⌛ Waiting for <strong>${esc(actP?.name||'…')}</strong></div>`}
      </div>

      <!-- Action dock (right) — only when it's my turn -->
      ${isMyTurn?`
      <div class="action-dock" id="adock">

        <!-- Raise amount control -->
        <div class="raise-ctrl-box">
          <div class="raise-presets">
            <button class="rp-btn" data-q="min">MIN</button>
            <button class="rp-btn" data-q="half">½ POT</button>
            <button class="rp-btn" data-q="pot">POT</button>
            <button class="rp-btn" data-q="allin">ALL IN</button>
          </div>
          <div class="raise-stepper-row">
            <span class="rs-lbl">${gameState.currentBet>0?'Raise to':'Bet'}</span>
            <div class="rs-spinner">
              <button class="rs-spin-btn" id="rs-up" title="Increase">▲</button>
              <span class="rs-spin-val" id="rs-val">${initRaise}</span>
              <button class="rs-spin-btn" id="rs-dn" title="Decrease">▼</button>
            </div>
          </div>
        </div>

        <!-- FOLD / CHECK·CALL / RAISE·BET -->
        <div class="action-btns">
          <button class="ab-fold" id="ab-fold">FOLD</button>
          ${canCheck
            ?`<button class="ab-check" id="ab-action">CHECK</button>`
            :`<button class="ab-check" id="ab-action">CALL<small>${toCall}</small></button>`}
          ${me.chips>0
            ?`<button class="ab-raise" id="ab-raise">${gameState.currentBet>0?'RAISE TO':'BET'}<small id="ab-raise-amt">${initRaise}</small></button>`
            :''}
        </div>

      </div>
      `:''}

    </div>
  </div>`;

  document.getElementById('pkbtn').onclick=()=>{peekCards=!peekCards;render();};

  if(isMyTurn){
    let raiseVal = initRaise;
    const step = gameState.bigBlind || 10;
    const rsValEl   = document.getElementById('rs-val');
    const abRaiseAmt = document.getElementById('ab-raise-amt');

    function clampRaise(v){ return Math.max(minRaise, Math.min(maxRaise, v)); }
    function setRaise(v){
      raiseVal = clampRaise(v);
      if(rsValEl)    rsValEl.textContent    = raiseVal;
      if(abRaiseAmt) abRaiseAmt.textContent = raiseVal;
    }

    // Scroll ▲ / ▼ steppers
    const rsUp = document.getElementById('rs-up');
    const rsDn = document.getElementById('rs-dn');
    if(rsUp) rsUp.onclick = () => setRaise(raiseVal + step);
    if(rsDn) rsDn.onclick = () => setRaise(raiseVal - step);

    // Quick presets
    document.querySelectorAll('.rp-btn[data-q]').forEach(b => {
      b.onclick = () => {
        let v;
        if(b.dataset.q==='min')       v = minRaise;
        else if(b.dataset.q==='half') v = gameState.currentBet + Math.round(pot/2);
        else if(b.dataset.q==='pot')  v = gameState.currentBet + pot;
        else                           v = maxRaise;
        setRaise(v);
      };
    });

    // Fold
    const abFold = document.getElementById('ab-fold');
    if(abFold) abFold.onclick = () => { clearTimer(); socket.emit('game_action',{type:'fold'}); };

    // Check / Call
    const abAction = document.getElementById('ab-action');
    if(abAction) abAction.onclick = () => {
      clearTimer();
      socket.emit('game_action',{type: canCheck ? 'check' : 'call'});
    };

    // Raise / Bet
    const abRaise = document.getElementById('ab-raise');
    if(abRaise) abRaise.onclick = () => {
      clearTimer();
      socket.emit('game_action',{
        type: raiseVal >= maxRaise ? 'allin' : (gameState.currentBet > 0 ? 'raise' : 'bet'),
        amount: raiseVal
      });
    };
  }
}

// ════════════════════════════════════════════════════
// HANDOVER
// ════════════════════════════════════════════════════
function renderHandover(){
  const r=gameState.handoverResult;if(!r)return;
  const isHost=gameState.creator===username;

  const potsHtml=r.pots.map((p,i)=>`
    <div class="win-banner">
      <div class="wb-winner">🏆 ${p.winners.map(w=>`${esc(w.name)} +${w.amount}`).join(' · ')}</div>
      <div class="wb-desc">${r.uncontested?'Uncontested — all others folded':`${i===0?'Main':'Side'} pot of ${p.amount}${p.winners[0]?.desc?' · '+p.winners[0].desc:''}`}</div>
    </div>`).join('');

  const showsHtml=r.shows.map(s=>{
    const isW=r.pots.some(p=>p.winners.some(w=>w.name===s.name));
    return `<div class="sd-row${isW?' winner':''}">
      <div>
        <div class="sd-nm">${esc(s.name)}</div>
        <div class="sd-hand">${s.desc}</div>
      </div>
      <div class="sd-cards">${sdCard(s.holeCards?.[0])}${sdCard(s.holeCards?.[1])}</div>
    </div>`;
  }).join('');

  const me=gameState.players.find(p=>p.id===username);
  const myChips=me?.chips || 0;

  appEl.innerHTML=`
  <div class="screen" style="justify-content:flex-start;padding-top:14px;">
    <div class="top-strip">
      <span>Hand <strong>#${gameState.handNumber}</strong> — Result</span>
      <span class="code-pill">${gameState.code}</span>
    </div>
    ${buildTable(null,{showAll:true})}
    <div style="width:100%;max-width:590px;">
      <div class="result-card">
        <div class="result-card-title">Hands Revealed</div>
        ${showsHtml||`<div style="text-align:center;color:var(--text-dim);font-size:13px;padding:8px 0;">No showdown needed</div>`}
        <div class="divider"></div>
        ${potsHtml}
      </div>
      <div class="log-feed">${gameState.log.slice(0,12).map(esc).join('<br>')}</div>

      ${myChips === 0
        ? `<div style="background:rgba(255,214,0,0.06);border:1px dashed rgba(255,214,0,0.3);border-radius:8px;padding:12px;margin-top:14px;text-align:center;">
             <div style="color:var(--gold-text);font-weight:700;font-size:13px;margin-bottom:6px;">⚠️ You have 0 chips! Rebuy now to stay in the game:</div>
             <div style="font-size:11px;color:var(--text-dim);font-family:var(--f-mono);margin-bottom:10px;">Account Balance: ✦ ${balance}</div>
             <div style="display:flex;gap:10px;justify-content:center;">
               <button class="btn btn-gold" onclick="rebuyChips()" style="padding:8px 16px;font-size:13px;">💰 Rebuy (✦ ${gameState.startingChips || 1000})</button>
               <button class="leave-btn" onclick="leaveRoom()">⬅ Leave Room</button>
             </div>
           </div>`
        : (isHost
            ?`<button class="btn btn-cyan" id="nbtn" style="margin-top:14px;">Deal Next Hand →</button>`
            :`<div class="status-banner status-waiting" style="margin-top:14px;">Waiting for host to deal next hand…</div>`)}
    </div>
  </div>`;

  const nb=document.getElementById('nbtn');
  if(nb)nb.onclick=()=>socket.emit('next_hand');
}

// ════════════════════════════════════════════════════
// MASTER RENDER
// ════════════════════════════════════════════════════
function render(){
  if(!token)    {renderAuth();  return;}
  if(!gameState){renderLobby(); return;}
  renderGame();
}

// ── Boot ──────────────────────────────────────────────
initBg();
if(token)connectSocket();
render();
