migrate(
  (app) => {
    const campaigns = app.findCollectionByNameOrId('campaigns')
    const deliveries = app.findCollectionByNameOrId('tse_deliveries')

    const collection = new Collection({
      name: 'tse_delivery_alerts',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'campaign_id',
          type: 'relation',
          required: true,
          collectionId: campaigns.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'delivery_id',
          type: 'relation',
          collectionId: deliveries.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'title',
          type: 'text',
          required: true,
        },
        {
          name: 'summary',
          type: 'text',
        },
        {
          name: 'severity',
          type: 'select',
          values: ['warning', 'critical'],
          maxSelect: 1,
        },
        {
          name: 'status',
          type: 'select',
          values: ['active', 'resolved', 'dismissed'],
          maxSelect: 1,
        },
        {
          name: 'days_to_deadline',
          type: 'number',
        },
        {
          name: 'delivery_title',
          type: 'text',
        },
        {
          name: 'deadline',
          type: 'date',
        },
        {
          name: 'resolved_at',
          type: 'date',
        },
        {
          name: 'created',
          type: 'autodate',
          onCreate: true,
          onUpdate: false,
        },
        {
          name: 'updated',
          type: 'autodate',
          onCreate: true,
          onUpdate: true,
        },
      ],
      indexes: [
        'CREATE INDEX idx_tse_deliv_alerts_camp ON tse_delivery_alerts (campaign_id)',
        'CREATE INDEX idx_tse_deliv_alerts_status ON tse_delivery_alerts (status)',
        'CREATE INDEX idx_tse_deliv_alerts_delivery ON tse_delivery_alerts (delivery_id)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('tse_delivery_alerts')
      app.delete(collection)
    } catch (_) {}
  },
)
