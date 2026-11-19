import React, { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, ScanLine, X, Camera } from 'lucide-react'

interface InvoiceImageFieldProps {
  previewUrl: string | null
  isReading: boolean
  onFileSelected: (file: File | null) => void
  onClear: () => void
  onReadClick: () => void
}

/**
 * Campo de anexo de imagem da nota fiscal com preview, botão de leitura
 * automática (OCR) e indicador de carregamento.
 */
export const InvoiceImageField: React.FC<InvoiceImageFieldProps> = ({
  previewUrl,
  isReading,
  onFileSelected,
  onClear,
  onReadClick,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="space-y-2">
      <Label className="text-[11px] text-slate-300">Foto da Nota Fiscal (OCR)</Label>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] || null
          onFileSelected(file)
          // permite re-selecionar o mesmo arquivo depois de limpar
          if (fileInputRef.current) fileInputRef.current.value = ''
        }}
      />

      {!previewUrl && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            disabled={isReading}
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-100 text-xs h-9 font-semibold"
          >
            <Camera className="w-4 h-4 mr-1.5 shrink-0" />
            <span className="truncate">Fotografar / anexar nota</span>
          </Button>
        </div>
      )}

      {previewUrl && (
        <div className="rounded-xl border border-slate-700 bg-slate-950 p-2.5 space-y-2.5">
          <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-black/40 flex justify-center">
            <img
              src={previewUrl}
              alt="Pré-visualização da nota fiscal"
              className="max-h-48 w-auto object-contain"
            />
            <button
              type="button"
              onClick={onClear}
              disabled={isReading}
              aria-label="Remover imagem"
              className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-slate-900/90 border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              disabled={isReading}
              onClick={onReadClick}
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs h-9"
            >
              {isReading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin shrink-0" />
                  <span className="truncate">Lendo nota...</span>
                </>
              ) : (
                <>
                  <ScanLine className="w-4 h-4 mr-1.5 shrink-0" />
                  <span className="truncate">Ler nota automaticamente</span>
                </>
              )}
            </Button>
            <Button
              type="button"
              disabled={isReading}
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="sm:w-auto bg-slate-900 border-slate-700 hover:bg-slate-800 text-slate-200 text-xs h-9"
            >
              Trocar foto
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
