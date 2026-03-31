import { useCallback, useMemo, useRef } from "react";
import { Dialog, DialogContent } from "./ui/dialog";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Download, ExternalLink, MoreVertical, Printer, X, Cloud } from "lucide-react";
import { toast } from "sonner";

export type DocumentPrintPreviewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** HTML completo do documento (ex.: página de impressão) */
  html: string;
  /** Título na barra (ex.: nome do documento) */
  titulo: string;
  /** Nome sugerido ao guardar (sem extensão .html é acrescentada) */
  downloadBaseName?: string;
};

function safeFileName(base: string): string {
  const s = base.replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);
  return s || "documento";
}

/**
 * iframes com srcDoc usam about:srcdoc — caminhos /logo/... não resolvem para o site.
 * Converte referências à pasta pública para URLs absolutas (respeita Vite base).
 */
function resolvePrintHtmlAssets(html: string): string {
  if (typeof window === "undefined" || !html) return html;
  const publicBase = new URL(import.meta.env.BASE_URL || "/", window.location.origin).href;

  const abs = (pathNoLeading: string) => new URL(pathNoLeading, publicBase).href;

  let out = html;
  out = out.replace(/\ssrc="\/([^"]+)"/g, (_, rel: string) => ` src="${abs(rel)}"`);
  out = out.replace(/\ssrc='\/([^']+)'/g, (_, rel: string) => ` src='${abs(rel)}'`);
  out = out.replace(/this\.src='\/([^']+)'/g, (_, rel: string) => `this.src='${abs(rel)}'`);
  out = out.replace(/this\.src="\/([^"]+)"/g, (_, rel: string) => `this.src="${abs(rel)}"`);

  if (!/<base\s/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, `<head$1><base href="${publicBase}">`);
  }
  return out;
}

/**
 * Pré-visualização com barra tipo leitor de PDF: Drive, transferir, imprimir, mais opções.
 * Não depende de aba própria no menu — abre-se ao imprimir vendas, compras ou fechamentos.
 */
export function DocumentPrintPreview({
  open,
  onOpenChange,
  html,
  titulo,
  downloadBaseName,
}: DocumentPrintPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const displayHtml = useMemo(() => resolvePrintHtmlAssets(html), [html]);

  const printar = useCallback(() => {
    const el = iframeRef.current;
    const w = el?.contentWindow;
    if (!w) {
      toast.error("Não foi possível aceder à pré-visualização para imprimir.");
      return;
    }
    try {
      w.focus();
      w.print();
    } catch {
      toast.error("Erro ao abrir a impressão.");
    }
  }, []);

  const baixar = useCallback(() => {
    if (!displayHtml.trim()) return;
    const name = safeFileName(downloadBaseName || titulo || "documento");
    const blob = new Blob([displayHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Ficheiro transferido.");
  }, [displayHtml, titulo, downloadBaseName]);

  const googleDrive = useCallback(() => {
    baixar();
    window.open("https://drive.google.com/drive/my-drive", "_blank", "noopener,noreferrer");
    toast.info(
      "Aceda ao Google Drive no novo separador e carregue o ficheiro .html que acabou de ser transferido (Novo → Carregar ficheiro ou arrastar).",
      { duration: 8000 }
    );
  }, [baixar]);

  const abrirNovaJanela = useCallback(() => {
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) {
      toast.error("Permita pop-ups para abrir numa nova janela.");
      return;
    }
    w.document.write(displayHtml);
    w.document.close();
    w.focus();
  }, [displayHtml]);

  const barTitle = titulo || "Documento";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          "data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 " +
          "fixed inset-0 left-0 top-0 z-50 flex h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 " +
          "flex-col gap-0 overflow-hidden rounded-none border-0 p-0 shadow-2xl duration-200 " +
          "sm:max-w-none [&>button]:hidden"
        }
      >
        <div className="flex items-center justify-between gap-2 px-2 py-2 sm:py-1.5 bg-zinc-900 text-zinc-100 shrink-0 border-b border-zinc-800 min-h-11">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-zinc-300 hover:text-white hover:bg-zinc-800 shrink-0 h-8 w-8"
              onClick={() => onOpenChange(false)}
              title="Fechar"
            >
              <X className="size-4" />
            </Button>
            <span className="text-xs sm:text-sm font-medium truncate" title={barTitle}>
              {barTitle}
            </span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-zinc-300 hover:text-white hover:bg-zinc-800 h-8 w-8"
              title="Guardar no Google Drive (transfere e abre o Drive)"
              onClick={googleDrive}
            >
              <Cloud className="size-[18px]" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-zinc-300 hover:text-white hover:bg-zinc-800 h-8 w-8"
              title="Transferir (.html)"
              onClick={baixar}
            >
              <Download className="size-[18px]" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-zinc-300 hover:text-white hover:bg-zinc-800 h-8 w-8"
              title="Imprimir"
              onClick={printar}
            >
              <Printer className="size-[18px]" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-zinc-300 hover:text-white hover:bg-zinc-800 h-8 w-8"
                  title="Mais opções"
                >
                  <MoreVertical className="size-[18px]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={abrirNovaJanela}>
                  <ExternalLink className="size-4 mr-2" />
                  Abrir em nova janela
                </DropdownMenuItem>
                <DropdownMenuItem onClick={printar}>
                  <Printer className="size-4 mr-2" />
                  Imprimir…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onOpenChange(false)}>Fechar pré-visualização</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="flex-1 min-h-0 min-w-0 bg-zinc-800/90 p-0 sm:p-1">
          {displayHtml ? (
            <iframe
              ref={iframeRef}
              title={barTitle}
              className="w-full h-full min-h-0 rounded-none sm:rounded border-0 bg-white block"
              srcDoc={displayHtml}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-400 text-sm">Sem conteúdo.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
