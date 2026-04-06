import React, { useState, useEffect, createContext, useContext, useRef, useMemo } from 'react'
import { Plus, Trash2, LayoutDashboard, Users, Calendar as CalendarIcon, Settings, LogOut, Download, Moon, Sun, AlertCircle, Clock, Edit2, X, Check, Copy, DownloadCloud, ChevronLeft, ChevronRight, Mail, Lock, Building2 } from 'lucide-react'
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, parse, differenceInMinutes, isWithinInterval, startOfDay, endOfDay, setHours, setMinutes } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import { initializeApp } from 'firebase/app'
import { getDatabase, ref, onValue, set, remove, update, get, push } from 'firebase/database'
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { HexColorPicker } from 'react-colorful'
import html2pdf from 'html2pdf.js'
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core'

/** FIREBASE CONFIG **/
const firebaseConfig = {
  apiKey: "AIzaSyDm9zFWKzqHajG9mq0IU0cabbOqRveJAWw",
  authDomain: "cafe-hay.firebaseapp.com",
  databaseURL: "https://cafe-hay-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cafe-hay",
  storageBucket: "cafe-hay.firebasestorage.app",
  messagingSenderId: "82983213524",
  appId: "1:82983213524:web:d45a807cf959945b6b1e41",
  measurementId: "G-99HM6QG4B5"
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const database = getDatabase(app)

/** AUTH CONTEXT **/
const AuthContext = createContext()
export const useAuth = () => useContext(AuthContext)

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [business, setBusiness] = useState(null)

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        const bizRef = ref(database, `businesses/${u.uid}`)
        const snapshot = await get(bizRef)
        if (snapshot.exists()) setBusiness(snapshot.val())
      }
      setLoading(false)
    })
  }, [])

  const signup = async (email, password, bizName) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    const bizData = { name: bizName, ownerId: cred.user.uid, createdAt: new Date().toISOString() }
    await set(ref(database, `businesses/${cred.user.uid}`), bizData)
    setBusiness(bizData)
  }

  const login = (e, p) => signInWithEmailAndPassword(auth, e, p)
  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{ user, business, signup, login, logout }}>
      {loading ? (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', gap: '1rem' }}>
          <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid #e2e8f0', borderTop: '4px solid #000', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <div style={{ fontWeight: 600, color: '#64748b' }}>MakSchichten Loading...</div>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      ) : children}
    </AuthContext.Provider>
  )
}

/** STORE CONTEXT **/
const StoreContext = createContext()
export const useStore = () => useContext(StoreContext)

const StoreProvider = ({ children }) => {
  const { user } = useAuth()
  const [workers, setWorkers] = useState([])
  const [shifts, setShifts] = useState([])

  useEffect(() => {
    if (!user) return
    const wRef = ref(database, `businesses/${user.uid}/workers`)
    const sRef = ref(database, `businesses/${user.uid}/shifts`)
    onValue(wRef, (s) => setWorkers(s.val() ? Object.entries(s.val()).map(([id,v])=>({id,...v})) : []))
    onValue(sRef, (s) => setShifts(s.val() ? Object.entries(s.val()).map(([id,v])=>({id,...v})) : []))
  }, [user])

  const actions = {
    addWorker: (w) => push(ref(database, `businesses/${user.uid}/workers`), w),
    updateWorker: (id, u) => update(ref(database, `businesses/${user.uid}/workers/${id}`), u),
    deleteWorker: (id) => remove(ref(database, `businesses/${user.uid}/workers/${id}`)),
    addShift: (s) => push(ref(database, `businesses/${user.uid}/shifts`), s),
    updateShift: (id, u) => update(ref(database, `businesses/${user.uid}/shifts/${id}`), u),
    deleteShift: (id) => remove(ref(database, `businesses/${user.uid}/shifts/${id}`)),
    importLegacy: async () => {
       const wSnap = await get(ref(database, 'workers'))
       const sSnap = await get(ref(database, 'shifts'))
       if (wSnap.exists()) Object.entries(wSnap.val()).forEach(([id,w])=>set(ref(database, `businesses/${user.uid}/workers/${id}`), w))
       if (sSnap.exists()) Object.entries(sSnap.val()).forEach(([id,s])=>set(ref(database, `businesses/${user.uid}/shifts/${id}`), s))
       alert('Legacy data imported!')
    }
  }

  return (
    <StoreContext.Provider value={{ workers, shifts, ...actions }}>
      {children}
    </StoreContext.Provider>
  )
}

