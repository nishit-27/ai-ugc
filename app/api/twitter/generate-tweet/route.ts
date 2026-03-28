import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import OpenAI from 'openai';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const {
      mode,
      genre,
      topic,
      contextTweet,
      currentContent,
      type = 'tweet',
      threadItemCount,
    } = body;

    let systemPrompt = `You are a world-class Twitter ghostwriter. Write engaging, viral-worthy tweets.
Be concise, punchy, and authentic. No hashtags unless specifically asked. No emojis unless they add genuine value.
Keep tweets under 280 characters unless it's a thread.`;

    let userPrompt = '';

    if (mode === 'generate') {
      userPrompt = `Write a ${type === 'thread' ? `Twitter thread with ${threadItemCount || 5} tweets` : 'single tweet'}`;
      if (genre) userPrompt += ` in the "${genre}" genre`;
      if (topic) userPrompt += ` about "${topic}"`;
      if (contextTweet) {
        userPrompt += `\n\nUse this tweet as context/inspiration (from @${contextTweet.username}):\n"${contextTweet.text}"`;
      }
      if (type === 'reply') {
        userPrompt = `Write a compelling reply to this tweet from @${contextTweet?.username}:\n"${contextTweet?.text}"\n`;
        if (genre) userPrompt += `Style: ${genre}. `;
        if (topic) userPrompt += `Focus on: ${topic}. `;
      }
      if (type === 'quote') {
        userPrompt = `Write a quote tweet commentary for this tweet from @${contextTweet?.username}:\n"${contextTweet?.text}"\n`;
        if (genre) userPrompt += `Style: ${genre}. `;
        if (topic) userPrompt += `Focus on: ${topic}. `;
      }
    } else if (mode === 'enhance') {
      userPrompt = `Enhance and improve this tweet while keeping its core message. Make it more engaging and impactful:\n\n"${currentContent}"`;
    }

    if (type === 'thread') {
      userPrompt += `\n\nFormat: Return each tweet on a new line, prefixed with "1/", "2/", etc. Each tweet should be under 280 characters.`;
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: type === 'thread' ? 2000 : 400,
    });

    const generated = completion.choices[0]?.message?.content || '';

    if (type === 'thread') {
      const items = generated
        .split(/\n/)
        .filter((line) => /^\d+[/.]/.test(line.trim()))
        .map((line) => line.replace(/^\d+[/.]\s*/, '').trim())
        .filter(Boolean);

      return NextResponse.json({
        threadItems: items.length > 0 ? items : [generated],
        raw: generated,
      });
    }

    return NextResponse.json({ content: generated.trim() });
  } catch (error) {
    console.error('Generate tweet error:', error);
    return NextResponse.json(
      { error: 'Failed to generate tweet' },
      { status: 500 }
    );
  }
}
