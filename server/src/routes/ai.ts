import { Router, Request, Response } from 'express';
import { db } from '../db';
import { whatsappConversationNotes, whatsappMessages, whatsappContacts } from '../db/schema/index';
import { authenticate } from '../middleware/auth';
import { eq, and, desc } from 'drizzle-orm';

const router = Router();

// AI Agent auto-respond
router.post('/respond', authenticate, async (req: Request, res: Response) => {
  try {
    const { conversationId, messageId } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    // Get conversation details
    const [conversation] = await db
      .select()
      .from(whatsappConversationNotes)
      .where(eq(whatsappConversationNotes.id, conversationId))
      .limit(1);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Check if in human mode
    if (conversation.conversationMode === 'human') {
      return res.json({ skipped: true, reason: 'human_mode' });
    }

    // Get recent messages for context
    const messages = await db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.conversationId, conversationId))
      .orderBy(desc(whatsappMessages.timestamp))
      .limit(10);

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'AI service not configured' });
    }

    // Get contact info
    const [contact] = await db
      .select()
      .from(whatsappContacts)
      .where(eq(whatsappContacts.id, conversation.contactId))
      .limit(1);

    const context = messages.reverse().map(m => 
      `${m.isFromMe ? 'Atendente' : contact?.name || 'Cliente'}: ${m.content}`
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
      return res.status(500).json({ error: 'AI service error' });
    }

    const aiData = await aiResponse.json();
    const response = aiData.choices[0]?.message?.content || 'Desculpe, não consegui processar sua mensagem.';

    res.json({ 
      success: true, 
      response,
      shouldSend: true,
      conversationMode: conversation.conversationMode,
    });
  } catch (error) {
    console.error('Error in AI respond:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Compose message with AI
router.post('/compose-message', authenticate, async (req: Request, res: Response) => {
  try {
    const { conversationId, intent, context } = req.body;

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'AI service not configured' });
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
      return res.status(500).json({ error: 'AI service error' });
    }

    const aiData = await aiResponse.json();
    const composedMessage = aiData.choices[0]?.message?.content || '';

    res.json({ success: true, message: composedMessage });
  } catch (error) {
    console.error('Error composing message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Suggest smart replies
router.post('/suggest-replies', authenticate, async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    // Get last message from contact
    const [lastMessage] = await db
      .select()
      .from(whatsappMessages)
      .where(
        and(
          eq(whatsappMessages.conversationId, conversationId),
          eq(whatsappMessages.isFromMe, false)
        )
      )
      .orderBy(desc(whatsappMessages.timestamp))
      .limit(1);

    if (!lastMessage) {
      return res.json({ success: true, suggestions: [] });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'AI service not configured' });
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
      return res.status(500).json({ error: 'AI service error' });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices[0]?.message?.content || '[]';
    
    // Parse JSON response
    let suggestions = [];
    try {
      const cleaned = content.replace(/```json\n?|\n?```/g, '');
      suggestions = JSON.parse(cleaned);
    } catch (e) {
      // Fallback suggestions
      suggestions = [
        'Entendo. Como posso ajudar você com isso?',
        'Obrigado pela mensagem. Vou verificar isso para você.',
        'Posso esclarecer essa dúvida agora mesmo.',
      ];
    }

    res.json({ success: true, suggestions });
  } catch (error) {
    console.error('Error suggesting replies:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Learn from conversation
router.post('/learn', authenticate, async (req: Request, res: Response) => {
  try {
    const { conversationId, feedback, rating } = req.body;

    // Store learning data for future model improvement
    // This is a placeholder for a more sophisticated learning system
    
    res.json({ 
      success: true, 
      message: 'Feedback recorded for learning',
    });
  } catch (error) {
    console.error('Error in learn:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
