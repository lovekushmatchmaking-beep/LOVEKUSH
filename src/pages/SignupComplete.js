import React from 'react'

// Halka CSS-only confetti burst — koi extra library nahi chahiye.
// Har piece ek chhota rotated rectangle hai, random left/delay/color ke
// saath, jo @keyframes confetti-fall se gir kar fade out hota hai.
const CONFETTI_COLORS = ['#e53e3e', '#f6ad55', '#68d391', '#63b3ed', '#b794f4', '#f687b3', '#000']
const CONFETTI_PIECES = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  left: Math.random() * 100,
  delay: Math.random() * 0.6,
  duration: 2.2 + Math.random() * 1.2,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  rotate: Math.random() * 360,
}))

export default function SignupComplete({ profile, photoPreview, onContinue }) {
  return (
    <div style={{minHeight:'100vh',background:'linear-gradient(180deg, #fff0f3 0%, #fff 45%)',display:'flex',flexDirection:'column',alignItems:'center',padding:'0 20px',overflow:'hidden',position:'relative'}}>
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(540deg); opacity: 0; }
        }
      `}</style>

      {CONFETTI_PIECES.map(p => (
        <div key={p.id} style={{
          position:'absolute', top:0, left: p.left + '%',
          width:8, height:14, background:p.color,
          animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s 1`,
          transform: `rotate(${p.rotate}deg)`,
          borderRadius:2, pointerEvents:'none',
        }} />
      ))}

      <div style={{marginTop:'12vh',textAlign:'center',position:'relative',zIndex:1}}>
        <div style={{width:140,height:180,borderRadius:20,background:'#e0e0e0',overflow:'hidden',margin:'0 auto 20px',boxShadow:'0 12px 30px rgba(0,0,0,0.12)',position:'relative'}}>
          {photoPreview
            ? <img src={photoPreview} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
            : <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:48}}>👤</div>
          }
          <div style={{position:'absolute',top:8,right:8,background:'rgba(0,0,0,0.7)',color:'#fff',fontSize:9,padding:'3px 8px',borderRadius:20,letterSpacing:'0.08em'}}>JUST JOINED</div>
        </div>

        <h1 style={{fontFamily:'Cormorant Garamond',fontWeight:300,fontSize:28,marginBottom:6}}>
          Welcome, {profile?.full_name?.split(' ')[0] || 'there'}! 🎉
        </h1>
        <div className="profile-code" style={{display:'inline-block',marginBottom:16}}>{profile?.profile_code}</div>
        <p style={{fontSize:14,color:'#8e8e8e',lineHeight:1.7,maxWidth:320,margin:'0 auto'}}>
          Aapki profile ban gayi hai! Hamari team 24-48 ghanto me review karegi, uske baad aapko matches milne shuru ho jayenge.
        </p>
      </div>

      <div style={{marginTop:'auto',width:'100%',maxWidth:420,paddingBottom:40,paddingTop:30,position:'relative',zIndex:1}}>
        <button className="btn btn-black btn-full btn-lg" onClick={onContinue}>Begin your journey →</button>
      </div>
    </div>
  )
}
