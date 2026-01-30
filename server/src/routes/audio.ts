import { Router, Request, Response } from 'express';
import { db } from '../db';
import { whatsappMessages } from '../db/schema/whatsapp';
import { authenticate } from '../middleware/auth';
import { eq } from 'drizzle-orm';
import { getSignedDownloadUrl } from '../lib/storage';
import FormData from 'form-data';

const router = Router();

// Transcribe audio message
router.post('/transcribe', authenticate, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.body;
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GROQ_API_KEY) {
      console.error('[transcribe-audio] GROQ_API_KEY not configured');
      return res.status(501).json({ 
        error: 'Transcrição não configurada: GROQ_API_KEY não encontrada' 
      });
    }

    if (!messageId) {
      return res.status(400).json({ error: 'Message ID is required' });
    }

    console.log('[transcribe-audio] Processing message:', messageId);

    // Get message data
    const [message] = await db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.id, messageId))
      .limit(1);

    if (!message) {
      console.error('[transcribe-audio] Message not found');
      return res.status(404).json({ error: 'Message not found' });
    }

    // Skip if already transcribed or in progress
    if ((message as any).audioTranscription || (message as any).transcriptionStatus === 'processing') {
      console.log('[transcribe-audio] Already transcribed or in progress');
      return res.json({ 
        success: true, 
        transcription: (message as any).audioTranscription 
      });
    }

    if (!message.mediaUrl) {
      console.error('[transcribe-audio] No media URL');
      return res.status(400).json({ error: 'No audio URL' });
    }

    // Mark as processing
    await db
      .update(whatsappMessages)
      .set({ metadata: { ...((message.metadata as any) || {}), transcriptionStatus: 'processing' } })
      .where(eq(whatsappMessages.id, messageId));

    console.log('[transcribe-audio] Processing audio from:', message.mediaUrl);

    // Get audio URL
    let audioUrl = message.mediaUrl;
    
    // Check if it's a storage path (not a URL)
    if (!audioUrl.startsWith('http://') && !audioUrl.startsWith('https://')) {
      console.log('[transcribe-audio] Generating signed URL for storage path:', audioUrl);
      
      try {
        audioUrl = await getSignedDownloadUrl(audioUrl, 3600);
        console.log('[transcribe-audio] Signed URL generated successfully');
      } catch (urlError) {
        console.error('[transcribe-audio] Failed to generate signed URL:', urlError);
        await db
          .update(whatsappMessages)
          .set({ metadata: { ...((message.metadata as any) || {}), transcriptionStatus: 'failed' } })
          .where(eq(whatsappMessages.id, messageId));
        return res.status(500).json({ error: 'Failed to access audio file' });
      }
    }

    console.log('[transcribe-audio] Downloading audio...');

    // Download audio file
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      console.error('[transcribe-audio] Failed to download audio:', audioResponse.status);
      await db
        .update(whatsappMessages)
        .set({ metadata: { ...((message.metadata as any) || {}), transcriptionStatus: 'failed' } })
        .where(eq(whatsappMessages.id, messageId));
      return res.status(500).json({ error: `Failed to download audio: ${audioResponse.status}` });
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    console.log('[transcribe-audio] Audio downloaded, size:', audioBuffer.byteLength);

    // Determine mime type
    const mimeType = (message as any).mediaMimetype || 'audio/m4a';

    // Prepare multipart form for GROQ transcription
    const formData = new FormData();
    formData.append('file', Buffer.from(audioBuffer), {
      filename: 'audio.m4a',
      contentType: mimeType,
    });
    formData.append('model', 'whisper-large-v3');

    // Call GROQ transcription endpoint
    try {
      const groqResp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          ...formData.getHeaders(),
        },
        body: formData.getBuffer(),
      });

      if (!groqResp.ok) {
        const errText = await groqResp.text();
        console.error('[transcribe-audio] GROQ transcription error:', groqResp.status, errText);
        await db
          .update(whatsappMessages)
          .set({ metadata: { ...((message.metadata as any) || {}), transcriptionStatus: 'failed' } })
          .where(eq(whatsappMessages.id, messageId));
        return res.status(502).json({ error: 'Transcription failed', details: errText });
      }

      const parsed = await groqResp.json() as { text?: string; transcription?: string };
      const transcription = parsed?.text || parsed?.transcription || '';

      // Save transcription
      await db
        .update(whatsappMessages)
        .set({ 
          metadata: { 
            ...((message.metadata as any) || {}), 
            audioTranscription: transcription,
            transcriptionStatus: 'completed' 
          } 
        })
        .where(eq(whatsappMessages.id, messageId));

      res.json({ success: true, transcription });

    } catch (groqError) {
      console.error('[transcribe-audio] Error calling GROQ transcription:', groqError);
      await db
        .update(whatsappMessages)
        .set({ metadata: { ...((message.metadata as any) || {}), transcriptionStatus: 'failed' } })
        .where(eq(whatsappMessages.id, messageId));
      return res.status(502).json({ error: String(groqError) });
    }

  } catch (error) {
    console.error('[transcribe-audio] Error:', error);
    res.status(500).json({ error: String(error) });
  }
});

export default router;
