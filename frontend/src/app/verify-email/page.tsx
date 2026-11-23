'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/errors'
import { AuthLayout } from '@/components/auth/AuthLayout'

function VerifyEmail() {
  const token = useSearchParams()?.get('token') || ''
  const [status, setStatus] = useState<'checking' | 'ok' | 'failed'>(token ? 'checking' : 'failed')
  const [message, setMessage] = useState(token ? '' : 'This confirmation link is missing its code.')
  const started = useRef(false)

  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    api
      .post('/auth/verify-email', { token })
      .then(() => setStatus('ok'))
      .catch((err: unknown) => {
        setStatus('failed')
        setMessage(getApiErrorMessage(err, 'This confirmation link is invalid or has expired.'))
      })
  }, [token])

  return (
    <div className="py-6 text-center space-y-3 animate-auth-reveal">
      {status === 'checking' && (
        <>
          <Loader2 className="w-8 h-8 animate-spin text-[#D8BC88] mx-auto" />
          <p className="text-xs text-[#A8A398]">Confirming your email…</p>
        </>
      )}
      {status === 'ok' && (
        <>
          <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-[#F2EFE8]">Email confirmed</h3>
          <p className="text-xs text-[#A8A398]">Your account is active. You can sign in now.</p>
          <Link href="/login" className="inline-block text-xs font-semibold text-[#D8BC88] hover:underline pt-1">
            Sign in
          </Link>
        </>
      )}
      {status === 'failed' && (
        <>
          <div className="w-12 h-12 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
            <XCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-[#F2EFE8]">Link not valid</h3>
          <p className="text-xs text-[#A8A398] max-w-xs mx-auto leading-relaxed">
            {message} Try signing in; you can request a fresh link from there.
          </p>
          <Link href="/login" className="inline-block text-xs font-semibold text-[#D8BC88] hover:underline pt-1">
            Go to sign in
          </Link>
        </>
      )}
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <AuthLayout title="Confirm your email" subtitle="One quick step to activate your GRID07 account">
      <Suspense fallback={null}>
        <VerifyEmail />
      </Suspense>
    </AuthLayout>
  )
}
