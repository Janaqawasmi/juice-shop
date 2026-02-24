import { Router, Request, Response } from 'express'

const router = Router()

type Wallet = { usd: number; eur: number; initialUsd: number }
const wallets = new Map<string, Wallet>()

function walletKey(req: Request) {
  return (req.headers['x-forwarded-for'] as string) || req.ip || 'local'
}

function getWallet(req: Request): Wallet {
  const k = walletKey(req)
  if (!wallets.has(k)) wallets.set(k, { usd: 10.0, eur: 0.0, initialUsd: 10.0 })
  return wallets.get(k)!
}

// intentionally vulnerable rounding
function roundUp2(n: number) {
  return Math.ceil(n * 100) / 100
}
function round2(n: number) {
  return Number(n.toFixed(2))
}

// GET /api/wallet
router.get('/wallet', (req: Request, res: Response) => {
  const w = getWallet(req)
  res.json({ usd: w.usd, eur: w.eur, initialUsd: w.initialUsd })
})

// POST /api/exchange
router.post('/exchange', (req: Request, res: Response) => {
  const { from, to, amount } = req.body ?? {}
  const w = getWallet(req)

  if (!['USD', 'EUR'].includes(from) || !['USD', 'EUR'].includes(to) || from === to) {
    return res.status(400).json({ error: 'Invalid currency pair' })
  }

  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: 'Invalid amount' })
  }

  const USD_TO_EUR = 0.91
  const EUR_TO_USD = 1 / USD_TO_EUR

  let received = 0

  // VULNERABLE: float + always rounding UP "for the customer"
  if (from === 'USD' && to === 'EUR') {
    if (w.usd < amt) return res.status(400).json({ error: 'Insufficient USD' })
    received = roundUp2(amt * USD_TO_EUR)
    w.usd = round2(w.usd - amt)
    w.eur = round2(w.eur + received)
  } else if (from === 'EUR' && to === 'USD') {
    if (w.eur < amt) return res.status(400).json({ error: 'Insufficient EUR' })
    received = roundUp2(amt * EUR_TO_USD)
    w.eur = round2(w.eur - amt)
    w.usd = round2(w.usd + received)
  }

  res.json({ message: 'exchanged', received, wallet: w })
})

// POST /api/refund
router.post('/refund', (req: Request, res: Response) => {
  const { currency, amount } = req.body ?? {}
  const w = getWallet(req)

  if (!['USD', 'EUR'].includes(currency)) {
    return res.status(400).json({ error: 'Invalid currency' })
  }

  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: 'Invalid amount' })
  }

  // VULNERABLE: inconsistent rounding point vs exchange
  const credited = roundUp2(amt)

  if (currency === 'USD') w.usd = round2(w.usd + credited)
  else w.eur = round2(w.eur + credited)

  res.json({ message: 'refunded', credited, wallet: w })
})

export default router
