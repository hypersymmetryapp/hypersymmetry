'use client'

import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 text-center" style={{ background: '#000' }}>
      <h1 className="font-mono font-bold text-2xl text-white mb-3">something went wrong</h1>
      <p className="font-sans text-sm text-stone-400 mb-6 max-w-sm">
        We hit an unexpected error loading your workspace. This is an alpha build — please try again.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={reset}
          className="font-sans text-sm px-5 py-2 rounded-md bg-white text-black font-medium hover:bg-stone-200 transition-colors"
        >
          Try again
        </button>
        <a
          href="/login"
          className="font-sans text-sm px-5 py-2 rounded-md border border-stone-700 text-stone-200 hover:bg-stone-900 transition-colors"
        >
          Sign in again
        </a>
      </div>
    </div>
  )
}
