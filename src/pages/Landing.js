import React, { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Landing({ user }) {
  const navigate = useNavigate()
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animId, particles = [], phase = 0, pt = 0, lastTs = 0
    let textI = 0, textTimer = 0, finalShown = false
    let planeT = 0, curCity = 0
    let mx = 0.5, my = 0.5

    const cities = [
      { name:'INDIA', x:0.68, y:0.43, couple:'Arjun & Priya', story:'Mumbai to Ahmedabad. Married in 2024.' },
      { name:'UK', x:0.46, y:0.24, couple:'Rohan & Ananya', story:'London NRI found his Delhi match.' },
      { name:'USA', x:0.19, y:0.33, couple:'Vikram & Sneha', story:'New York to Bangalore. Love knows no distance.' },
      { name:'UAE', x:0.60, y:0.41, couple:'Farhan & Zara', story:'Dubai to Hyderabad. Trust brought them together.' },
      { name:'AUSTRALIA', x:0.80, y:0.66, couple:'Dev & Kavya', story:'Sydney to Kerala. Tradition united them.' },
    ]

    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight }
    resize()
    window.addEventListener('resize', resize)
    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect()
      mx = (e.clientX - r.left) / canvas.width
      my = (e.clientY - r.top) / canvas.height
    })

    particles = Array.from({length:100}, () => ({
      x: Math.random(), y: Math.random(),
      r: Math.random()*1.2+0.3,
      vy: -(Math.random()*0.00012+0.00006),
      op: Math.random()*0.3+0.08
    }))

    const W = () => canvas.width
    const H = () => canvas.height

    const cityXY = i => ({
      x: cities[i%cities.length].x * W() + (mx-0.5)*20,
      y: cities[i%cities.length].y * H() + (my-0.5)*15
    })

    const bezier = (a, b, t) => {
      const cx = (a.x+b.x)/2, cy = (a.y+b.y)/2 - H()*0.12
      return {
        x: (1-t)(1-t)*a.x + 2(1-t)*t*cx + t*t*b.x,
        y: (1-t)(1-t)*a.y + 2(1-t)*t*cy + t*t*b.y
      }
    }

    const drawPlane = (px, py, angle, sz) => {
      ctx.save(); ctx.translate(px,py); ctx.rotate(angle); ctx.fillStyle='#000'
      ctx.beginPath(); ctx.ellipse(0,0,sz*1.8,sz*0.3,0,0,Math.PI*2); ctx.fill()
      ctx.beginPath(); ctx.moveTo(-sz*0.2,0); ctx.lineTo(-sz*0.9,sz); ctx.lineTo(sz*0.3,sz*0.1); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.moveTo(-sz*0.2,0); ctx.lineTo(-sz*0.9,-sz); ctx.lineTo(sz*0.3,-sz*0.1); ctx.closePath(); ctx.fill()
      ctx.font = 300 ${Math.max(8,sz*0.65)}px DM Sans
      ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.letterSpacing='0.2em'
      ctx.fillText('LOVEKUSH', -24, -sz*1.2)
      ctx.restore()
    }

    const drawKnot = (cx, cy, sz, alpha) => {
      ctx.save(); ctx.translate(cx,cy)
      ctx.strokeStyle=rgba(0,0,0,${alpha})
      ctx.lineWidth=sz*0.06; ctx.lineCap='round'; ctx.lineJoin='round'
      const s=sz*0.44
      for(let l=0;l<3;l++){
        ctx.save(); ctx.rotate(l*Math.PI*2/3)
        ctx.beginPath()
        ctx.moveTo(0,-s*1.55)
        ctx.bezierCurveTo(s*1.1,-s*1.55,s*1.4,-s*0.3,s*0.6,s*0.42)
        ctx.bezierCurveTo(s*0.2,s*0.72,-s*0.2,s*0.72,-s*0.6,s*0.42)
        ctx.bezierCurveTo(-s*1.4,-s*0.3,-s*1.1,-s*1.55,0,-s*1.55)
        ctx.stroke(); ctx.restore()
      }
      ctx.beginPath(); ctx.arc(0,0,sz*0.06,0,Math.PI*2)
      ctx.fillStyle=rgba(0,0,0,${alpha}); ctx.fill()
      ctx.restore()
    }

    const BRAND = 'LOVEKUSH'

    function roundRect(ctx,x,y,w,h,r){
      ctx.beginPath()
      ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y)
      ctx.quadraticCurveTo(x+w,y,x+w,y+r)
      ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h)
      ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r)
      ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y)
      ctx.closePath()
    }

    function wrapText(ctx,text,x,y,maxW,lineH){
      const words=text.split(' '); let line=''
      for(let w of words){
        const test=line+w+' '
        if(ctx.measureText(test).width>maxW&&line){ ctx.fillText(line,x,y); line=w+' '; y+=lineH }
        else line=test
      }
      ctx.fillText(line,x,y)
    }

    function showFinal(){
      document.getElementById('landing-content').style.opacity='1'
      document.getElementById('landing-content').style.transform='translateY(0)'
    }
    (ts) => {
      const dt = Math.min((ts-lastTs)/1000, 0.05)
      lastTs=ts; pt+=dt

      ctx.clearRect(0,0,W(),H())
      ctx.fillStyle='#fff'; ctx.fillRect(0,0,W(),H())

      const pa = Math.min(pt/1.5,1)*0.5
      particles.forEach(p => {
        ctx.beginPath()
        ctx.arc((p.x+(mx-0.5)*0.03)*W(), (p.y+(my-0.5)*0.03)*H(), p.r, 0, Math.PI*2)
        ctx.fillStyle=rgba(0,0,0,${p.op*pa}); ctx.fill()
        p.y+=p.vy; if(p.y<0){p.y=1;p.x=Math.random()}
      })

      if(phase===0){ if(pt>1){phase=1;pt=0} }
      else if(phase===1){
        const a=Math.min(pt/1.5,1)
        drawKnot(W()/2,H()/2,Math.min(W(),H())*0.1,a)
        if(pt>2.5){phase=2;pt=0;textI=0;textTimer=0}
      }
      else if(phase===2){
        const shrink=Math.min(pt/1.5,1)
        const ks=Math.min(W(),H())0.1(1-shrink*0.7)
        drawKnot(W()/2,H()/2,ks,1)
        textTimer+=dt
        if(textTimer>0.12&&textI<BRAND.length){textI++;textTimer=0}
        if(textI>0){
          ctx.font=200 ${Math.min(W()*0.07,56)}px DM Sans
          ctx.fillStyle='#000'; ctx.textAlign='center'; ctx.letterSpacing='0.5em'
          ctx.fillText(BRAND.slice(0,textI),W()/2,H()/2+8)
          if(textI===BRAND.length){
            ctx.font=300 ${Math.min(W()*0.02,13)}px DM Sans
            ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.letterSpacing='0.3em'
            ctx.fillText('GLOBAL MATCHMAKING',W()/2,H()/2+32)
          }
          ctx.textAlign='left'
        }
        if(pt>3.5&&textI===BRAND.length){phase=3;pt=0;curCity=0;planeT=0}
      }
      else if(phase===3){
        const nc=(curCity+1)%cities.length
        const spd=0.6*dt; planeT=Math.min(planeT+spd,1)
        const pos=bezier(cityXY(curCity),cityXY(nc),planeT)
        const p1=bezier(cityXY(curCity),cityXY(nc),Math.max(0,planeT-0.01))
        const p2=bezier(cityXY(curCity),cityXY(nc),Math.min(1,planeT+0.01))
        const ang=Math.atan2(p2.y-p1.y,p2.x-p1.x)
        drawPlane(pos.x,pos.y,ang,Math.min(W(),H())*0.02)
        if(planeT>=1){phase=4;pt=0;curCity=nc}
      }
      else if(phase===4){
        const c=cityXY(curCity), city=cities[curCity]
        const pulse=(Math.sin(pt*3)+1)/2
        ctx.beginPath(); ctx.arc(c.x,c.y,10+pulse*12,0,Math.PI*2)
        ctx.strokeStyle=rgba(0,0,0,${0.3-pulse*0.2}); ctx.lineWidth=1.5; ctx.stroke()
        ctx.beginPath(); ctx.arc(c.x,c.y,4,0,Math.PI*2)
        ctx.fillStyle='#000'; ctx.fill()
        const opacity=Math.min(pt/0.5,1)
        let cx=c.x+16, cy=c.y-50
        if(cx+200>W())cx=c.x-210
        if(cy<20)cy=c.y+20
        ctx.save(); ctx.globalAlpha=opacity
        ctx.fillStyle='rgba(0,0,0,0.88)'
        roundRect(ctx,cx,cy,200,72,10); ctx.fill()
        ctx.fillStyle='#fff'
        ctx.font=400 10px DM Sans; ctx.letterSpacing='0.2em'
        ctx.fillText(city.name.toUpperCase(), cx+12, cy+18)
        ctx.font=400 14px Cormorant Garamond
        ctx.fillText(city.couple, cx+12, cy+36)
        ctx.font=300 11px DM Sans; ctx.fillStyle='rgba(255,255,255,0.6)'
        wrapText(ctx, city.story, cx+12, cy+52, 176, 14)
        ctx.restore()
        if(pt>2.5){
          if(curCity<cities.length-1){phase=3;pt=0;planeT=0}
          else{phase=5;pt=0}
        }
      }
      else if(phase===5){
        cities.forEach((c,i)=>{
          const pos=cityXY(i)
          ctx.beginPath(); ctx.arc(pos.x,pos.y,3,0,Math.PI*2)
          ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.fill()
        })
        const glowT=Math.min(pt/2,1)
        const grad=ctx.createRadialGradient(W()*0.5,H()*0.4,0,W()*0.5,H()*0.4,W()*0.4)
        grad.addColorStop(0,rgba(0,0,0,${0.05*glowT}))
        grad.addColorStop(1,'rgba(0,0,0,0)')
        ctx.fillStyle=grad; ctx.fillRect(0,0,W(),H())
        drawKnot(W()/2,H()/2,Math.min(W(),H())*0.08*glowT,0.4*glowT)
        if(pt>3&&!finalShown){finalShown=true;showFinal()}
      }

      animId=requestAnimationFrame(tick)
    }

    requestAnimationFrame(ts=>{lastTs=ts;requestAnimationFrame(tick)})
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize) }
  }, [])

  return (
    <div style={{minHeight:'100vh',background:'#fff'}}>
      <nav className="navbar">
        <span className="nav-brand">LOVEKUSH</span>
        <div className="nav-right">
          {user ? (
            <button className="btn btn-black" onClick={()=>navigate('/dashboard')}>Dashboard</button>
          ) : (
            <>
              <button className="btn btn-outline" onClick={()=>navigate('/login')}>Login</button>
              <button className="btn btn-black" onClick={()=>navigate('/register')}>Register</button>
            </>
          )}
        </div>
      </nav>

      <div style={{position:'relative',height:'calc(100vh - 52px)',overflow:'hidden'}}>
        <canvas ref={canvasRef} style={{width:'100%',height:'100%',display:'block'}} />
        <div id="landing-content" style={{
          position:'absolute',inset:0,display:'flex',flexDirection:'column',
          alignItems:'center',justifyContent:'center',textAlign:'center',
          padding:'20px',opacity:0,transform:'translateY(20px)',
          transition:'all 1.5s ease',pointerEvents:'none',
          background:'rgba(255,255,255,0.15)',backdropFilter:'blur(2px)'
        }}>
          <div style={{pointerEvents:'all'}}>
            <svg width="52" height="52" viewBox="0 0 60 60" fill="none" style={{marginBottom:16}}>
              <g stroke="black" strokeWidth="2.2" strokeLinecap="round" fill="none">
                <path d="M30 6C36 6,44 14,44 22C44 29,38 34,33 37C40 39,51 46,51 55C51 59,44 62,37 58C33 55,31 51,30 47C29 51,27 55,23 58C16 62,9 59,9 55C9 46,20 39,27 37C22 34,16 29,16 22C16 14,24 6,30 6Z"/>
                <circle cx="30" cy="37" r="2.5" fill="black"/>
              </g>
            </svg>
            <div style={{fontFamily:'DM Sans',fontSize:'clamp(32px,7vw,64px)',fontWeight:200,letterSpacing:'0.5em',marginBottom:6}}>LOVEKUSH</div>
            <div style={{fontSize:11,letterSpacing:'0.35em',opacity:0.4,textTransform:'uppercase',marginBottom:16}}>Global Matchmaking Services</div>
            <div style={{width:40,height:1,background:'rgba(0,0,0,0.2)',margin:'0 auto 16px'}}></div>
            <div style={{fontFamily:'Cormorant Garamond',fontSize:'clamp(18px,3vw,26px)',fontStyle:'italic',fontWeight:300,marginBottom:36,opacity:0.8}}>Bridging Hearts, Building Legacies.</div>
            <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
              <button className="btn btn-black btn-lg" onClick={()=>navigate('/register')}>Begin Your Journey →</button>
              <button className="btn btn-outline btn-lg" onClick={()=>document.getElementById('features').scrollIntoView({behavior:'smooth'})}>Learn More ↓</button>
            </div>
          </div>
        </div>
      </div>

      <div id="features" style={{background:'#fff',padding:'60px 20px'}}>
        <div style={{maxWidth:600,margin:'0 auto'}}>
          <div className="section-label" style={{textAlign:'center',marginBottom:8}}>Why Lovekush</div>
          <h2 style={{fontFamily:'Cormorant Garamond',fontSize:'clamp(28px,5vw,42px)',fontWeight:300,textAlign:'center',marginBottom:40,lineHeight:1.2}}>
            A service built on<br/><em>trust & discretion.</em>
          </h2>
          <div style={{display:'flex',flexDirection:'column',gap:1,border:'1px solid rgba(0,0,0,0.08)',borderRadius:16,overflow:'hidden'}}>
            {[
              {icon:'💎',title:'Handpicked Introductions',desc:'Every match personally reviewed. No random browsing.'},
              {icon:'🔒',title:'Complete Privacy',desc:'Contact details hidden until you choose to share.'},
              {icon:'✅',title:'Verified Profiles Only',desc:'Every profile reviewed before being shown to anyone.'},
              {icon:'🌍',title:'Global Reach',desc:'India, UK, USA, Canada, UAE, Australia and 50+ countries.'},
              {icon:'👨‍👩‍👧',title:'Family-First',desc:'Serious marriage seekers only. No dating vibe.'},
            ].map(f=>(
              <div key={f.title} style={{display:'flex',gap:14,padding:'20px',background:'#fff',transition:'background 0.2s'}}
                onMouseEnter={e=>e.currentTarget.style.background='#f9f9f9'}
                onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                <span style={{fontSize:22,flexShrink:0,paddingTop:2}}>{f.icon}</span>
                <div>
                  <div style={{fontWeight:500,marginBottom:3}}>{f.title}</div>
                  <div style={{fontSize:13,color:'#8e8e8e',lineHeight:1.5}}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{marginTop:32,display:'flex',flexDirection:'column',gap:10}}>
            <button className="btn btn-black btn-full btn-lg" onClick={()=>navigate('/register')}>Create Free Profile</button>
            <button className="btn btn-outline btn-full" onClick={()=>navigate('/login')}>Already registered? Login</button>
          </div>
        </div>
      </div>

      <footer style={{borderTop:'1px solid rgba(0,0,0,0.08)',padding:'40px 20px',textAlign:'center'}}>
        <div style={{fontFamily:'DM Sans',fontSize:20,fontWeight:200,letterSpacing:'0.45em',marginBottom:6}}>LOVEKUSH</div>
        <div style={{fontFamily:'Cormorant Garamond',fontStyle:'italic',fontSize:14,opacity:0.4,marginBottom:20}}>Bridging Hearts, Building Legacies.</div>
        <div style={{display:'flex',gap:20,justifyContent:'center',flexWrap:'wrap',marginBottom:16}}>
          {['About','Privacy Policy','Terms','Contact'].map(l=>(
            <span key={l} style={{fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',opacity:0.4,cursor:'pointer'}}>{l}</span>
          ))}
        </div>
        <div style={{fontSize:11,opacity:0.25}}>© 2025 Lovekush Global Matchmaking Services</div>
      </footer>
    </div>
  )
}
