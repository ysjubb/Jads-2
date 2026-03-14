import { useEffect, useState, useCallback } from 'react'
import { useAdminAuth, adminAxios } from '../../hooks/useAdminAuth'
import { T } from '../../theme'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

/* ── Types ─────────────────────────────────── */

type DroneCategory =
  | 'NANO_RECREATIONAL'
  | 'MICRO_RECREATIONAL'
  | 'MICRO_COMMERCIAL'
  | 'SMALL_VLOS'
  | 'AGRICULTURAL'
  | 'BVLOS_SPECIAL'

interface DroneUser {
  id: string
  name: string
  email: string
  droneCategory: DroneCategory | null
  registeredDrones: number
  activeUins: string[]
  uaopNumber: string | null
  uaopValid: boolean
  rpcId: string | null
  rpcValid: boolean
  insuranceStatus: 'VALID' | 'EXPIRED' | 'NONE'
  lastActive: string | null
}

interface CategoryStats {
  category: DroneCategory
  count: number
}

/* ── Constants ──────────────────────────────── */

const CATEGORY_LABELS: Record<DroneCategory, string> = {
  NANO_RECREATIONAL: 'Nano Recreational',
  MICRO_RECREATIONAL: 'Micro Recreational',
  MICRO_COMMERCIAL: 'Micro Commercial',
  SMALL_VLOS: 'Small VLOS',
  AGRICULTURAL: 'Agricultural',
  BVLOS_SPECIAL: 'BVLOS / Special',
}

const CATEGORY_COLOURS: Record<DroneCategory, string> = {
  NANO_RECREATIONAL: '#4CAF50',
  MICRO_RECREATIONAL: '#8BC34A',
  MICRO_COMMERCIAL: '#FF9800',
  SMALL_VLOS: '#2196F3',
  AGRICULTURAL: '#795548',
  BVLOS_SPECIAL: '#E91E63',
}

const ALL_CATEGORIES: DroneCategory[] = Object.keys(CATEGORY_LABELS) as DroneCategory[]

/* ── Badge Component ─────────────────────────── */

function CategoryBadge({ category }: { category: DroneCategory | null }) {
  if (!category) return <span style={{ color: T.muted, fontSize: '0.7rem' }}>UNASSIGNED</span>
  const colour = CATEGORY_COLOURS[category] ?? T.muted
  return (
    <span style={{
      fontSize: '0.65rem', fontWeight: 600,
      padding: '2px 8px', borderRadius: '4px',
      background: colour + '25', color: colour, border: `1px solid ${colour}40`,
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      {CATEGORY_LABELS[category]}
    </span>
  )
}

/* ── User Detail Drawer ──────────────────────── */

function UserDrawer({ user, onClose }: { user: DroneUser; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, width: '400px', height: '100vh',
      background: T.surface, borderLeft: `1px solid ${T.border}`,
      boxShadow: `-4px 0 24px rgba(0,0,0,0.5)`, zIndex: 100,
      display: 'flex', flexDirection: 'column', overflow: 'auto',
    }}>
      <div style={{ padding: '1.5rem', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: T.primary, fontSize: '1rem' }}>Drone Profile</h3>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: T.muted, cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
      </div>
      <div style={{ padding: '1.5rem', flex: 1 }}>
        <Section label="User">
          <Field label="Name" value={user.name} />
          <Field label="Email" value={user.email} />
        </Section>
        <Section label="Operator Category">
          <div style={{ marginBottom: '0.75rem' }}><CategoryBadge category={user.droneCategory} /></div>
        </Section>
        <Section label="Registered Drones">
          <Field label="Count" value={String(user.registeredDrones)} />
          <Field label="Active UINs" value={user.activeUins.length > 0 ? user.activeUins.join(', ') : '—'} mono />
        </Section>
        <Section label="Certifications">
          <Field label="UAOP Number" value={user.uaopNumber ?? '—'} mono />
          <Field label="UAOP Valid" value={user.uaopValid ? '✓ Valid' : '✗ Invalid'} color={user.uaopValid ? T.green : T.red} />
          <Field label="RPC ID" value={user.rpcId ?? '—'} mono />
          <Field label="RPC Valid" value={user.rpcValid ? '✓ Valid' : '✗ Invalid'} color={user.rpcValid ? T.green : T.red} />
        </Section>
        <Section label="Insurance">
          <Field
            label="Status"
            value={user.insuranceStatus}
            color={user.insuranceStatus === 'VALID' ? T.green : user.insuranceStatus === 'EXPIRED' ? T.red : T.muted}
          />
        </Section>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ fontSize: '0.65rem', color: T.muted, fontWeight: 600, marginBottom: '0.5rem', letterSpacing: '0.06em' }}>{label}</div>
      {children}
    </div>
  )
}

