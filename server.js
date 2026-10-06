require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const VIDEO_MODEL = process.env.GEMINI_VIDEO_MODEL || 'gemini-3.8-flash';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Tells the frontend whether real AI is configured. The key never leaves the server.
app.get('/api/health', (_req, res) => res.json({ ok: true, demoMode: !KEY }));

async function chat(system, user) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': KEY
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `${system}\n\n${user}`
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      })
    }
  );

  if (!r.ok) {
    const errorText = await r.text();
    throw new Error('Gemini API error ' + r.status + ': ' + errorText);
  }

  const d = await r.json();
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }

  return JSON.parse(text);
}

// PDF study-material pipeline:
// upload PDF -> send the original PDF directly to Gemini
// This supports normal PDFs, scanned PDFs, image-only PDFs and notes.
app.post('/api/material', upload.single('file'), async (req, res) => {

  if (!req.file) {
    return res.status(400).json({
      error: 'No PDF file uploaded.'
    });
  }

  if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(req.file.mimetype)) {
  return res.status(400).json({
    error: 'Only PDF, PNG, JPG or WEBP files are supported here.'
  });
}

  if (!KEY) {
    return res.status(503).json({
      error: 'Gemini API key is not configured.'
    });
  }

  try {

    // Convert uploaded PDF into base64.
    // We send the ORIGINAL PDF to Gemini.
    const base64Pdf = req.file.buffer.toString('base64');

    const prompt = `
You are an expert college study teacher.

Read the uploaded PDF carefully.

IMPORTANT:
The PDF can contain:
- selectable text
- scanned pages
- screenshots
- images
- handwritten notes
- diagrams
- tables
- formulas

Even if the PDF has no selectable text, read the visible content from the PDF.

Do NOT reject an image-only or scanned PDF.

Create study material ONLY from the uploaded PDF.
Do not invent information that is not supported by the PDF.

LANGUAGE AND EXPLANATION RULE:

Keep important technical English terms exactly as they appear in the PDF.

But explain every difficult concept in very simple English.

For example:

Technical term:
Encapsulation

Easy explanation:
Encapsulation means keeping related data and functions together in one place.

If one technical word has a large or difficult meaning,
explain the complete meaning in a simple sentence.

Do not just give one-word definitions.

Use easy English that a college student can understand.

Add simple examples whenever an example helps understanding.

Do not remove important technical terminology.

Do not change formulas or technical names.

Return ONLY valid JSON.

The JSON must contain exactly these keys:

title,
summary,
points,
screen_content,
notes,
flashcards,
quiz,
voice_teacher

RULES:

title:
Create a suitable title based on the uploaded PDF.

summary:
Explain the complete topic in simple English.
Use clear and short sentences.

points:
Create 5-15 important points.
Each point must be easy to understand.
Keep the original technical terms.

screen_content:
Include important:
- formulas
- definitions
- headings
- table information
- diagram labels
- important visible text

If there is no useful screen content, return [].

notes:
Create 5-15 note objects.

Each object must contain:
title
content

The content should explain the concept in simple English.
Use examples when useful.

flashcards:
Create 5-15 objects.

Each object must contain:
q
a

quiz:
Create exactly 5 objects.

Each object must contain:
q
options
answer
explanation

options must contain exactly 4 strings.

answer must be an integer from 0 to 3.

Every quiz answer must come directly from the uploaded PDF.

VOICE TEACHER:

Create a detailed Telugu teaching script for the COMPLETE PDF.

This is very important.

Explain the PDF topic by topic and line-by-line where useful.

The voice teacher should:

1. Speak naturally in Telugu.

2. Keep technical English words in English.

3. After saying an important English technical term,
   explain its meaning clearly in Telugu.

4. Explain difficult English sentences in simple Telugu.

5. Give examples for difficult concepts.

6. Connect one concept to the next logically.

7. Do not skip important concepts from the PDF.

8. Do not simply translate every word.

9. Teach the student like a friendly college teacher.

10. If the PDF says a difficult definition,
    first say the important technical definition,
    then explain what it means in simple Telugu,
    then give an example.

The student should be able to understand the PDF
even if the original PDF uses difficult English.

Return ONLY valid JSON.
`;

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': KEY
        },

        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
  mime_type: req.file.mimetype,
  data: base64Pdf
}
        
                },
                {
                  text: prompt
                }
              ]
            }
          ],

          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!r.ok) {
      const errorText = await r.text();

      throw new Error(
        'Gemini PDF API error ' +
        r.status +
        ': ' +
        errorText
      );
    }

    const d = await r.json();

    const text =
      d.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error(
        'Gemini returned an empty PDF response.'
      );
    }

    const out = JSON.parse(text);

    // Create source text for Ask-a-Doubt / teaching.
    const sourceText = [
      out.summary || '',
      ...(Array.isArray(out.points) ? out.points : []),
      ...(Array.isArray(out.notes)
        ? out.notes.map(n =>
            `${n.title || ''}: ${n.content || ''}`
          )
        : [])
    ].join('\n');

    res.json({

      title:
        out.title ||
        req.file.originalname,

      transcript: [],

      summary:
        out.summary || '',

      points:
        Array.isArray(out.points)
          ? out.points
          : [],

      screen_content:
        Array.isArray(out.screen_content)
          ? out.screen_content
          : [],

      notes:
        Array.isArray(out.notes)
          ? out.notes
          : [],

      flashcards:
        Array.isArray(out.flashcards)
          ? out.flashcards
          : [],

      quiz:
        Array.isArray(out.quiz)
          ? out.quiz
          : [],

      voice_intro:
        out.voice_teacher ||
        'Let us learn this topic step by step.',

      voice_teacher:
        out.voice_teacher ||
        '',

      sourceText,

      demoMode: false,

      sourceType: 'pdf'
    });

  } catch (e) {

    console.error('PDF ERROR:', e);

    res.status(500).json({
      error:
        'Could not analyze this PDF. Please check the PDF and try again.'
    });
  }
});
// YouTube educational video -> study material
app.post('/api/video-link', async (req, res) => {

  const { url } = req.body;

  if (!url) {
    return res.status(400).json({
      error: 'Please paste a YouTube video link.'
    });
  }

  if (!KEY) {
    return res.status(503).json({
      error: 'Gemini API key is not configured.'
    });
  }

  try {

    const videoUrl = new URL(url);

    const allowedHosts = [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'youtu.be'
    ];

    if (!allowedHosts.includes(videoUrl.hostname)) {
      return res.status(400).json({
        error: 'Please use a public YouTube link.'
      });
    }

    const prompt = `
You are an expert college study teacher.

Analyze the uploaded YouTube educational video carefully.

Create study material ONLY from the video.
Do not invent information that is not supported by the video.

Keep important technical English terms exactly as they are.

Explain difficult concepts in very simple English.

Give simple examples whenever useful.

Return ONLY valid JSON.

The JSON must contain exactly these keys:

title,
summary,
points,
screen_content,
notes,
flashcards,
quiz,
voice_teacher

RULES:

title:
Create a suitable title based on the video.

summary:
Explain the complete video topic in simple English.

points:
Create 5-15 important points.
Keep important technical terms.

screen_content:
Include important formulas, definitions, headings,
diagram labels, tables and important visible information.
If there is no useful screen content, return [].

notes:
Create 5-15 objects.

Each object must contain:
title
content

flashcards:
Create 5-15 objects.

Each object must contain:
q
a

quiz:
Create exactly 5 objects.

Each object must contain:
q
options
answer
explanation

options must contain exactly 4 strings.

answer must be an integer from 0 to 3.

Every quiz answer must be supported by the video.

VOICE TEACHER:

Create a detailed Telugu teaching script for the COMPLETE video.

This is very important.

Explain the video topic-by-topic in logical order.

The voice teacher should:

1. Speak naturally in Telugu.

2. Keep important technical English words in English.

3. After saying an important English technical term,
   explain its meaning clearly in Telugu.

4. Explain difficult English sentences in simple Telugu.

5. Give simple examples for difficult concepts.

6. Connect one concept to the next logically.

7. Do not skip important concepts from the video.

8. Do not simply translate every word.

9. Teach the student like a friendly college teacher.

10. For difficult definitions:
    first say the technical definition,
    then explain it in simple Telugu,
    then give an example.

The student should understand the complete video
even if the original video uses difficult English.

Return ONLY valid JSON.
`;

      const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': KEY
        },

        body: JSON.stringify({
          model: VIDEO_MODEL,

          input: [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'video',
              uri: url
            }
          ],

          response_format: {
            type: 'text',
            mime_type: 'application/json'
          }
        })
      }
    );

    if (!r.ok) {
      const errorText = await r.text();

      throw new Error(
        'Gemini video API error ' +
        r.status +
        ': ' +
        errorText
      );
    }

    const d = await r.json();

    const text = d.output_text;

    if (!text) {
      throw new Error(
        'Gemini returned an empty video response.'
      );
    }

    const out = JSON.parse(text);

    const sourceText = [
      out.summary || '',
      ...(Array.isArray(out.points) ? out.points : []),
      ...(Array.isArray(out.notes)
        ? out.notes.map(n =>
            `${n.title || ''}: ${n.content || ''}`
          )
        : [])
    ].join('\n');

    res.json({

      title:
        out.title ||
        'Video Study Material',

      transcript: [],

      summary:
        out.summary || '',

      points:
        Array.isArray(out.points)
          ? out.points
          : [],

      screen_content:
        Array.isArray(out.screen_content)
          ? out.screen_content
          : [],

      notes:
        Array.isArray(out.notes)
          ? out.notes
          : [],

      flashcards:
        Array.isArray(out.flashcards)
          ? out.flashcards
          : [],

      quiz:
        Array.isArray(out.quiz)
          ? out.quiz
          : [],

      voice_intro:
        out.voice_teacher ||
        'Let us learn this video step by step.',

      voice_teacher:
        out.voice_teacher ||
        '',

      sourceText,

      demoMode: false,

      sourceType: 'video'

    });

  } catch (e) {

    console.error('VIDEO ERROR:', e);

res.status(500).json({
  error: e.message || 'Video analysis failed.'
});
  }
});

