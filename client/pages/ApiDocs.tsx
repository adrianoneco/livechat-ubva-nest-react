import { useEffect } from "react";

export default function ApiDocs() {
  useEffect(() => {
    // Redirect to the static API docs page
    window.location.href = "/api-docs.html";
  }, []);

  return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-muted-foreground">Carregando documentação da API...</p>
    </div>
  );
}