function Field({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: `1px solid ${T.border}20` }}>
      <span style={{ fontSize: '0.75rem', color: T.muted }}>{label}</span>
      <span style={{ fontSize: '0.75rem', color: color ?? T.textBright, fontFamily: mono ? "'JetBrains Mono', monospace" : 'inherit' }}>{value}</span>
    </div>
  )
}

/* ── Main Page ───────────────────────────────── */

export function UserCategoryPage() {
  const { token } = useAdminAuth()
  const [users, setUsers] = useState<DroneUser[]>([])
  const [stats, setStats] = useState<CategoryStats[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCat, setFilterCat] = useState<string>('ALL')
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<DroneUser | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCategory, setBulkCategory] = useState<DroneCategory>('NANO_RECREATIONAL')

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const api = adminAxios(token)
      const [usersRes, statsRes] = await Promise.all([
        api.get('/api/admin/drone/user-categories'),
        api.get('/api/admin/drone/category-stats'),
      ])
      setUsers(usersRes.data.users ?? mockUsers)
      setStats(statsRes.data.stats ?? mockStats)
    } catch {
      setUsers(mockUsers)
      setStats(mockStats)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  const filtered = users.filter(u => {
    if (filterCat !== 'ALL' && u.droneCategory !== filterCat) return false
    if (search && !u.name.toLowerCase().includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleBulkAssign = async () => {
    if (selectedIds.size === 0 || !token) return
    try {
      await adminAxios(token).post('/api/admin/drone/bulk-category', {
        userIds: Array.from(selectedIds),
        category: bulkCategory,
      })
      setSelectedIds(new Set())
      load()
    } catch { /* mock */ }
  }

  const pieData = stats.map(s => ({
    name: CATEGORY_LABELS[s.category],
    value: s.count,
    fill: CATEGORY_COLOURS[s.category],
  }))

  return (
    <div style={{ padding: '2rem', color: T.textBright }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', color: T.primary, fontFamily: "'JetBrains Mono', monospace" }}>USER CATEGORIES</h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: T.muted }}>Drone operator category management</p>
        </div>
      </div>

      {/* Distribution Chart */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: T.primary }}>Category Distribution</h3>
        <div style={{ height: 220 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, fontSize: '0.75rem' }} />
              <Legend wrapperStyle={{ fontSize: '0.7rem' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filters + Bulk Actions */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          style={{ background: T.surface, color: T.textBright, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}>
          <option value="ALL">All Categories</option>
          {ALL_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..."
          style={{ background: T.surface, color: T.textBright, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '0.4rem 0.6rem', fontSize: '0.75rem', width: '220px' }} />

        {selectedIds.size > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: 'auto' }}>
            <span style={{ fontSize: '0.7rem', color: T.muted }}>{selectedIds.size} selected →</span>
            <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value as DroneCategory)}
              style={{ background: T.surface, color: T.textBright, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '0.3rem 0.5rem', fontSize: '0.7rem' }}>
              {ALL_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
            <button onClick={handleBulkAssign}
              style={{ background: T.primary, color: '#000', border: 'none', borderRadius: '4px', padding: '0.35rem 0.75rem', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}>
              ASSIGN
            </button>
          </div>
        )}
      </div>

      {/* Users Table */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: T.muted }}>Loading...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                <th style={th}><input type="checkbox" onChange={e => { if (e.target.checked) setSelectedIds(new Set(filtered.map(u => u.id))); else setSelectedIds(new Set()) }} /></th>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Drone Category</th>
                <th style={th}>Drones</th>
                <th style={th}>RPC</th>
                <th style={th}>Insurance</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(user => (
                <tr key={user.id} onClick={() => setSelectedUser(user)}
                  style={{ borderBottom: `1px solid ${T.border}15`, cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = T.primary + '08')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={td} onClick={e => { e.stopPropagation(); toggleSelect(user.id) }}>
                    <input type="checkbox" checked={selectedIds.has(user.id)} readOnly />
                  </td>
                  <td style={td}>{user.name}</td>
                  <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem' }}>{user.email}</td>
                  <td style={td}><CategoryBadge category={user.droneCategory} /></td>
                  <td style={{ ...td, textAlign: 'center' }}>{user.registeredDrones}</td>
                  <td style={td}>
                    <span style={{ color: user.rpcValid ? T.green : T.muted, fontSize: '0.7rem' }}>
                      {user.rpcId ? (user.rpcValid ? '✓ Valid' : '✗ Expired') : '—'}
                    </span>
                  </td>
                  <td style={td}>
                    <span style={{ color: user.insuranceStatus === 'VALID' ? T.green : user.insuranceStatus === 'EXPIRED' ? T.red : T.muted, fontSize: '0.7rem' }}>
                      {user.insuranceStatus}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: T.muted, padding: '2rem' }}>No users found</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* User Detail Drawer */}
      {selectedUser && <UserDrawer user={selectedUser} onClose={() => setSelectedUser(null)} />}
    </div>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '0.6rem 0.75rem', color: T.muted,
  fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.04em',
}

const td: React.CSSProperties = {
  padding: '0.5rem 0.75rem', color: T.textBright,
}

/* ── Mock Data ───────────────────────────────── */

const mockUsers: DroneUser[] = [
  { id: '1', name: 'Aarav Patel', email: 'aarav@skyops.in', droneCategory: 'MICRO_COMMERCIAL', registeredDrones: 3, activeUins: ['UA-MICR-0001', 'UA-MICR-0002', 'UA-MICR-0003'], uaopNumber: 'UAOP-2025-1234', uaopValid: true, rpcId: 'RPC-IN-55012', rpcValid: true, insuranceStatus: 'VALID', lastActive: '2026-03-08' },
  { id: '2', name: 'Priya Sharma', email: 'priya@agrifly.in', droneCategory: 'AGRICULTURAL', registeredDrones: 5, activeUins: ['UA-AGRI-0010', 'UA-AGRI-0011'], uaopNumber: 'UAOP-2025-5678', uaopValid: true, rpcId: 'RPC-IN-55089', rpcValid: true, insuranceStatus: 'VALID', lastActive: '2026-03-07' },
  { id: '3', name: 'Rahul Dev', email: 'rahul@hobbyflyer.in', droneCategory: 'NANO_RECREATIONAL', registeredDrones: 1, activeUins: [], uaopNumber: null, uaopValid: false, rpcId: null, rpcValid: false, insuranceStatus: 'NONE', lastActive: '2026-03-01' },
  { id: '4', name: 'Meera Krishnan', email: 'meera@surveypro.in', droneCategory: 'BVLOS_SPECIAL', registeredDrones: 2, activeUins: ['UA-BVLS-0050'], uaopNumber: 'UAOP-2025-9012', uaopValid: true, rpcId: 'RPC-IN-55201', rpcValid: false, insuranceStatus: 'EXPIRED', lastActive: '2026-02-28' },
  { id: '5', name: 'Vikram Singh', email: 'vikram@dronelogistics.in', droneCategory: 'SMALL_VLOS', registeredDrones: 8, activeUins: ['UA-SMAL-0100', 'UA-SMAL-0101', 'UA-SMAL-0102'], uaopNumber: 'UAOP-2025-3456', uaopValid: true, rpcId: 'RPC-IN-55300', rpcValid: true, insuranceStatus: 'VALID', lastActive: '2026-03-09' },
  { id: '6', name: 'Anita Joshi', email: 'anita@photodrone.in', droneCategory: 'MICRO_RECREATIONAL', registeredDrones: 1, activeUins: ['UA-MICR-0099'], uaopNumber: null, uaopValid: false, rpcId: null, rpcValid: false, insuranceStatus: 'NONE', lastActive: '2026-03-05' },
]

const mockStats: CategoryStats[] = [
  { category: 'NANO_RECREATIONAL', count: 1245 },
  { category: 'MICRO_RECREATIONAL', count: 890 },
  { category: 'MICRO_COMMERCIAL', count: 456 },
  { category: 'SMALL_VLOS', count: 234 },
  { category: 'AGRICULTURAL', count: 567 },
  { category: 'BVLOS_SPECIAL', count: 89 },
]

export default UserCategoryPage