// English correction: body { text }
app.post('/api/correct', async (req, res) => {
  const text = String(req.body.text || '').slice(0, 1000);
  if (!text) return res.status(400).json({ error: 'Missing text.' });
  if (!KEY) return res.status(503).json({ error: 'Demo mode: no API key configured.' });
  try {
    const out = await chat(
      'You are a kind English teacher for Indian students. Correct at most two important mistakes. Return JSON: {"correction":string,"corrected_sentence":string,"grammar":0-10,"fluency":0-10,"vocabulary":0-10,"tip":string,"spoken_reply":string}.',
      text);
    res.json(out);
  } catch (e) { res.status(502).json({ error: 'AI feedback failed. Please try again.' }); }
});

// Source-grounded teaching: body { source, question, mode: "english"|"telugu-english"|"simple" }
app.post('/api/teach', async (req, res) => {
  const { source = '', question = '', mode = 'english' } = req.body;
  if (!source || !question) return res.status(400).json({ error: 'Missing source or question.' });
  if (!KEY) return res.status(503).json({ error: 'Demo mode: no API key configured.' });
  try {
    const out = await chat(
      `You are a patient teacher. Answer ONLY from the SOURCE. If the answer is not in the source, say exactly: "This point is not mentioned in your uploaded material. Would you like a general explanation?" Mode: ${mode}. For telugu-english, write Telugu using English letters only. Return JSON {"answer":string}.`,
      `SOURCE:\n${String(source).slice(0, 12000)}\n\nQUESTION: ${question}`);
    res.json(out);
  } catch (e) { res.status(502).json({ error: 'Teacher response failed. Please try again.' }); }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`StudySpeak AI running at http://localhost:${port} (${KEY ? 'AI enabled' : 'demo mode'})`));