/** COMPONENTS **/
const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true)
  const [form, setForm] = useState({ email: '', password: '', biz: '' })
  const { login, signup } = useAuth()

  const submit = async (e) => {
    e.preventDefault()
    try {
      if (isLogin) await login(form.email, form.password)
      else await signup(form.email, form.password, form.biz)
    } catch (err) { alert(err.message) }
  }

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card" style={{ width: '400px', padding: '2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <div style={{ padding: '0.75rem', background: '#000', borderRadius: '12px', color: '#fff' }}><LayoutDashboard size={28} /></div>
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, textAlign: 'center' }}>MakSchichten</h2>
        <p style={{ fontSize: '0.8rem', color: '#64748b', textAlign: 'center', marginBottom: '2rem' }}>Enterprise Management</p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {!isLogin && <input placeholder="Business Name" required value={form.biz} onChange={e=>setForm({...form, biz: e.target.value})} />}
          <input type="email" placeholder="Email" required value={form.email} onChange={e=>setForm({...form, email: e.target.value})} />
          <input type="password" placeholder="Password" required value={form.password} onChange={e=>setForm({...form, password: e.target.value})} />
          <button type="submit" className="primary" style={{ padding: '0.8rem' }}>{isLogin ? 'Sign In' : 'Create Account'}</button>
        </form>
        <button onClick={()=>setIsLogin(!isLogin)} style={{ marginTop: '1.5rem', width: '100%', fontSize: '0.8rem', color: '#64748b' }}>{isLogin ? "New account?" : "Already member?"}</button>
      </motion.div>
    </div>
  )
}

