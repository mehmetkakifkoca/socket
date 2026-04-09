import React, { useState, useEffect, createContext, useContext, useRef, useMemo } from 'react'
import { Plus, Folder, Trash2, LayoutDashboard, Users, Calendar as CalendarIcon, Settings, LogOut, Download, Moon, Sun, AlertCircle, Clock, Edit2, X, Check, CheckSquare, Copy, DownloadCloud, ChevronLeft, ChevronRight, Mail, Lock, Building2, RefreshCw, Repeat } from 'lucide-react'
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, parse, differenceInMinutes, isWithinInterval, startOfDay, endOfDay, setHours, setMinutes, addWeeks, isAfter, isBefore, parseISO } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import { initializeApp, deleteApp } from 'firebase/app'
import { getDatabase, ref, onValue, set, remove, update, get, push } from 'firebase/database'
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import AdminPanel from './AdminPanel.jsx'
import html2pdf from 'html2pdf.js'
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core'
import { HexColorPicker } from 'react-colorful'

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

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const database = getDatabase(app)

/** AUTH CONTEXT **/
const AuthContext = createContext()
export const useAuth = () => useContext(AuthContext)

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [business, setBusiness] = useState(null)

  const [role, setRole] = useState(null)
  const [employeeData, setEmployeeData] = useState(null)
  const [globalSettings, setGlobalSettings] = useState(null)

  useEffect(() => {
    // Listen to global settings
    const settingsRef = ref(database, 'global_settings')
    onValue(settingsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val()
        setGlobalSettings(data)
        if (data.faviconUrl) {
          let link = document.querySelector("link[rel*='icon']") || document.createElement('link')
          link.type = 'image/x-icon'
          link.rel = 'shortcut icon'
          link.href = data.faviconUrl
          document.getElementsByTagName('head')[0].appendChild(link)
        }
        if (data.appName) {
          document.title = data.appName
        }
      }
    })

    return onAuthStateChanged(auth, async (u) => {
      try {
        setUser(u)
        if (u) {
          if (u.email === 'admin@akifkoca.com' || u.email === 'admin@makschichten.app') {
             setRole('admin')
          } else {
             const bizRef = ref(database, `businesses/${u.uid}`)
             const snapshot = await get(bizRef)
             if (snapshot.exists()) {
                setBusiness(snapshot.val())
                setRole('business')
             } else {
                const empRef = ref(database, `employee_accounts/${u.uid}`)
                const empSnap = await get(empRef)
                if (empSnap.exists()) {
                   setEmployeeData(empSnap.val())
                   const parentBizRef = ref(database, `businesses/${empSnap.val().businessId}`)
                   const pBizSnap = await get(parentBizRef)
                   setBusiness({ ...pBizSnap.val(), id: empSnap.val().businessId })
                   setRole('worker')
                } else {
                   setRole('unknown')
                }
             }
          }
        } else {
          setRole(null)
          setBusiness(null)
          setEmployeeData(null)
        }
      } catch (err) {
        console.error("Auth initialization error:", err)
        setRole('unknown')
      } finally {
        setLoading(false)
      }
    })
  }, [])

  // Convert plain username → fake email so Firebase Auth is happy
  const toEmail = (username) => `${username.trim().toLowerCase().replace(/\s+/g, '_')}@makschichten.app`

  const signup = async (username, password, bizName) => {
    const email = toEmail(username)
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    const bizData = { name: bizName, ownerId: cred.user.uid, username: username.trim(), createdAt: new Date().toISOString() }
    await set(ref(database, `businesses/${cred.user.uid}`), bizData)
    setBusiness(bizData)
  }

  const login = (username, password) => signInWithEmailAndPassword(auth, toEmail(username), password)
  const loginEmail = (email, password) => signInWithEmailAndPassword(auth, email, password)
  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{ user, role, employeeData, business, signup, login, loginEmail, logout, toEmail, globalSettings }}>
      {loading ? (
        <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', gap: '1rem' }}>
          <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid #e2e8f0', borderTop: '4px solid #000', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <div style={{ fontWeight: 600, color: '#64748b' }}>SOCKET Loading...</div>
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
  const { user, role, employeeData, toEmail } = useAuth()
  const [workers, setWorkers] = useState([])
  const [shifts, setShifts] = useState([])
  const [timeLogs, setTimeLogs] = useState([])
  const [routines, setRoutines] = useState([])
  const [taskLogs, setTaskLogs] = useState({})

  const bizUid = role === 'worker' ? employeeData?.businessId : user?.uid

  useEffect(() => {
    if (!bizUid) return
    const wRef = ref(database, `businesses/${bizUid}/workers`)
    const sRef = ref(database, `businesses/${bizUid}/shifts`)
    const tRef = ref(database, `businesses/${bizUid}/timeLogs`)
    const rRef = ref(database, `businesses/${bizUid}/routines`)
    
    // Fetch all task logs for history dashboard
    const tlRef = ref(database, `businesses/${bizUid}/taskLogs`)
    
    onValue(wRef, (s) => setWorkers(s.val() ? Object.entries(s.val()).map(([id,v])=>({id,...v})) : []))
    onValue(sRef, (s) => setShifts(s.val() ? Object.entries(s.val()).map(([id,v])=>({id,...v})) : []))
    onValue(tRef, (s) => setTimeLogs(s.val() ? Object.entries(s.val()).map(([id,v])=>({id,...v})) : []))
    onValue(rRef, (s) => setRoutines(s.val() ? Object.entries(s.val()).map(([id,v])=>({id,...v})) : []))
    onValue(tlRef, (s) => setTaskLogs(s.val() || {}))
  }, [bizUid])

  const actions = {
    clockIn: (workerId) => update(ref(database, `businesses/${bizUid}/workers/${workerId}`), { clockInTime: new Date().toISOString() }),
    clockOut: async (workerId, startTime) => {
       const endTime = new Date().toISOString()
       await push(ref(database, `businesses/${bizUid}/timeLogs`), { workerId, startTime, endTime })
       await update(ref(database, `businesses/${bizUid}/workers/${workerId}`), { clockInTime: null })
    },
    createWorkerAccount: async (wData, username, password) => {
       const secApp = initializeApp(app.options, "SecWorker_" + Date.now())
       const secAuth = await import('firebase/auth').then(m => m.getAuth(secApp))
       const mAuth = await import('firebase/auth')
       const cred = await mAuth.createUserWithEmailAndPassword(secAuth, toEmail(username), password)
       await mAuth.signOut(secAuth)
       
       const workerId = cred.user.uid
       await set(ref(database, `businesses/${user.uid}/workers/${workerId}`), { name: wData.name, color: wData.color, id: workerId })
       await set(ref(database, `employee_accounts/${workerId}`), { businessId: user.uid, name: wData.name, username })
       
       await deleteApp(secApp)
    },
    updateWorker: (id, u) => update(ref(database, `businesses/${bizUid}/workers/${id}`), u),
    deleteWorker: async (id) => {
       await remove(ref(database, `businesses/${bizUid}/workers/${id}`))
       await remove(ref(database, `employee_accounts/${id}`))
    },
    addShift: (s) => push(ref(database, `businesses/${bizUid}/shifts`), s),
    updateShift: (id, u) => update(ref(database, `businesses/${bizUid}/shifts/${id}`), u),
    deleteShift: (id) => remove(ref(database, `businesses/${bizUid}/shifts/${id}`)),

    addRoutine: (data) => push(ref(database, `businesses/${bizUid}/routines`), data),
    updateRoutine: (id, u) => update(ref(database, `businesses/${bizUid}/routines/${id}`), u),
    deleteRoutine: (id) => remove(ref(database, `businesses/${bizUid}/routines/${id}`)),
    toggleTask: (taskId, isCompleted) => {
        const today = new Date()
        const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0')
        if (isCompleted) {
           set(ref(database, `businesses/${bizUid}/taskLogs/${todayStr}/${taskId}`), {
               completedAt: new Date().toISOString(),
               completedBy: user.uid
           })
        } else {
           remove(ref(database, `businesses/${bizUid}/taskLogs/${todayStr}/${taskId}`))
        }
    },

    // Delete this shift only
    deleteSingleShift: (id) => remove(ref(database, `businesses/${bizUid}/shifts/${id}`)),

    // Delete this shift and all future occurrences with same recurringId
    deleteFutureShifts: (shift, allShifts) => {
      const recurringId = shift.recurringId
      const fromDate = new Date(shift.start)
      const toDelete = allShifts.filter(s =>
        s.recurringId === recurringId && !isBefore(new Date(s.start), fromDate)
      )
      toDelete.forEach(s => remove(ref(database, `businesses/${bizUid}/shifts/${s.id}`)))
    },

    // Reset ALL future recurring shifts from today
    resetFutureRecurringShifts: async (allShifts) => {
      const today = startOfDay(new Date())
      const toDelete = allShifts.filter(s =>
        s.recurringId && isAfter(new Date(s.start), today)
      )
      toDelete.forEach(s => remove(ref(database, `businesses/${bizUid}/shifts/${s.id}`)))
      return toDelete.length
    },

    // Add shift with optional weekly recurrence
    addShiftWithRecurrence: async (shiftData, repeatWeeks, skipFirst = false) => {
      if (!repeatWeeks || repeatWeeks <= 1) {
        return push(ref(database, `businesses/${bizUid}/shifts`), shiftData)
      }
      // Generate a shared recurringId for this series
      const recurringId = `rec_${Date.now()}`
      // skipFirst=true → editing existing shift, so start copies from week 1 (don't duplicate week 0)
      const startW = skipFirst ? 1 : 0
      for (let w = startW; w < repeatWeeks; w++) {
        const start = addWeeks(new Date(shiftData.start), w)
        const end = addWeeks(new Date(shiftData.end), w)
        await push(ref(database, `businesses/${bizUid}/shifts`), {
          ...shiftData,
          start: start.toISOString(),
          end: end.toISOString(),
          recurringId,
          recurringWeek: skipFirst ? w : w + 1,
          recurringTotal: repeatWeeks
        })
      }
    },

    updateBusinessSettings: (updates) => update(ref(database, `businesses/${bizUid}`), updates)
  }

  return (
    <StoreContext.Provider value={{ workers, shifts, timeLogs, routines, taskLogs, ...actions, business: useAuth().business }}>
      {children}
    </StoreContext.Provider>
  )
}

/** DELETE CONFIRM DIALOG **/
const DeleteConfirmDialog = ({ shift, onDeleteSingle, onDeleteFuture, onCancel }) => {
  const isRecurring = !!shift.recurringId
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="card"
        onClick={e => e.stopPropagation()}
        style={{ width: '360px', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#fff1f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Trash2 size={18} color="#ef4444" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>Schicht löschen?</div>
            {isRecurring && (
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Bu mesai haftalık tekrarlıyor</div>
            )}
          </div>
        </div>

        {isRecurring ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button
              onClick={onDeleteSingle}
              style={{ padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <X size={15} color="#64748b" />
              Sadece bu mesaiyi sil
            </button>
            <button
              onClick={onDeleteFuture}
              style={{ padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #fecaca', background: '#fff1f2', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#dc2626' }}
            >
              <Repeat size={15} color="#dc2626" />
              Bu ve sonraki tüm tekrarları sil
            </button>
            <button
              onClick={onCancel}
              style={{ padding: '0.6rem 1rem', borderRadius: '10px', border: 'none', background: 'transparent', fontSize: '0.8rem', cursor: 'pointer', color: '#64748b' }}
            >
              Abbrechen
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={onCancel}
              style={{ flex: 1, padding: '0.65rem', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}
            >
              Abbrechen
            </button>
            <button
              onClick={onDeleteSingle}
              style={{ flex: 1, padding: '0.65rem', borderRadius: '10px', border: 'none', background: '#ef4444', color: '#fff', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 700 }}
            >
              Löschen
            </button>
          </div>
        )}
      </motion.div>
    </div>
  )
}

/** RESET FUTURE SHIFTS DIALOG **/
const ResetFutureDialog = ({ onConfirm, onCancel }) => (
  <div className="modal-overlay" onClick={onCancel}>
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      className="card"
      onClick={e => e.stopPropagation()}
      style={{ width: '380px', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <RefreshCw size={20} color="#f97316" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>Zukünftige Schichten zurücksetzen</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Bugünden sonraki tüm tekrarlayan mesailer silinir</div>
        </div>
      </div>
      <div style={{ fontSize: '0.82rem', color: '#64748b', background: '#fff7ed', border: '1px solid #fed7aa', padding: '0.75rem 1rem', borderRadius: '10px', lineHeight: 1.5 }}>
        ⚠️ Bu işlem geri alınamaz. Bugünden sonraki tüm <strong>haftalık tekrarlayan</strong> mesailer silinecek.
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={onCancel}
          style={{ flex: 1, padding: '0.7rem', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}
        >
          Abbrechen
        </button>
        <button
          onClick={onConfirm}
          style={{ flex: 1, padding: '0.7rem', borderRadius: '10px', border: 'none', background: '#f97316', color: '#fff', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 700 }}
        >
          Sıfırla
        </button>
      </div>
    </motion.div>
  </div>
)

/** COMPONENTS **/
const DASHBOARD_UI_STYLE = { 
  aside: { width: '280px', background: '#fcfcfc', borderRight: '1px solid #eee', display: 'flex', flexDirection: 'column' },
  main: { flexGrow: 1, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column' }
}

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true)
  const [form, setForm] = useState({ username: '', password: '', biz: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, loginEmail, signup, toEmail, globalSettings } = useAuth()

  // Friendly Firebase error messages
  const friendlyError = (code) => {
    const map = {
      'auth/user-not-found': 'Benutzer nicht gefunden.',
      'auth/wrong-password': 'Falsches Passwort.',
      'auth/invalid-credential': 'Benutzername oder Passwort falsch.',
      'auth/email-already-in-use': 'Dieser Benutzername ist bereits vergeben.',
      'auth/weak-password': 'Das Passwort muss mindestens 6 Zeichen lang sein.',
      'auth/too-many-requests': 'Zu viele Versuche. Bitte warten.',
    }
    return map[code] || 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.'
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.username.trim()) return setError('Benutzername darf nicht leer sein.')
    setLoading(true)
    try {
      const isEmail = form.username.includes('@')
      if (isLogin) {
          if (isEmail) await loginEmail(form.username, form.password)
          else await login(form.username, form.password)
      } else {
          if (isEmail) {
             await createUserWithEmailAndPassword(auth, form.username, form.password)
          } else {
             await signup(form.username, form.password, form.biz)
          }
      }
    } catch (err) {
      setError(friendlyError(err.code))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f0f4ff 0%, #f8fafc 60%, #fff7f0 100%)', padding: '2rem 1rem' }}>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="card"
        style={{ width: '400px', padding: '2.5rem', boxShadow: '0 20px 60px rgba(0,0,0,0.1)', border: '1px solid #f1f5f9', margin: 'auto' }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
          {globalSettings?.logoUrl ? (
            <img src={globalSettings.logoUrl} alt="Logo" style={{ height: '48px', objectFit: 'contain', borderRadius: '8px' }} />
          ) : (
            <div style={{ padding: '0.75rem', background: '#0f172a', borderRadius: '12px', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              <LayoutDashboard size={24} />
            </div>
          )}
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {!isLogin && (
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '5px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Betriebsname</label>
              <input
                placeholder="z.B. Cafe Hay"
                required
                value={form.biz}
                onChange={e => setForm({ ...form, biz: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>
          )}

          <div>
            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '5px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Benutzername</label>
            <div style={{ position: 'relative' }}>
              <input
                placeholder="benutzername"
                required
                autoComplete="username"
                value={form.username}
                onChange={e => { setForm({ ...form, username: e.target.value }); setError('') }}
                style={{ width: '100%', paddingLeft: '2.5rem' }}
              />
              <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.85rem', color: '#94a3b8', pointerEvents: 'none', display: form.username.includes('@') ? 'none' : 'block' }}>@</span>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '5px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Passwort</label>
            <input
              type="password"
              placeholder="••••••••"
              required
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              value={form.password}
              onChange={e => { setForm({ ...form, password: e.target.value }); setError('') }}
              style={{ width: '100%' }}
            />
          </div>

          {/* Error message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ background: '#fff1f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '0.6rem 0.85rem', fontSize: '0.78rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <AlertCircle size={13} /> {error}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            className="primary"
            disabled={loading}
            style={{ padding: '0.85rem', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 700, marginTop: '0.25rem', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? '...' : isLogin ? 'Anmelden' : 'Konto erstellen'}
          </button>
        </form>

        {/* Registration is locked to admin only */}
      </motion.div>
    </div>
  )
}

const AdminRoutinesView = () => {
    const { routines, taskLogs, addRoutine, updateRoutine, deleteRoutine } = useStore()
    const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
    const [currentTime, setCurrentTime] = useState(new Date())
    const [openCategory, setOpenCategory] = useState(null)

    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 5000)
        return () => clearInterval(interval)
    }, [])
    
    const todaysLogs = taskLogs[selectedDate] || {}

    return (
        <div style={{ padding: '2rem', display: 'flex', gap: '2rem', height: '100%', overflowY: 'auto', background: '#f8fafc', flexDirection: window.innerWidth < 768 ? 'column' : 'row' }}>
            <div style={{ flex: 1, background: '#fff', padding: '1.5rem', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1rem', color: '#0f172a' }}>Tagesaufgaben verwalten</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {(() => {
                        const grouped = routines.reduce((acc, r) => {
                            const cat = r.category?.trim() || 'Allgemein';
                            if (!acc[cat]) acc[cat] = [];
                            acc[cat].push(r);
                            return acc;
                        }, {});
                        const cats = Object.keys(grouped).sort();
                        return (
                            <>
                                {cats.map(cat => {
                                    const isOpen = openCategory === cat;
                                    return (
                                        <div key={cat} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', background: isOpen ? '#f8fafc' : '#fff', overflow: 'hidden' }}>
                                            <div onClick={() => setOpenCategory(isOpen ? null : cat)} style={{ padding: '1rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isOpen ? '#f1f5f9' : 'transparent' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#475569' }}>
                                                    <Folder size={18} color="#94a3b8" /> {cat}
                                                </div>
                                                <ChevronLeft size={16} style={{ transform: isOpen ? 'rotate(-90deg)' : 'rotate(180deg)', transition: '0.2s', color: '#94a3b8' }} />
                                            </div>
                                            {isOpen && (
                                                <div style={{ padding: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                    {grouped[cat].map(r => (
                                                        <div key={r.id} style={{ padding: '0.75rem', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff' }}>
                                                            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                                                <input value={r.title} onChange={e => updateRoutine(r.id, { title: e.target.value })} style={{ flex: 1, padding: '0.4rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.8rem' }} />
                                                                <button onClick={() => deleteRoutine(r.id)} style={{ background: '#fef2f2', color: '#ef4444', border: 'none', borderRadius: '4px', padding: '0 8px', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                                <input type="time" value={r.startTime || ''} onChange={e => updateRoutine(r.id, { startTime: e.target.value })} style={{ padding: '0.2rem', fontSize: '0.75rem', border: '1px solid #ccc', borderRadius: '4px' }} />
                                                                <span style={{ fontSize: '0.7rem' }}>bis</span>
                                                                <input type="time" value={r.endTime || ''} onChange={e => updateRoutine(r.id, { endTime: e.target.value })} style={{ padding: '0.2rem', fontSize: '0.75rem', border: '1px solid #ccc', borderRadius: '4px' }} />
                                                            </div>
                                                            <div style={{ marginTop: '8px' }}>
                                                                <input placeholder="Kategorie (verschieben)" value={r.category || ''} onChange={e => updateRoutine(r.id, { category: e.target.value })} style={{ width: '100%', padding: '0.4rem', border: '1px dashed #cbd5e1', borderRadius: '4px', fontSize: '0.75rem', background: '#fff' }} />
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <button onClick={() => addRoutine({ title: 'Neue Aufgabe', startTime: '08:00', endTime: '12:00', category: cat === 'Allgemein' ? '' : cat })} className="secondary" style={{ padding: '0.5rem', borderRadius: '8px', border: '1px dashed #cbd5e1', background: 'transparent', cursor: 'pointer', fontSize: '0.8rem' }}>+ Neue Routine in {cat}</button>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                                <div style={{ marginTop: '1rem', padding: '1rem', border: '1px dashed #cbd5e1', borderRadius: '8px', display: 'flex', gap: '8px', alignItems: 'center', background: '#f8fafc' }}>
                                    <input id="newCatInput" placeholder="Ordnername (Kategorie)..." style={{ flex: 1, padding: '0.6rem', fontSize: '0.8rem', border: '1px solid #ccc', borderRadius: '6px' }} />
                                    <button onClick={() => {
                                        const el = document.getElementById('newCatInput');
                                        if(el && el.value.trim()){
                                            const catName = el.value.trim();
                                            addRoutine({ title: 'Neue Aufgabe', startTime: '08:00', endTime: '12:00', category: catName });
                                            setOpenCategory(catName);
                                            el.value = '';
                                        }
                                    }} style={{ padding: '0.6rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Ordner erstellen</button>
                                </div>
                            </>
                        )
                    })()}
                </div>
            </div>

            <div style={{ flex: 1, background: '#fff', padding: '1.5rem', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>Verlauf (Historie)</h2>
                        <button onClick={() => setCurrentTime(new Date())} style={{ background: '#f1f5f9', border: 'none', padding: '6px', borderRadius: '8px', cursor: 'pointer', color: '#64748b', display: 'flex' }} title="Ansicht aktualisieren">
                            <RefreshCw size={14} />
                        </button>
                    </div>
                    <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} />
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {routines.length === 0 && <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Keine Aufgaben vorhanden.</span>}
                    {Object.keys(routines.reduce((acc, r) => { const cat = r.category?.trim() || 'Allgemein'; if (!acc[cat]) acc[cat] = []; acc[cat].push(r); return acc; }, {})).sort().map(cat => {
                        const catRoutines = routines.filter(r => (r.category?.trim() || 'Allgemein') === cat)
                        return (
                            <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: '2px solid #f1f5f9', paddingBottom: '4px' }}>{cat}</div>
                                {catRoutines.map(r => {
                                    const isToday = selectedDate === format(currentTime, 'yyyy-MM-dd')
                                    const isFuture = new Date(selectedDate) > startOfDay(currentTime)
                                    const currHM = format(currentTime, 'HH:mm')
                                    const isDone = !!todaysLogs[r.id]?.completedAt
                                    
                                    let uiState = 'missed'
                                    if (isDone) {
                                        uiState = 'done'
                                    } else if (isToday) {
                                        if (currHM < (r.startTime || "00:00")) {
                                            uiState = 'passive'
                                        } else if (currHM >= (r.startTime || "00:00") && currHM <= (r.endTime || "23:59")) {
                                            uiState = 'active'
                                        } else {
                                            uiState = 'missed'
                                        }
                                    } else if (isFuture) {
                                        uiState = 'passive'
                                    }

                                    const bgColors = { done: '#ecfdf5', active: '#f0f9ff', passive: '#f8fafc', missed: '#fef2f2' }
                                    const textColors = { done: '#065f46', active: '#0369a1', passive: '#64748b', missed: '#991b1b' }
                                    const badgeBg = { done: '#d1fae5', active: '#e0f2fe', passive: '#f1f5f9', missed: '#fee2e2' }
                                    const badgeText = { done: '#10b981', active: '#0ea5e9', passive: '#64748b', missed: '#ef4444' }
                                    const badgeLabel = { done: 'Erledigt ✓', active: 'Aktiv (Wartet)', passive: 'Passiv (Noch nicht Zeit)', missed: 'Verpasst ✕' }
                                    
                                    return (
                                        <div key={r.id} style={{ padding: '1rem', border: `1px solid ${uiState==='passive' ? '#e2e8f0' : '#f1f5f9'}`, borderRadius: '12px', background: bgColors[uiState], display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: textColors[uiState] }}>{r.title}</div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{r.startTime} - {r.endTime}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: badgeText[uiState], background: badgeBg[uiState], padding: '4px 8px', borderRadius: '12px' }}>
                                                    {badgeLabel[uiState]}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

const Calendar = ({ readOnly, isStandalone }) => {
    const { workers, shifts, routines, addRoutine, updateRoutine, deleteRoutine, addShiftWithRecurrence, updateShift, deleteShift, deleteSingleShift, deleteFutureShifts, resetFutureRecurringShifts, importLegacy, addWorker, updateWorker, deleteWorker, createWorkerAccount, business } = useStore()
    const { logout, globalSettings } = useAuth()
    const [selectedWeek, setSelectedWeek] = useState(new Date())
    const [viewMode, setViewMode] = useState('3') // '7', '3', '1'
    const [mobileMenu, setMobileMenu] = useState(false)
    const [modal, setModal] = useState(null)
    const [editW, setEditW] = useState(null)
    const [deleteConfirm, setDeleteConfirm] = useState(null) // { shift }
    const [showResetConfirm, setShowResetConfirm] = useState(false)
    const [resetMsg, setResetMsg] = useState(null)
    const [activePage, setActivePage] = useState('calendar')

    // Shift modal state
    const [repeatWeeks, setRepeatWeeks] = useState(1)
    
    const [now, setNow] = useState(new Date())
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 60000)
        return () => clearInterval(t)
    }, [])

    const wStart = startOfWeek(selectedWeek, { weekStartsOn: 1 })
    const allDays = eachDayOfInterval({ start: wStart, end: addDays(wStart, 6) })
    
    const days = useMemo(() => {
        if (viewMode === '1') return [selectedWeek]
        if (viewMode === '3') {
            return [
                selectedWeek,
                addDays(selectedWeek, 1),
                addDays(selectedWeek, 2)
            ]
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

    // Handle shift delete button click
    const handleDeleteClick = (shift) => {
        setDeleteConfirm({ shift })
    }

    // Handle single delete
    const handleDeleteSingle = () => {
        deleteSingleShift(deleteConfirm.shift.id)
        setDeleteConfirm(null)
    }

    // Handle delete this + future
    const handleDeleteFuture = () => {
        deleteFutureShifts(deleteConfirm.shift, shifts)
        setDeleteConfirm(null)
    }

    // Handle reset future recurring
    const handleResetFuture = async () => {
        const count = await resetFutureRecurringShifts(shifts)
        setShowResetConfirm(false)
        setResetMsg(`${count} tekrarlayan mesai silindi.`)
        setTimeout(() => setResetMsg(null), 3000)
    }

    // Save shift (new or edit)
    const saveShift = async () => {
        if (!modal.workerId) return
        
        // Cleanup empty tasks
        const cleanedTasks = (modal.tasks || []).filter(t => t.title.trim() !== '')

        const s = new Date(modal.start || days[0])
        const [hS, mS] = (modal.s || format(s, 'HH:mm')).split(':')
        s.setHours(hS, mS, 0)
        const e = new Date(modal.start || days[0])
        const [hE, mE] = (modal.e || format(e, 'HH:mm')).split(':')
        e.setHours(hE, mE, 0)

        if (modal.id) {
            // Update the current shift itself
            await updateShift(modal.id, { workerId: modal.workerId, start: s.toISOString(), end: e.toISOString(), tasks: cleanedTasks })
            // If repeat requested, also create future copies starting from NEXT week
            if (repeatWeeks > 1) {
                await addShiftWithRecurrence({
                    workerId: modal.workerId,
                    start: s.toISOString(),
                    end: e.toISOString(),
                    tasks: cleanedTasks
                }, repeatWeeks, true /* skipFirst — bu mesai zaten var */)
            }
        } else {
            await addShiftWithRecurrence({
                workerId: modal.workerId,
                start: s.toISOString(),
                end: e.toISOString(),
                tasks: cleanedTasks
            }, repeatWeeks)
        }
        setModal(null)
        setRepeatWeeks(1)
    }

    return (
        <div style={{ display: 'flex', height: '100dvh', width: '100%', background: '#fcfcfc', overflow: 'hidden' }}>
            <aside style={{ 
                ...DASHBOARD_UI_STYLE.aside,
                display: isStandalone ? 'none' : ((window.innerWidth < 768 && !mobileMenu) ? 'none' : 'flex'),
                position: (window.innerWidth < 768) ? 'fixed' : 'relative',
                zIndex: 1000, height: '100dvh', width: (window.innerWidth < 768) ? '100%' : '280px',
                transition: 'all 0.3s'
            }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {globalSettings?.faviconUrl || globalSettings?.logoUrl ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <img src={globalSettings.faviconUrl || globalSettings.logoUrl} alt="Icon" style={{ height: '28px', width: 'auto', objectFit: 'contain', borderRadius: '6px' }} />
                           <div style={{ fontWeight: 800, fontSize: '1.05rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{globalSettings?.appName || business?.name || 'SOCKET'}</div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <div style={{ width: '28px', height: '28px', background: '#0f172a', borderRadius: '6px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 700 }}>{business?.name?.[0] || 'S'}</div>
                           <div style={{ fontWeight: 800, fontSize: '1.05rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{business?.name || 'SOCKET'}</div>
                        </div>
                    )}
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
                                    {!readOnly && (
                                        <>
                                            <Edit2 size={12} style={{ cursor: 'pointer', opacity: 0.3 }} onClick={()=>setEditW({...w})} />
                                            <Trash2 size={12} style={{ cursor: 'pointer', opacity: 0.3 }} onClick={()=>deleteWorker(w.id)} />
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                        {!readOnly && (
                            <button onClick={()=>setEditW({name: '', color:'#e0f2fe'})} style={{ width: '100%', fontSize: '0.75rem', padding: '0.75rem', border: '1px dashed #ccc', borderRadius: '12px', color: '#999', background: 'transparent' }}>+ Mitarbeiter hinzufügen</button>
                        )}
                    </div>
                    
                    {!readOnly && (
                        <div style={{ marginTop: '2rem' }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#999', marginBottom: '0.75rem', letterSpacing: '0.05em' }}>AUFGABENVERWALTUNG</div>
                            {activePage === 'calendar' ? (
                                <button onClick={() => setActivePage('routines')} style={{ width: '100%', fontSize: '0.8rem', padding: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '12px', color: '#334155', background: '#f8fafc', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <CheckSquare size={16} color="#7c3aed" /> Tagesaufgaben
                                </button>
                            ) : (
                                <button onClick={() => setActivePage('calendar')} style={{ width: '100%', fontSize: '0.8rem', padding: '0.75rem', border: 'none', borderRadius: '12px', color: '#fff', background: '#7c3aed', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(124,58,237,0.2)' }}>
                                    <CalendarIcon size={16} /> Zurück
                                </button>
                            )}
                        </div>
                    )}
                </nav>

                {!readOnly && (
                    <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #eee' }}>
                        <button
                            onClick={() => setShowResetConfirm(true)}
                            style={{ width: '100%', fontSize: '0.72rem', padding: '0.65rem 0.75rem', border: '1px dashed #f97316', borderRadius: '10px', color: '#f97316', background: '#fff7ed11', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}
                        >
                            <RefreshCw size={13} />
                            Zukünftige Schichten zurücksetzen
                        </button>
                        {resetMsg && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: '#16a34a', textAlign: 'center', padding: '0.4rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                ✓ {resetMsg}
                            </div>
                        )}
                    </div>
                )}

                <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <button onClick={logout} style={{ fontSize: '0.85rem', padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#666' }}><LogOut size={16}/> Abmelden</button>
                </div>
            </aside>
            <main style={DASHBOARD_UI_STYLE.main}>
                {activePage === 'routines' ? (
                    <AdminRoutinesView />
                ) : (
                    <>
                        <header style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                {window.innerWidth < 768 && !isStandalone && <LayoutDashboard size={24} onClick={()=>setMobileMenu(true)} style={{ cursor: 'pointer', padding: '4px' }} />}
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
                                {!readOnly && (
                                    <button onClick={()=>{ setModal({}); setRepeatWeeks(1) }} className="primary" style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem' }}>+ Assign</button>
                                )}
                            </div>
                        </header>
                        <div id="calendar-view" style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', background: '#fff' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: `50px repeat(${days.length}, 1fr)`, minHeight: 'fit-content' }}>
                                {/* TIME LABELS SIDEBAR */}
                                <div style={{ borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', minHeight: '560px', background: '#f8fafc' }}>
                                    <div style={{ padding: '0.5rem', height: '62px', borderBottom: '1px solid #eee', boxSizing: 'border-box' }}></div>
                                    <div style={{ position: 'relative', flexGrow: 1 }}>
                                        {hours.map((h, i) => i%2===0 ? (
                                            <div key={h} style={{ position: 'absolute', top: i * 20 - 8, right: 8, fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>
                                                {h}
                                            </div>
                                        ) : null)}
                                    </div>
                                </div>
                                <DndContext sensors={sensors} onDragEnd={(e)=>{
                                     if (readOnly) return;
                                     const { active, over, delta } = e
                                     if(!over) return
                                     const [dayIso] = over.id.split('_')
                                     const s = shifts.find(x => x.id === active.id)
                                     if(s) {
                                         const origStart = new Date(s.start)
                                         const duration = new Date(s.end) - origStart
                                         let newStart = new Date(dayIso)
                                         
                                         const deltaMins = Math.round((delta.y / 40) * 60 / 30) * 30
                                         newStart.setHours(origStart.getHours(), origStart.getMinutes() + deltaMins, 0, 0)
                                         
                                         const minStart = new Date(dayIso)
                                         minStart.setHours(6, 0, 0, 0)
                                         if (newStart < minStart) newStart = minStart
                                         
                                         const newEnd = new Date(newStart.getTime() + duration)
                                         updateShift(s.id, { start: newStart.toISOString(), end: newEnd.toISOString() })
                                     }
                                }}>
                                    {days.map(d => {
                                        const isToday = isSameDay(d, now)
                                        return (
                                        <DroppableCol key={d.toISOString()} day={d} hours={hours}>
                                            <div style={{ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid #eee', background: '#fcfcfc', height: '62px', boxSizing: 'border-box' }}>
                                                <div style={{ fontSize: '0.65rem', color: isToday ? '#ef4444' : '#94a3b8', textTransform: 'uppercase', fontWeight: isToday ? 800 : 600 }}>{format(d, 'EEE')}</div>
                                                <div style={{ 
                                                    fontWeight: 700, 
                                                    width: '28px', 
                                                    height: '28px', 
                                                    margin: '4px auto 0', 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    justifyContent: 'center', 
                                                    borderRadius: '8px', 
                                                    background: isToday ? '#ef4444' : 'transparent', 
                                                    color: isToday ? '#fff' : '#0f172a' 
                                                }}>{format(d, 'd')}</div>
                                            </div>
                                            <div style={{ position: 'relative', flexGrow: 1 }}>
                                                {isToday && now.getHours() >= 6 && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: (differenceInMinutes(now, startOfDay(now).setHours(6,0,0,0)) / 60) * 40,
                                                        left: 0,
                                                        right: 0,
                                                        height: '2px',
                                                        background: '#ef4444',
                                                        zIndex: 50,
                                                        pointerEvents: 'none'
                                                    }}>
                                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', position: 'absolute', top: '-3px', left: '-4px' }} />
                                                    </div>
                                                )}
                                                {shifts.filter(s => isSameDay(new Date(s.start), d)).map(s => {
                                                    const w = workers.find(x => x.id === s.workerId)
                                                    if(!w) return null
                                                    const top = (differenceInMinutes(new Date(s.start), startOfDay(new Date(s.start)).setHours(6,0,0,0)) / 60) * 40
                                                    const h = (differenceInMinutes(new Date(s.end), new Date(s.start)) / 60) * 40
                                                    return <Shift key={s.id} s={s} w={w} top={top} h={h} del={()=>handleDeleteClick(s)} edit={()=>setModal(s)} readOnly={readOnly} viewMode={viewMode} />
                                                })}
                                            </div>
                                        </DroppableCol>
                                    )})}
                                </DndContext>
                            </div>
                            <SummaryTable workers={workers} shifts={shifts} timeLogs={useStore().timeLogs} days={days} />
                        </div>
                    </>
                )}
            </main>

            {/* Modals */}
            <AnimatePresence>
                {/* Shift Create/Edit Modal */}
                {modal && (
                    <div className="modal-overlay" onClick={()=>setModal(null)}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 16 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 16 }}
                            className="card"
                            onClick={e=>e.stopPropagation()}
                            style={{ width: '100%', maxWidth: '400px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '90vh', overflowY: 'auto' }}
                        >
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{modal.id ? 'Schicht bearbeiten' : 'Neue Schicht'}</h3>
                            
                            <select value={modal.workerId} onChange={e=>setModal({...modal, workerId: e.target.value})}>
                                <option>Mitarbeiter auswählen</option>
                                {workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Datum</label>
                                    <input 
                                        type="date" 
                                        value={format(new Date(modal.start || days[0]), 'yyyy-MM-dd')}
                                        onChange={e => {
                                            if (!e.target.value) return
                                            const d = new Date(e.target.value)
                                            setModal({...modal, start: d.toISOString(), end: d.toISOString()})
                                        }}
                                        style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.85rem' }} 
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Start</label>
                                        <input type="time" onChange={e=>setModal({...modal, s: e.target.value})} defaultValue={modal.start ? format(new Date(modal.start), 'HH:mm') : '09:00'} style={{ width: '100%', boxSizing: 'border-box' }} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Ende</label>
                                        <input type="time" onChange={e=>setModal({...modal, e: e.target.value})} defaultValue={modal.end ? format(new Date(modal.end), 'HH:mm') : '17:00'} style={{ width: '100%', boxSizing: 'border-box' }} />
                                    </div>
                                </div>
                            </div>

                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <CheckSquare size={14} color="#7c3aed"/> Schicht-Aufgaben (Todo)
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {(modal.tasks || []).map((t, i) => (
                                        <div key={t.id || i} style={{ display: 'flex', gap: '4px' }}>
                                            <input value={t.title} onChange={e => {
                                                const newTasks = [...(modal.tasks || [])]
                                                newTasks[i].title = e.target.value
                                                setModal({...modal, tasks: newTasks})
                                            }} placeholder="Aufgabe..." style={{ flex: 1, padding: '0.4rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.8rem' }} />
                                            <button onClick={() => {
                                                const newTasks = [...(modal.tasks || [])]
                                                newTasks.splice(i, 1)
                                                setModal({...modal, tasks: newTasks})
                                            }} style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', padding: '0 8px', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                        </div>
                                    ))}
                                    <button onClick={() => setModal({...modal, tasks: [...(modal.tasks || []), { id: Date.now().toString(), title: '' }]})} className="secondary" style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', fontSize: '0.75rem', border: '1px dashed #cbd5e1', background: 'transparent', color: '#64748b', fontWeight: 600 }}>+ Aufgabe hinzufügen</button>
                                </div>
                            </div>

                            {/* Weekly repeat — available for both new & existing shifts */}
                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Repeat size={14} color="#7c3aed" />
                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#7c3aed' }}>Wöchentliche Wiederholung</span>
                                    </div>
                                    {modal.id && modal.recurringId && (
                                        <span style={{ fontSize: '0.65rem', background: '#ede9fe', color: '#7c3aed', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>
                                            Serie {modal.recurringWeek}/{modal.recurringTotal}
                                        </span>
                                    )}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <label style={{ fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                                        {modal.id ? 'Für wie viele Wochen ab hier?' : 'Wie viele Wochen?'}
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={52}
                                        value={repeatWeeks}
                                        onChange={e => setRepeatWeeks(Math.max(1, parseInt(e.target.value) || 1))}
                                        style={{ width: '80px', padding: '0.4rem 0.6rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', fontWeight: 600 }}
                                    />
                                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                        {repeatWeeks <= 1 ? 'Keine Wiederholung' : `${repeatWeeks} Wochen`}
                                    </span>
                                </div>

                                {repeatWeeks > 1 && (
                                    <div style={{ marginTop: '0.6rem', fontSize: '0.7rem', color: '#7c3aed', background: '#f5f3ff', padding: '0.4rem 0.65rem', borderRadius: '8px', lineHeight: 1.5 }}>
                                        {modal.id
                                            ? `✦ Diese Schicht wird aktualisiert + für die nächsten ${repeatWeeks - 1} Wochen kopiert`
                                            : `✦ Diese Schicht wird jede Woche am selben Tag ${repeatWeeks} mal erstellt`
                                        }
                                    </div>
                                )}
                            </div>

                            <button className="primary" onClick={saveShift} style={{ padding: '0.75rem', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 700 }}>
                                {modal.id
                                    ? repeatWeeks > 1 ? `Speichern + ${repeatWeeks - 1} Wochen wiederholen` : 'Speichern'
                                    : repeatWeeks > 1 ? `${repeatWeeks} Schichten erstellen` : 'Schicht erstellen'
                                }
                            </button>
                        </motion.div>
                    </div>
                )}



                {/* Worker Edit Modal */}
                {editW && (
                    <div className="modal-overlay" onClick={()=>setEditW(null)}>
                        <div className="card" onClick={e=>e.stopPropagation()} style={{ width: '100%', maxWidth: '320px', padding: '1.5rem', display:'flex', flexDirection:'column', gap:'0.75rem', maxHeight: '90vh', overflowY: 'auto' }}>
                            <h3 style={{margin:0}}>{editW.id ? 'Mitarbeiter bearbeiten' : 'Neuer Mitarbeiter (Zugang gewähren)'}</h3>
                            <input placeholder="Vor- und Nachname" value={editW.name} onChange={e=>setEditW({...editW, name: e.target.value})} style={{padding:'0.5rem', borderRadius:'8px', border:'1px solid #ccc'}} />
                            {!editW.id && (
                                <>
                                  <input placeholder="Benutzername (für Login)" value={editW.username || ''} onChange={e=>setEditW({...editW, username: e.target.value})} style={{padding:'0.5rem', borderRadius:'8px', border:'1px solid #ccc'}} />
                                  <input type="password" placeholder="Passwort" value={editW.password || ''} onChange={e=>setEditW({...editW, password: e.target.value})} style={{padding:'0.5rem', borderRadius:'8px', border:'1px solid #ccc'}} />
                                </>
                            )}
                            <label style={{fontSize:'0.75rem', fontWeight:600, color:'#666'}}>Farbauswahl:</label>
                            <HexColorPicker color={editW.color} onChange={c=>setEditW({...editW, color: c})} style={{width:'100%'}} />
                            <button className="primary" style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', marginTop:'0.5rem' }} onClick={()=>{
                                if(editW.id) updateWorker(editW.id, editW)
                                else {
                                  if(!editW.username || !editW.password) { alert('Bitte Benutzername und Passwort eingeben'); return; }
                                  createWorkerAccount(editW, editW.username, editW.password)
                                }
                                setEditW(null)
                            }}>{editW.id ? 'Speichern' : 'Mitarbeiter hinzufügen'}</button>
                        </div>
                    </div>
                )}

                {/* Delete Confirm Dialog */}
                {deleteConfirm && (
                    <DeleteConfirmDialog
                        shift={deleteConfirm.shift}
                        onDeleteSingle={handleDeleteSingle}
                        onDeleteFuture={handleDeleteFuture}
                        onCancel={() => setDeleteConfirm(null)}
                    />
                )}

                {/* Reset Future Recurring Dialog */}
                {showResetConfirm && (
                    <ResetFutureDialog
                        onConfirm={handleResetFuture}
                        onCancel={() => setShowResetConfirm(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}

const SummaryTable = ({ workers, shifts, timeLogs = [], days }) => {
    const isLogThisWeek = (l) => {
        if (!days || days.length === 0) return true
        return l.startTime && new Date(l.startTime) >= startOfDay(days[0]) && l.endTime && new Date(l.endTime) <= endOfDay(days[days.length-1])
    }
    const weeklyLogs = timeLogs.filter(isLogThisWeek)

    const schedTotal = workers.reduce((sum, w) => sum + shifts.filter(s=>s.workerId===w.id).reduce((t,s)=>(t+(new Date(s.end)-new Date(s.start))/3600000),0), 0)
    const actualTotal = weeklyLogs.reduce((sum, l) => sum + (new Date(l.endTime)-new Date(l.startTime))/3600000, 0)
    
    return (
        <div style={{ padding: '1rem 1.5rem', background: '#fff', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, display: 'flex', gap: '1rem' }}>
               <span>Geplant: {schedTotal.toFixed(1)} Std.</span>
               <span style={{ color: '#16a34a' }}>Tatsächlich: {actualTotal.toFixed(1)} Std.</span>
            </div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap:'wrap', justifyContent:'flex-end' }}>
                {workers.map(w => {
                    const sched = shifts.filter(s=>s.workerId===w.id).reduce((t,s)=>(t+(new Date(s.end)-new Date(s.start))/3600000),0)
                    const act = weeklyLogs.filter(l=>l.workerId===w.id).reduce((t,l)=>(t+(new Date(l.endTime)-new Date(l.startTime))/3600000),0)
                    if(sched === 0 && act === 0) return null
                    return (
                       <div key={w.id} style={{ fontSize: '0.75rem', display:'flex', flexDirection:'column', alignItems:'center', background:'#f8fafc', padding:'4px 8px', borderRadius:'8px' }}>
                          <b>{w.name}</b>
                          <span>{sched.toFixed(1)} Std. / <span style={{color:'#16a34a'}}>{act.toFixed(1)} Std.</span></span>
                       </div>
                    )
                })}
            </div>
        </div>
    )
}

const DroppableCol = ({ day, hours, children }) => {
    const { setNodeRef } = useDroppable({ id: `${day.toISOString()}_0` })
    return <div ref={setNodeRef} style={{ borderRight: '1px solid #eee', position: 'relative', display: 'flex', flexDirection: 'column', minHeight: '560px' }}>{children}<div style={{ position: 'absolute', inset: 0, zIndex: -1 }}>{hours.map((_,i)=><div key={i} style={{ height: '20px', borderBottom: i%2===1 ? '1px solid #e2e8f0' : 'none' }} />)}</div></div>
}

const Shift = ({ s, w, top, h, del, edit, readOnly, viewMode }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: s.id, disabled: readOnly })
    const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 100 } : undefined
    
    const formatTime = (dateStr) => {
        const d = new Date(dateStr)
        return isNaN(d.getTime()) ? '--:--' : format(d, 'HH:mm')
    }

    const shortName = (name) => {
        if (!name) return ''
        const parts = name.trim().split(' ')
        if (viewMode === '7') {
           return parts.map(p => p.charAt(0).toUpperCase() + '.').join('')
        }
        if (parts.length === 1) return parts[0]
        const last = parts.pop()
        return `${parts.join(' ')} ${last.charAt(0)}.`
    }

    return (
        <div ref={setNodeRef} style={{ position: 'absolute', top, height: h, left: 4, right: 4, background: w.color+'aa', borderRadius: '10px', padding: '10px', border: `1px solid ${w.color}`, backdropFilter: 'blur(4px)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', overflow: 'hidden', ...style }} {...listeners} {...attributes}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
                    <b style={{ color: '#000', pointerEvents: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shortName(w.name)}</b>
                    {s.recurringId && <Repeat size={9} color="#7c3aed" style={{ opacity: 0.7, flexShrink: 0 }} />}
                </div>
                {!readOnly && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <Edit2 size={14} style={{ cursor: 'pointer', color: '#000' }} onPointerDown={(e)=>{e.stopPropagation(); edit()}} />
                        <X size={14} style={{ cursor: 'pointer', color: '#000' }} onPointerDown={(e)=>{e.stopPropagation(); del()}} />
                    </div>
                )}
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

const WorkerHome = () => {
    const { user, logout, business, globalSettings } = useAuth()
    const { workers, timeLogs, shifts, routines, taskLogs, toggleTask, clockIn, clockOut } = useStore()
    const [view, setView] = useState('clock')

    const me = workers.find(w => w.id === user.uid)
    const isClockedIn = !!me?.clockInTime

    const todayLogs = timeLogs.filter(l => l.workerId === user.uid && l.endTime && isSameDay(new Date(l.startTime), new Date()))
    const workedMs = todayLogs.reduce((acc, l) => acc + (new Date(l.endTime) - new Date(l.startTime)), 0)
    
    const currentMs = isClockedIn ? (new Date() - new Date(me.clockInTime)) : 0
    const workedHours = ((workedMs + currentMs) / 3600000).toFixed(1)

    const [currentTime, setCurrentTime] = useState(new Date())
    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 1000)
        return () => clearInterval(interval)
    }, [])

    const myUpcomingShifts = shifts
      .filter(s => s.workerId === user.uid && new Date(s.start) > currentTime)
      .sort((a,b) => new Date(a.start) - new Date(b.start));
    const nextShift = myUpcomingShifts[0];

    let nextShiftStr = '';
    let nextShiftRemaining = '';
    if (nextShift) {
        const start = new Date(nextShift.start);
        const ms = start - currentTime;
        const d = Math.floor(ms / (1000 * 60 * 60 * 24));
        const h = Math.floor((ms / (1000 * 60 * 60)) % 24);
        const m = Math.floor((ms / 1000 / 60) % 60);

        if (isSameDay(start, currentTime)) {
            nextShiftStr = `Heute, ${format(start, 'HH:mm')}`;
        } else if (isSameDay(start, addDays(currentTime, 1))) {
            nextShiftStr = `Morgen, ${format(start, 'HH:mm')}`;
        } else {
            nextShiftStr = `${format(start, 'dd.MM.')}, ${format(start, 'HH:mm')}`;
        }

        if (d > 0) nextShiftRemaining = `${d}d ${h}h`;
        else if (h > 0) nextShiftRemaining = `${h}h ${m}m`;
        else nextShiftRemaining = `${m}m`;
    }

    if (view === 'shiftDetails' && nextShift) {
        const tasks = nextShift.tasks || []
        const startStr = format(new Date(nextShift.start), 'dd.MM.yyyy HH:mm')
        const endStr = format(new Date(nextShift.end), 'HH:mm')
        
        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f8fafc' }}>
                <button onClick={() => setView('clock')} style={{ padding: '1rem', width: '100%', border: 'none', background: '#fff', fontWeight: 800, color: '#0f172a', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
                    <ChevronLeft size={18} /> Zurück
                </button>
                <div style={{ flexGrow: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '420px', background: '#fff', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.2rem' }}>Schichtdetails</div>
                        <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem' }}>{startStr} - {endStr}</div>
                        
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <CheckSquare size={18} color="#0284c7" /> Schicht-Aufgaben
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {tasks.length === 0 && <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Keine Aufgaben für diese Schicht.</div>}
                            {tasks.map((t, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0284c7' }} />
                                    <div style={{ flex: 1, fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>{t.title}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    if (view === 'calendar') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f8fafc' }}>
                <button 
                  onClick={() => setView('clock')} 
                  style={{ padding: '1rem', width: '100%', border: 'none', background: '#fff', fontWeight: 800, color: '#0f172a', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', zIndex: 50, boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}
                >
                    <ChevronLeft size={18} /> Zurück
                </button>
                <div style={{ flexGrow: 1, position: 'relative', overflow: 'hidden' }}>
                   <Calendar readOnly={true} />
                </div>
            </div>
        )
    }

    if (view === 'tasks') {
        const todayShifts = shifts.filter(s => s.workerId === user.uid && isSameDay(new Date(s.start), new Date()))
        const currHM = format(currentTime, 'HH:mm')
        
        const todayStr = `${currentTime.getFullYear()}-${String(currentTime.getMonth()+1).padStart(2,'0')}-${String(currentTime.getDate()).padStart(2,'0')}`
        const todaysLogs = taskLogs[todayStr] || {}
        
        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f8fafc' }}>
                <button 
                  onClick={() => setView('clock')} 
                  style={{ padding: '1rem', width: '100%', border: 'none', background: '#fff', fontWeight: 800, color: '#0f172a', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', zIndex: 50, boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}
                >
                    <ChevronLeft size={18} /> Zurück
                </button>
                
                <div style={{ flexGrow: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        
                        <div className="card" style={{ background: '#fff', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <CheckSquare size={18} color="#7c3aed" /> Tagesaufgaben (Routinen)
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                {routines.length === 0 && <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Keine Tagesaufgaben gefunden.</div>}
                                {Object.keys(routines.reduce((acc, r) => { const cat = r.category?.trim() || 'Allgemein'; if (!acc[cat]) acc[cat] = []; acc[cat].push(r); return acc; }, {})).sort().map(cat => {
                                    const catRoutines = routines.filter(r => (r.category?.trim() || 'Allgemein') === cat)
                                    return (
                                        <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', borderBottom: '2px solid #f1f5f9', paddingBottom: '4px' }}>{cat}</div>
                                            {catRoutines.map(r => {
                                                const isActive = currHM >= (r.startTime || "00:00") && currHM <= (r.endTime || "23:59")
                                                const isDone = !!todaysLogs[r.id]?.completedAt
                                                return (
                                                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1rem', background: isActive ? '#f8fafc' : '#f1f5f9', borderRadius: '12px', opacity: isActive ? 1 : 0.6, border: '1px solid #e2e8f0' }}>
                                                        <input type="checkbox" disabled={!isActive} checked={isDone} onChange={e => toggleTask(r.id, e.target.checked)} style={{ width: '20px', height: '20px', accentColor: '#10b981' }} />
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: isActive ? '#334155' : '#94a3b8', textDecoration: isDone ? 'line-through' : 'none' }}>{r.title}</div>
                                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{r.startTime} - {r.endTime}</div>
                                                        </div>
                                                        {!isActive && <div style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 700 }}>Inaktiv</div>}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {todayShifts.map(s => {
                            const now = new Date()
                            const isActive = now >= new Date(s.start) && now <= new Date(s.end)
                            const tasks = s.tasks || []
                            
                            return (
                              <div key={s.id} className="card" style={{ background: '#fff', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <CheckSquare size={18} color="#0284c7" /> Meine Schicht-Aufgaben
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1rem' }}>
                                      Schicht: {format(new Date(s.start), 'HH:mm')} - {format(new Date(s.end), 'HH:mm')}
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                      {tasks.length === 0 && <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Keine Aufgaben für diese Schicht.</div>}
                                      {tasks.map(t => {
                                          const isDone = !!todaysLogs[t.id]?.completedAt
                                          return (
                                              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1rem', background: isActive ? '#f0f9ff' : '#f1f5f9', borderRadius: '12px', opacity: isActive ? 1 : 0.6, border: '1px solid #e0f2fe' }}>
                                                  <input type="checkbox" disabled={!isActive} checked={isDone} onChange={e => toggleTask(t.id, e.target.checked)} style={{ width: '20px', height: '20px', accentColor: '#0284c7' }} />
                                                  <div style={{ flex: 1, fontSize: '0.9rem', fontWeight: 600, color: isActive ? '#0369a1' : '#94a3b8', textDecoration: isDone ? 'line-through' : 'none' }}>
                                                      {t.title}
                                                  </div>
                                                  {!isActive && <div style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 700 }}>Inaktiv</div>}
                                              </div>
                                          )
                                      })}
                                  </div>
                              </div>
                            )
                        })}
                        
                    </div>
                </div>
            </div>
        )
    }

    const logoToShow = business?.logoUrl || globalSettings?.logoUrl
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f8fafc', padding: '1rem', overflow: 'hidden' }}>
            
            {/* Top Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: '400px', margin: '0 auto 0.5rem auto' }}>
                {logoToShow ? (
                    <img src={logoToShow} alt="Logo" style={{ height: '32px', maxWidth: '180px', objectFit: 'contain' }} />
                ) : (
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>SOCKET</div>
                )}
                <button onClick={logout} style={{ padding: '0.6rem', borderRadius: '12px', border: 'none', background: '#fff', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    <LogOut size={18} />
                </button>
            </div>
            
            <div style={{ flexGrow: 1, width: '100%', maxWidth: '400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', justifyContent: 'center' }}>
                
                {/* Greeting & Info Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '1rem 1.25rem', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.01)' }}>
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '2px' }}>Hallo,</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{me?.name || 'Mitarbeiter'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '2px' }}>Uhrzeit</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981', fontVariantNumeric: 'tabular-nums' }}>{format(currentTime, 'HH:mm:ss')}</div>
                    </div>
                </div>

                {/* Main Action Block */}
                <div style={{ background: '#fff', borderRadius: '24px', padding: '1.5rem', textAlign: 'center', border: '1px solid #e2e8f0', boxShadow: '0 4px 25px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', marginBottom: '0.5rem' }}>Zeiterfassung</div>
                        <div style={{ fontSize: '3rem', fontWeight: 900, color: '#0f172a', lineHeight: 1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                            {String(Math.floor(currentMs/3600000)).padStart(2,'0')}:{String(Math.floor((currentMs%3600000)/60000)).padStart(2,'0')}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, marginTop: '0.5rem' }}>Heute gesamt: {workedHours} Std.</div>
                    </div>
                    
                    <button 
                        onClick={() => isClockedIn ? clockOut(user.uid, me.clockInTime) : clockIn(user.uid)}
                        style={{ 
                            background: isClockedIn ? '#ef4444' : '#10b981', 
                            color: '#fff', 
                            fontWeight: 800, 
                            fontSize: '1rem', 
                            padding: '1.1rem', 
                            borderRadius: '16px', 
                            border: 'none', 
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            boxShadow: isClockedIn ? '0 10px 20px -5px rgba(239, 68, 68, 0.4)' : '0 10px 20px -5px rgba(16, 185, 129, 0.4)'
                        }}
                    >
                        {isClockedIn ? 'Arbeit beenden' : 'Arbeit beginnen'}
                    </button>
                </div>

                {/* Next Shift Box */}
                {nextShift && (
                    <div style={{ padding: '1rem 1.25rem', background: '#f8fafc', borderRadius: '18px', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Nächste Schicht</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>{nextShiftStr}</div>
                                <div style={{ fontSize: '0.7rem', color: '#f97316', background: '#fff7ed', padding: '2px 6px', borderRadius: '6px', fontWeight: 700 }}>in {nextShiftRemaining}</div>
                            </div>
                        </div>
                        <button onClick={() => setView('shiftDetails')} style={{ padding: '0.6rem 0.85rem', borderRadius: '12px', border: 'none', background: '#fff', color: '#0f172a', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>Details</button>
                    </div>
                )}

                {/* Bottom Apps */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <button onClick={() => setView('tasks')} style={{ background: '#fff', padding: '1.25rem 1rem', borderRadius: '20px', border: '1px solid #e2e8f0', fontWeight: 800, color: '#0f172a', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                        <div style={{ background: '#fef2f2', padding: '10px', borderRadius: '12px' }}><CheckSquare size={20} color="#ef4444" /></div>
                        Aufgaben
                    </button>
                    <button onClick={() => setView('calendar')} style={{ background: '#fff', padding: '1.25rem 1rem', borderRadius: '20px', border: '1px solid #e2e8f0', fontWeight: 800, color: '#0f172a', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                        <div style={{ background: '#f0fdf4', padding: '10px', borderRadius: '12px' }}><CalendarIcon size={20} color="#10b981" /></div>
                        Kalender
                    </button>
                </div>

            </div>

            {/* Footer Branding */}
            <div style={{ textAlign: 'center', padding: '1rem 0', opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em' }}>powered by</span>
                <div style={{ fontSize: '0.85rem', fontWeight: 900, color: '#475569', letterSpacing: '-0.02em' }}>SOCKET</div>
            </div>
        </div>
    )
}

/* BUSINESS LAYOUT & PAGES */
const StandaloneMitarbeiter = ({ onBack }) => {
    const { workers, deleteWorker, createWorkerAccount, updateWorker } = useStore()
    const [editW, setEditW] = useState(null)
    
    return (
        <div style={{ minHeight: '100dvh', background: '#f8fafc', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column' }}>
             <button onClick={onBack} style={{ alignSelf: 'flex-start', padding: '0.8rem 1.25rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
                 <ChevronLeft size={16} /> Zurück
             </button>
             <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1.5rem', flexGrow: 1, maxWidth: '600px', width: '100%', margin: '0 auto' }}>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: 0, marginBottom: '1.5rem' }}>Mitarbeiter Liste</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {workers.map(w => (
                          <div key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: '#f8f9fa', border: '1px solid #eee', borderRadius: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: w.color }} />
                                  <b style={{ fontSize: '1.05rem' }}>{w.name}</b>
                              </div>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                  <button onClick={()=>setEditW({...w})} style={{ padding: '0.5rem', background: '#fff', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer' }}><Edit2 size={16} /></button>
                                  <button onClick={()=>deleteWorker(w.id)} style={{ padding: '0.5rem', background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444', borderRadius: '8px', cursor: 'pointer' }}><Trash2 size={16} /></button>
                              </div>
                          </div>
                      ))}
                      <button onClick={()=>setEditW({name: '', color:'#e0f2fe'})} style={{ padding: '1rem', border: '2px dashed #cbd5e1', borderRadius: '12px', background: 'transparent', color: '#64748b', fontWeight: 700, cursor: 'pointer', marginTop: '1rem' }}>+ Mitarbeiter hinzufügen</button>
                  </div>
             </div>

            {/* Worker Edit Modal */}
            {editW && (
                <div className="modal-overlay" onClick={()=>setEditW(null)}>
                    <div className="card" onClick={e=>e.stopPropagation()} style={{ width: '360px', padding: '2rem', display:'flex', flexDirection:'column', gap:'1rem' }}>
                        <h3 style={{margin:0, fontSize: '1.25rem', fontWeight: 800}}>{editW.id ? 'Mitarbeiter bearbeiten' : 'Neuer Mitarbeiter'}</h3>
                        <input placeholder="Vor- und Nachname" value={editW.name} onChange={e=>setEditW({...editW, name: e.target.value})} style={{padding:'0.75rem', borderRadius:'10px', border:'1px solid #ccc'}} />
                        {!editW.id && (
                            <>
                              <input placeholder="Benutzername (für Login)" value={editW.username || ''} onChange={e=>setEditW({...editW, username: e.target.value})} style={{padding:'0.75rem', borderRadius:'10px', border:'1px solid #ccc'}} />
                              <input type="password" placeholder="Passwort" value={editW.password || ''} onChange={e=>setEditW({...editW, password: e.target.value})} style={{padding:'0.75rem', borderRadius:'10px', border:'1px solid #ccc'}} />
                            </>
                        )}
                        <label style={{fontSize:'0.85rem', fontWeight:700, color:'#333'}}>Farbe für Kalender:</label>
                        <HexColorPicker color={editW.color} onChange={c=>setEditW({...editW, color: c})} style={{width:'100%'}} />
                        <button className="primary" style={{ width: '100%', padding: '0.85rem', borderRadius: '10px', marginTop:'0.5rem', fontWeight: 700 }} onClick={()=>{
                            if(editW.id) updateWorker(editW.id, editW)
                            else {
                                if(!editW.username || !editW.password) { alert('Bitte Benutzername und Passwort eingeben'); return; }
                                createWorkerAccount(editW, editW.username, editW.password)
                            }
                            setEditW(null)
                        }}>{editW.id ? 'Speichern' : 'Hinzufügen'}</button>
                    </div>
                </div>
            )}
        </div>
    )
}

const TagesReport = ({ onBack }) => {
    const { timeLogs = [], taskLogs = {}, routines, workers } = useStore()
    const [openDays, setOpenDays] = useState({})

    const sortedLogs = [...timeLogs].sort((a,b) => new Date(b.startTime) - new Date(a.startTime))
    const grouped = {}
    sortedLogs.forEach(l => {
       const dStr = format(new Date(l.startTime), 'yyyy-MM-dd')
       if(!grouped[dStr]) grouped[dStr] = { logs: [], dateObj: new Date(l.startTime) }
       grouped[dStr].logs.push(l)
    })
    
    // Check if taskLogs has dates not in timeLogs
    Object.keys(taskLogs).forEach(dStr => {
        if(!grouped[dStr]) grouped[dStr] = { logs: [], dateObj: parseISO(dStr) }
    })

    const sortedDates = Object.keys(grouped).sort((a,b) => grouped[b].dateObj - grouped[a].dateObj)
    const toggle = (d) => setOpenDays(p => ({...p, [d]: !p[d]}))

    return (
        <div style={{ minHeight: '100dvh', background: '#f8fafc', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column' }}>
             <button onClick={onBack} style={{ alignSelf: 'flex-start', padding: '0.8rem 1.25rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
                 <ChevronLeft size={16} /> Zurück
             </button>
             <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: 0, marginBottom: '1.5rem', textAlign: 'center' }}>Tages Report</h2>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '700px', width: '100%', margin: '0 auto' }}>
                 {sortedDates.map((dStr, i) => {
                     const logs = grouped[dStr].logs
                     const tLogs = taskLogs[dStr] || {}
                     const isOpen = openDays[dStr] !== undefined ? openDays[dStr] : (i === 0)
                     
                     return (
                         <div key={dStr} style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <div onClick={() => toggle(dStr)} style={{ padding: '1.25rem 1.5rem', background: isOpen ? '#f1f5f9' : '#fff', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{format(grouped[dStr].dateObj, 'EEEE, dd.MM.yyyy')}</div>
                                <div>{isOpen ? <ChevronLeft style={{transform: 'rotate(90deg)'}} size={20}/> : <ChevronLeft style={{transform: 'rotate(-90deg)'}} size={20}/>}</div>
                            </div>
                            {isOpen && (
                                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                    <div>
                                        <h4 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}><Clock size={16} color="#0284c7" /> Zeiterfassung</h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {logs.length === 0 && <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Keine Einträge gesondert gefunden.</div>}
                                            {logs.map((l, idx) => {
                                                const w = workers.find(x=>x.id===l.workerId)
                                                const h = l.endTime ? ((new Date(l.endTime) - new Date(l.startTime))/3600000).toFixed(1) : 'Aktiv'
                                                return (
                                                   <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', border: '1px solid #e0f2fe', borderRadius: '12px', background: '#f0f9ff' }}>
                                                      <div><b style={{ color: '#0369a1' }}>{w?.name || 'Mitarbeiter'}</b> <span style={{fontSize:'0.8rem', color:'#0ea5e9', marginLeft:'8px'}}>{format(new Date(l.startTime),'HH:mm')} - {l.endTime ? format(new Date(l.endTime),'HH:mm') : '...'}</span></div>
                                                      <div style={{fontWeight: 800, color: l.endTime ? '#0284c7' : '#10b981'}}>{h} {l.endTime ? 'Std.' : ''}</div>
                                                   </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                    <div>
                                        <h4 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}><CheckSquare size={16} color="#10b981" /> Tagesaufgaben Status</h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                            {Object.keys(routines.reduce((acc, r) => { const cat = r.category?.trim() || 'Allgemein'; if (!acc[cat]) acc[cat] = []; acc[cat].push(r); return acc; }, {})).sort().map(cat => {
                                                const catRoutines = routines.filter(r => (r.category?.trim() || 'Allgemein') === cat)
                                                return (
                                                   <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                       <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>{cat}</div>
                                                       {catRoutines.map(r => {
                                                           const isDone = !!tLogs[r.id]?.completedAt
                                                           return (
                                                               <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1rem', border: `1px solid ${isDone ? '#a7f3d0' : '#fecaca'}`, borderRadius: '12px', background: isDone ? '#ecfdf5' : '#fef2f2' }}>
                                                                   {isDone ? <Check size={18} color="#10b981" /> : <X size={18} color="#ef4444" />}
                                                                   <span style={{ fontSize: '0.95rem', fontWeight: 600, color: isDone ? '#065f46' : '#991b1b', textDecoration: isDone ? 'line-through' : 'none' }}>{r.title}</span>
                                                               </div>
                                                           )
                                                       })}
                                                   </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}
                         </div>
                     )
                 })}
             </div>
        </div>
    )
}

const BusinessHome = () => {
    const { logout, business, globalSettings } = useAuth()
    const { updateBusinessSettings } = useStore()
    const [view, setView] = useState('home')
    const [showSettings, setShowSettings] = useState(false)
    const [logoUrl, setLogoUrl] = useState(business?.logoUrl || '')

    const handleLogoUpload = (e) => {
        const file = e.target.files[0]
        if (!file) return
        if (file.size > 1024 * 1024) { // 1MB limit for base64 RTDB storage
            alert('Das Logo ist zu groß. Bitte ein Bild unter 1MB wählen.')
            return
        }
        const reader = new FileReader()
        reader.onloadend = () => {
            setLogoUrl(reader.result)
        }
        reader.readAsDataURL(file)
    }

    if (view === 'schichtplan') return <div style={{height:'100dvh',display:'flex',flexDirection:'column'}}><div style={{padding:'1rem', background:'#fff', borderBottom:'1px solid #eee'}}><button onClick={() => setView('home')} style={{ padding:'0.75rem 1.25rem', borderRadius:'8px', border:'1px solid #e2e8f0', background:'#f8fafc', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:'8px' }}><ChevronLeft size={16}/> Zurück zum Menü</button></div><div style={{flexGrow:1,position:'relative',minHeight:0,overflow:'hidden'}}><Calendar readOnly={false} isStandalone={true} /></div></div>
    if (view === 'tagesaufgaben') return <div style={{height:'100dvh',display:'flex',flexDirection:'column'}}><div style={{padding:'1rem', background:'#fff', borderBottom:'1px solid #eee'}}><button onClick={() => setView('home')} style={{ padding:'0.75rem 1.25rem', borderRadius:'8px', border:'1px solid #e2e8f0', background:'#f8fafc', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:'8px' }}><ChevronLeft size={16}/> Zurück zum Menü</button></div><div style={{flexGrow:1,position:'relative',minHeight:0,overflow:'hidden'}}><AdminRoutinesView /></div></div>
    if (view === 'mitarbeiter') return <StandaloneMitarbeiter onBack={() => setView('home')} />
    if (view === 'tagesreport') return <TagesReport onBack={() => setView('home')} />

    return (
        <div style={{ minHeight: '100dvh', background: '#f8fafc', padding: '3rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
             
             {/* Header / Config */}
             <div style={{ width: '100%', maxWidth: '480px', display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
                 <button onClick={()=>setShowSettings(true)} style={{ padding: '0.6rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.8rem' }}><Settings size={16} /> Einstellungen</button>
             </div>

             {/* Logo */}
             <div style={{ width: '100%', maxWidth: '480px', marginBottom: '3rem', display: 'flex', justifyContent: 'center' }}>
                 {business?.logoUrl ? (
                     <img src={business.logoUrl} alt="Business Logo" style={{ height: '64px', objectFit: 'contain' }} />
                 ) : globalSettings?.logoUrl ? (
                     <img src={globalSettings.logoUrl} alt="Platform Logo" style={{ height: '48px', objectFit: 'contain', opacity: 0.5 }} />
                 ) : (
                     <div style={{ fontSize: '2rem', fontWeight: 900, color: '#334155' }}>
                         {business?.name}
                     </div>
                 )}
             </div>

             {/* Menu Buttons */}
             <div style={{ width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '1rem', flexGrow: 1 }}>
                 <button onClick={() => setView('schichtplan')} style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', fontWeight: 800, fontSize: '1.1rem', color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', cursor: 'pointer' }}>
                     <CalendarIcon size={20} color="#7c3aed" /> Schichtplan
                 </button>
                 <button onClick={() => setView('tagesreport')} style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', fontWeight: 800, fontSize: '1.1rem', color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', cursor: 'pointer' }}>
                     <LayoutDashboard size={20} color="#0284c7" /> Tages Report
                 </button>
                 <button onClick={() => setView('tagesaufgaben')} style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', fontWeight: 800, fontSize: '1.1rem', color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', cursor: 'pointer' }}>
                     <CheckSquare size={20} color="#10b981" /> Tagesaufgaben
                 </button>
                 <button onClick={() => setView('mitarbeiter')} style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', fontWeight: 800, fontSize: '1.1rem', color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', cursor: 'pointer' }}>
                     <Users size={20} color="#f59e0b" /> Mitarbeiter Liste
                 </button>
             </div>

             <div style={{ marginTop: '2rem', width: '100%', maxWidth: '480px' }}>
                 <button onClick={logout} style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '1px solid #fecaca', background: '#fef2f2', fontWeight: 700, color: '#ef4444', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                     <LogOut size={18} /> Abmelden
                 </button>
             </div>

             {/* Footer Note */}
             <div style={{ marginTop: '3rem', fontSize: '0.8rem', fontWeight: 700, color: '#cbd5e1', letterSpacing: '0.05em' }}>
                 powered by SOCKET
             </div>

             {/* Settings Modal */}
             {showSettings && (
                 <div className="modal-overlay" onClick={()=>setShowSettings(false)}>
                     <div className="card" onClick={e=>e.stopPropagation()} style={{ width: '360px', padding: '2rem', display:'flex', flexDirection:'column', gap:'1.5rem' }}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{margin:0, fontSize: '1.25rem', fontWeight: 800}}>Einstellungen</h3>
                            <button onClick={()=>setShowSettings(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><X size={20}/></button>
                         </div>
                         
                         <div>
                             <label style={{fontSize:'0.85rem', fontWeight:700, color:'#333', marginBottom:'12px', display:'block'}}>Betriebs Logo</label>
                             <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '1.5rem', border: '2px dashed #e2e8f0', borderRadius: '16px', background: '#f8fafc', overflow: 'hidden' }}>
                                 {logoUrl ? (
                                     <div style={{ position: 'relative', zIndex: 5 }}>
                                         <img src={logoUrl} alt="Preview" style={{ height: '60px', objectFit: 'contain', borderRadius: '8px' }} />
                                         <button onClick={(e)=>{e.stopPropagation(); setLogoUrl('')}} style={{ position:'absolute', top:'-8px', right:'-8px', background:'#ef4444', color:'#fff', border:'none', borderRadius:'50%', width:'20px', height:'20px', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 4px rgba(0,0,0,0.1)', zIndex: 20 }}><X size={12}/></button>
                                     </div>
                                 ) : (
                                     <div style={{ textAlign: 'center' }}>
                                         <DownloadCloud size={32} color="#cbd5e1" style={{ marginBottom: '8px' }} />
                                         <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Klicken zum Hochladen</div>
                                     </div>
                                 )}
                                 <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer', left: 0, top: 0, zIndex: 1 }} />
                             </div>
                             <div style={{fontSize: '0.7rem', color: '#64748b', marginTop: '10px', textAlign: 'center'}}>Das Logo wird in den Dashboards angezeigt.</div>
                         </div>

                         <button className="primary" style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', fontWeight: 700 }} onClick={()=>{
                             updateBusinessSettings({ logoUrl: logoUrl.trim() })
                             setShowSettings(false)
                         }}>Speichern</button>
                     </div>
                 </div>
             )}
        </div>
    )
}

function AppContent() {
  const { user, role } = useAuth()
  if (!user || role === null) return <AuthPage />
  
  if (role === 'admin') return <AdminPanel />
  if (role === 'unknown') return <div style={{padding:'2rem',textAlign:'center'}}>Konto nicht gefunden oder unautorisiert.</div>
  
  if (role === 'worker') return <WorkerHome />
  return <BusinessHome />
}

export default App
