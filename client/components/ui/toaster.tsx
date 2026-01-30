import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { getNotificationSettings, NotificationSettingsData } from "@/components/settings/NotificationSettings";

const positionClasses = {
  "top-left": "top-0 left-0 sm:top-0 sm:left-0 sm:bottom-auto sm:right-auto",
  "top-right": "top-0 right-0 sm:top-0 sm:right-0 sm:bottom-auto sm:left-auto",
  "bottom-left": "bottom-0 left-0 sm:bottom-0 sm:left-0 sm:top-auto sm:right-auto",
  "bottom-right": "bottom-0 right-0 sm:bottom-0 sm:right-0 sm:top-auto sm:left-auto",
};

export function Toaster() {
  const { toasts } = useToast();
  const [position, setPosition] = useState<NotificationSettingsData["toastPosition"]>("bottom-right");

  useEffect(() => {
    // Load initial settings
    const settings = getNotificationSettings();
    setPosition(settings.toastPosition);

    // Listen for settings changes
    const handleSettingsChange = (e: CustomEvent<NotificationSettingsData>) => {
      setPosition(e.detail.toastPosition);
    };
    
    window.addEventListener("notification-settings-changed" as any, handleSettingsChange);
    return () => {
      window.removeEventListener("notification-settings-changed" as any, handleSettingsChange);
    };
  }, []);

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport className={positionClasses[position]} />
    </ToastProvider>
  );
}
