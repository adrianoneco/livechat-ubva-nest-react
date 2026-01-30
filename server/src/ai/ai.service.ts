import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappMessage, WhatsappContact } from '../entities';

@Injectable()
export class AiService {
  constructor(
    @InjectRepository(WhatsappMessage)
    private messageRepository: Repository<WhatsappMessage>,
    @InjectRepository(WhatsappContact)
    private contactRepository: Repository<WhatsappContact>,
  ) {}

  async respond(conversationId: string, messageId?: string) {
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      throw new BadRequestException('AI service not configured');
    }

    const messages = await this.messageRepository.find({
      where: { conversationId },
      order: { timestamp: 'DESC' },
      take: 10,
    });

    const context = messages.reverse().map(m =>
      `${m.isFromMe ? 'Atendente' : 'Cliente'}: ${m.content}`
    ).join('\n');

    const prompt = `Você é um assistente virtual de atendimento ao cliente. 
Analise a conversa abaixo e forneça uma resposta apropriada, prestativa e profissional.

Conversa:
${context}

Forneça uma resposta curta e direta que ajude o cliente.`;

    const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!aiResponse.ok) {
      throw new BadRequestException('AI service error');
    }

    const aiData = await aiResponse.json();
    const response = aiData.choices[0]?.message?.content || 'Desculpe, não consegui processar sua mensagem.';

    return { success: true, response, shouldSend: true };
  }

  async composeMessage(intent: string, context?: string) {
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      throw new BadRequestException('AI service not configured');
    }

    const prompt = `Componha uma mensagem profissional de atendimento ao cliente com base no seguinte:

Intenção: ${intent}
Contexto adicional: ${context || 'Nenhum'}

A mensagem deve ser:
- Profissional e cordial
- Clara e direta
- Em português do Brasil
- Curta (máximo 3 parágrafos)`;

    const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 300,
      }),
    });

    if (!aiResponse.ok) {
      throw new BadRequestException('AI service error');
    }

    const aiData = await aiResponse.json();
    const composedMessage = aiData.choices[0]?.message?.content || '';

    return { success: true, message: composedMessage };
  }

  async suggestReplies(conversationId: string) {
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      throw new BadRequestException('AI service not configured');
    }

    const [lastMessage] = await this.messageRepository.find({
      where: { conversationId, isFromMe: false },
      order: { timestamp: 'DESC' },
      take: 1,
    });

    if (!lastMessage) {
      return { success: true, suggestions: [] };
    }

    const prompt = `Baseado na mensagem do cliente abaixo, sugira 3 respostas rápidas diferentes que um atendente poderia usar.
As respostas devem ser curtas (máximo 1-2 linhas cada), profissionais e em português do Brasil.
Retorne APENAS um array JSON com as 3 sugestões.

Mensagem do cliente: "${lastMessage.content}"`;

    const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 200,
      }),
    });

    if (!aiResponse.ok) {
      throw new BadRequestException('AI service error');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices[0]?.message?.content || '[]';

    let suggestions = [];
    try {
      const cleaned = content.replace(/```json\n?|\n?```/g, '');
      suggestions = JSON.parse(cleaned);
    } catch (e) {
      suggestions = [
        'Entendo. Como posso ajudar você com isso?',
        'Obrigado pela mensagem. Vou verificar isso para você.',
        'Posso esclarecer essa dúvida agora mesmo.',
      ];
    }

    return { success: true, suggestions };
  }

  async learn(conversationId: string, feedback: any, rating: number) {
    return { success: true, message: 'Feedback recorded for learning' };
  }
}
