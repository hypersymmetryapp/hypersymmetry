'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!USERNAME_RE.test(username)) {
      setError('Username must be 3-20 characters: letters, numbers, underscore.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        emailRedirectTo: `${location.origin}/auth/confirm`,
      },
    })
    if (error) {
      setError(
        /duplicate key|profiles_username_key/i.test(error.message)
          ? 'That username is already taken.'
          : error.message
      )
      setLoading(false)
    } else {
      setDone(true)
    }
  }

  if (done) {
    return (
      <div className="flex-1 flex items-center justify-center p-4" style={{ background: '#000' }}>
        <div className="text-center space-y-3 font-sans">
          <p className="text-white text-lg">Check your email</p>
          <p className="text-sm text-stone-500">
            We sent a confirmation link to <span className="text-stone-300">{email}</span>
          </p>
        </div>
      </div>
    )
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
            className="w-full px-3 py-2 rounded-md text-sm bg-white text-stone-900 placeholder-stone-400 outline-none border border-stone-700"
          />
          <input
            type="text"
            name="username"
            id="username"
            autoComplete="username"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-md text-sm bg-white text-stone-900 placeholder-stone-400 outline-none border border-stone-700"
          />
          <input
            type="password"
            name="new-password"
            id="new-password"
            autoComplete="new-password"
            placeholder="Password (8+ characters)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-3 py-2 rounded-md text-sm bg-white text-stone-900 placeholder-stone-400 outline-none border border-stone-700"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-md text-sm font-medium text-black disabled:opacity-50 bg-white hover:bg-stone-200"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-stone-500 font-sans">
          Have an account?{' '}
          <Link href="/login" className="text-stone-300 hover:text-white transition-colors">
            Sign in
          </Link>
        </p>
      </div>
      <p className="mt-8 text-[10px] font-mono uppercase tracking-widest text-stone-600 border border-stone-800 rounded-full px-3 py-1">
        alpha build — more coming soon
      </p>
    </div>
  )
}
