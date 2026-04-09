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
      <button onClick={() => {setTab('users'); setManagingBiz(null); setMobileMenu(false)}} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', borderRadius: '12px', border: 'none', background: tab === 'users' ? '#f1f5f9' : 'transparent', color: tab === 'users' ? '#0f172a' : '#64748b', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}><Users size={18} /> Betriebe</button>
      <button onClick={() => {setTab('settings'); setManagingBiz(null); setMobileMenu(false)}} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', borderRadius: '12px', border: 'none', background: tab === 'settings' ? '#f1f5f9' : 'transparent', color: tab === 'settings' ? '#0f172a' : '#64748b', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}><Settings size={18} /> App Settings</button>
      <button onClick={logout} style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem', borderRadius: '12px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#ef4444', fontWeight: 700, cursor: 'pointer' }}><LogOut size={16} /> Logout</button>
    </>
  )

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: '100dvh', width: '100vw', background: '#f8fafc', overflow: 'hidden' }}>
      
      {/* Sidebar (Desktop) */}
      {!isMobile && (
        <aside style={{ width: managingBiz ? '0' : '280px', transition: '0.3s', overflow: 'hidden', background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', padding: managingBiz ? '0' : '1.5rem' }}>
          <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '40px', height: '40px', background: '#7c3aed', borderRadius: '12px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Settings size={20} /></div>
            <div style={{ fontWeight: 800, color: '#0f172a' }}>SUPER ADMIN</div>
          </div>
          <Navigation />
        </aside>
      )}

      {/* Mobile Top Bar */}
      {isMobile && !managingBiz && (
          <header style={{ padding: '1rem', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 900, fontSize: '1.1rem', letterSpacing: '-0.02em' }}>SOCKET <span style={{ color: '#7c3aed' }}>ADMIN</span></div>
              <button onClick={() => setMobileMenu(!mobileMenu)} style={{ background: 'none', border: 'none' }}><Menu size={24} /></button>
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
                      <h2 style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 900, marginBottom: '1.5rem' }}>İşyerleri & Yedekleme</h2>
                      
                      {/* Yeni İşletme Formu */}
                      <div className="card" style={{ padding: isMobile ? '1.25rem' : '1.5rem', marginBottom: '2rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Plus size={20} color="#7c3aed" /> Yeni İşletme</h3>
                        <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '1rem' }}>
                          <input name="bizName" required placeholder="İşletme Adı" style={{ flex: 1, padding: '0.85rem', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }} />
                          <input name="username" required placeholder="Kullanıcı Adı" style={{ flex: 1, padding: '0.85rem', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }} />
                          <input name="password" required type="password" placeholder="Şifre" style={{ flex: 1, padding: '0.85rem', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }} />
                          <button className="primary" type="submit" style={{ padding: '0.85rem 1.5rem', borderRadius: '12px', fontWeight: 800 }}>Ekle</button>
                        </form>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1rem' }}>
                          {businesses.map(b => (
                              <div key={b.id} className="card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '24px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.03)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <div>
                                          <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#0f172a' }}>{b.name}</div>
                                          <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>@{b.username}</div>
                                      </div>
                                      <button onClick={() => handleDeleteBiz(b.id)} style={{ padding: '8px', background: '#fef2f2', color: '#ef4444', border: 'none', borderRadius: '10px', cursor: 'pointer' }}><Trash2 size={18} /></button>
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                      <button onClick={() => setManagingBiz(b)} style={{ gridColumn: 'span 2', padding: '0.85rem', borderRadius: '14px', background: '#7c3aed', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                          <Users size={16} /> İşçileri Yönet
                                      </button>
                                      <button onClick={() => handleExport(b)} style={{ padding: '0.75rem', borderRadius: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#0ea5e9', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                          <DownloadCloud size={16} /> Yedekle
                                      </button>
                                      <div style={{ position: 'relative' }}>
                                        <button style={{ width: '100%', padding: '0.75rem', borderRadius: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#10b981', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                            <UploadCloud size={16} /> Geri Yükle
                                        </button>
                                        <input type="file" accept=".json" onChange={(e) => handleImport(b, e)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                                      </div>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              ) : (
                <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '2rem' }}>App Settings</h2>
                    <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div className="card" style={{ padding: '2rem', background: '#fff', borderRadius: '24px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div>
                                <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem', display: 'block' }}>Platform Adı</label>
                                <input value={globalSettings.appName} onChange={e => setGlobalSettings({...globalSettings, appName: e.target.value})} style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                            </div>
                            <button className="primary" type="submit" style={{ padding: '1rem', borderRadius: '12px', fontWeight: 800 }}>Değişiklikleri Kaydet</button>
                        </div>
                    </form>
                </div>
              )}
          </div>
        ) : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '1.5rem', background: '#fff', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <button onClick={() => setManagingBiz(null)} style={{ padding: '0.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'none' }}><ChevronLeft size={24}/></button>
                  <div style={{ fontWeight: 900, fontSize: '1.1rem' }}>{managingBiz.name} İşçileri</div>
              </div>
              <div style={{ flexGrow: 1, padding: isMobile ? '1rem' : '2rem', overflowY: 'auto' }}>
                  <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {workerList.map(w => (
                          <div key={w.id} style={{ background: '#fff', padding: '1.25rem', borderRadius: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '1rem', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                  <div style={{ width: '45px', height: '45px', borderRadius: '14px', background: w.color || '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#fff' }}>{w.name?.charAt(0)}</div>
                                  <div>
                                      <div style={{ fontWeight: 800 }}>{w.name}</div>
                                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>ID: {w.id}</div>
                                  </div>
                              </div>
                              <div style={{ display: 'flex', gap: '0.5rem', width: isMobile ? '100%' : 'auto' }}>
                                  <button onClick={() => {
                                      const newName = window.prompt('Yeni isim:', w.name);
                                      if(newName) update(ref(database, `businesses/${managingBiz.id}/workers/${w.id}`), { name: newName });
                                  }} style={{ flex: 1, padding: '0.6rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', fontWeight: 700, fontSize: '0.85rem' }}><Edit2 size={14}/> Edit</button>
                                  <button onClick={() => alert('Şifre sıfırlama için işçiyi silip tekrar ekleyin.')} style={{ flex: 1, padding: '0.6rem 1rem', borderRadius: '10px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#ef4444', fontWeight: 700, fontSize: '0.85rem' }}><Key size={14}/> Pass</button>
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
