import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import type { TseTransaction, TseDelivery } from '@/types/campaign'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Wallet, TrendingUp, TrendingDown, ArrowRight, Loader2 } from 'lucide-react'

const formatBRL = (val: number) =>
  val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Card "Caixa Eleitoral em Tempo Real": totais de receitas e despesas e
 * saldo calculados a partir de tse_transactions da campanha selecionada.
 */
export const CashPositionCard: React.FC<{ campaignId: string }> = ({ campaignId }) => {
  const navigate = useNavigate()
  const [transactions, setTransactions] = useState<TseTransaction[]>([])
  const [deliveries, setDeliveries] = useState<TseDelivery[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!campaignId) return
    let cancelled = false
    const load = async () => {
      try {
        const [txs, dels] = await Promise.all([
          pb.collection('tse_transactions').getFullList<TseTransaction>({
            filter: `campaign_id = "${campaignId}"`,
          }),
          pb.collection('tse_deliveries').getFullList<TseDelivery>({
            filter: `campaign_id = "${campaignId}"`,
          }),
        ])
        if (cancelled) return
        setTransactions(txs)
        setDeliveries(dels)
      } catch {
        if (!cancelled) {
          setTransactions([])
          setDeliveries([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [campaignId])

  const totalReceitas = transactions
    .filter((t) => t.type === 'receita')
    .reduce((acc, t) => acc + (t.amount || 0), 0)
  const totalDespesas = transactions
    .filter((t) => t.type === 'despesa')
    .reduce((acc, t) => acc + (t.amount || 0), 0)
  const saldo = totalReceitas - totalDespesas
  const percentGasto = totalReceitas > 0 ? Math.min((totalDespesas / totalReceitas) * 100, 100) : 0
  const overdueDeliveries = deliveries.filter((d) => {
    if (d.status === 'concluido') return false
    if (!d.legal_deadline) return false
    const dl = new Date(d.legal_deadline + 'T23:59:59')
    return dl.getTime() < Date.now()
  }).length

  return (
    <Card className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/40 border-amber-500/40 text-white shadow-sm w-full min-w-0 overflow-hidden">
      <CardContent className="p-4 space-y-3 w-full min-w-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wallet className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-white leading-tight truncate">
                Caixa Eleitoral
              </h3>
              <p className="text-[11px] text-slate-400 leading-tight">
                Prestação de contas em tempo real
              </p>
            </div>
          </div>
          {overdueDeliveries > 0 && (
            <span className="shrink-0 text-[10px] font-bold text-rose-300 bg-rose-500/20 border border-rose-500/40 rounded-full px-2 py-0.5 whitespace-nowrap">
              {overdueDeliveries}{' '}
              {overdueDeliveries === 1 ? 'entrega atrasada' : 'entregas atrasadas'}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 xs:grid-cols-3 sm:grid-cols-3 gap-2 min-w-0">
          <div className="rounded-lg bg-slate-950/70 border border-slate-800 p-2 min-w-0">
            <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 mb-0.5">
              <TrendingUp className="w-3 h-3 shrink-0" />
              <span className="truncate">Receitas</span>
            </div>
            <div className="text-sm sm:text-base font-black text-emerald-400 truncate tabular-nums">
              {formatBRL(totalReceitas)}
            </div>
          </div>
          <div className="rounded-lg bg-slate-950/70 border border-slate-800 p-2 min-w-0">
            <div className="flex items-center gap-1 text-[10px] font-semibold text-rose-400 mb-0.5">
              <TrendingDown className="w-3 h-3 shrink-0" />
              <span className="truncate">Despesas</span>
            </div>
            <div className="text-sm sm:text-base font-black text-rose-400 truncate tabular-nums">
              {formatBRL(totalDespesas)}
            </div>
          </div>
          <div className="rounded-lg bg-slate-950/70 border border-amber-500/30 p-2 min-w-0">
            <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-300 mb-0.5">
              <Wallet className="w-3 h-3 shrink-0" />
              <span className="truncate">Saldo</span>
            </div>
            <div
              className={`text-sm sm:text-base font-black truncate tabular-nums ${
                saldo >= 0 ? 'text-amber-400' : 'text-rose-400'
              }`}
            >
              {formatBRL(saldo)}
            </div>
          </div>
        </div>

        <div className="space-y-1 min-w-0">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span className="truncate">% gasto do caixa</span>
            <span className="font-bold text-slate-200 shrink-0 ml-2 tabular-nums">
              {percentGasto.toFixed(0)}%
            </span>
          </div>
          <Progress
            value={percentGasto}
            className="h-2 bg-slate-800 [&>div]:bg-gradient-to-r [&>div]:from-amber-500 [&>div]:to-rose-500"
          />
        </div>

        <Button
          onClick={() => navigate('/accounting')}
          className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs h-9 justify-center"
        >
          <span className="truncate">Ver prestação de contas</span>
          <ArrowRight className="w-4 h-4 ml-1.5 shrink-0" />
        </Button>
      </CardContent>
    </Card>
  )
}
