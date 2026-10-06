# StudySpeak AI
Voice-first English coach and study teacher for students. Learn by speaking. Understand every lesson.

## Features
- English voice practice with spoken corrections, scores and a correction card
- Study material tabs: exact transcript, points, screen content, voice teacher, notes, flashcards, quiz
- Progress dashboard (sample data)
- Language modes: English, Telugu-English (Telugu in English letters), Simple English

## Stack
Node.js + Express backend, plain HTML/CSS/JS frontend, browser Web Speech API for voice.

## Run in VS Code
1. Install Node.js 18+.
2. Unzip, open the folder in VS Code, open a terminal.
3. `npm install`
4. `npm start`
5. Open http://localhost:3000 in **Chrome or Edge** (best Web Speech support).

## Environment variables
Copy `.env.example` to `.env`. Without `OPENAI_API_KEY` the app runs in demo mode (built-in sample lesson and rule-based corrections). API keys stay on the server only.

## Demo mode
Works with no keys. Click "Load sample lesson" on the PDF/Video page, or start a call on English Practice.

## Current limits
- Uploads are validated (type, 50 MB) but PDF/video extraction is simulated.
- `/api/correct` and `/api/teach` exist for real AI but the frontend still uses demo logic. Next step: call them with `fetch`.
- No database or accounts yet; progress is sample data.

## Privacy
Upload only content you own or have permission to use. Raw files are not stored. AI feedback is for learning support. Please verify important academic information with your teacher or trusted sources.

## AI-Assisted Development Disclosure
This project was created with help from Claude (Anthropic) and reviewed by the project author.

## Future improvements
Real PDF text extraction, video audio transcription with timestamps, frame OCR, real-time WebRTC voice, Supabase/PostgreSQL progress storage, user accounts.
