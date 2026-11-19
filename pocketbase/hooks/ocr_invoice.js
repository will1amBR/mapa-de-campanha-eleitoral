/// <reference path="../../pb_data/types.d.ts" />
// OCR de notas fiscais: POST /backend/v1/ocr/invoice
// Recebe { image_base64, mime_type } e extrai valor_total, fornecedor,
// numero_nota e data_emissao usando modelo multimodal (OpenAI Vision) quando
// OPENAI_API_KEY está disponível; caso contrário responde 503 com mensagem
// amigável (a UI oferece o preenchimento manual).

routerAdd(
  'POST',
  '/backend/v1/ocr/invoice',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação necessária')

    let body = {}
    try {
      body = e.requestInfo().body
    } catch (_) {
      body = {}
    }

    const imageBase64 = (body.image_base64 || '').toString()
    const mimeType = (body.mime_type || 'image/jpeg').toString()

    if (!imageBase64) {
      return e.json(400, { success: false, message: 'Imagem da nota não enviada.' })
    }

    if (imageBase64.length > 8_000_000) {
      return e.json(413, {
        success: false,
        message: 'Imagem muito grande. Tire a foto novamente com menos detalhes de fundo.',
      })
    }

    const apiKey = $os.getenv('OPENAI_API_KEY')
    if (!apiKey) {
      console.log('ocr_invoice: OPENAI_API_KEY not configured — returning 503')
      return e.json(503, {
        success: false,
        message:
          'Leitura automática de notas indisponível no momento. Preencha valor e fornecedor manualmente.',
      })
    }

    const dataUrl = 'data:' + mimeType + ';base64,' + imageBase64

    let payload = null
    try {
      const res = $http.send({
        url: 'https://api.openai.com/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + apiKey,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 500,
          temperature: 0,
          messages: [
            {
              role: 'system',
              content:
                'Você é um extrator de dados de notas fiscais brasileiras. Responda SOMENTE com JSON válido, sem markdown, no formato: {"valor_total": number, "fornecedor": string, "numero_nota": string, "data_emissao": "YYYY-MM-DD", "confianca": number}. valor_total é o VALOR TOTAL da nota em reais (número). fornecedor é a razão social ou nome do emitente. numero_nota é o número da NF (string vazia se não achar). data_emissao no formato YYYY-MM-DD (string vazia se não achar). confianca é 0 a 1 indicando sua confiança na leitura. Se não conseguir ler a imagem como uma nota fiscal, responda {"valor_total": 0, "fornecedor": "", "numero_nota": "", "data_emissao": "", "confianca": 0}.',
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Extraia os dados desta nota fiscal brasileira:' },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
        }),
        timeout: 30,
      })

      if (res.statusCode >= 400) {
        console.log('ocr_invoice: OpenAI error status ' + res.statusCode)
        return e.json(502, {
          success: false,
          message: 'Não foi possível ler a nota agora. Preencha os dados manualmente.',
        })
      }

      const content = res.json?.choices?.[0]?.message?.content || ''
      const jsonStr = content
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim()
      const start = jsonStr.indexOf('{')
      const end = jsonStr.lastIndexOf('}')
      if (start < 0 || end <= start) {
        return e.json(422, {
          success: false,
          message: 'Não foi possível interpretar a nota. Preencha os dados manualmente.',
        })
      }
      payload = JSON.parse(jsonStr.slice(start, end + 1))
    } catch (err) {
      console.log('ocr_invoice: extraction error: ' + err)
      return e.json(502, {
        success: false,
        message: 'Não foi possível ler a nota agora. Preencha os dados manualmente.',
      })
    }

    const valor = Number(payload.valor_total) || 0
    const fornecedor = (payload.fornecedor || '').toString().trim()

    if (!valor || valor <= 0 || !fornecedor) {
      return e.json(422, {
        success: false,
        message:
          'Não conseguimos identificar valor e fornecedor com clareza. Preencha manualmente.',
      })
    }

    return e.json(200, {
      success: true,
      valor_total: valor,
      fornecedor: fornecedor,
      numero_nota: (payload.numero_nota || '').toString(),
      data_emissao: (payload.data_emissao || '').toString(),
      confianca: typeof payload.confianca === 'number' ? payload.confianca : 0.8,
    })
  },
  $apis.requireAuth(),
)
