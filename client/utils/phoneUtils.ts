/**
 * Normaliza número de telefone brasileiro adicionando código do país
 * - Remove caracteres especiais
 * - Adiciona código do país 55 se não presente
 * - Valida tamanho mínimo/máximo
 */
export function normalizeBrazilianPhone(phone: string): string {
  // Remove tudo que não é dígito
  const digits = phone.replace(/\D/g, '');
  
  // Se já começa com 55 e tem tamanho adequado (12-13 dígitos), retorna como está
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) {
    return digits;
  }
  
  // Se tem 10-11 dígitos (DDD + número), adiciona 55
  if (digits.length >= 10 && digits.length <= 11) {
    return `55${digits}`;
  }
  
  // Retorna o que temos (pode estar inválido, mas será validado pelo Zod)
  return digits;
}

/**
 * Verifica se um número de telefone tem formato válido brasileiro
 */
export function isValidBrazilianPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  
  // Aceita com ou sem código do país (55)
  // Com 55: 12-13 dígitos (5511987654321 ou 551187654321)
  // Sem 55: 10-11 dígitos (11987654321 ou 1187654321)
  return (
    (digits.length >= 10 && digits.length <= 11) || // Sem código país
    (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) // Com código país
  );
}

/**
 * Formata um número de telefone para exibição
 * Formato: +55 (11) 98765-4321 ou +55 (11) 8765-4321
 * Suporta números internacionais genéricos
 */
export function formatPhoneForDisplay(phone: string | null | undefined): string {
  if (!phone) return '';
  
  // Remove tudo que não é dígito
  let digits = phone.replace(/\D/g, '');
  
  if (!digits) return phone;
  
  // Se o número é muito curto, retorna como está
  if (digits.length < 8) return phone;
  
  // Brasil: números com 55 ou que parecem brasileiros
  if (digits.startsWith('55') || (digits.length >= 10 && digits.length <= 11)) {
    // Adiciona 55 se não tiver
    if (!digits.startsWith('55') && digits.length >= 10 && digits.length <= 11) {
      digits = '55' + digits;
    }
    
    const countryCode = digits.slice(0, 2); // 55
    const areaCode = digits.slice(2, 4); // DDD
    const rest = digits.slice(4);
    
    // Celular (9 dígitos) ou fixo (8 dígitos)
    if (rest.length === 9) {
      return `+${countryCode} (${areaCode}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    } else if (rest.length === 8) {
      return `+${countryCode} (${areaCode}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
  }
  
  // Formato internacional genérico
  if (digits.length >= 11) {
    // Tenta extrair código do país (1-3 dígitos) e formatar
    // Códigos comuns: 1 (EUA/CAN), 44 (UK), 351 (PT), etc.
    let countryCode = '';
    let restStart = 0;
    
    if (digits.startsWith('1') && digits.length >= 11) {
      countryCode = '1';
      restStart = 1;
    } else if (digits.length >= 12) {
      countryCode = digits.slice(0, 2);
      restStart = 2;
    } else {
      countryCode = digits.slice(0, 2);
      restStart = 2;
    }
    
    const areaCode = digits.slice(restStart, restStart + 2);
    const number = digits.slice(restStart + 2);
    
    if (number.length >= 8) {
      const mid = Math.ceil(number.length / 2);
      return `+${countryCode} (${areaCode}) ${number.slice(0, mid)}-${number.slice(mid)}`;
    }
  }
  
  // Fallback: retorna com + na frente se parecer internacional
  if (digits.length >= 10) {
    return '+' + digits;
  }
  
  return phone;
}
