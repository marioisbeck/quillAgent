import dotenv from 'dotenv';
import { QuillTools } from './tools.js';

dotenv.config();

async function simulateQuill() {
  console.log('Quill Agent (OpenClaw Mock) started.');

  const tools = new QuillTools();

  // 1. Autonomous read
  console.log('\n--- Task 1: Check Emails ---');
  const emails = await tools.readEmails();
  console.log(`Found ${emails.length} new emails.`);

  // 2. Autonomous draft
  console.log('\n--- Task 2: Draft Reply ---');
  const draftBody = 'Hi Boss,\n\nHere is the Q3 report you requested.\n\nBest,\nQuill';
  await tools.createEmailDraft('boss@company.com', 'Re: Urgent: Q3 Report', draftBody);

  // 3. Approval required write
  console.log('\n--- Task 3: Send Email ---');
  const sendResult = await tools.sendEmail('boss@company.com', 'Re: Urgent: Q3 Report', draftBody);

  if (sendResult.status === 'changes_requested') {
    console.log('Human requested changes. We should iterate and try again.');
    // In a real agent loop, we would adjust the draft based on the feedback and call sendEmail again.
  }

  // 4. Shared state
  console.log('\n--- Task 4: Shared State ---');
  await tools.setSharedState('last_run', new Date().toISOString());
  const lastRun = await tools.getSharedState('last_run');
  console.log(`Saved state: last_run = ${lastRun}`);
}

simulateQuill();
