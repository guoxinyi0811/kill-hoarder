/**
 * 登录（SPEC §2.2）：Supabase magic link，单账号。
 * 不做注册流程，不做密码找回 UI。
 */

import { useState, type FormEvent } from 'react'
import { supabase } from '../api/client'

export function LoginScreen() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setState('sending')

    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })

    if (authError) {
      setError(authError.message)
      setState('idle')
      return
    }
    setState('sent')
  }

  if (state === 'sent') {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <p className="text-5xl">📬</p>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">
          登录链接已发出
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          去 {email} 收信，点开链接就登录了。
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md px-6 py-20">
      <h1 className="text-2xl font-semibold text-slate-900">保质期</h1>
      <p className="mt-2 text-sm text-slate-500">
        输入邮箱，我们发一条登录链接给你。
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="邮箱"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base"
        />
        <button
          type="submit"
          disabled={state === 'sending'}
          className="w-full rounded-xl bg-slate-900 py-3 font-medium text-white active:bg-slate-700 disabled:opacity-50"
        >
          {state === 'sending' ? '发送中…' : '发送登录链接'}
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </form>
    </div>
  )
}
