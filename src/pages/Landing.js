import React from 'react'
import { Gem, Lock, BadgeCheck, Globe, Users, ArrowRight, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { TrinityLogo, Wordmark, BrandLockup } from '../components/BrandLogo'

export default function Landing({ user }) {
  const navigate = useNavigate()

  return (
    <div style={{minHeight:'100vh',background:'var(--bg)'}}>
      {/* Navbar */}
      <nav className="navbar">
        <BrandLockup />
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

      {/* Hero — static, koi animation/plane nahi */}
      <section className="landing-hero">
        <div className="landing-hero-glow" aria-hidden="true" />
        <div className="landing-hero-inner">
          <TrinityLogo size={112} bg="var(--ivory)" className="landing-logo" />
          <Wordmark height={30} style={{ maxWidth: '82vw', marginTop: 26 }} />
          <div className="splash-tag" style={{ marginTop: 10 }}>Global Matchmaking Services</div>
          <div className="landing-quote">Bridging Hearts, Building Legacies.</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {user ? (
              <button className="btn btn-black btn-lg" onClick={()=>navigate('/dashboard')}>Open Dashboard <ArrowRight size={18} /></button>
            ) : (
              <button className="btn btn-black btn-lg" onClick={()=>navigate('/register')}>Begin Your Journey <ArrowRight size={18} /></button>
            )}
            <button className="btn btn-outline btn-lg" onClick={()=>document.getElementById('features').scrollIntoView({behavior:'smooth'})}>Learn More <ChevronDown size={18} /></button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <div id="features" style={{padding:'56px 20px'}}>
        <div style={{maxWidth:600,margin:'0 auto'}}>
          <div className="section-label" style={{justifyContent:'center',marginBottom:8}}>Why Lovekush</div>
          <h2 style={{fontFamily:'Cormorant Garamond',fontSize:'clamp(28px,5vw,42px)',fontWeight:300,textAlign:'center',marginBottom:40,lineHeight:1.2}}>
            A service built on<br/><em>trust & discretion.</em>
          </h2>

          <div className="feature-list">
            {[
              {icon:Gem,title:'Handpicked Introductions',desc:'Every match personally reviewed. No random browsing.'},
              {icon:Lock,title:'Complete Privacy',desc:'Contact details hidden until you choose to share.'},
              {icon:BadgeCheck,title:'Verified Profiles Only',desc:'Every profile reviewed before being shown to anyone.'},
              {icon:Globe,title:'Global Reach',desc:'India, UK, USA, Canada, UAE, Australia and 50+ countries.'},
              {icon:Users,title:'Family-First',desc:'Serious marriage seekers only. No dating vibe.'},
            ].map(f=>(
              <div key={f.title} className="feature-item">
                <span className="feature-icon"><f.icon size={20} /></span>
                <div>
                  <div style={{fontWeight:600,marginBottom:3}}>{f.title}</div>
                  <div style={{fontSize:13,color:'var(--gray3)',lineHeight:1.5}}>{f.desc}</div>
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

      {/* Footer */}
      <footer style={{borderTop:'1px solid var(--border)',padding:'40px 20px',textAlign:'center',background:'var(--ivory)'}}>
        <TrinityLogo size={44} bg="var(--ivory)" />
        <Wordmark height={16} style={{ display: 'block', margin: '12px auto 6px' }} />
        <div style={{fontFamily:'Cormorant Garamond',fontStyle:'italic',fontSize:14,opacity:0.4,marginBottom:20}}>Bridging Hearts, Building Legacies.</div>
        <div style={{display:'flex',gap:20,justifyContent:'center',flexWrap:'wrap',marginBottom:16}}>
          {['About','Privacy Policy','Terms','Contact'].map(l=>(
            <span key={l} style={{fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',opacity:0.4,cursor:'pointer'}}>{l}</span>
          ))}
        </div>
        <div style={{fontSize:11,opacity:0.25}}>© {new Date().getFullYear()} Lovekush Global Matchmaking Services</div>
      </footer>
    </div>
  )
}
