import axios from 'axios';
import { ActionPayload, ApprovalRequest } from '@quill/shared';

export class QuillTools {
  private apiUrl: string;
  private apiKey?: string;

  constructor(apiUrl: string = 'http://localhost:3001/api', apiKey: string | undefined = process.env.QUILL_API_KEY) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  private authHeaders() {
    return this.apiKey
      ? {
          'x-quill-api-key': this.apiKey,
        }
      : undefined;
  }

  /**
   * Helper to wait for approval
   */
  private async waitForApproval(approvalId: string): Promise<ApprovalRequest> {
    console.log(`Waiting for human approval (ID: ${approvalId})...`);

    let status = 'pending';
    let approval: ApprovalRequest | null = null;

    while (status === 'pending') {
      await new Promise(resolve => setTimeout(resolve, 3000));
      try {
        const response = await axios.get(`${this.apiUrl}/approvals/${approvalId}`);
        approval = response.data;
        status = approval.status;
      } catch (error) {
        console.error('Error checking approval status:', error);
      }
    }

    return approval!;
  }

  /**
   * Helper to request approval for an action
   */
  private async requestApproval(action: string, payload: ActionPayload): Promise<any> {
    try {
      const response = await axios.post(`${this.apiUrl}/approvals`, {
        action,
        payload
      }, {
        headers: this.authHeaders()
      });

      const approvalId = response.data.id;
      const finalApproval = await this.waitForApproval(approvalId);

      if (finalApproval.status === 'approved') {
        return { success: true, payload: finalApproval.payload };
      } else if (finalApproval.status === 'changes_requested' || finalApproval.status === 'continuous_improvement') {
        // Find the audit log to get the feedback
        const auditResponse = await axios.get(`${this.apiUrl}/approvals/${approvalId}/audit`); // We need to add this endpoint
        return {
          success: false,
          status: finalApproval.status,
          feedback: 'User requested changes', // We'll need to fetch actual feedback
          payload: finalApproval.payload
        };
      } else {
        return { success: false, status: 'rejected', reason: 'Human rejected the action.' };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // 1. GMAIL TOOLS
  // ============================================================================

  /**
   * Autonomous by default: Read emails
   */
  async readEmails(query: string = '') {
    console.log(`[Gmail] Reading emails with query: ${query}`);
    // In reality, this would use the Gmail API
    return [
      { id: '1', from: 'boss@company.com', subject: 'Urgent: Q3 Report', body: 'Please send the Q3 report ASAP.', date: new Date().toISOString() }
    ];
  }

  /**
   * Autonomous by default: Create a draft
   */
  async createEmailDraft(to: string, subject: string, body: string) {
    console.log(`[Gmail] Creating draft to ${to}`);
    return { success: true, draftId: 'draft_123', message: 'Draft saved successfully.' };
  }

  /**
   * Requires Approval: Send an email
   */
  async sendEmail(to: string, subject: string, body: string) {
    console.log(`[Gmail] Preparing to send email to ${to}`);

    const payload: ActionPayload = {
      connector: 'gmail',
      summary: `Send email to ${to}`,
      details: { to, subject, body },
      preview: {
        title: subject,
        body: body,
        metadata: { to }
      }
    };

    const result = await this.requestApproval('Send Email', payload);

    if (result.success) {
      console.log(`[Gmail] Email sent to ${result.payload.details.to}!`);
      return { success: true, message: 'Email sent successfully.' };
    } else {
      console.log(`[Gmail] Email sending aborted: ${result.status}`);
      return result;
    }
  }

  // ============================================================================
  // 2. FILE SYSTEM / DRIVE TOOLS
  // ============================================================================

  /**
   * Autonomous by default: Read file
   */
  async readFile(path: string) {
    console.log(`[Files] Reading file: ${path}`);
    return { content: 'File contents here...' };
  }

  /**
   * Requires Approval: Delete file
   */
  async deleteFile(path: string) {
    console.log(`[Files] Preparing to delete file: ${path}`);

    const payload: ActionPayload = {
      connector: 'files',
      summary: `Delete file: ${path}`,
      details: { path },
      preview: {
        title: `Delete ${path}`,
        body: `Are you sure you want to delete ${path}? This action cannot be undone.`
      }
    };

    const result = await this.requestApproval('Delete File', payload);

    if (result.success) {
      console.log(`[Files] File ${path} deleted!`);
      return { success: true, message: 'File deleted successfully.' };
    } else {
      return result;
    }
  }

  // ============================================================================
  // 3. SHARED STATE TOOLS
  // ============================================================================

  /**
   * Autonomous: Get shared state from backend
   */
  async getSharedState(key: string) {
    try {
      const response = await axios.get(`${this.apiUrl}/state/${key}`);
      return response.data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Autonomous: Set shared state in backend
   */
  async setSharedState(key: string, value: any) {
    try {
      const response = await axios.post(`${this.apiUrl}/state`, { key, value }, {
        headers: this.authHeaders()
      });
      return response.data;
    } catch (error: any) {
      return { error: error.message };
    }
  }
}
