import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Download, ExternalLink, FileText } from "lucide-react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

interface PDFViewerModalProps {
  pdfUrl: string | null;
  fileName?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const PDFViewerModal = ({ pdfUrl, fileName, isOpen, onClose }: PDFViewerModalProps) => {
  if (!pdfUrl) return null;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = fileName || 'documento.pdf';
    a.click();
  };

  const handleOpenExternal = () => {
    window.open(pdfUrl, '_blank');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-[95vw] h-[95vh] p-0 border-0 overflow-hidden">
        <VisuallyHidden>
          <DialogTitle>Visualização de PDF</DialogTitle>
          <DialogDescription>Visualizando documento {fileName || 'PDF'}</DialogDescription>
        </VisuallyHidden>
        <div className="relative w-full h-full bg-background flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b bg-muted/50">
            <span className="text-sm font-medium truncate max-w-[60%]">
              📄 {fileName || 'Documento PDF'}
            </span>
            <div className="flex gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={handleDownload}
                title="Baixar"
              >
                <Download className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleOpenExternal}
                title="Abrir em nova aba"
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* PDF Viewer */}
          <div className="flex-1 overflow-hidden">
            <embed
              src={`${pdfUrl}#view=FitH`}
              type="application/pdf"
              className="w-full h-full"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
