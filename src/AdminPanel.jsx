import React, { useState, useEffect } from 'react'
import { ref, set, onValue, remove } from 'firebase/database'
import { database, app } from './App.jsx'
import { initializeApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, signOut as secSignOut } from 'firebase/auth'
import { motion } from 'framer-motion'
import { Users, Settings, Plus, Trash2, Save, LogOut } from 'lucide-react'
import { useAuth } from './App.jsx'
import { deleteApp } from 'firebase/app'

const AdminPanel = () => {
  const { logout } = useAuth()
  const [tab, setTab] = useState('users') // users, settings
  const [businesses, setBusinesses] = useState([])
  const [globalSettings, setGlobalSettings] = useState({ appName: '', faviconUrl: '', logoUrl: '' })
  const [msg, setMsg] = useState('')

  const handleFileUpload = (e, field) => {
    const file = e.target.files[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      alert("Die Datei darf maximal 2MB groß sein!")
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      setGlobalSettings(prev => ({ ...prev, [field]: event.target.result }))
    }
    reader.readAsDataURL(file)
  }

  // New User form
  const [newUser, setNewUser] = useState({ username: '', password: '', bizName: '' })

  useEffect(() => {
    // Load all businesses
    const bRef = ref(database, 'businesses')
    const unsubB = onValue(bRef, (snap) => {
      const data = snap.val()
      setBusinesses(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
    })

    // Load global settings
    const sRef = ref(database, 'global_settings')
    const unsubS = onValue(sRef, (snap) => {
      if (snap.exists()) setGlobalSettings(snap.val())
    })

    return () => { unsubB(); unsubS() }
  }, [])

  const toEmail = (username) => `${username.trim().toLowerCase().replace(/\s+/g, '_')}@makschichten.app`

  const handleCreateUser = async (e) => {
    e.preventDefault()
    if (!newUser.username || !newUser.password || !newUser.bizName) return
    try {
      // 1. Create in secondary auth
      const secApp = initializeApp(app.options, "SecondaryApp_" + Date.now())
      const secAuth = getAuth(secApp)
      const cred = await createUserWithEmailAndPassword(secAuth, toEmail(newUser.username), newUser.password)
      await secSignOut(secAuth)
      await deleteApp(secApp)
      
      // 2. Save business data to database
      const bizData = {
        name: newUser.bizName,
        username: newUser.username.trim(),
        ownerId: cred.user.uid,
        createdAt: new Date().toISOString()
      }
      await set(ref(database, `businesses/${cred.user.uid}`), bizData)
      setNewUser({ username: '', password: '', bizName: '' })
      setMsg('Benutzer (Betrieb) erfolgreich erstellt.')
      setTimeout(() => setMsg(''), 3000)
    } catch (err) {
      alert("Fehler: " + err.message)
    }
  }

  const handleDeleteBiz = async (id) => {
    if (window.confirm('Sind Sie sicher, dass Sie diesen Betrieb (und alle Schichten) löschen möchten?')) {
      await remove(ref(database, `businesses/${id}`))
    }
  }

  const handleSaveSettings = async (e) => {
    e.preventDefault()
    await set(ref(database, 'global_settings'), globalSettings)
    setMsg('Einstellungen gespeichert.')
    setTimeout(() => setMsg(''), 3000)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', background: '#f8fafc', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{ width: '280px', background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '36px', height: '36px', background: '#7c3aed', borderRadius: '10px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Settings size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 800 }}>SUPER ADMIN</div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Plattform-Verwaltung</div>
          </div>
        </div>
        <nav style={{ padding: '1rem', flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button 
            onClick={() => setTab('users')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', borderRadius: '10px', border: 'none', background: tab === 'users' ? '#f1f5f9' : 'transparent', color: tab === 'users' ? '#0f172a' : '#64748b', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
          >
            <Users size={18} /> Benutzer (Betriebe)
          </button>
          <button 
            onClick={() => setTab('settings')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', borderRadius: '10px', border: 'none', background: tab === 'settings' ? '#f1f5f9' : 'transparent', color: tab === 'settings' ? '#0f172a' : '#64748b', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
          >
            <Settings size={18} /> Globale Einstellungen
          </button>
        </nav>
        <div style={{ padding: '1rem', borderTop: '1px solid #e2e8f0' }}>
          <button onClick={logout} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.85rem', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, cursor: 'pointer' }}>
            <LogOut size={16} /> Abmelden
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <main style={{ flexGrow: 1, overflowY: 'auto', padding: '2.5rem' }}>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          {tab === 'users' && (
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '2rem' }}>Betriebs- / Benutzerverwaltung</h2>
              
              {/* Yeni Kullanıcı Formu */}
              <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Plus size={18} color="#7c3aed" /> Neues Betriebskonto hinzufügen
                </h3>
                <form onSubmit={handleCreateUser} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '1rem', alignItems: 'end' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>Betriebsname</label>
                    <input required placeholder="z.B. Cafe Hay" value={newUser.bizName} onChange={e => setNewUser({...newUser, bizName: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>Benutzername</label>
                    <input required placeholder="benutzername" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>Passwort</label>
                    <input required type="password" placeholder="••••••" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0' }} />
                  </div>
                  <button className="primary" type="submit" style={{ padding: '0.75rem 1.5rem', borderRadius: '10px', fontWeight: 700, height: '42px' }}>Erstellen</button>
                </form>
                {msg && <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f0fdf4', color: '#16a34a', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600 }}>✓ {msg}</div>}
              </div>

              {/* Kullanıcı Listesi */}
              <div className="card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '1rem', fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>BETRIEBSNAME</th>
                      <th style={{ padding: '1rem', fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>BENUTZERNAME</th>
                      <th style={{ padding: '1rem', fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>REGISTRIERUNGSDATUM</th>
                      <th style={{ padding: '1rem', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', textAlign: 'right' }}>AKTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {businesses.map(b => (
                      <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '1rem', fontWeight: 700, fontSize: '0.9rem' }}>{b.name}</td>
                        <td style={{ padding: '1rem', fontSize: '0.85rem', color: '#64748b' }}>@{b.username}</td>
                        <td style={{ padding: '1rem', fontSize: '0.85rem', color: '#64748b' }}>{b.createdAt ? new Date(b.createdAt).toLocaleDateString() : '-'}</td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          <button onClick={() => handleDeleteBiz(b.id)} style={{ padding: '0.5rem', background: '#fff1f2', color: '#ef4444', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {businesses.length === 0 && (
                      <tr><td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Noch keine registrierten Betriebe.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'settings' && (
            <div style={{ maxWidth: '600px' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '2rem' }}>Globale App-Einstellungen</h2>
              <form className="card" onSubmit={handleSaveSettings} style={{ padding: '2rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '8px' }}>App-Name (Browser-Tab)</label>
                  <input value={globalSettings.appName} onChange={e => setGlobalSettings({...globalSettings, appName: e.target.value})} placeholder="z.B. SOCKET" style={{ width: '100%', padding: '0.85rem', borderRadius: '10px', border: '1px solid #cbd5e1' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '8px' }}>Favicon (Browser-Icon .ico / .png)</label>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    {globalSettings.faviconUrl && <img src={globalSettings.faviconUrl} alt="Favicon Preview" style={{ width: '32px', height: '32px', border: '1px solid #ccc', borderRadius: '4px' }} />}
                    <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'faviconUrl')} style={{ width: '100%', padding: '0.5rem', borderRadius: '10px', border: '1px dashed #cbd5e1', cursor: 'pointer' }} />
                  </div>
                  {/* Keep URL input as secondary optional value for manual setup if needed, or we just keep it hidden/removed */}
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '8px' }}>Globales Logo (Sichtbar für alle Benutzer)</label>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    {globalSettings.logoUrl && <img src={globalSettings.logoUrl} alt="Logo Preview" style={{ width: 'auto', height: '48px', border: '1px solid #ccc', borderRadius: '8px', padding: '2px', background: '#f8fafc' }} />}
                    <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'logoUrl')} style={{ width: '100%', padding: '0.5rem', borderRadius: '10px', border: '1px dashed #cbd5e1', cursor: 'pointer' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                      <span style={{ fontSize: '0.7rem', color: '#64748b' }}>* Optimal sind Bilder mit transparentem Hintergrund (.png) unter 2MB.</span>
                      <button type="button" onClick={() => setGlobalSettings({...globalSettings, logoUrl: ''})} style={{ fontSize: '0.7rem', color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600 }}>Entfernen</button>
                  </div>
                </div>

                <div style={{ paddingTop: '1rem', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {msg ? <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '0.85rem' }}>✓ {msg}</span> : <span />}
                  <button type="submit" className="primary" style={{ padding: '0.85rem 2rem', borderRadius: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Save size={18} /> Einstellungen speichern
                  </button>
                </div>
              </form>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  )
}

export default AdminPanel
