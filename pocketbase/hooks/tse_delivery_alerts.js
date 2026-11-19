// Scheduled Job: alertas de vencimento de entregas do TRE (tse_deliveries)
// Roda diariamente às 07:10 e a cada 12h como reforço; cria alertas de
// vencimento (status active/dimissed), notificação in-app e Web Push.
const DLG_THRESHOLD_DAYS = 7

function tseDaysUntil(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return null
  const today = new Date()
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((d.getTime() - todayMid.getTime()) / (1000 * 60 * 60 * 24))
}

function tseComputeSeverity(daysUntil) {
  if (daysUntil === null) return null
  if (daysUntil < 0) return 'critical'
  if (daysUntil <= 3) return 'critical'
  if (daysUntil <= DLG_THRESHOLD_DAYS) return 'warning'
  return null
}

function tseScanDeliveries() {
  let deliveries = []
  try {
    deliveries = $app.findRecordsByFilter(
      'tse_deliveries',
      'status != "concluido" && status != "em_atraso"',
      'legal_deadline',
      500,
      0,
    )
  } catch (err) {
    console.log('tse_delivery_alerts: error fetching deliveries: ' + err)
    return
  }
  if (!deliveries || deliveries.length === 0) return

  let notificationsCol = null
  try {
    notificationsCol = $app.findCollectionByNameOrId('notifications')
  } catch (_) {}

  for (let i = 0; i < deliveries.length; i++) {
    const del = deliveries[i]
    const daysUntil = tseDaysUntil(del.getString('legal_deadline'))
    const severity = tseComputeSeverity(daysUntil)
    if (severity === null) continue // prazo confortável, nada a fazer

    const campaignId = del.getString('campaign_id')
    const title = del.getString('title') || 'Obrigação do TRE'
    const isOverdue = daysUntil < 0

    // 1. Cria/atualiza alerta de vencimento (idempotente por entrega)
    let alertRec = null
    try {
      const existing = $app.findRecordsByFilter(
        'tse_delivery_alerts',
        'delivery_id = "' + del.id + '" && status = "active"',
        '-created',
        1,
        0,
      )
      if (existing.length > 0) alertRec = existing[0]
    } catch (_) {}

    try {
      if (alertRec) {
        // Nada mudou (mesma severidade e dias) → não reprocessa
        if (alertRec.getInt('days_until_deadline') === daysUntil) continue
        alertRec.set('days_until_deadline', daysUntil)
        alertRec.set('severity', severity)
        alertRec.set(
          'summary',
          isOverdue
            ? 'Entrega "' + title + '" está ATRASADA há ' + Math.abs(daysUntil) + ' dia(s).'
            : 'Entrega "' + title + '" vence em ' + daysUntil + ' dia(s).',
        )
        $app.save(alertRec)
      } else {
        const col = $app.findCollectionByNameOrId('tse_delivery_alerts')
        const newAlert = new Record(col)
        newAlert.set('campaign_id', campaignId)
        newAlert.set('delivery_id', del.id)
        newAlert.set('title', isOverdue ? 'Entrega TRE atrasada' : 'Prazo TRE próximo')
        newAlert.set(
          'summary',
          isOverdue
            ? 'Entrega "' + title + '" está ATRASADA há ' + Math.abs(daysUntil) + ' dia(s).'
            : 'Entrega "' + title + '" vence em ' + daysUntil + ' dia(s).',
        )
        newAlert.set('severity', severity)
        newAlert.set('days_until_deadline', daysUntil)
        newAlert.set('status', 'active')
        $app.save(newAlert)
      }
    } catch (alertErr) {
      console.log('tse_delivery_alerts: error saving alert: ' + alertErr)
      continue
    }

    // 2. Notificação in-app (mesma infra do sininho)
    if (notificationsCol && campaignId) {
      try {
        const notif = new Record(notificationsCol)
        notif.set('campaign_id', campaignId)
        notif.set('title', isOverdue ? '🚨 Entrega TRE atrasada' : '⏰ Prazo TRE se aproximando')
        notif.set(
          'body',
          isOverdue
            ? '"' +
                title +
                '" venceu há ' +
                Math.abs(daysUntil) +
                ' dia(s). Regularize o quanto antes.'
            : '"' + title + '" vence em ' + daysUntil + ' dia(s). Organize a documentação.',
        )
        notif.set('type', 'info')
        notif.set('severity', severity)
        notif.set('read', false)
        notif.set('link', '/accounting')
        $app.save(notif)
      } catch (notifErr) {
        console.log('tse_delivery_alerts: notification error: ' + notifErr)
      }
    }

    // 3. Web Push (mesma infra de push_subscriptions)
    let subscriptions = []
    try {
      subscriptions = $app.findRecordsByFilter(
        'push_subscriptions',
        'is_active = true && (campaign_id = "' +
          campaignId +
          '" || campaign_id = "" || campaign_id = null)',
        '-created',
        100,
        0,
      )
    } catch (_) {
      subscriptions = []
    }

    const pushPayload = JSON.stringify({
      title: isOverdue ? '🚨 Entrega TRE atrasada' : '⏰ Prazo TRE se aproximando',
      body: isOverdue
        ? '"' + title + '" venceu há ' + Math.abs(daysUntil) + ' dia(s).'
        : '"' + title + '" vence em ' + daysUntil + ' dia(s).',
      url: '/accounting',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'tse-delivery-' + del.id + '-' + daysUntil,
      data: { url: '/accounting', campaign_id: campaignId, delivery_id: del.id },
    })

    for (let s = 0; s < subscriptions.length; s++) {
      const sub = subscriptions[s]
      const endpoint = sub.getString('endpoint')
      if (!endpoint) continue
      try {
        let httpRes
        try {
          httpRes = $http.send({
            url: endpoint,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', TTL: '86400', Urgency: 'high' },
            body: pushPayload,
            timeout: 5,
          })
        } catch (_) {
          httpRes = { statusCode: 200 }
        }
        if (httpRes && (httpRes.statusCode === 404 || httpRes.statusCode === 410)) {
          sub.set('is_active', false)
          $app.save(sub)
        }
      } catch (pushErr) {
        console.log('tse_delivery_alerts: push error: ' + pushErr)
      }
    }
  }
}

cronAdd('check_tse_delivery_alerts', '10 7 * * *', () => {
  try {
    tseScanDeliveries()
  } catch (err) {
    console.log('Error in check_tse_delivery_alerts cron: ' + err)
  }
})

cronAdd('check_tse_delivery_alerts_12h', '10 */12 * * *', () => {
  try {
    tseScanDeliveries()
  } catch (err) {
    console.log('Error in check_tse_delivery_alerts_12h cron: ' + err)
  }
})

// POST /backend/v1/accounting/deliveries/scan
// Executa o scan on-demand (usado pela UI logo após abrir o checklist).
routerAdd(
  'POST',
  '/backend/v1/accounting/deliveries/scan',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação necessária')
    try {
      tseScanDeliveries()
      return e.json(200, { success: true, message: 'Varredura de prazos TRE concluída.' })
    } catch (err) {
      return e.json(500, { error: err.message || 'Erro ao varrer prazos do TRE.' })
    }
  },
  $apis.requireAuth(),
)
