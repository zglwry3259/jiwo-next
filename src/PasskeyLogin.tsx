import { useState } from 'react'
import { startAuthentication } from '@simplewebauthn/browser'
import { KeyRound } from 'lucide-react'
import './PasskeyLogin.css'

function isSecure(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof window.PublicKeyCredential !== 'undefined'
  )
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

interface BeginPayload {
  session: string
  options: Parameters<typeof startAuthentication>[0]['optionsJSON']
}

interface FinishPayload {
  token?: string
  master_origin?: string
}

/** 使用已在主控注册的 Passkey 登录，并把成功登录态安全地带回主控。 */
export function PasskeyLogin({ buttonClassName, iconSize = 18 }: { buttonClassName?: string; iconSize?: number } = {}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isSecure()) return null

  const login = async () => {
    setBusy(true)
    setError(null)
    try {
      const beginRes = await post('/api/login/passkey/begin', { remember_me: true })
      if (!beginRes.ok) {
        setError('主控未开放 Passkey 登录')
        return
      }
      const { session, options } = (await beginRes.json()) as BeginPayload
      const assertion = await startAuthentication({ optionsJSON: options })
      const finishRes = await post(
        `/api/login/passkey/finish?session=${encodeURIComponent(session)}`,
        assertion,
      )
      if (!finishRes.ok) {
        setError('Passkey 校验失败')
        return
      }
      const payload = (await finishRes.json()) as FinishPayload
      if (!payload.token) {
        setError('登录未返回凭据')
        return
      }
      const target = (payload.master_origin || '').replace(/\/$/, '')
      if (!target) {
        setError('主控地址未配置')
        return
      }
      window.location.href = `${target}/#mmwx_token=${encodeURIComponent(payload.token)}`
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') return
      if (err instanceof Error && err.name === 'SecurityError') {
        setError('本域名未被主控承认，请配置 Related Origins')
        return
      }
      setError('登录失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="probe-passkey-login">
      <button
        type="button"
        className={buttonClassName}
        aria-label="使用 Passkey 登录"
        aria-busy={busy}
        title="使用 Passkey 登录"
        onClick={login}
        disabled={busy}
      >
        <KeyRound size={iconSize} />
      </button>
      {error && <em className="probe-passkey-error" role="status">{error}</em>}
    </span>
  )
}
