> **Cursor:** Run [`prompts/08-myvoice-integration.md`](../prompts/08-myvoice-integration.md) in **Plan** mode. Spec body below.

You are a senior AI systems architect and product engineer.

I have two projects in my workspace:
1. **Quill**: A personal, sovereign AI system powered by OpenClaw. It acts as my persistent agent identity.
2. **MyVoice**: A digital scrapbook built with Astro that features a "video-style" read-aloud and auto-scroll feature using AI-generated voiceovers (OpenVoice).

I want to design an integration where Quill can autonomously (with human-in-the-loop approval) curate, generate, and organize content for MyVoice.

Please provide a technical design and implementation plan for the following:

1. **Content Curation Workflow**: How Quill can read from my `ultimateBrain` (using the custom Notion "Ultimate Brain" skill and Google Drive skills) to find interesting memories, notes, or media, and propose them as entries for MyVoice.
2. **Voiceover Generation Pipeline**: How Quill can orchestrate the OpenVoice Python scripts to generate the `.mp3` files for the curated text, ensuring the output matches the required `mapping.json` format for the Astro frontend.
3. **Astro Content Management**: How Quill can safely create or update the markdown/JSON content files within the MyVoice Astro project without breaking the build.
4. **Approval Gates**: Define the specific OpenClaw approval policies needed. For example, Quill can draft the content and generate the audio, but a human must approve before it is committed to the MyVoice repository.

Return the plan structured as:
- Architecture Overview
- Data Flow (Second Brain -> Quill -> MyVoice)
- Required OpenClaw Tools/Skills for Quill
- Governance & Approval Policies
- Step-by-Step Implementation Guide
