import React, { useState, useEffect } from 'react'
import { ref, set, onValue, remove, get, update } from 'firebase/database'
import { database, app } from './App.jsx'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, signOut as secSignOut } from 'firebase/auth'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, Settings, Plus, Trash2, Save, LogOut, DownloadCloud, UploadCloud, ChevronLeft, Edit2, Key, Menu, X } from 'lucide-react'
import { useAuth } from './App.jsx'

const AdminPanel = () => {
  const { logout } = useAuth()
  const [tab, setTab] = useState('users') // users, settings
  const [businesses, setBusinesses] = useState([])
  const [globalSettings, setGlobalSettings] = useState({ appName: '', faviconUrl: '', logoUrl: '' })
  const [msg, setMsg] = useState('')
  const [managingBiz, setManagingBiz] = useState(null)
  const [workerList, setWorkerList] = useState([])
  const [mobileMenu, setMobileMenu] = useState(false)

  const isMobile = window.innerWidth < 768

  useEffect(() => {
    const bRef = ref(database, 'businesses')
    const unsubB = onValue(bRef, (snap) => {
      const data = snap.val()
      setBusinesses(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
    }, (error) => {
      alert("İşletmeler yüklenirken hata oluştu (Muhtemelen Firebase Veritabanı Kuralları 'Super Admin' okuma yetkisini engelliyor): " + error.message)
    })
    const sRef = ref(database, 'global_settings')
    const unsubS = onValue(sRef, (snap) => {
      if (snap.exists()) setGlobalSettings(snap.val())
    })
    return () => { unsubB(); unsubS() }
  }, [])

  useEffect(() => {
    if (!managingBiz) { setWorkerList([]); return }
    const wRef = ref(database, `businesses/${managingBiz.id}/workers`)
    const unsubW = onValue(wRef, (snap) => {
        const data = snap.val()
        setWorkerList(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
    })
    return () => unsubW()
  }, [managingBiz])

  const toEmail = (username) => `${username.trim().toLowerCase().replace(/\s+/g, '_')}@makschichten.app`

  const handleCreateUser = async (e) => {
    e.preventDefault()
    const { username, password, bizName } = e.target.elements
    try {
      const secApp = initializeApp(app.options, "Sec_" + Date.now())
      const secAuth = getAuth(secApp)
      const cred = await createUserWithEmailAndPassword(secAuth, toEmail(username.value), password.value)
      await secSignOut(secAuth)
      await deleteApp(secApp)
      
      const bizData = { name: bizName.value, username: username.value.trim(), ownerId: cred.user.uid, createdAt: new Date().toISOString() }
      await set(ref(database, `businesses/${cred.user.uid}`), bizData)
      e.target.reset()
      setMsg('Betrieb erstellt.')
      setTimeout(() => setMsg(''), 3000)
    } catch (err) { alert(err.message) }
  }

  const handleDeleteBiz = async (id) => {
    if (window.confirm('WIRKLICH LÖSCHEN?')) await remove(ref(database, `businesses/${id}`))
  }

  const handleExport = async (biz) => {
    const snap = await get(ref(database, `businesses/${biz.id}`))
    if (!snap.exists()) return
    const blob = new Blob([JSON.stringify(snap.val(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `BACKUP_${biz.name.replace(/\s+/g, '_')}.json`
    a.click()
  }

  const handleImport = async (biz, e) => {
    const file = e.target.files[0]
    if (!file || !window.confirm(`Mevcut verilerin üzerine yazılsın mı?`)) return
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        await set(ref(database, `businesses/${biz.id}`), JSON.parse(event.target.result))
        alert('Erfolgreich!')
      } catch (err) { alert('Hata!') }
    }
    reader.readAsText(file)
  }

  const handleSaveSettings = async (e) => {
     e.preventDefault()
     await set(ref(database, 'global_settings'), globalSettings)
     setMsg('Einstellungen gespeichert.')
     setTimeout(() => setMsg(''), 3000)
  }

  const Navigation = () => (
    <>
      <button onClick={() => {setTab('users'); setManagingBiz(null); setMobileMenu(false)}} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', borderRadius: '12px', border: 'none', background: tab === 'users' ? '#ecedf2' : 'transparent', color: tab === 'users' ? '#262626' : '#64748b', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}><Users size={18} /> Betriebe</button>
      <button onClick={() => {setTab('settings'); setManagingBiz(null); setMobileMenu(false)}} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', borderRadius: '12px', border: 'none', background: tab === 'settings' ? '#ecedf2' : 'transparent', color: tab === 'settings' ? '#262626' : '#64748b', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}><Settings size={18} /> App Settings</button>
      <button onClick={logout} style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem', borderRadius: '12px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#ef4444', fontWeight: 700, cursor: 'pointer' }}><LogOut size={16} /> Logout</button>
    </>
  )

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: '100dvh', width: '100vw', background: '#ecedf2', overflow: 'hidden' }}>
      
      {/* Sidebar (Desktop) */}
      {!isMobile && (
        <aside style={{ width: managingBiz ? '0' : '280px', transition: '0.3s', overflow: 'hidden', background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', padding: managingBiz ? '0' : '1.5rem' }}>
          <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '40px', height: '40px', background: '#f3b279', borderRadius: '12px', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Settings size={20} /></div>
            <div style={{ fontWeight: 800, color: '#262626' }}>SUPER ADMIN</div>
          </div>
          <Navigation />
        </aside>
      )}

      {/* Mobile Top Bar */}
      {isMobile && !managingBiz && (
          <header style={{ padding: '1rem', background: '#ffffff', borderBottom: '1px solid #dbdde3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 900, fontSize: '1.1rem', letterSpacing: '-0.02em', color: '#262626' }}>Rostr <span style={{ color: '#f3b279' }}>ADMIN</span></div>
              <button onClick={() => setMobileMenu(!mobileMenu)} style={{ background: 'none', border: 'none', color: '#262626' }}><Menu size={24} /></button>
          </header>
      )}

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
          {mobileMenu && (
              <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }} style={{ position: 'fixed', inset: 0, background: '#fff', zIndex: 100, padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button onClick={() => setMobileMenu(false)} style={{ background: 'none', border: 'none' }}><X size={32} /></button></div>
                  <Navigation />
              </motion.div>
          )}
      </AnimatePresence>

      <main style={{ flexGrow: 1, overflowY: 'auto', padding: isMobile ? '1rem' : '2.5rem', minHeight: 0 }}>
        {!managingBiz ? (
          <div>
              {tab === 'users' ? (
                  <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                      <h2 style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 900, marginBottom: '1.5rem', color: '#262626' }}>Betriebe & Backup</h2>
                      
                      {/* Neuer Betrieb Formular */}
                      <div className="card" style={{ padding: isMobile ? '1.25rem' : '1.5rem', marginBottom: '2rem', background: '#ffffff', border: '1px solid #dbdde3', borderRadius: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#262626' }}><Plus size={20} color="#f3b279" /> Neuer Betrieb</h3>
                        <form onSubmit={handleCreateUser} style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                          <input name="bizName" required placeholder="Name des Betriebs" style={{ flex: '1 1 200px', minWidth: '0', padding: '0.85rem', borderRadius: '12px', border: '1px solid #dbdde3', fontSize: '0.9rem', background: '#ecedf2' }} />
                          <input name="username" required placeholder="Benutzername" style={{ flex: '1 1 200px', minWidth: '0', padding: '0.85rem', borderRadius: '12px', border: '1px solid #dbdde3', fontSize: '0.9rem', background: '#ecedf2' }} />
                          <input name="password" required type="password" placeholder="Passwort" style={{ flex: '1 1 200px', minWidth: '0', padding: '0.85rem', borderRadius: '12px', border: '1px solid #dbdde3', fontSize: '0.9rem', background: '#ecedf2' }} />
                          <button className="primary" type="submit" style={{ flex: isMobile ? '1 1 100%' : '1 1 auto', padding: '0.85rem 1.5rem', borderRadius: '12px', fontWeight: 800, background: '#f3b279', border: 'none', color: '#ffffff', cursor: 'pointer', whiteSpace: 'nowrap' }}>Hinzufügen</button>
                        </form>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 360px), 1fr))', gap: '1rem' }}>
                          {businesses.map(b => (
                              <div key={b.id} className="card" style={{ background: '#ffffff', border: '1px solid #dbdde3', borderRadius: '24px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.03)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                          {b.logoUrl ? (
                                              <img src={b.logoUrl} alt="Logo" style={{ height: '40px', width: '40px', objectFit: 'contain', borderRadius: '8px', background: '#ecedf2' }} />
                                          ) : (
                                              <div style={{ width: '40px', height: '40px', background: '#ecedf2', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontWeight: 700 }}>{b.name.charAt(0)}</div>
                                          )}
                                          <div>
                                              <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#262626' }}>{b.name}</div>
                                              <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>@{b.username}</div>
                                          </div>
                                      </div>
                                      <button onClick={() => handleDeleteBiz(b.id)} style={{ padding: '8px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '10px', cursor: 'pointer' }}><Trash2 size={18} /></button>
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '0.5rem' }}>
                                      <button onClick={() => setManagingBiz(b)} style={{ gridColumn: 'span 2', padding: '0.85rem', borderRadius: '14px', background: '#f3b279', color: '#ffffff', border: 'none', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                          <Users size={16} /> Mitarbeiter verwalten
                                      </button>
                                      
                                      <div style={{ position: 'relative' }}>
                                          <button style={{ width: '100%', padding: '0.75rem', borderRadius: '14px', background: '#ecedf2', border: 'none', color: '#262626', fontWeight: 700, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                              <UploadCloud size={16} color="#f3b279" /> Logo
                                          </button>
                                          <input type="file" accept="image/*" onChange={(e) => {
                                              const file = e.target.files[0];
                                              if (!file) return;
                                              if (file.size > 1024 * 1024) { alert('Bild < 1MB!'); return; }
                                              const reader = new FileReader();
                                              reader.onload = async (ev) => {
                                                  try {
                                                      await update(ref(database, `businesses/${b.id}`), { logoUrl: ev.target.result });
                                                      alert('Logo başarıyla güncellendi!');
                                                  } catch (err) { 
                                                      alert('Logo yüklenemedi! (Firebase Yetki Hatası olabilir): ' + err.message); 
                                                  }
                                              };
                                              reader.readAsDataURL(file);
                                          }} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                                      </div>
                                      
                                      <button onClick={() => handleExport(b)} style={{ padding: '0.75rem', borderRadius: '14px', background: '#ecedf2', border: 'none', color: '#262626', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                          <DownloadCloud size={16} color="#f3b279" /> Backup
                                      </button>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              ) : (
                <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '2rem', color: '#262626' }}>App Einstellungen</h2>
                    
                    <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div className="card" style={{ padding: '2rem', background: '#ffffff', borderRadius: '24px', border: '1px solid #dbdde3', display: 'flex', flexDirection: 'column', gap: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                            
                            {/* Platform Name */}
                            <div>
                                <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem', display: 'block', color: '#262626' }}>Plattform Name</label>
                                <input value={globalSettings.appName || ''} onChange={e => setGlobalSettings({...globalSettings, appName: e.target.value})} style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid #dbdde3', background: '#ecedf2' }} />
                            </div>
                            
                            {/* Platform Haupt-Logo */}
                            <div>
                                <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem', display: 'block', color: '#262626' }}>Plattform Logo (Zentrales Logo)</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    {globalSettings.logoUrl ? (
                                        <img src={globalSettings.logoUrl} alt="Global Logo" style={{ height: '40px', objectFit: 'contain', background: '#ecedf2', borderRadius: '8px', padding: '4px' }} />
                                    ) : (
                                        <div style={{ padding: '10px 14px', background: '#ecedf2', borderRadius: '8px', fontSize: '0.8rem', color: '#94a3b8' }}>Kein Logo</div>
                                    )}
                                    <div style={{ position: 'relative' }}>
                                        <button type="button" style={{ padding: '0.75rem 1.25rem', borderRadius: '12px', background: '#f3b279', border: 'none', color: '#ffffff', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                            <UploadCloud size={16} /> Neues Logo hochladen
                                        </button>
                                        <input type="file" accept="image/*" onChange={(e) => {
                                              const file = e.target.files[0];
                                              if (!file) return;
                                              if (file.size > 1024 * 1024) { alert('Bild < 1MB!'); return; }
                                              const reader = new FileReader();
                                              reader.onload = (ev) => {
                                                  setGlobalSettings({...globalSettings, logoUrl: ev.target.result});
                                              };
                                              reader.readAsDataURL(file);
                                          }} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                                    </div>
                                </div>
                            </div>
                            
                            {/* Platform Favicon */}
                            <div>
                                <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem', display: 'block', color: '#262626' }}>Plattform Favicon (Browser Icon)</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    {globalSettings.faviconUrl ? (
                                        <img src={globalSettings.faviconUrl} alt="Favicon" style={{ height: '32px', width: '32px', objectFit: 'contain', background: '#ecedf2', borderRadius: '8px', padding: '4px' }} />
                                    ) : (
                                        <div style={{ padding: '8px', background: '#ecedf2', borderRadius: '8px', fontSize: '0.8rem', color: '#94a3b8' }}>N/A</div>
                                    )}
                                    <div style={{ position: 'relative' }}>
                                        <button type="button" style={{ padding: '0.75rem 1.25rem', borderRadius: '12px', background: '#ecedf2', border: 'none', color: '#262626', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                            <UploadCloud size={16} color="#f3b279" /> Favicon hochladen
                                        </button>
                                        <input type="file" accept="image/*" onChange={(e) => {
                                              const file = e.target.files[0];
                                              if (!file) return;
                                              if (file.size > 1024 * 1024) { alert('Bild < 1MB!'); return; }
                                              const reader = new FileReader();
                                              reader.onload = (ev) => {
                                                  setGlobalSettings({...globalSettings, faviconUrl: ev.target.result});
                                              };
                                              reader.readAsDataURL(file);
                                          }} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                                    </div>
                                </div>
                            </div>

                            <button className="primary" type="submit" style={{ padding: '1rem', borderRadius: '12px', fontWeight: 800, background: '#f3b279', border: 'none', color: '#ffffff', cursor: 'pointer', marginTop: '1rem' }}>Änderungen speichern</button>
                        </div>
                    </form>
                </div>
              )}
          </div>
        ) : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '1.5rem', background: '#ffffff', borderBottom: '1px solid #dbdde3', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <button onClick={() => setManagingBiz(null)} style={{ padding: '0.5rem', borderRadius: '12px', border: '1px solid #dbdde3', background: '#ecedf2', cursor: 'pointer', color: '#262626' }}><ChevronLeft size={24}/></button>
                  <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#262626' }}>{managingBiz.name} Mitarbeiter</div>
              </div>
              <div style={{ flexGrow: 1, padding: isMobile ? '1rem' : '2rem', overflowY: 'auto' }}>
                  <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {workerList.length === 0 && <div style={{ fontSize: '0.9rem', color: '#64748b', textAlign: 'center', padding: '2rem' }}>Keine Mitarbeiter vorhanden.</div>}
                      {workerList.map(w => (
                          <div key={w.id} style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '20px', border: '1px solid #dbdde3', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '1rem', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                  <div style={{ width: '45px', height: '45px', borderRadius: '14px', background: w.color || '#ecedf2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: w.color ? '#ffffff' : '#262626' }}>{w.name?.charAt(0)}</div>
                                  <div>
                                      <div style={{ fontWeight: 800, color: '#262626' }}>{w.name}</div>
                                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>ID: {w.id}</div>
                                  </div>
                              </div>
                              <div style={{ display: 'flex', gap: '0.5rem', width: isMobile ? '100%' : 'auto' }}>
                                  <button onClick={() => {
                                      const newName = window.prompt('Neuer Name:', w.name);
                                      if(newName) update(ref(database, `businesses/${managingBiz.id}/workers/${w.id}`), { name: newName });
                                  }} style={{ flex: 1, padding: '0.6rem 1rem', borderRadius: '10px', border: '1px solid #dbdde3', background: '#ecedf2', fontWeight: 700, fontSize: '0.85rem', color: '#262626', cursor: 'pointer' }}><Edit2 size={14}/> Bearbeiten</button>
                                  <button onClick={() => alert('Für Passwort-Reset bitte den Mitarbeiter im Business-Dashboard löschen und neu anlegen.')} style={{ flex: 1, padding: '0.6rem 1rem', borderRadius: '10px', border: '1px solid #fecaca', background: '#fef2f2', color: '#ef4444', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}><Key size={14}/> Reset</button>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default AdminPanel
