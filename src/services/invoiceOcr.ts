import pb from '@/lib/pocketbase/client'

export interface InvoiceOcrResult {
  valor_total: number
  fornecedor: string
  numero_nota?: string
  data_emissao?: string
  confianca?: number
}

export class InvoiceOcrUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvoiceOcrUnavailableError'
  }
}

/**
 * Envia a foto da nota fiscal (arquivo) para o endpoint OCR no pb_hooks
 * e retorna valor total e fornecedor/razão social extraídos da imagem.
 * Lança InvoiceOcrUnavailableError quando o serviço não está disponível
 * (sem chave de OCR provisionada) — a UI mostra fallback amigável.
 */
export async function extractInvoiceData(file: File): Promise<InvoiceOcrResult> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = (reader.result as string) || ''
      const commaIdx = result.indexOf(',')
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result)
    }
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo da nota.'))
    reader.readAsDataURL(file)
  })

  let res: Response
  try {
    res = await pb.send('/backend/v1/ocr/invoice', {
      method: 'POST',
      body: JSON.stringify({
        image_base64: base64,
        mime_type: file.type || 'image/jpeg',
      }),
    })
  } catch (err: any) {
    // pb.send lança ClientResponseError com status e response
    const status = err?.status || err?.response?.status || 0
    const data = err?.response || err?.data || {}
    if (status === 503 || status === 502 || status === 404) {
      throw new InvoiceOcrUnavailableError(
        data?.message || 'Não foi possível ler a nota agora. Preencha os dados manualmente.',
      )
    }
    throw new Error(data?.message || 'Não foi possível ler a nota. Preencha os dados manualmente.')
  }

  const data = await res.json().catch(() => null)
  if (!res.ok || !data || !data.success) {
    throw new InvoiceOcrUnavailableError(
      data?.message || 'Não foi possível ler a nota. Preencha os dados manualmente.',
    )
  }

  return {
    valor_total: Number(data.valor_total) || 0,
    fornecedor: String(data.fornecedor || ''),
    numero_nota: String(data.numero_nota || ''),
    data_emissao: String(data.data_emissao || ''),
    confianca: typeof data.confianca === 'number' ? data.confianca : undefined,
  }
}
