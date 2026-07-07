'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setDone(true)
      setTimeout(() => { router.push('/app'); router.refresh() }, 1500)
    }
  }

  if (done) {
    return (
      <div className="flex-1 flex items-center justify-center p-4" style={{ background: '#000' }}>
        <p className="font-sans text-white text-lg">Password updated — taking you to your board…</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4" style={{ background: '#000' }}>
      <div className="w-full max-w-sm">
        <h1 className="font-mono font-bold text-3xl text-white mb-10 text-center tracking-tight">
          hypersymmetry
        </h1>
        <form onSubmit={handleSubmit} className="space-y-3 font-sans">
          <input
            type="password"
            name="new-password"
            id="new-password"
            autoComplete="new-password"
            placeholder="New password (8+ characters)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-3 py-2 rounded-md text-sm bg-white text-stone-900 placeholder-stone-400 outline-none border border-stone-700 focus:border-stone-400"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-md text-sm font-medium text-black transition-colors disabled:opacity-50 bg-white hover:bg-stone-200"
          >
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
