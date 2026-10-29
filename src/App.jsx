import { useEffect, useState } from 'react'
import { Menu, Moon, User, LogOut, CalendarDays, Gem, BarChart3, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import Agenda from './pages/Agenda'
import Estoque from './pages/Estoque'
import Relatorios from './pages/Relatorios'

const NAV = [['agenda', 'Agenda', CalendarDays], ['estoque', 'Estoque', Gem], ['relatorios', 'Relatórios', BarChart3]]

function Login() {
  const [email, setEmail] = useState(''), [senha, setSenha] = useState(''), [erro, setErro] = useState('')
  const entrar = async e => { e.preventDefault(); const { error } = await supabase.auth.signInWithPassword({ email, password: senha }); if (error) setErro('E-mail ou senha incorretos.') }
  return (
    <div className="login"><form className="card login-card" onSubmit={entrar}>
      <div className="logo big"><Moon size={30} /><span>Lua tattoos</span></div>
      <label>E-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label>Senha<input type="password" value={senha} onChange={e => setSenha(e.target.value)} required /></label>
      {erro && <p className="erro">{erro}</p>}
      <button className="btn primary">Entrar</button>
    </form></div>)
}

export default function App() {
  const [session, setSession] = useState(undefined), [page, setPage] = useState('agenda'), [open, setOpen] = useState(false), [menu, setMenu] = useState(false)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_, s) => setSession(s)); return () => data.subscription.unsubscribe()
  }, [])
  if (session === undefined) return null
  if (!session) return <Login />
  const Page = { agenda: Agenda, estoque: Estoque, relatorios: Relatorios }[page]
  return (
    <>
      <header className="topbar">
        <button className="icon-btn" aria-label="Abrir menu" onClick={() => setOpen(true)}><Menu /></button>
        <div className="logo"><Moon size={22} /><span>Lua tattoos</span></div>
        <div className="perfil">
          <button className="icon-btn" aria-label="Perfil" onClick={() => setMenu(!menu)}><User /></button>
          {menu && <div className="pop card"><small>{session.user.email}</small>
            <button className="btn ghost" onClick={() => supabase.auth.signOut()}><LogOut size={16} />Sair da conta</button></div>}
        </div>
      </header>
      <div className={'scrim' + (open ? ' on' : '')} onClick={() => setOpen(false)} />
      <nav className={'side' + (open ? ' on' : '')}>
        <button className="icon-btn close" aria-label="Fechar menu" onClick={() => setOpen(false)}><X /></button>
        {NAV.map(([k, label, Icon]) => (
          <button key={k} className={'nav' + (page === k ? ' active' : '')} onClick={() => { setPage(k); setOpen(false) }}><Icon size={20} />{label}</button>))}
      </nav>
      <main className="page"><Page /></main>
    </>)
}
