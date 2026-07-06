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
      <div className="flex-1 flex items-center justify-center p-4" style={{ background: '#383838' }}>
        <div className="text-center space-y-3">
          <p className="text-stone-100 text-lg">Check your email</p>
          <p className="text-sm text-stone-400">
            We sent a confirmation link to <span className="text-stone-200">{email}</span>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4" style={{ background: '#383838' }}>
      <div className="w-full max-w-sm">
        <h1 className="text-2xl mb-8 text-center text-stone-100" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>
          hypersymmetry
        </h1>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-md text-sm bg-white outline-none border border-stone-300"
          />
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-md text-sm bg-white outline-none border border-stone-300"
          />
          <input
            type="password"
            placeholder="Password (8+ characters)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-3 py-2 rounded-md text-sm bg-white outline-none border border-stone-300"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-md text-sm font-medium text-white disabled:opacity-50 bg-teal-600 hover:bg-teal-500"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-stone-400">
          Have an account?{' '}
          <Link href="/login" className="text-stone-200 hover:text-white transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
