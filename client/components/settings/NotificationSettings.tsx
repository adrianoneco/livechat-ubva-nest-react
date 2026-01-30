import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Volume2, Upload, Play, X, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const NOTIFICATION_SETTINGS_KEY = "notification-settings";

export interface NotificationSettingsData {
  enabled: boolean;
  soundEnabled: boolean;
  toastPosition: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  showForNewConversation: boolean;
  showForReplies: boolean;
  showForTransfers: boolean;
  customAudioUrl: string | null;
  customAudioNewConversation: string | null;
  customAudioTransfer: string | null;
  toastDuration: number; // in seconds
}

const defaultSettings: NotificationSettingsData = {
  enabled: true,
  soundEnabled: true,
  toastPosition: "bottom-right",
  showForNewConversation: true,
  showForReplies: true,
  showForTransfers: true,
  customAudioUrl: null,
  customAudioNewConversation: null,
  customAudioTransfer: null,
  toastDuration: 5,
};

export function getNotificationSettings(): NotificationSettingsData {
  try {
    const saved = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (saved) {
      return { ...defaultSettings, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error("Error loading notification settings:", e);
  }
  return defaultSettings;
}

export function saveNotificationSettings(settings: NotificationSettingsData): void {
  localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
  // Dispatch event for other components to react
  window.dispatchEvent(new CustomEvent("notification-settings-changed", { detail: settings }));
}

export function NotificationSettings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<NotificationSettingsData>(getNotificationSettings);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputNewConvRef = useRef<HTMLInputElement>(null);
  const fileInputTransferRef = useRef<HTMLInputElement>(null);

  const updateSetting = <K extends keyof NotificationSettingsData>(
    key: K,
    value: NotificationSettingsData[K]
  ) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    saveNotificationSettings(newSettings);
  };

  const handleFileUploadFor = (
    e: React.ChangeEvent<HTMLInputElement>,
    settingKey: "customAudioUrl" | "customAudioNewConversation" | "customAudioTransfer"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("audio/")) {
      toast({
        title: "Erro",
        description: "Por favor, selecione um arquivo de áudio válido.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 1MB)
    if (file.size > 1024 * 1024) {
      toast({
        title: "Erro",
        description: "O arquivo deve ter no máximo 1MB.",
        variant: "destructive",
      });
      return;
    }

    // Convert to base64 and save
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      updateSetting(settingKey, base64);
      toast({
        title: "Áudio atualizado",
        description: "O som de notificação personalizado foi salvo.",
      });
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileUploadFor(e, "customAudioUrl");
  };

  const playTestSoundFor = (
    settingKey: "customAudioUrl" | "customAudioNewConversation" | "customAudioTransfer",
    description: string
  ) => {
    const audioSrc = settings[settingKey] || settings.customAudioUrl || "/notification.mp3";
    if (audioRef.current) {
      audioRef.current.src = audioSrc;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(console.error);
    }
    
    // Show test toast
    toast({
      title: "Notificação",
      description,
    });
  };

  const playTestSound = () => {
    playTestSoundFor("customAudioUrl", "Este é um exemplo de notificação de mensagem recebida.");
  };

  const removeCustomAudio = () => {
    updateSetting("customAudioUrl", null);
    toast({
      title: "Áudio removido",
      description: "O som padrão será usado.",
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notificações
        </CardTitle>
        <CardDescription>
          Configure como você deseja receber notificações de novas mensagens
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Ativar notificações</Label>
            <p className="text-sm text-muted-foreground">
              Receber alertas visuais e sonoros
            </p>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(checked) => updateSetting("enabled", checked)}
          />
        </div>

        {settings.enabled && (
          <>
            {/* Sound toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Som de notificação</Label>
                <p className="text-sm text-muted-foreground">
                  Tocar som ao receber mensagens
                </p>
              </div>
              <Switch
                checked={settings.soundEnabled}
                onCheckedChange={(checked) => updateSetting("soundEnabled", checked)}
              />
            </div>

            {/* Toast position */}
            <div className="space-y-2">
              <Label>Posição do toast</Label>
              <Select
                value={settings.toastPosition}
                onValueChange={(value: NotificationSettingsData["toastPosition"]) =>
                  updateSetting("toastPosition", value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="top-left">Superior esquerdo</SelectItem>
                  <SelectItem value="top-right">Superior direito</SelectItem>
                  <SelectItem value="bottom-left">Inferior esquerdo</SelectItem>
                  <SelectItem value="bottom-right">Inferior direito</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Toast duration */}
            <div className="space-y-2">
              <Label>Duração do toast (segundos)</Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={settings.toastDuration}
                onChange={(e) => updateSetting("toastDuration", parseInt(e.target.value) || 5)}
                className="w-24"
              />
            </div>

            {/* Notification types */}
            <div className="space-y-3">
              <Label>Tipos de notificação</Label>
              
              <div className="flex items-center justify-between py-2">
                <span className="text-sm">Novas conversas</span>
                <Switch
                  checked={settings.showForNewConversation}
                  onCheckedChange={(checked) => updateSetting("showForNewConversation", checked)}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-sm">Respostas de clientes</span>
                <Switch
                  checked={settings.showForReplies}
                  onCheckedChange={(checked) => updateSetting("showForReplies", checked)}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-sm">Transferências de conversa</span>
                <Switch
                  checked={settings.showForTransfers}
                  onCheckedChange={(checked) => updateSetting("showForTransfers", checked)}
                />
              </div>
            </div>

            {/* Custom audio - Default */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Volume2 className="h-4 w-4" />
                Som padrão (respostas)
              </Label>
              
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Enviar
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={playTestSound}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Testar
                </Button>

                {settings.customAudioUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={removeCustomAudio}
                    className="text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {settings.customAudioUrl && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Som personalizado configurado
                </p>
              )}
            </div>

            {/* Custom audio - New Conversation */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Volume2 className="h-4 w-4" />
                Som para nova conversa
              </Label>
              
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputNewConvRef}
                  type="file"
                  accept="audio/*"
                  onChange={(e) => handleFileUploadFor(e, "customAudioNewConversation")}
                  className="hidden"
                />
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputNewConvRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Enviar
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => playTestSoundFor("customAudioNewConversation", "Nova conversa iniciada")}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Testar
                </Button>

                {settings.customAudioNewConversation && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateSetting("customAudioNewConversation", null)}
                    className="text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {settings.customAudioNewConversation && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Som personalizado configurado
                </p>
              )}
            </div>

            {/* Custom audio - Transfer */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Volume2 className="h-4 w-4" />
                Som para transferência
              </Label>
              
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputTransferRef}
                  type="file"
                  accept="audio/*"
                  onChange={(e) => handleFileUploadFor(e, "customAudioTransfer")}
                  className="hidden"
                />
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputTransferRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Enviar
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => playTestSoundFor("customAudioTransfer", "Conversa transferida")}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Testar
                </Button>

                {settings.customAudioTransfer && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateSetting("customAudioTransfer", null)}
                    className="text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {settings.customAudioTransfer && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Som personalizado configurado
                </p>
              )}
            </div>
          </>
        )}

        {/* Hidden audio element for testing */}
        <audio ref={audioRef} className="hidden" />
      </CardContent>
    </Card>
  );
}
