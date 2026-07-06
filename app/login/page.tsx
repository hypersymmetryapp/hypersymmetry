'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/app')
      router.refresh()
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4" style={{ background: '#000' }}>
      <div className="w-full max-w-sm">
        <h1 className="font-mono font-bold text-3xl text-white mb-10 text-center tracking-tight">
          hypersymmetry
        </h1>
        <form onSubmit={handleSubmit} className="space-y-3 font-sans" autoComplete="on">
          <input
            type="email"
            name="email"
            id="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-md text-sm bg-white outline-none border border-stone-700 focus:border-stone-400"
          />
          <input
            type="password"
            name="password"
            id="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-md text-sm bg-white outline-none border border-stone-700 focus:border-stone-400"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-md text-sm font-medium text-black transition-colors disabled:opacity-50 bg-white hover:bg-stone-200"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-stone-500 font-sans">
          No account?{' '}
          <Link href="/signup" className="text-stone-300 hover:text-white transition-colors">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
