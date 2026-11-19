// Alertas de vencimento de entregas TRE (checklist de prestação de contas).
// - Cron diário 07:10 + reforço ao meio-dia: varre tse_deliveries não concluídas e grava
//   alertas idempotentes em tse_delivery_alerts (status active/dismissed), além de notificação in-app.
// - Endpoint on-demand: POST /backend/v1/accounting/deliveries/scan
//
// IMPORTANTE (escopo PocketBase/JVM): TODA a lógica vive DENTRO dos callbacks de
// cronAdd/routerAdd. Nada é declarado no escopo de arquivo do hook.

cronAdd('tse_delivery_alerts_morning', '10 7 * * *', () => {
  const now = new Date()
  let deliveries = []
  let created = 0
  let activeAlerts = 0

  try {
    deliveries = $app.findRecordsByFilter(
      'tse_deliveries',
      'status != "concluido"',
      'legal_deadline',
      500,
      0,
    )
  } catch (fetchErr) {
    console.log('tse_delivery_alerts: erro ao buscar entregas: ' + fetchErr)
    deliveries = []
  }

  let alertsCol = null
  try {
    alertsCol = $app.findCollectionByNameOrId('tse_delivery_alerts')
  } catch (_) {
    console.log('tse_delivery_alerts: coleção tse_delivery_alerts não encontrada')
    alertsCol = null
  }

  let notificationsCol = null
  try {
    notificationsCol = $app.findCollectionByNameOrId('notifications')
  } catch (_) {
    notificationsCol = null
  }

  for (let i = 0; i < deliveries.length; i++) {
    const del = deliveries[i]
    const campaignId = del.getString('campaign_id') || ''
    const deliveryTitle = del.getString('title') || 'Entrega TRE'
    const deadlineStr = del.getString('legal_deadline') || ''
    if (!deadlineStr) continue

    const deadlineDateOnly = String(deadlineStr).split(' ')[0].split('T')[0]
    const deadline = new Date(deadlineDateOnly + 'T23:59:59')
    if (isNaN(deadline.getTime())) continue

    const daysToDeadline = Math.ceil((now.getTime() - deadline.getTime()) / 86400000)
    if (daysToDeadline > 3) continue

    const severity = daysToDeadline < 0 ? 'critical' : 'warning'
    const daysLabel =
      daysToDeadline === 0
        ? 'vence HOJE'
        : daysToDeadline > 0
          ? 'vence em ' + daysToDeadline + ' dia(s)'
          : 'ATRASADA há ' + Math.abs(daysToDeadline) + ' dia(s)'
    const summary =
      'A entrega "' +
      deliveryTitle +
      '" ' +
      daysLabel +
      ' (prazo ' +
      deadlineDateOnly.split('-').reverse().join('/') +
      ').'

    let existing = []
    try {
      existing = $app.findRecordsByFilter(
        'tse_delivery_alerts',
        'delivery_id = "' + del.id + '" && (status = "active" || status = "dismissed")',
        '-created',
        1,
        0,
      )
    } catch (_) {
      existing = []
    }

    let alertRecord = null
    if (existing.length > 0) {
      alertRecord = existing[0]
      if (
        alertRecord.getString('status') === 'dismissed' &&
        alertRecord.getString('severity') === severity
      ) {
        continue
      }
    }

    if (alertsCol) {
      if (alertRecord) {
        alertRecord.set('days_to_deadline', daysToDeadline)
        alertRecord.set('severity', severity)
        alertRecord.set('summary', summary)
        alertRecord.set('status', 'active')
        try {
          $app.save(alertRecord)
          activeAlerts++
        } catch (saveErr) {
          console.log('tse_delivery_alerts: erro ao atualizar alerta: ' + saveErr)
        }
      } else {
        const alert = new Record(alertsCol)
        alert.set('campaign_id', campaignId)
        alert.set('delivery_id', del.id)
        alert.set('title', 'Prazo TRE: ' + deliveryTitle)
        alert.set('summary', summary)
        alert.set('severity', severity)
        alert.set('status', 'active')
        alert.set('days_to_deadline', daysToDeadline)
        alert.set('delivery_title', deliveryTitle)
        alert.set('deadline', deadlineDateOnly)
        try {
          $app.save(alert)
          created++
          activeAlerts++
        } catch (saveErr) {
          console.log('tse_delivery_alerts: erro ao criar alerta: ' + saveErr)
        }
      }
    }

    if (notificationsCol && campaignId) {
      const notifTitle =
        (daysToDeadline < 0 ? '🚨 Entrega TRE atrasada: ' : '⏰ Entrega TRE vencendo: ') +
        deliveryTitle
      let recentNotif = []
      try {
        recentNotif = $app.findRecordsByFilter(
          'notifications',
          'campaign_id = "' + campaignId + '" && title = "' + notifTitle.replace(/"/g, '') + '"',
          '-created',
          1,
          0,
        )
      } catch (_) {
        recentNotif = []
      }
      if (recentNotif.length === 0) {
        try {
          const notif = new Record(notificationsCol)
          notif.set('campaign_id', campaignId)
          notif.set('title', notifTitle)
          notif.set('body', summary)
          notif.set('type', 'info')
          notif.set('severity', daysToDeadline < 0 ? 'critical' : 'warning')
          notif.set('read', false)
          notif.set('link', '/accounting')
          $app.save(notif)
        } catch (notifErr) {
          console.log('tse_delivery_alerts: erro ao criar notificação: ' + notifErr)
        }
      }
    }
  }

  console.log(
    'tse_delivery_alerts scan: verificadas=' +
      deliveries.length +
      ', criadas=' +
      created +
      ', ativas=' +
      activeAlerts,
  )
})

cronAdd('tse_delivery_alerts_midday', '0 12 * * *', () => {
  const now = new Date()
  let deliveries = []
  let created = 0
  let activeAlerts = 0

  try {
    deliveries = $app.findRecordsByFilter(
      'tse_deliveries',
      'status != "concluido"',
      'legal_deadline',
      500,
      0,
    )
  } catch (fetchErr) {
    console.log('tse_delivery_alerts (meio-dia): erro ao buscar entregas: ' + fetchErr)
    deliveries = []
  }

  let alertsCol = null
  try {
    alertsCol = $app.findCollectionByNameOrId('tse_delivery_alerts')
  } catch (_) {
    console.log('tse_delivery_alerts (meio-dia): coleção tse_delivery_alerts não encontrada')
    alertsCol = null
  }

  for (let i = 0; i < deliveries.length; i++) {
    const del = deliveries[i]
    const campaignId = del.getString('campaign_id') || ''
    const deliveryTitle = del.getString('title') || 'Entrega TRE'
    const deadlineStr = del.getString('legal_deadline') || ''
    if (!deadlineStr) continue

    const deadlineDateOnly = String(deadlineStr).split(' ')[0].split('T')[0]
    const deadline = new Date(deadlineDateOnly + 'T23:59:59')
    if (isNaN(deadline.getTime())) continue

    const daysToDeadline = Math.ceil((now.getTime() - deadline.getTime()) / 86400000)
    if (daysToDeadline > 3) continue

    const severity = daysToDeadline < 0 ? 'critical' : 'warning'
    const daysLabel =
      daysToDeadline === 0
        ? 'vence HOJE'
        : daysToDeadline > 0
          ? 'vence em ' + daysToDeadline + ' dia(s)'
          : 'ATRASADA há ' + Math.abs(daysToDeadline) + ' dia(s)'
    const summary =
      'A entrega "' +
      deliveryTitle +
      '" ' +
      daysLabel +
      ' (prazo ' +
      deadlineDateOnly.split('-').reverse().join('/') +
      ').'

    let existing = []
    try {
      existing = $app.findRecordsByFilter(
        'tse_delivery_alerts',
        'delivery_id = "' + del.id + '" && (status = "active" || status = "dismissed")',
        '-created',
        1,
        0,
      )
    } catch (_) {
      existing = []
    }

    let alertRecord = null
    if (existing.length > 0) {
      alertRecord = existing[0]
      if (
        alertRecord.getString('status') === 'dismissed' &&
        alertRecord.getString('severity') === severity
      ) {
        continue
      }
    }

    if (alertsCol) {
      if (alertRecord) {
        alertRecord.set('days_to_deadline', daysToDeadline)
        alertRecord.set('severity', severity)
        alertRecord.set('summary', summary)
        alertRecord.set('status', 'active')
        try {
          $app.save(alertRecord)
          activeAlerts++
        } catch (saveErr) {
          console.log('tse_delivery_alerts (meio-dia): erro ao atualizar alerta: ' + saveErr)
        }
      } else {
        const alert = new Record(alertsCol)
        alert.set('campaign_id', campaignId)
        alert.set('delivery_id', del.id)
        alert.set('title', 'Prazo TRE: ' + deliveryTitle)
        alert.set('summary', summary)
        alert.set('severity', severity)
        alert.set('status', 'active')
        alert.set('days_to_deadline', daysToDeadline)
        alert.set('delivery_title', deliveryTitle)
        alert.set('deadline', deadlineDateOnly)
        try {
          $app.save(alert)
          created++
          activeAlerts++
        } catch (saveErr) {
          console.log('tse_delivery_alerts (meio-dia): erro ao criar alerta: ' + saveErr)
        }
      }
    }
  }

  console.log(
    'tse_delivery_alerts (meio-dia) scan: verificadas=' +
      deliveries.length +
      ', criadas=' +
      created +
      ', ativas=' +
      activeAlerts,
  )
})

routerAdd(
  'POST',
  '/backend/v1/accounting/deliveries/scan',
  (e) => {
    try {
      const now = new Date()
      let deliveries = []
      let created = 0
      let activeAlerts = 0

      try {
        deliveries = $app.findRecordsByFilter(
          'tse_deliveries',
          'status != "concluido"',
          'legal_deadline',
          500,
          0,
        )
      } catch (_) {
        deliveries = []
      }

      let alertsCol = null
      try {
        alertsCol = $app.findCollectionByNameOrId('tse_delivery_alerts')
      } catch (_) {
        return e.json(500, { error: 'Coleção tse_delivery_alerts não encontrada' })
      }

      for (let i = 0; i < deliveries.length; i++) {
        const del = deliveries[i]
        const deadlineStr = del.getString('legal_deadline') || ''
        if (!deadlineStr) continue

        const deadlineDateOnly = String(deadlineStr).split(' ')[0].split('T')[0]
        const deadline = new Date(deadlineDateOnly + 'T23:59:59')
        if (isNaN(deadline.getTime())) continue

        const daysToDeadline = Math.ceil((now.getTime() - deadline.getTime()) / 86400000)
        if (daysToDeadline > 3) continue

        const severity = daysToDeadline < 0 ? 'critical' : 'warning'
        const deliveryTitle = del.getString('title') || 'Entrega TRE'
        const daysLabel =
          daysToDeadline === 0
            ? 'vence HOJE'
            : daysToDeadline > 0
              ? 'vence em ' + daysToDeadline + ' dia(s)'
              : 'ATRASADA há ' + Math.abs(daysToDeadline) + ' dia(s)'
        const summary =
          'A entrega "' +
          deliveryTitle +
          '" ' +
          daysLabel +
          ' (prazo ' +
          deadlineDateOnly.split('-').reverse().join('/') +
          ').'

        let existing = []
        try {
          existing = $app.findRecordsByFilter(
            'tse_delivery_alerts',
            'delivery_id = "' + del.id + '" && (status = "active" || status = "dismissed")',
            '-created',
            1,
            0,
          )
        } catch (_) {
          existing = []
        }

        let alertRecord = null
        if (existing.length > 0) {
          alertRecord = existing[0]
          if (
            alertRecord.getString('status') === 'dismissed' &&
            alertRecord.getString('severity') === severity
          ) {
            continue
          }
        }

        if (alertRecord) {
          alertRecord.set('days_to_deadline', daysToDeadline)
          alertRecord.set('severity', severity)
          alertRecord.set('summary', summary)
          alertRecord.set('status', 'active')
          $app.save(alertRecord)
          activeAlerts++
        } else {
          const alert = new Record(alertsCol)
          alert.set('campaign_id', del.getString('campaign_id') || '')
          alert.set('delivery_id', del.id)
          alert.set('title', 'Prazo TRE: ' + deliveryTitle)
          alert.set('summary', summary)
          alert.set('severity', severity)
          alert.set('status', 'active')
          alert.set('days_to_deadline', daysToDeadline)
          alert.set('delivery_title', deliveryTitle)
          alert.set('deadline', deadlineDateOnly)
          $app.save(alert)
          created++
          activeAlerts++
        }
      }

      return e.json(200, {
        success: true,
        checked: deliveries.length,
        active_alerts: activeAlerts,
        created: created,
      })
    } catch (err) {
      return e.json(500, { error: 'Erro ao verificar prazos das entregas TRE: ' + err })
    }
  },
  $apis.requireAuth(),
)
