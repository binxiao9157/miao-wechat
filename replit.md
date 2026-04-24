# Miao - AI Cat Studio App

## Overview
An AI-powered Progressive Web App (PWA) for generating and managing cat-related content (images and videos). Users can create AI-generated cat images and videos, manage companions, share via QR codes, and maintain a diary.

## Tech Stack
- **Frontend:** React 19, Tailwind CSS 4, React Router DOM 7, Motion (Framer Motion), Lucide React
- **Backend:** Node.js + Express.js with TypeScript (via tsx)
- **Build Tool:** Vite 6
- **AI Services:** Volcengine Ark (image/video generation), Google Generative AI
- **Package Manager:** npm

## Project Structure
- `server.ts` — Express backend + Vite middleware server (entry point)
- `src/` — Frontend React source code
  - `components/` — Reusable UI components
  - `context/` — Global state (AuthContext)
  - `hooks/` — Custom React hooks
  - `pages/` — Route-level page components
  - `services/` — API and storage services
  - `lib/` — Utility functions
- `public/` — Static assets, PWA manifest, service worker
- `vite.config.ts` — Vite bundler configuration
- `index.html` — SPA entry point

## Development
- Run: `npm run dev` (starts tsx server.ts which serves both API and Vite dev middleware)
- Server port: 5000
- Host: 0.0.0.0

## Environment Variables
- `VOLC_API_KEY` — Volcengine Ark API key (required for AI generation)
- `VOLC_MODEL_ID` — Video generation model ID (default: doubao-seedance-1-5-pro-251215)
- `VOLC_T2I_MODEL_ID` — Image generation model ID (default: doubao-t2i-v2)
- `VOLC_ENDPOINT` — Ark API endpoint URL

## Deployment
- Build: `npm run build` (outputs to `dist/`)
- Production run: `npx tsx server.ts` with `NODE_ENV=production`
- Deployment target: autoscale
