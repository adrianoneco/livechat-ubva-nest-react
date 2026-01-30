import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Send, Loader2, FileText, Music, Video } from "lucide-react";
import { supabase } from "@/integrations/api/client";
import { MediaSendParams } from "./MessageInputContainer";
import { useToast } from "@/hooks/use-toast";

interface MediaPreviewProps {
  file: File;
  onSend: (params: MediaSendParams) => void;
  onClose: () => void;
}

function getMessageType(mimeType: string): MediaSendParams['messageType'] {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

function sanitizeFileName(name: string): string {
  // Remove acentos
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Substitui espaços e caracteres especiais por underscores
  // Mantém apenas letras, números, pontos, hífens e underscores
  return normalized.replace(/[^a-zA-Z0-9.\-_]/g, '_');
}

export const MediaPreview = ({ file, onSend, onClose }: MediaPreviewProps) => {
  const [caption, setCaption] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  
  // Memoize previewUrl so it doesn't change on every render
  const previewUrl = useMemo(() => URL.createObjectURL(file), [file]);

  // Revoke object URL when component unmounts
  useEffect(() => {
    return () => {
      try { URL.revokeObjectURL(previewUrl); } catch(_) {}
    };
  }, [previewUrl]);

  const handleSend = async () => {
    setIsUploading(true);
    
    try {
      const fileName = `${Date.now()}-${sanitizeFileName(file.name)}`;
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('whatsapp-media')
        .upload(fileName, file, {
          contentType: file.type,
        });

      if (uploadError) throw uploadError;

      // Use the full storage path returned from upload, or construct it
      const storagePath = uploadData?.path || `whatsapp-media/${fileName}`;
      const messageType = getMessageType(file.type);

      onSend({
        messageType,
        content: caption || undefined,
        mediaUrl: storagePath, // Full storage path for server to read
        mediaMimetype: file.type,
        fileName: file.name,
      });

      onClose();
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Erro ao enviar arquivo",
        description: "Não foi possível fazer upload do arquivo. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const renderPreview = () => {
    const type = getMessageType(file.type);
    switch (type) {
      case 'image':
        return (
          <img 
            src={previewUrl} 
            alt="Preview" 
            className="max-h-64 object-contain rounded-lg"
          />
        );
      case 'video':
        return (
          <div className="flex flex-col items-center gap-2">
            <Video className="w-16 h-16 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{file.name}</p>
          </div>
        );
      case 'audio':
        return (
          <div className="flex flex-col items-center gap-2">
            <Music className="w-16 h-16 text-muted-foreground" />
            <audio src={previewUrl} controls className="max-w-full" />
          </div>
        );
      default:
        // If PDF, show an embedded preview; otherwise show generic file preview
        if (file.type === 'application/pdf') {
          return (
            <div className="w-full h-96 rounded-md overflow-hidden border border-border">
              <embed
                src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                type="application/pdf"
                className="w-full h-full"
              />
            </div>
          );
        }

        return (
          <div className="flex flex-col items-center gap-2">
            <FileText className="w-16 h-16 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{file.name}</p>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card rounded-lg shadow-lg max-w-2xl w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Enviar Arquivo</h3>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            disabled={isUploading}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex justify-center py-4">
          {renderPreview()}
        </div>

        <Input
          placeholder="Adicionar legenda (opcional)"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          disabled={isUploading}
        />

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isUploading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Enviar
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