const DASHBOARD_UI_STYLE = { 
  aside: { width: '280px', background: '#fcfcfc', borderRight: '1px solid #eee', display: 'flex', flexDirection: 'column' },
  main: { flexGrow: 1, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column' }
}

const Calendar = () => {
    const { workers, shifts, addShift, updateShift, deleteShift, importLegacy, addWorker, updateWorker, deleteWorker, business } = useStore()
    const { logout } = useAuth()
    const [selectedWeek, setSelectedWeek] = useState(new Date())
    const [viewMode, setViewMode] = useState('7') // '7', '3', '1'
    const [mobileMenu, setMobileMenu] = useState(false)
    const [modal, setModal] = useState(null)
    const [editW, setEditW] = useState(null)

    const wStart = startOfWeek(selectedWeek, { weekStartsOn: 1 })
    const allDays = eachDayOfInterval({ start: wStart, end: addDays(wStart, 6) })
    
    const days = useMemo(() => {
        if (viewMode === '1') return [selectedWeek]
        if (viewMode === '3') {
            const idx = allDays.findIndex(d => isSameDay(d, selectedWeek))
            const startIdx = idx === -1 ? 0 : idx
            return allDays.slice(startIdx, Math.min(startIdx + 3, allDays.length))
        }
        return allDays
    }, [viewMode, selectedWeek, allDays])

    const hours = useMemo(()=>Array.from({length: 28}, (_, i)=> {
      const h = Math.floor(i/2) + 6
      const m = i%2 === 0 ? '00' : '30'
      return `${h.toString().padStart(2, '0')}:${m}`
    }), [])

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

    const [windowWidth, setWindowWidth] = useState(window.innerWidth)
    useEffect(() => {
        const h = () => setWindowWidth(window.innerWidth)
        window.addEventListener('resize', h)
        return () => window.removeEventListener('resize', h)
    }, [])

    const exportPDF = () => {
        const el = document.getElementById('calendar-view')
        html2pdf().set({ margin: 10, filename: 'schedule.pdf', image:{type:'jpeg',quality:0.98}, html2canvas:{scale:2}, jsPDF:{unit:'mm',format:'a4',orientation:'landscape'}})
            .from(el).save()
    }

    const calcHours = (id) => shifts.filter(s=>s.workerId===id).reduce((t,s)=>(t+(new Date(s.end)-new Date(s.start))/3600000),0)

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw', background: '#fcfcfc', overflow: 'hidden' }}>
            <aside style={{ 
                ...DASHBOARD_UI_STYLE.aside,
                display: (window.innerWidth < 768 && !mobileMenu) ? 'none' : 'flex',
                position: (window.innerWidth < 768) ? 'fixed' : 'relative',
                zIndex: 1000, height: '100vh', width: (window.innerWidth < 768) ? '100vw' : '280px',
                transition: 'all 0.3s'
            }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '32px', height: '32px', background: '#000', borderRadius: '8px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{business?.name?.[0]}</div>
                    <div style={{ fontWeight: 700 }}>{business?.name || 'MakSchichten'}</div>
                   </div>
                   {window.innerWidth < 768 && <X size={24} onClick={()=>setMobileMenu(false)} style={{ cursor: 'pointer' }} />}
                </div>
                <nav style={{ padding: '1rem', flexGrow: 1, overflowY: 'auto' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#999', marginBottom: '1.5rem', letterSpacing: '0.05em' }}>TEAM MANAGEMENT</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {workers.map(w => (
                            <div key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: '#fff', border: '1px solid #eee', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: w.color }} />
                                    <div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{w.name}</div>
                                        <div style={{ fontSize: '0.65rem', color: '#999' }}>{calcHours(w.id).toFixed(1)}h / week</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <Edit2 size={12} style={{ cursor: 'pointer', opacity: 0.3 }} onClick={()=>setEditW({...w})} />
                                    <Trash2 size={12} style={{ cursor: 'pointer', opacity: 0.3 }} onClick={()=>deleteWorker(w.id)} />
                                </div>
                            </div>
                        ))}
                        <button onClick={()=>setEditW({name: '', color:'#e0f2fe'})} style={{ width: '100%', fontSize: '0.75rem', padding: '0.75rem', border: '1px dashed #ccc', borderRadius: '12px', color: '#999', background: 'transparent' }}>+ Add Team Member</button>
                    </div>
                </nav>
                <div style={{ padding: '1rem', borderTop: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <button onClick={importLegacy} style={{ fontSize: '0.7rem', color: '#3b82f6', border: '1px dashed #3b82f6', padding: '0.75rem', borderRadius: '12px', background: '#3b82f611', fontWeight: 600 }}>
                        <DownloadCloud size={14} style={{ marginRight: '6px' }} /> Import Old Data
                    </button>
                    <button onClick={logout} style={{ fontSize: '0.85rem', padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#666' }}><LogOut size={16}/> Logout</button>
                </div>
            </aside>
            <main style={DASHBOARD_UI_STYLE.main}>
                <header style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {window.innerWidth < 768 && <LayoutDashboard size={24} onClick={()=>setMobileMenu(true)} style={{ cursor: 'pointer', padding: '4px' }} />}
                        <div style={{ display: 'flex', background: '#f1f5f9', padding: '0.2rem', borderRadius: '8px', alignItems: 'center' }}>
                            <button style={{ padding: '0.2rem' }} onClick={()=>setSelectedWeek(addDays(selectedWeek, viewMode === '7' ? -7 : viewMode === '3' ? -3 : -1))}><ChevronLeft size={14}/></button>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0 0.5rem', whiteSpace: 'nowrap' }}>
                                {format(days[0], 'd MMM')} - {format(days[days.length-1], 'd MMM')}
                            </span>
                            <button style={{ padding: '0.2rem' }} onClick={()=>setSelectedWeek(addDays(selectedWeek, viewMode === '7' ? 7 : viewMode === '3' ? 3 : 1))}><ChevronRight size={14}/></button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <select 
                            value={viewMode} 
                            onChange={e=>setViewMode(e.target.value)} 
                            style={{ padding: '0.35rem', fontSize: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0', width: 'auto', fontWeight: 600 }}
                        >
                            <option value="7">7 Days</option>
                            <option value="3">3 Days</option>
                            <option value="1">1 Day</option>
                        </select>
                        <button onClick={exportPDF} style={{ border: '1px solid #e2e8f0', padding: '0.4rem', borderRadius: '6px', color: '#64748b' }}><Download size={14}/></button>
                        <button onClick={()=>setModal({})} className="primary" style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem' }}>+ Assign</button>
                    </div>
                </header>
                <div id="calendar-view" style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, 1fr)`, flexGrow: 1, minWidth: '100%' }}>
                        <DndContext sensors={sensors} onDragEnd={(e)=>{
                             const { active, over } = e
                             if(!over) return
                             const [dayIso, timeOffset] = over.id.split('_')
                             const s = shifts.find(x => x.id === active.id)
                             if(s) {
                                 const start = new Date(dayIso); start.setHours(6, parseInt(timeOffset), 0)
                                 const duration = new Date(s.end) - new Date(s.start)
                                 const end = new Date(start.getTime() + duration)
                                 updateShift(s.id, { start: start.toISOString(), end: end.toISOString() })
                             }
                        }}>
                            {days.map(d => (
                                <DroppableCol key={d.toISOString()} day={d} hours={hours}>
                                    <div style={{ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid #eee', background: '#fcfcfc' }}>
                                        <div style={{ fontSize: '0.6rem', color: '#999', textTransform: 'uppercase' }}>{format(d, 'EEE')}</div>
                                        <div style={{ fontWeight: 700 }}>{format(d, 'd')}</div>
                                    </div>
                                    <div style={{ position: 'relative', flexGrow: 1 }}>
                                        {shifts.filter(s => isSameDay(new Date(s.start), d)).map(s => {
                                            const w = workers.find(x => x.id === s.workerId)
                                            if(!w) return null
                                            const top = (differenceInMinutes(new Date(s.start), startOfDay(new Date(s.start)).setHours(6,0,0,0)) / 60) * 60
                                            const h = (differenceInMinutes(new Date(s.end), new Date(s.start)) / 60) * 60
                                            return <Shift key={s.id} s={s} w={w} top={top} h={h} del={()=>deleteShift(s.id)} edit={()=>setModal(s)} />
                                        })}
                                    </div>
                                </DroppableCol>
                            ))}
                        </DndContext>
                    </div>
                    <SummaryTable workers={workers} shifts={shifts} />
                </div>
            </main>
            <AnimatePresence>
                {modal && (
                    <div className="modal-overlay" onClick={()=>setModal(null)}>
                        <div className="card" onClick={e=>e.stopPropagation()} style={{ width: '400px', padding: '1.5rem' }}>
                            <h3>{modal.id ? 'Edit Shift' : 'New Shift'}</h3>
                            <select value={modal.workerId} onChange={e=>setModal({...modal, workerId: e.target.value})}><option>Select Worker</option>{workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>
                            <input type="time" onChange={e=>setModal({...modal, s: e.target.value})} defaultValue={modal.start ? format(new Date(modal.start), 'HH:mm') : '09:00'} />
                            <input type="time" onChange={e=>setModal({...modal, e: e.target.value})} defaultValue={modal.end ? format(new Date(modal.end), 'HH:mm') : '17:00'} />
                            <button className="primary" onClick={()=>{
                                if(!modal.workerId) return
                                const s = new Date(modal.start || days[0]); const [hS, mS] = (modal.s||format(s,'HH:mm')).split(':'); s.setHours(hS, mS, 0)
                                const e = new Date(modal.start || days[0]); const [hE, mE] = (modal.e||format(e,'HH:mm')).split(':'); e.setHours(hE, mE, 0)
                                if(modal.id) updateShift(modal.id, {workerId: modal.workerId, start: s.toISOString(), end: e.toISOString()})
                                else addShift({workerId: modal.workerId, start: s.toISOString(), end: e.toISOString()})
                                setModal(null)
                            }}>Save</button>
                        </div>
                    </div>
                )}
                {editW && (
                    <div className="modal-overlay" onClick={()=>setEditW(null)}>
                        <div className="card" onClick={e=>e.stopPropagation()} style={{ width: '320px', padding: '1.5rem' }}>
                            <h3>{editW.id ? 'Edit Worker' : 'Add Worker'}</h3>
                            <input placeholder="Name" value={editW.name} onChange={e=>setEditW({...editW, name: e.target.value})} />
                            <HexColorPicker color={editW.color} onChange={c=>setEditW({...editW, color: c})} />
                            <button className="primary" style={{ width: '100%', padding: '0.75rem', borderRadius: '12px' }} onClick={()=>{
                                if(editW.id) updateWorker(editW.id, editW)
                                else addWorker(editW)
                                setEditW(null)
                            }}>{editW.id ? 'Save Changes' : 'Add Member'}</button>
                        </div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    )
}

const SummaryTable = ({ workers, shifts }) => {
    const total = workers.reduce((sum, w) => sum + shifts.filter(s=>s.workerId===w.id).reduce((t,s)=>(t+(new Date(s.end)-new Date(s.start))/3600000),0), 0)
    return (
        <div style={{ padding: '1rem 1.5rem', background: '#fff', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>Haftalık Toplam: {total.toFixed(1)} Saat</div>
            <div style={{ display: 'flex', gap: '1rem' }}>
                {workers.map(w => {
                    const h = shifts.filter(s=>s.workerId===w.id).reduce((t,s)=>(t+(new Date(s.end)-new Date(s.start))/3600000),0)
                    if(h === 0) return null
                    return <div key={w.id} style={{ fontSize: '0.75rem' }}><b>{w.name}:</b> {h.toFixed(1)}h</div>
                })}
            </div>
        </div>
    )
}

const DroppableCol = ({ day, hours, children }) => {
    const { setNodeRef } = useDroppable({ id: `${day.toISOString()}_0` })
    return <div ref={setNodeRef} style={{ borderRight: '1px solid #eee', position: 'relative', display: 'flex', flexDirection: 'column', minHeight: '840px' }}>{children}<div style={{ position: 'absolute', inset: 0, zIndex: -1 }}>{hours.map((_,i)=><div key={i} style={{ height: '30px', borderBottom: i%2===1 ? '1px solid #f9f9f9' : 'none' }} />)}</div></div>
}

const Shift = ({ s, w, top, h, del, edit }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: s.id })
    const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 100 } : undefined
    
    const formatTime = (dateStr) => {
        const d = new Date(dateStr)
        return isNaN(d.getTime()) ? '--:--' : format(d, 'HH:mm')
    }

    return (
        <div ref={setNodeRef} style={{ position: 'absolute', top, height: h, left: 4, right: 4, background: w.color+'aa', borderRadius: '10px', padding: '10px', border: `1px solid ${w.color}`, backdropFilter: 'blur(4px)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', ...style }} {...listeners} {...attributes}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                <b style={{ color: '#000', pointerEvents: 'none' }}>{w.name}</b>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <Edit2 size={14} style={{ cursor: 'pointer', color: '#000' }} onPointerDown={(e)=>{e.stopPropagation(); edit()}} />
                    <X size={14} style={{ cursor: 'pointer', color: '#000' }} onPointerDown={(e)=>{e.stopPropagation(); del()}} />
                </div>
            </div>
            <div style={{ fontSize: '0.65rem', color: '#333', fontWeight: 700, pointerEvents: 'none' }}>
                {formatTime(s.start)} - {formatTime(s.end)}
            </div>
        </div>
    )
}

/** APP WRAPPER **/
function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <AppContent />
      </StoreProvider>
    </AuthProvider>
  )
}

function AppContent() {
  const { user } = useAuth()
  return user ? <Calendar /> : <AuthPage />
}

export default App
